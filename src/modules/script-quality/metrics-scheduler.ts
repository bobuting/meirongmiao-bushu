/**
 * 指标聚合定时调度器
 *
 * 每 30 分钟扫描 nrm_script_quality_scores，
 * 按 prompt_code + prompt_version 重新聚合指标到 nrm_prompt_version_metrics。
 */

import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import type { FastifyBaseLogger } from "fastify";
import { recomputeAllMetrics } from "./metrics-aggregator.js";

/** 默认调度间隔：30 分钟 */
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;

export class MetricsScheduler {
  private timer?: NodeJS.Timeout;
  private readonly intervalMs: number;

  constructor(
    private readonly repos: PgRepositoryCollection,
    private readonly logger: FastifyBaseLogger,
    intervalMs?: number,
  ) {
    this.intervalMs = intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  start(): void {
    this.logger.info(`[MetricsScheduler] started (interval=${this.intervalMs / 1000}s)`);
    this.scheduleNextRun();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.logger.info("[MetricsScheduler] stopped");
  }

  async runOnce(): Promise<number> {
    try {
      const count = await recomputeAllMetrics(this.repos);
      if (count > 0) {
        this.logger.info(`[MetricsScheduler] recomputed ${count} prompt version metrics`);
      }
      return count;
    } catch (err) {
      this.logger.error({ err }, "[MetricsScheduler] runOnce failed");
      return 0;
    }
  }

  private scheduleNextRun(): void {
    this.timer = setTimeout(async () => {
      await this.runOnce();
      this.scheduleNextRun();
    }, this.intervalMs);
  }
}
