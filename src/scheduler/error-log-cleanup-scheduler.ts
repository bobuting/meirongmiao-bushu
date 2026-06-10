/**
 * 错误日志定时清理调度器
 * 每天凌晨 2 点执行，按分级保留策略清理过期日志
 */

import type { Pool } from "pg";
import type { PgErrorLogRepository } from "../repositories/pg/error-log-pg-repository.js";
import type { FastifyBaseLogger } from "fastify";
import { SchedulerDailyGuard, SCHEDULER_NAMES } from "../services/scheduler-daily-guard.js";

/** 清理配置 */
export interface CleanupConfig {
  runHour: number;  // 执行时间（小时，默认 2 点）
}

const DEFAULT_CONFIG: CleanupConfig = {
  runHour: 2,
};

export class ErrorLogCleanupScheduler {
  private readonly repo: PgErrorLogRepository;
  private readonly logger: FastifyBaseLogger;
  private readonly config: CleanupConfig;
  private timer?: NodeJS.Timeout;
  private static instance: ErrorLogCleanupScheduler | null = null;

  constructor(
    private readonly pool: Pool,
    repo: PgErrorLogRepository,
    logger: FastifyBaseLogger,
    config: Partial<CleanupConfig> = {}
  ) {
    this.repo = repo;
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 启动定时清理 */
  start(): void {
    if (this.timer) {
      this.logger.warn("Error log cleanup scheduler already started, skipping");
      return;
    }
    this.logger.info("Error log cleanup scheduler started");
    this.scheduleNextRun();
  }

  /** 停止定时清理 */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.logger.info("Error log cleanup scheduler stopped");
  }

  /** 手动执行清理（测试用） */
  async runCleanup(): Promise<void> {
    // 多进程防护
    const guard = new SchedulerDailyGuard(this.pool);
    const lockId = await guard.tryAcquire(SCHEDULER_NAMES.ERROR_LOG_CLEANUP);
    if (!lockId) {
      this.logger.info("其他进程正在执行错误日志清理，跳过");
      return;
    }

    this.logger.info("Running error log cleanup");

    try {
      const stats = await this.repo.deleteExpiredLogs();

      this.logger.info({
        criticalDeleted: stats.criticalDeleted,
        errorDeleted: stats.errorDeleted,
        warnDeleted: stats.warnDeleted,
        totalDeleted: stats.totalDeleted,
      }, "Error log cleanup completed");
    } catch (error) {
      this.logger.error(error, "Error log cleanup failed");
    } finally {
      await guard.release(lockId);
    }
  }

  /** 计算下次执行时间并调度 */
  private scheduleNextRun(): void {
    const now = new Date();
    const nextRun = new Date();

    // 设置执行时间为配置的小时
    nextRun.setHours(this.config.runHour, 0, 0, 0);

    // 如果已过今天执行时间，设置为明天
    if (now >= nextRun) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const delayMs = nextRun.getTime() - now.getTime();

    this.logger.info(`Next cleanup scheduled at ${nextRun.toISOString()}`);

    this.timer = setTimeout(async () => {
      await this.runCleanup();
      this.scheduleNextRun();  // 调度下次执行
    }, delayMs);
  }

  static getInstance(
    pool: Pool,
    repo: PgErrorLogRepository,
    logger: FastifyBaseLogger,
    config: Partial<CleanupConfig> = {}
  ): ErrorLogCleanupScheduler {
    if (!ErrorLogCleanupScheduler.instance) {
      ErrorLogCleanupScheduler.instance = new ErrorLogCleanupScheduler(pool, repo, logger, config);
    }
    return ErrorLogCleanupScheduler.instance;
  }

  static resetInstance(): void {
    if (ErrorLogCleanupScheduler.instance) {
      ErrorLogCleanupScheduler.instance.stop();
      ErrorLogCleanupScheduler.instance = null;
    }
  }
}