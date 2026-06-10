/**
 * 裂变组合方案生成执行器
 *
 * 负责处理 step6_fission_combination job：
 * - dependsOn 保证了所有 video job 已完成
 * - 查询 task_items 确认所有 item 完成
 * - 调用 FissionStoryboardSubService.getCombinations() 生成组合方案
 * - 更新 fissionVideoStatus → combining → ready_for_merge
 * - 前端检测 ready_for_merge 后执行视频合并
 */

import type { Pool } from "pg";
import type { AppContext } from "../../core/app-context.js";
import type { User } from "../../contracts/types.js";
import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import { getLogger } from "../../core/logger/index.js";
import { FissionStatus } from "./fission-video-config.js";
import { FissionVideoStatusService, FissionStoryboardSubService, createFissionTaskItemsService } from "../../service/services-sub.js";
import { getAsyncJob, finalizeAsyncJob, checkAndFinalizeParent } from "../../service/async-job-service.js";
import type { FissionCombinationJobInput, FissionCombinationJobResult } from "./fission-job-service.js";
import type { QueueDispatcher } from "../queue-dispatcher.js";
import { createHash } from "node:crypto";

const logger = getLogger("fission-combination-executor");

/** 组合方案执行器单例 */
let _combinationExecutor: FissionCombinationExecutor | null = null;
export function registerFissionCombinationExecutor(e: FissionCombinationExecutor): void { _combinationExecutor = e; }
export function getFissionCombinationExecutor(): FissionCombinationExecutor | null { return _combinationExecutor; }

/**
 * 组合方案生成执行器
 */
export class FissionCombinationExecutor {
  private readonly pool: Pool;
  private readonly log = getLogger("fission-combination-executor");
  private readonly statusService: FissionVideoStatusService;

  constructor(
    private readonly ctx: AppContext,
    private readonly dispatcher?: QueueDispatcher,
  ) {
    this.pool = ctx.pool;
    this.statusService = new FissionVideoStatusService(ctx.repos);
  }

  /**
   * 推进组合方案生成任务（每次 tick 调用）
   * QueueDispatcher 已在 tryPromote 中获取 advisory lock，executor 无需重复获取
   */
  async advanceOnce(user: User, projectId: string, jobId: string): Promise<void> {
    const now = Date.now();
    let job: Awaited<ReturnType<typeof getAsyncJob>> = null;

    try {
      job = await getAsyncJob(this.ctx.repos, jobId, () => now);
      if (!job || job.status !== "running") return;

      const input = JSON.parse(job.input) as FissionCombinationJobInput;
      const result: FissionCombinationJobResult = (job.result as unknown as FissionCombinationJobResult) || {
        combinationCount: 0,
      };

      // 1. 设置状态为 combining
      await this.statusService.update(input.fissionVideoStatusId, {
        status: FissionStatus.COMBINING,
      });

      // 2. 查询 task_items 确认所有 item 完成（安全检查）
      const taskItemsService = createFissionTaskItemsService(this.ctx.repos, this.statusService, this.ctx.businessConfigService);
      const imageVideoItems = await taskItemsService.getItemsByType(input.fissionVideoStatusId, "image_video");
      const newStoryItems = await taskItemsService.getItemsByType(input.fissionVideoStatusId, "new_story");
      const allItems = [...imageVideoItems, ...newStoryItems];

      const allComplete = allItems.length > 0 && allItems.every(item =>
        item.imageStatus === "completed" && !!item.imageUrl &&
        item.videoStatus === "completed" && !!item.videoUrl,
      );

      if (!allComplete) {
        const incompleteItems = allItems.filter(item =>
          item.imageStatus !== "completed" || !item.imageUrl ||
          item.videoStatus !== "completed" || !item.videoUrl,
        );
        const details = incompleteItems.slice(0, 5).map(i => `#${i.itemIndex}(img=${i.imageStatus},video=${i.videoStatus})`).join(", ");
        throw new Error(`depends_on 已满足但 task_items 未全部完成(${incompleteItems.length}个): ${details}`);
      }

      // 3. 生成组合方案
      const storyboardService = new FissionStoryboardSubService(this.ctx.repos);
      const combinations = await storyboardService.getCombinations(input.projectId, input.fissionCount);

      // 【修复】检查组合数量是否满足请求
      if (combinations.length === 0) {
        const errorMsg = "组合方案生成失败：无可用视频素材";
        this.log.error({ jobId, projectId }, errorMsg);
        throw new Error(errorMsg);
      }
      if (combinations.length < input.fissionCount) {
        this.log.warn(
          { jobId, requested: input.fissionCount, actual: combinations.length },
          "[FissionCombination] 组合数量不足，已生成最大可用数量"
        );
        // 继续执行，但记录警告
      }

      result.combinationCount = combinations.length;
      this.log.info({ jobId, combinationCount: combinations.length, requested: input.fissionCount }, "[FissionCombination] 组合方案生成完成");

      // 4. 更新状态为 ready_for_merge
      await this.statusService.update(input.fissionVideoStatusId, {
        status: FissionStatus.READY_FOR_MERGE,
      });

      // 5. finalize
      await finalizeAsyncJob(this.ctx.repos, jobId, "completed", result, null, now, this.dispatcher);
      if (job.parentJobId && this.dispatcher) {
        await checkAndFinalizeParent(this.ctx.repos, job.parentJobId, this.dispatcher, now);
      }

      this.log.info({ jobId, status: "ready_for_merge" }, "[FissionCombination] 组合任务完成，等待前端合并");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log.error({ err: error, jobId, projectId }, "[FissionCombination] 未捕获异常");
      await finalizeAsyncJob(this.ctx.repos, jobId, "failed", null, {
        code: "FISSION_COMBINATION_ERROR",
        message: errorMsg,
      }, now, this.dispatcher);

      // 【修复】失败时检查父任务是否需要自动完成（job 在 try 块开头已获取）
      if (job?.parentJobId && this.dispatcher) {
        await checkAndFinalizeParent(this.ctx.repos, job.parentJobId, this.dispatcher, now);
      }
    }
  }
}
