/**
 * 情感原型库后置微调调度器
 * 每日凌晨 5 点执行：清理低质量原型 + 重新计算流行度 + 去重合并
 */

import type { Pool } from "pg";
import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import type { EmotionArchetypeLibraryService } from "../services/emotion-archetype-library-service.js";
import { getLogger } from "../core/logger/index.js";
import { SchedulerDailyGuard, SCHEDULER_NAMES } from "../services/scheduler-daily-guard.js";

const log = getLogger("EmotionArchetypeLibraryUpdateScheduler");

/**
 * 情感原型库后置微调调度器
 * 单例模式，每天凌晨 5 点执行（避免与其他任务冲突）
 */
export class EmotionArchetypeLibraryUpdateScheduler {
  /** 定时器 ID */
  private intervalId: NodeJS.Timeout | null = null;

  /** 执行时间：凌晨 5 点 */
  private readonly scheduleHour = 5;

  /** 单例实例 */
  private static instance: EmotionArchetypeLibraryUpdateScheduler | null = null;

  constructor(
    private readonly updateService: EmotionArchetypeLibraryService,
    private readonly repos: PgRepositoryCollection,
    private readonly pool: Pool,
  ) {}

  /** 启动定时任务 */
  start(): void {
    if (this.intervalId) {
      log.warn("定时任务已启动，跳过重复启动");
      return;
    }

    // 计算到下次执行时间的毫秒数
    const now = Date.now();
    const nextRunTime = this.calculateNextRunTime(now);
    const delayMs = nextRunTime - now;

    log.info(
      `启动情感原型库后置微调任务，下次执行时间: ${new Date(nextRunTime).toISOString()}，延迟 ${Math.round(delayMs / 1000 / 60)} 分钟`
    );

    // 设置首次执行定时器
    this.intervalId = setTimeout(() => {
      this.executeUpdate();
      // 首次执行后，设置每 24 小时执行一次的定时器
      this.setupDailyInterval();
    }, delayMs);
  }

  /** 停止定时任务 */
  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      log.info("定时任务已停止");
    }
  }

  /** 执行更新任务 */
  private async executeUpdate(triggerType: "scheduled" | "manual" = "scheduled"): Promise<void> {
    // 多进程防护
    const guard = new SchedulerDailyGuard(this.pool);
    const lockId = await guard.tryAcquire(SCHEDULER_NAMES.EMOTION_ARCHETYPE_LIBRARY);
    if (!lockId) return;

    log.info("开始执行情感原型库后置微调任务");
    const startTime = Date.now();

    // 插入运行记录
    const logId = await this.repos.emotionArchetypeRunLogs.insertRunLog({
      runType: "scheduled_update",
      triggerType,
      startedAt: startTime,
    });

    const taskResults: Record<string, unknown> = {};

    try {
      // 任务1：重新计算所有原型的流行度
      log.info("任务1：重新计算流行度");
      const updatedCount = await this.updateService.recalculateAllPopularityScores();
      log.info(`流行度更新完成：${updatedCount} 个原型`);
      taskResults.popularityUpdate = { updatedCount };

      // 任务2：自动淘汰低流行度原型
      log.info("任务2：淘汰低流行度原型");
      const deactivatedCount = await this.updateService.deactivateLowPopularityArchetypes();
      log.info(`淘汰完成：${deactivatedCount} 个原型`);
      taskResults.deactivation = { deactivatedCount };

      // 任务3：去重合并（相同 emotion_core 合并）
      log.info("任务3：去重合并");
      const mergedCount = await this.mergeDuplicateArchetypes();
      log.info(`去重完成：合并 ${mergedCount} 个重复原型`);
      taskResults.merge = { mergedCount };

      // 任务4：限制数量（最多保留 65 个活跃原型）
      log.info("任务4：限制原型数量");
      const trimmedCount = await this.trimArchetypeCount(65);
      log.info(`数量限制完成：保留 ${trimmedCount} 个原型`);
      taskResults.trim = { trimmedCount, maxCount: 65 };

      const durationMs = Date.now() - startTime;
      log.info(
        `后置微调任务完成：流行度更新 ${updatedCount}，淘汰 ${deactivatedCount}，合并 ${mergedCount}，总耗时 ${Math.round(durationMs / 1000)} 秒`
      );

      // 更新运行记录为完成
      await this.completeRunLog(logId, "completed", taskResults, durationMs);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error({ error: errorMsg }, "后置微调任务执行失败");
      await this.completeRunLog(logId, "failed", taskResults, durationMs, errorMsg);
    } finally {
      await guard.release(lockId);
    }
  }

  /** 更新运行记录状态 */
  private async completeRunLog(
    logId: string | undefined,
    status: string,
    taskResults: Record<string, unknown>,
    durationMs: number,
    errorMessage?: string,
  ): Promise<void> {
    if (!logId) return;
    try {
      if (status === "completed") {
        await this.repos.emotionArchetypeRunLogs.updateRunLogCompleted(logId, {
          taskResults,
          durationMs,
          completedAt: Date.now(),
        });
      } else {
        await this.repos.emotionArchetypeRunLogs.updateRunLogFailed(logId, {
          errorMessage: errorMessage || "Unknown error",
          durationMs,
          completedAt: Date.now(),
        });
      }
    } catch (dbError) {
      log.error({ error: dbError instanceof Error ? dbError.message : String(dbError) }, "更新运行记录失败");
    }
  }

  /** 设置每日执行定时器 */
  private setupDailyInterval(): void {
    // 每 24 小时执行一次
    this.intervalId = setInterval(() => {
      this.executeUpdate();
    }, 24 * 60 * 60 * 1000);
  }

  /** 计算下次执行时间（凌晨 5 点） */
  private calculateNextRunTime(now: number): number {
    const date = new Date(now);
    // 设置为今天凌晨 5 点
    const today5AM = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      this.scheduleHour,
      0,
      0,
      0
    ).getTime();

    // 如果已经过了今天 5 点，则设置为明天 5 点
    if (now >= today5AM) {
      return today5AM + 24 * 60 * 60 * 1000;
    }
    return today5AM;
  }

  /** 获取单例实例 */
  static getInstance(updateService: EmotionArchetypeLibraryService, repos: PgRepositoryCollection, pool: Pool): EmotionArchetypeLibraryUpdateScheduler {
    if (!EmotionArchetypeLibraryUpdateScheduler.instance) {
      EmotionArchetypeLibraryUpdateScheduler.instance = new EmotionArchetypeLibraryUpdateScheduler(updateService, repos, pool);
    }
    return EmotionArchetypeLibraryUpdateScheduler.instance;
  }

  /** 重置单例（用于测试或重新初始化） */
  static resetInstance(): void {
    if (EmotionArchetypeLibraryUpdateScheduler.instance) {
      EmotionArchetypeLibraryUpdateScheduler.instance.stop();
      EmotionArchetypeLibraryUpdateScheduler.instance = null;
    }
  }

  // ========== 后置微调任务 ==========

  /**
   * 去重合并：相同 emotion_core 的原型合并（保留流行度最高的）
   */
  private async mergeDuplicateArchetypes(): Promise<number> {
    const duplicates = await this.repos.emotionArchetypes.findDuplicateEmotionCores();
    const now = Date.now();
    let mergedCount = 0;

    for (const { ids } of duplicates) {
      const keepId = ids[0]; // 保留流行度最高的
      const removeIds = ids.slice(1); // 删除其余的

      // 将删除的原型的使用次数合并到保留的原型
      await this.repos.emotionArchetypes.mergeUseCount(keepId, removeIds);

      // 删除重复原型
      await this.repos.emotionArchetypes.deactivateByIds(removeIds, now);

      mergedCount += removeIds.length;
      log.info(`合并重复原型：保留 ${keepId}，删除 ${removeIds.join(", ")}`);
    }

    return mergedCount;
  }

  /**
   * 限制原型数量：保留最多 N 个活跃原型（按流行度降序）
   */
  private async trimArchetypeCount(maxCount: number): Promise<number> {
    const currentCount = await this.repos.emotionArchetypes.countActive();

    if (currentCount <= maxCount) {
      log.info(`当前原型数量 ${currentCount} <= 限制 ${maxCount}，无需裁剪`);
      return currentCount;
    }

    const trimCount = currentCount - maxCount;
    const trimIds = await this.repos.emotionArchetypes.findLowestPopularityIds(trimCount);
    const now = Date.now();
    await this.repos.emotionArchetypes.deactivateByIds(trimIds, now);

    log.info(`裁剪原型数量：删除 ${trimIds.length} 个低流行度原型`);
    return maxCount;
  }
}
