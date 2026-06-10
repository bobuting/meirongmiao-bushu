/**
 * 已删除数据定时清理调度器
 * 每天凌晨 3 点执行清理任务
 */

import type { Pool } from "pg";
import type { DeletedDataCleanupService } from "../modules/deleted-data-cleanup-service.js";
import { getLogger } from "../core/logger/index.js";
import { SchedulerDailyGuard, SCHEDULER_NAMES } from "../services/scheduler-daily-guard.js";

const log = getLogger("deleted-data-cleanup-scheduler");

/**
 * 已删除数据清理调度器
 * 单例模式，每天凌晨 3 点执行清理
 */
export class DeletedDataCleanupScheduler {
  /** 定时器 ID */
  private intervalId: NodeJS.Timeout | null = null;

  /** 执行时间：凌晨 3 点 */
  private readonly scheduleHour = 3;

  /** 单例实例 */
  private static instance: DeletedDataCleanupScheduler | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly cleanupService: DeletedDataCleanupService,
  ) {}

  /** 启动定时任务 */
  start(): void {
    if (this.intervalId) {
      log.warn("[DeletedDataCleanupScheduler] 定时任务已启动，跳过重复启动");
      return;
    }

    // 计算到下次执行时间的毫秒数
    const now = Date.now();
    const nextRunTime = this.calculateNextRunTime(now);
    const delayMs = nextRunTime - now;


    // 设置首次执行定时器
    this.intervalId = setTimeout(() => {
      this.executeCleanup();
      // 首次执行后，设置每 24 小时执行一次的定时器
      this.setupDailyInterval();
    }, delayMs);
  }

  /** 停止定时任务 */
  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }

  /** 执行清理任务 */
  private async executeCleanup(): Promise<void> {
    // 多进程防护
    const guard = new SchedulerDailyGuard(this.pool);
    const lockId = await guard.tryAcquire(SCHEDULER_NAMES.DELETED_DATA_CLEANUP);
    if (!lockId) return;

    try {
      const result = await this.cleanupService.runScheduledCleanup();
      if (result) {
        log.info("[DeletedDataCleanupScheduler] 清理任务执行完成");
      } else {
        log.warn("[DeletedDataCleanupScheduler] 清理任务未执行");
      }
    } catch (error) {
      log.error({ error }, "[DeletedDataCleanupScheduler] 清理任务执行失败");
    } finally {
      await guard.release(lockId);
    }
  }

  /** 设置每日执行定时器 */
  private setupDailyInterval(): void {
    // 每 24 小时执行一次
    this.intervalId = setInterval(() => {
      this.executeCleanup();
    }, 24 * 60 * 60 * 1000);
  }

  /** 计算下次执行时间（凌晨 3 点） */
  private calculateNextRunTime(now: number): number {
    const date = new Date(now);
    // 设置为今天凌晨 3 点
    const today3AM = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      this.scheduleHour,
      0,
      0,
      0
    ).getTime();

    // 如果已经过了今天 3 点，则设置为明天 3 点
    if (now >= today3AM) {
      return today3AM + 24 * 60 * 60 * 1000;
    }
    return today3AM;
  }

  /** 获取单例实例 */
  static getInstance(pool: Pool, cleanupService: DeletedDataCleanupService): DeletedDataCleanupScheduler {
    if (!DeletedDataCleanupScheduler.instance) {
      DeletedDataCleanupScheduler.instance = new DeletedDataCleanupScheduler(pool, cleanupService);
    }
    return DeletedDataCleanupScheduler.instance;
  }

  /** 重置单例（用于测试或重新初始化） */
  static resetInstance(): void {
    if (DeletedDataCleanupScheduler.instance) {
      DeletedDataCleanupScheduler.instance.stop();
      DeletedDataCleanupScheduler.instance = null;
    }
  }
}