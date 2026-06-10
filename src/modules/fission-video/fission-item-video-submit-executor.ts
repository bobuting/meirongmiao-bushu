/**
 * 裂变分镜视频 Submit 执行器
 *
 * Submit 任务：提交视频生成 → 创建 Query 子任务 → 保持 running 等待 Query 完成后由 checkAndFinalizeParent 自动 finalize
 * 同步返回（罕见）时直接 finalize，不需要 Query。
 */

import type { Pool } from "pg";
import type { AppContext } from "../../core/app-context.js";
import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import type { AsyncJobRecord } from "../../service/async-job-service.js";
import type { QueueDispatcher } from "../../modules/queue-dispatcher.js";
import type { User } from "../../contracts/types.js";
import { getLogger } from "../../core/logger/index.js";
import { ProviderRouteKeys, selectRouteKeyByAge } from "../../contracts/provider-route-keys.js";
import { generateImageToVideo } from "../../service/llm/llm-image-video.js";
import { finalizeAsyncJob, checkAndFinalizeParent, createAsyncJob, updateAsyncJobResult, updateAsyncJobStage, getAsyncJob } from "../../service/async-job-service.js";
import {
  FISSION_ITEM_VIDEO_QUERY_JOB_TYPE,
  type FissionItemVideoJobInput,
  type FissionItemVideoJobResult,
  type FissionItemVideoQueryJobInput,
} from "../fission-video/fission-job-service.js";
import { FissionVideoStatusService, createFissionTaskItemsService } from "../../service/services-sub.js";
import { FissionStatus } from "./fission-video-config.js";

const log = getLogger("fission-item-video-submit-executor");

/** 视频生成执行器单例 */
let _submitExecutor: FissionItemVideoSubmitExecutor | null = null;
export function registerFissionItemVideoSubmitExecutor(e: FissionItemVideoSubmitExecutor): void { _submitExecutor = e; }
export function getFissionItemVideoSubmitExecutor(): FissionItemVideoSubmitExecutor | null { return _submitExecutor; }

/**
 * 分镜视频生成 Submit 执行器
 */
export class FissionItemVideoSubmitExecutor {
  private readonly pool: Pool;
  private readonly repos: PgRepositoryCollection;
  private readonly log = getLogger("fission-item-video-submit-executor");
  private readonly taskItemsService;
  private readonly statusService: FissionVideoStatusService;

  constructor(
    private readonly ctx: AppContext,
    private readonly dispatcher?: QueueDispatcher,
  ) {
    this.pool = ctx.pool;
    this.repos = ctx.repos as PgRepositoryCollection;
    this.statusService = new FissionVideoStatusService(ctx.repos);
    this.taskItemsService = createFissionTaskItemsService(ctx.repos, this.statusService, ctx.businessConfigService);
  }

  /**
   * 检查同级 video_submit 任务是否全部终态，如果是且有失败项则更新 fissionVideoStatus
   * 必须在 checkAndFinalizeParent 之前调用，确保前端能看到 partial_complete 状态
   */
  private async checkAndUpdatePartialComplete(
    fissionVideoStatusId: string,
    parentJobId: string,
  ): Promise<void> {
    // 查询同 parent 的所有 video_submit 任务
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
   * 执行 Submit 任务
   * 1. 获取图片（dependsOn 保证了图片已完成）
   * 2. 提交视频生成
   * 3. 同步返回 → finalize completed + 更新 task_items
   * 4. 异步返回 → 创建 Query 子任务 → 保持 running(stage=生成中) 等待 checkAndFinalizeParent
   */
  async advanceOnce(user: User, projectId: string, jobId: string): Promise<void> {
    const now = Date.now();

    const job = await getAsyncJob(this.ctx.repos, jobId, () => now);
    if (!job || job.status !== "running") return;

    const input = JSON.parse(job.input) as FissionItemVideoJobInput;
    const result: FissionItemVideoJobResult = (job.result as unknown as FissionItemVideoJobResult) || {
      videoTaskId: null,
    };

    // 配对标识：Submit 和 Query 共享，用于调试气泡配对展示
    const pairId = `pair-${job.id}`;

    // 从 task_items 获取 imageUrl（dependsOn 保证了图片已完成）
    try {
      const items = await this.taskItemsService.getPendingItems(input.fissionVideoStatusId, input.taskType);
      let item = items.find(i => i.itemIndex === input.itemIndex);

      if (!item?.imageUrl) {
        // 尝试从已完成的 item 获取
        const allItems = await this.taskItemsService.getItemsByType(input.fissionVideoStatusId, input.taskType);
        const completedItem = allItems.find(i => i.itemIndex === input.itemIndex && i.imageStatus === "completed");
        if (!completedItem?.imageUrl) {
          this.log.error({ jobId, itemIndex: input.itemIndex }, "视频 Submit job 启动但图片未完成");
          result.errorMessage = "图片未完成";
          await finalizeAsyncJob(this.ctx.repos, jobId, "failed", result, { code: "IMAGE_NOT_READY", message: "图片未完成" }, now, this.dispatcher);
          return;
        }
        item = completedItem;
      }

      // 根据角色年龄选择视频生成 RouteKey
      const project = await this.ctx.repos.projects.findById(projectId);
      const age = project?.selectedRoleDirection?.age;
      const videoRouteKey = selectRouteKeyByAge(
        age != null ? Number(age) : null,
        ProviderRouteKeys.FISSION_VIDEO_GENERATION_CHILD,
        ProviderRouteKeys.FISSION_VIDEO_GENERATION_ADULT,
      );

      // 调用图生视频
      const vr = await generateImageToVideo(this.ctx, user, {
        projectId,
        characterReferences: input.characterImageUrl ? [{ imageUrl: input.characterImageUrl }] : [],
        outfitReferenceImages: input.outfitImageUrl ? [input.outfitImageUrl] : [],
        sceneImageUrl: item!.imageUrl!,
        scenePrompt: input.videoPrompt,
        sceneIndex: input.itemIndex - 1,
        videoTaskId: null, // Submit 阶段不传入已有 taskId
      }, undefined, videoRouteKey, undefined, undefined, pairId);

      // 同步返回（罕见）
      if (vr.success && vr.videoUrl) {
        this.log.info({ jobId, itemIndex: input.itemIndex }, "视频生成同步返回");

        // 更新 task_items 表
        await this.taskItemsService.updateVideoStatus(item!.id, input.fissionVideoStatusId, input.taskType, {
          videoUrl: vr.videoUrl,
          videoPath: vr.videoPath || undefined,
          status: "completed",
          videoTaskId: vr.taskId,
        });

        // Finalize Submit 任务
        await finalizeAsyncJob(this.ctx.repos, jobId, "completed", result, null, now, this.dispatcher);

        // 触发父任务检查
        if (job.parentJobId && this.dispatcher) {
          await checkAndFinalizeParent(this.ctx.repos, job.parentJobId, this.dispatcher, now);
          await this.dispatcher.tryPromote();
        }
        return;
      }

      // 异步返回：Submit 保持 running（stage = "生成中"），等待 Query 完成后由 checkAndFinalizeParent 自动 finalize
      if (vr.pending && vr.taskId) {
        this.log.info({ jobId, taskId: vr.taskId }, "视频生成已提交，创建 Query 任务");

        // 创建 Query 任务
        const queryInput: FissionItemVideoQueryJobInput = {
          fissionVideoStatusId: input.fissionVideoStatusId,
          projectId,
          itemIndex: input.itemIndex,
          taskType: input.taskType,
          videoTaskId: vr.taskId,
          parentJobId: input.parentJobId,
          freezeId: vr.freezeId, // 传递冻结积分ID，由 Query 完成最终扣减/解冻
        };

        await createAsyncJob(this.ctx.repos, {
          userId: job.userId,
          jobType: FISSION_ITEM_VIDEO_QUERY_JOB_TYPE,
          input: JSON.stringify(queryInput),
          now,
          projectId,
          parentJobId: jobId, // Query 的父任务是 Submit（嵌套模式）
          initialStatus: "pending",
          executionMode: "poll",
        }, this.ctx.globalTaskConcurrencyService);

        // 更新 Submit 阶段为"生成中"（保持 running，不 finalize）
        // 存储 debugAuditId 供 Query 阶段复用调试气泡
        result.videoTaskId = vr.taskId;
        result.debugAuditId = vr.debugAuditId;
        result.debugStartedAt = vr.debugStartedAt;
        result.freezeId = vr.freezeId; // 存入 result，供 Query 从 parent job 读取
        result.pairId = pairId; // 配对标识，供 Query 阶段创建独立调试记录
        await updateAsyncJobStage(this.ctx.repos, jobId, "生成中", now, result as unknown as Record<string, unknown>);

        // 触发 Query 任务尽快开始
        if (this.dispatcher) {
          await this.dispatcher.tryPromote();
        }
        return;
      }

      // 失败
      result.errorMessage = vr.errorMessage || "视频生成提交失败";
      await finalizeAsyncJob(this.ctx.repos, jobId, "failed", result, { code: "VIDEO_SUBMIT_FAILED", message: result.errorMessage }, now, this.dispatcher);

      // 更新 task_items 表
      await this.taskItemsService.updateVideoStatus(item!.id, input.fissionVideoStatusId, input.taskType, {
        status: "failed",
        errorMessage: result.errorMessage,
      });

      // 检查同级任务状态，必要时更新 fissionVideoStatus 为 partial_complete
      if (job.parentJobId) {
        await this.checkAndUpdatePartialComplete(input.fissionVideoStatusId, job.parentJobId);
      }

      // 触发父任务检查
      if (job.parentJobId && this.dispatcher) {
        await checkAndFinalizeParent(this.ctx.repos, job.parentJobId, this.dispatcher, now);
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log.error({ jobId, error: errorMsg }, "分镜视频 Submit 异常");
      result.errorMessage = errorMsg;
      await finalizeAsyncJob(this.ctx.repos, jobId, "failed", result, { code: "VIDEO_ERROR", message: errorMsg }, now, this.dispatcher);

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