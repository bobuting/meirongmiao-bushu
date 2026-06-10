/**
 * 审美特征库定时更新调度器
 * 每日凌晨 4 点执行 TikHub API 爬取 + AI 分析 + 数据库更新
 */

import type { Pool } from "pg";
import type { AestheticLibraryUpdateService, AestheticUpdateResult } from "../modules/aesthetic-library-update-service.js";
import { AGE_GROUP_RANGES, type AgeGroupRange } from "../constants/age-groups.js";
import { getLogger } from "../core/logger/index.js";
import { SchedulerDailyGuard, SCHEDULER_NAMES } from "../services/scheduler-daily-guard.js";

const log = getLogger("AestheticLibraryUpdateScheduler");

/**
 * 审美特征库更新调度器
 * 单例模式，每天凌晨 4 点执行（避免与现有清理任务冲突）
 */
export class AestheticLibraryUpdateScheduler {
  /** 定时器 ID */
  private intervalId: NodeJS.Timeout | null = null;

  /** 执行时间：凌晨 4 点 */
  private readonly scheduleHour = 4;

  /** 单例实例 */
  private static instance: AestheticLibraryUpdateScheduler | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly updateService: AestheticLibraryUpdateService,
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
      `启动审美特征库定时更新，下次执行时间: ${new Date(nextRunTime).toISOString()}，延迟 ${Math.round(delayMs / 1000 / 60)} 分钟`
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

  /** 执行更新任务（依次更新所有统一年龄段） */
  private async executeUpdate(): Promise<void> {
    // 多进程防护
    const guard = new SchedulerDailyGuard(this.pool);
    const lockId = await guard.tryAcquire(SCHEDULER_NAMES.AESTHETIC_LIBRARY);
    if (!lockId) return;

    log.info("开始执行审美特征库更新任务（全年龄段）");
    try {
      let totalUpdated = 0;
      for (const ageRange of AGE_GROUP_RANGES) {
        const result = await this.updateService.updateLibrary({ ageRange, triggerType: 'scheduled' });
        log.info(`年龄段 ${ageRange} 审美特征更新完成：${result.updated} 个`);
        totalUpdated += result.updated;
      }
      log.info(`审美特征库全部更新完成：总计 ${totalUpdated} 个`);
    } catch (error) {
      log.error({ error: error instanceof Error ? error.message : String(error) }, "更新任务执行失败");
    } finally {
      await guard.release(lockId);
    }
  }

  /** 设置每日执行定时器 */
  private setupDailyInterval(): void {
    // 每 24 小时执行一次
    this.intervalId = setInterval(() => {
      this.executeUpdate();
    }, 24 * 60 * 60 * 1000);
  }

  /** 计算下次执行时间（凌晨 4 点） */
  private calculateNextRunTime(now: number): number {
    const date = new Date(now);
    // 设置为今天凌晨 4 点
    const today4AM = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      this.scheduleHour,
      0,
      0,
      0
    ).getTime();

    // 如果已经过了今天 4 点，则设置为明天 4 点
    if (now >= today4AM) {
      return today4AM + 24 * 60 * 60 * 1000;
    }
    return today4AM;
  }

  /** 获取单例实例 */
  static getInstance(pool: Pool, updateService: AestheticLibraryUpdateService): AestheticLibraryUpdateScheduler {
    if (!AestheticLibraryUpdateScheduler.instance) {
      AestheticLibraryUpdateScheduler.instance = new AestheticLibraryUpdateScheduler(pool, updateService);
    }
    return AestheticLibraryUpdateScheduler.instance;
  }

  /** 重置单例（用于测试或重新初始化） */
  static resetInstance(): void {
    if (AestheticLibraryUpdateScheduler.instance) {
      AestheticLibraryUpdateScheduler.instance.stop();
      AestheticLibraryUpdateScheduler.instance = null;
    }
  }
}