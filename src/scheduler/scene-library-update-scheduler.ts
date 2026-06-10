/**
 * 场景库定时更新调度器
 * 每日凌晨 4:30 执行场景库更新（所有场景分类依次执行）
 */

import type { Pool } from "pg";
import { SceneLibraryUpdateService } from "../modules/scene-library-update-service.js";
import { getLogger } from "../core/logger/index.js";
import { SchedulerDailyGuard, SCHEDULER_NAMES } from "../services/scheduler-daily-guard.js";

const log = getLogger("SceneLibraryUpdateScheduler");

export class SceneLibraryUpdateScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly scheduleHour = 4;
  private readonly scheduleMinute = 30;
  private static instance: SceneLibraryUpdateScheduler | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly updateService: SceneLibraryUpdateService,
  ) {}

  start(): void {
    if (this.intervalId) {
      log.warn("场景库定时任务已启动，跳过重复启动");
      return;
    }

    const now = Date.now();
    const nextRunTime = this.calculateNextRunTime(now);
    const delayMs = nextRunTime - now;

    log.info(`场景库更新将在 ${Math.round(delayMs / 60000)} 分钟后执行（每日 ${this.scheduleHour}:${this.scheduleMinute}）`);

    this.intervalId = setTimeout(() => {
      this.executeUpdate();
      this.setupDailyInterval();
    }, delayMs);
  }

  private async executeUpdate(): Promise<void> {
    // 多进程防护
    const guard = new SchedulerDailyGuard(this.pool);
    const lockId = await guard.tryAcquire(SCHEDULER_NAMES.SCENE_LIBRARY);
    if (!lockId) return;

    log.info("开始执行场景库定时更新");
    const categories = SceneLibraryUpdateService.getSceneCategories();

    try {
      for (const category of categories) {
        try {
          const result = await this.updateService.updateLibrary({
            sceneCategory: category,
            triggerType: "scheduled",
          });
          log.info(`场景分类 ${category} 更新完成：${result.updated} 个场景`);
        } catch (error) {
          log.error({ error: error instanceof Error ? error.message : String(error) }, `场景分类 ${category} 更新失败`);
        }
      }
    } finally {
      await guard.release(lockId);
    }
  }

  private setupDailyInterval(): void {
    this.intervalId = setInterval(() => {
      this.executeUpdate();
    }, 24 * 60 * 60 * 1000);
  }

  private calculateNextRunTime(now: number): number {
    const date = new Date(now);
    date.setHours(this.scheduleHour, this.scheduleMinute, 0, 0);

    // 如果今天的时间已过，安排到明天
    if (date.getTime() <= now) {
      date.setDate(date.getDate() + 1);
    }

    return date.getTime();
  }

  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      log.info("场景库定时任务已停止");
    }
  }

  static resetInstance(): void {
    if (SceneLibraryUpdateScheduler.instance) {
      SceneLibraryUpdateScheduler.instance.stop();
      SceneLibraryUpdateScheduler.instance = null;
    }
  }

  static getInstance(pool: Pool, updateService: SceneLibraryUpdateService): SceneLibraryUpdateScheduler {
    if (!SceneLibraryUpdateScheduler.instance) {
      SceneLibraryUpdateScheduler.instance = new SceneLibraryUpdateScheduler(pool, updateService);
    }
    return SceneLibraryUpdateScheduler.instance;
  }
}
