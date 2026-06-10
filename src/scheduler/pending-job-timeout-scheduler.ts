/**
 * Pending 任务超时清理调度器
 *
 * 定期调用 GlobalTaskConcurrencyService.timeoutPendingJobs()
 * 将超过配置时间的 pending 任务自动标记为 failed
 */

import type { FastifyBaseLogger } from "fastify";
import type { GlobalTaskConcurrencyService } from "../modules/global-task-concurrency-service.js";

/** 清理配置 */
export interface PendingJobTimeoutConfig {
  /** 扫描间隔（毫秒），默认 5 分钟 */
  intervalMs: number;
}

const DEFAULT_CONFIG: PendingJobTimeoutConfig = {
  intervalMs: 5 * 60 * 1000,
};

export class PendingJobTimeoutScheduler {
  private readonly logger: FastifyBaseLogger;
  private readonly config: PendingJobTimeoutConfig;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly concurrencyService: GlobalTaskConcurrencyService,
    logger: FastifyBaseLogger,
    config: Partial<PendingJobTimeoutConfig> = {},
  ) {
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 启动定时清理 */
  start(): void {
    this.logger.info(`Pending job timeout scheduler started (interval=${this.config.intervalMs / 1000}s)`);
    this.scheduleNextRun();
  }

  /** 停止定时清理 */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.logger.info("Pending job timeout scheduler stopped");
  }

  /** 手动执行清理 */
  async runCleanup(): Promise<{ parentCount: number; childCount: number }> {
    try {
      const result = await this.concurrencyService.timeoutPendingJobs();
      if (result.parentCount > 0 || result.childCount > 0) {
        this.logger.info(
          { parentCount: result.parentCount, childCount: result.childCount },
          "Pending job timeout cleanup completed (parent + children)",
        );
      }
      return result;
    } catch (error) {
      this.logger.error(error, "Pending job timeout cleanup failed");
      return { parentCount: 0, childCount: 0 };
    }
  }

  private scheduleNextRun(): void {
    this.timer = setTimeout(async () => {
      await this.runCleanup();
      this.scheduleNextRun();
    }, this.config.intervalMs);
  }
}
