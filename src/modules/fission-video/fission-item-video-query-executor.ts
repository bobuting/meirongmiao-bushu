/**
 * 裂变分镜视频 Query 执行器
 *
 * Query 任务：查询视频状态 → pending 时保持 running，更新 updated_at
 */

import type { AppContext } from "../../core/app-context.js";
import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import type { AsyncJobRecord } from "../../service/async-job-service.js";
import type { QueueDispatcher } from "../../modules/queue-dispatcher.js";
import type { User } from "../../contracts/types.js";
import { getLogger } from "../../core/logger/index.js";
import { ProviderRouteKeys, selectRouteKeyByAge, type ProviderRouteKey } from "../../contracts/provider-route-keys.js";
import { resolveRouteProvider } from "../../services/llm/provider-resolver.js";
import { generateImageToVideo } from "../../service/llm/llm-image-video.js";
import { deductFrozenCredit, unfreezeCredit } from "../../services/llm/llm-transport.js";
import { finalizeAsyncJob, checkAndFinalizeParent, getAsyncJob } from "../../service/async-job-service.js";
import {
  createLlmDebugRecord,
  finalizeLlmDebugRecordError,
} from "../../services/llm/llm-debug-recorder.js";
import {
  type FissionItemVideoQueryJobInput,
  type FissionItemVideoQueryJobResult,
  type FissionItemVideoJobResult,
} from "./fission-job-service.js";
import { FissionVideoStatusService, createFissionTaskItemsService } from "../../service/services-sub.js";
import { AppError } from "../../core/errors.js";
import { FissionStatus } from "./fission-video-config.js";

const log = getLogger("fission-item-video-query-executor");

/** Query 任务超时阈值（10 分钟） */
const QUERY_TIMEOUT_MS = 10 * 60 * 1000;

/** 视频 Query 执行器单例 */
let _queryExecutor: FissionItemVideoQueryExecutor | null = null;
export function registerFissionItemVideoQueryExecutor(e: FissionItemVideoQueryExecutor): void { _queryExecutor = e; }
export function getFissionItemVideoQueryExecutor(): FissionItemVideoQueryExecutor | null { return _queryExecutor; }

/**
 * 分镜视频 Query 执行器
 */
export class FissionItemVideoQueryExecutor {
  private readonly pool;
  private readonly log = getLogger("fission-item-video-query-executor");
  private readonly taskItemsService;
  private readonly statusService: FissionVideoStatusService;

  constructor(
    private readonly ctx: AppContext,
    private readonly dispatcher?: QueueDispatcher,
  ) {
    this.pool = ctx.pool;
    this.statusService = new FissionVideoStatusService(ctx.repos);
    this.taskItemsService = createFissionTaskItemsService(ctx.repos, this.statusService, ctx.businessConfigService);
  }

  /**
   * 检查同级 video_submit 任务是否全部终态，如果是且有失败项则更新 fissionVideoStatus
   * query job 的 parent 是 submit job，submit 的 parent 才是 shot_prompts（同级 video_submit 的共同 parent）
   */
  private async checkAndUpdatePartialComplete(
    fissionVideoStatusId: string,
    submitJobId: string,
  ): Promise<void> {
    // 获取 submit job 的 parent（shot_prompts parent）
    const parentJobId = await this.ctx.repos.asyncJobs.getParentJobId(submitJobId);
    if (!parentJobId) return;

    // 查询同级 video_submit 任务
    const rows = await this.ctx.repos.asyncJobs.findChildrenStatusByParentId(
      parentJobId,
      "step6_fission_item_video_submit",
    );
    if (rows.length === 0) return;

    const allTerminal = rows.every((r) =>
      r.status === "completed" || r.status === "failed",
    );
    if (!allTerminal) return;

    const anyFailed = rows.some((r) => r.status === "failed");
    if (anyFailed) {
      this.log.info({ fissionVideoStatusId, failedCount: rows.filter((r) => r.status === "failed").length, totalCount: rows.length }, "所有 video_submit 任务已终态，存在失败项，更新为 partial_complete");
      await this.statusService.update(fissionVideoStatusId, {
        status: FissionStatus.PARTIAL_COMPLETE,
      });
    }
  }

  /**
   * 执行 Query 任务
   * 1. 查询外部 API 视频生成状态
   * 2. succeeded → 更新 task_items + finalize completed
   * 3. pending → 更新 updated_at（保持 running，等下次轮询）
   * 4. failed → finalize failed
   */
  async advanceOnce(user: User, projectId: string, jobId: string): Promise<void> {
    const now = Date.now();

    const job = await getAsyncJob(this.ctx.repos, jobId, () => now);
    if (!job || job.status !== "running") return;

    const input = JSON.parse(job.input) as FissionItemVideoQueryJobInput;
    const result: FissionItemVideoQueryJobResult = {
      videoUrl: null,
      videoPath: null,
    };

    // RouteKey 提升到 try 外，确保 catch 块也能访问（用于解冻积分）
    let videoRouteKey: ProviderRouteKey = ProviderRouteKeys.FISSION_VIDEO_GENERATION_ADULT;

    try {
      // 1. 获取 task_item 记录
      const allItems = await this.taskItemsService.getItemsByType(input.fissionVideoStatusId, input.taskType);
      const item = allItems.find(i => i.itemIndex === input.itemIndex);
      if (!item) {
        throw new AppError(404, "ITEM_NOT_FOUND", `task_item 不存在: itemIndex=${input.itemIndex}`);
      }

      // 2. 根据角色年龄选择视频生成 RouteKey
      const project = await this.ctx.repos.projects.findById(projectId);
      const age = project?.selectedRoleDirection?.age;
      videoRouteKey = selectRouteKeyByAge(
        age != null ? Number(age) : null,
        ProviderRouteKeys.FISSION_VIDEO_GENERATION_CHILD,
        ProviderRouteKeys.FISSION_VIDEO_GENERATION_ADULT,
      );

      // 2.5 从父任务（Submit）读取 pairId，用于调试气泡配对展示
      let pairId: string | null = null;
      if (job.parentJobId) {
        const parentJob = await getAsyncJob(this.ctx.repos, job.parentJobId, () => now);
        if (parentJob?.result) {
          const parentResult = typeof parentJob.result === "string"
            ? JSON.parse(parentJob.result) as FissionItemVideoJobResult
            : parentJob.result as unknown as FissionItemVideoJobResult;
          pairId = parentResult.pairId ?? null;
        }
      }

      // 2.6 超时检查（移到 pairId + provider 解析之后，确保能创建调试记录）
      if (job.createdAt && now - job.createdAt > QUERY_TIMEOUT_MS) {
        const provider = await resolveRouteProvider(this.ctx, videoRouteKey);
        if (provider) {
          const timeoutRecord = createLlmDebugRecord(this.ctx, {
            routeKey: videoRouteKey,
            businessContext: `视频生成(查询) - 分镜 ${input.itemIndex}`,
            requestId: pairId ?? undefined,
            projectId,
            userId: user.id,
            asyncJobId: jobId,
            messages: [{ role: "prompt", content: `query taskId=${input.videoTaskId} (timeout)` }],
            provider,
          });
          if (timeoutRecord) {
            finalizeLlmDebugRecordError(this.ctx, {
              auditId: timeoutRecord.auditId,
              startedAt: timeoutRecord.startedAt,
              errorCode: "FISSION_VIDEO_QUERY_TIMEOUT",
              errorMessage: `视频生成超时（${QUERY_TIMEOUT_MS / 1000}s）`,
            });
          }
        }
        throw new AppError(502, "FISSION_VIDEO_QUERY_TIMEOUT", `视频生成超时（${QUERY_TIMEOUT_MS / 1000}s）`);
      }

      // 3. 查询视频状态（传入 pairId 创建独立调试记录，与 Submit 配对）
      // skipCreditFreeze: Query 不冻结积分，由 Submit 的 freezeId 完成最终扣减/解冻
      const vr = await generateImageToVideo(this.ctx, user, {
        projectId,
        characterReferences: [], // Query 阶段不需要
        outfitReferenceImages: [],
        sceneImageUrl: item.imageUrl || "",
        scenePrompt: "",
        sceneIndex: input.itemIndex - 1,
        videoTaskId: input.videoTaskId, // 传入 taskId 查询状态
      }, undefined, videoRouteKey, null, true, pairId);

      // 4. 处理结果
      if (vr.success && vr.videoUrl) {
        this.log.info({ jobId, itemIndex: input.itemIndex, videoUrl: vr.videoUrl.slice(0, 100) }, "视频生成完成");

        // 扣减 Submit 阶段冻结的积分（视频生成成功）
        if (input.freezeId) {
          try {
            await deductFrozenCredit({ ctx: this.ctx, routeKey: videoRouteKey, userId: user.id, projectId }, input.freezeId, "llm_image");
          } catch (e) {
            this.log.error({ freezeId: input.freezeId, err: e }, "冻结积分扣减失败（视频已生成）");
          }
        }

        // 更新 task_items 表
        await this.taskItemsService.updateVideoStatus(item.id, input.fissionVideoStatusId, input.taskType, {
          videoUrl: vr.videoUrl,
          videoPath: vr.videoPath || undefined,
          status: "completed",
          videoTaskId: vr.taskId,
        });

        // Finalize Query 任务
        result.videoUrl = vr.videoUrl;
        result.videoPath = vr.videoPath || null;
        await finalizeAsyncJob(this.ctx.repos, jobId, "completed", result, null, now, this.dispatcher);

        // 触发父任务检查
        if (job.parentJobId && this.dispatcher) {
          await checkAndFinalizeParent(this.ctx.repos, job.parentJobId, this.dispatcher, now);
          await this.dispatcher.tryPromote();
        }
        return;
      }

      // 失败
      if (!vr.success && !vr.pending) {
        this.log.warn({ jobId, itemIndex: input.itemIndex, error: vr.errorMessage }, "视频生成失败");
        // 解冻 Submit 阶段冻结的积分（视频生成失败）
        if (input.freezeId) {
          try {
            await unfreezeCredit({ ctx: this.ctx, routeKey: videoRouteKey, userId: user.id, projectId }, input.freezeId);
          } catch (e) {
            this.log.error({ freezeId: input.freezeId, err: e }, "积分解冻失败");
          }
        }
        throw new AppError(502, "FISSION_VIDEO_QUERY_FAILED", vr.errorMessage || "视频生成任务失败");
      }

      // 5. pending → 保持 running，更新 updated_at（心跳）
      if (vr.pending) {
        await this.ctx.repos.asyncJobs.updateHeartbeat(jobId, now);
        this.log.info({ jobId, itemIndex: input.itemIndex, taskId: input.videoTaskId }, "视频生成 pending，等待下次查询");
        return;
      }

      // 其他状态视为失败
      throw new AppError(502, "FISSION_VIDEO_UNKNOWN_STATUS", `未知视频状态: ${JSON.stringify(vr)}`);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log.error({ jobId, itemIndex: input.itemIndex, error: errorMsg }, "分镜视频 Query 异常");

      // 解冻 Submit 阶段冻结的积分（异常路径）
      if (input.freezeId) {
        try {
          await unfreezeCredit({ ctx: this.ctx, routeKey: videoRouteKey, userId: user.id, projectId }, input.freezeId);
        } catch (e) {
          this.log.error({ freezeId: input.freezeId, err: e }, "积分解冻失败（异常路径）");
        }
      }

      result.errorMessage = errorMsg;
      await finalizeAsyncJob(this.ctx.repos, jobId, "failed", result, { code: "FISSION_VIDEO_QUERY_ERROR", message: errorMsg }, now, this.dispatcher);

      // 更新 task_items 表
      const allItems = await this.taskItemsService.getItemsByType(input.fissionVideoStatusId, input.taskType);
      const item = allItems.find(i => i.itemIndex === input.itemIndex);
      if (item) {
        await this.taskItemsService.updateVideoStatus(item.id, input.fissionVideoStatusId, input.taskType, {
          status: "failed",
          errorMessage: errorMsg,
        });
      }

      // 检查同级任务状态，必要时更新 fissionVideoStatus 为 partial_complete
      if (job.parentJobId) {
        await this.checkAndUpdatePartialComplete(input.fissionVideoStatusId, job.parentJobId);
      }

      // 触发父任务检查
      if (job.parentJobId && this.dispatcher) {
        await checkAndFinalizeParent(this.ctx.repos, job.parentJobId, this.dispatcher, now);
      }
    }
  }
}