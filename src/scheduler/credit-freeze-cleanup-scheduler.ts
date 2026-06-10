/**
 * 冻结积分过期清理调度器
 * 每分钟检查并清理过期冻结记录，解冻积分
 */

import type { ICreditService } from "../contracts/services.js";
import type { FastifyBaseLogger } from "fastify";

/** 清理配置 */
export interface CreditFreezeCleanupConfig {
  intervalMs: number;  // 检查间隔（毫秒，默认 60 秒）
}

const DEFAULT_CONFIG: CreditFreezeCleanupConfig = {
  intervalMs: 60_000,  // 每分钟检查一次
};

export class CreditFreezeCleanupScheduler {
  private readonly creditService: ICreditService;
  private readonly logger: FastifyBaseLogger;
  private readonly config: CreditFreezeCleanupConfig;
  private timer?: NodeJS.Timeout;

  constructor(
    creditService: ICreditService,
    logger: FastifyBaseLogger,
    config: Partial<CreditFreezeCleanupConfig> = {}
  ) {
    this.creditService = creditService;
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 启动定时清理 */
  start(): void {
    this.logger.info({ intervalMs: this.config.intervalMs }, "Credit freeze cleanup scheduler started");
    this.scheduleNextRun();
  }

  /** 停止定时清理 */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.logger.info("Credit freeze cleanup scheduler stopped");
  }

  /** 手动执行清理（测试用） */
  async runCleanup(): Promise<void> {
    this.logger.debug("Running credit freeze cleanup");

    try {
      const cleanedCount = await this.creditService.cleanupExpiredFreezes();

      if (cleanedCount > 0) {
        this.logger.info({ cleanedCount }, "Expired credit freezes cleaned up");
      }
    } catch (error) {
      this.logger.error(error, "Credit freeze cleanup failed");
    }
  }

  /** 调度下次执行 */
  private scheduleNextRun(): void {
    this.timer = setTimeout(async () => {
      await this.runCleanup();
      this.scheduleNextRun();  // 调度下次执行
    }, this.config.intervalMs);
  }
}