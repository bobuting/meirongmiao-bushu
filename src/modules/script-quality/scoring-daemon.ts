/**
 * 脚本质量评分守护进程
 *
 * 照搬 StuckJobCleanupScheduler 的 setTimeout 递归调度模式。
 * 轮询 nrm_system_jobs 中 job_type='quality_scoring' 的 pending 任务，
 * 调用 ScoringEngine 评分并写入 nrm_script_quality_scores。
 */

import type { FastifyBaseLogger } from "fastify";
import type { ScoringDaemonConfig, ScoringJobInput, ScoringEngineDeps } from "./scoring-types.js";
import type { ScoringLoopConfig } from "../../contracts/business-config-contract.js";
import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import { DEFAULT_SCORING_LOOP_CONFIG } from "../../contracts/business-config-contract.js";
import { scoreScript } from "./scoring-engine.js";
import { insertScore } from "./scoring-repository.js";
import { markScriptQualityStatus } from "./scoring-loop.js";

/** 默认配置 */
const DEFAULT_CONFIG: ScoringDaemonConfig = {
  enabled: true,
  intervalMs: 10_000,
  batchSize: 5,
  llmTimeoutMs: 30_000,
};

/** 评分守护进程 */
export class ScriptQualityScoringDaemon {
  private timer?: NodeJS.Timeout;
  private readonly config: ScoringDaemonConfig;

  constructor(
    private readonly repos: PgRepositoryCollection,
    /** 懒加载 ScoringEngineDeps（因为需要运行时解析 provider） */
    private readonly resolveEngineDeps: () => Promise<ScoringEngineDeps>,
    private readonly logger: FastifyBaseLogger,
    config?: Partial<ScoringDaemonConfig>,
    /** 动态获取评分闭环配置（每次评分周期从 businessConfigService 读取最新值） */
    private readonly resolveScoringLoopConfig?: () => ScoringLoopConfig,
    private readonly ctx?: () => Promise<{ ctx: import("../../core/app-context.js").AppContext; routeKey: string }>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 运行状态 */
  get running(): boolean {
    return this.timer !== undefined;
  }

  start(): void {
    this.logger.info(
      `[ScoringDaemon] started (interval=${this.config.intervalMs / 1000}s, batch=${this.config.batchSize})`,
    );
    this.scheduleNextRun();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.logger.info("[ScoringDaemon] stopped");
  }

  /** 手动触发一轮评分（用于测试） */
  async processOnce(): Promise<{ scored: number; failed: number }> {
    let scored = 0;
    let failed = 0;

    try {
      const now = Date.now();
      // 使用原子操作：FOR UPDATE SKIP LOCKED 锁定行并立即标记为 running
      // 防止多实例守护进程同时抢夺同一任务
      const jobs = await this.repos.systemJobs.fetchAndMarkRunning("quality_scoring", this.config.batchSize, now);
      if (jobs.length === 0) return { scored: 0, failed: 0 };

      this.logger.info(`[ScoringDaemon] locked ${jobs.length} scoring jobs`);

      // 懒加载 engine deps（每次 processOnce 解析一次 provider）
      const engineDeps = await this.resolveEngineDeps();

      // 获取 ctx 和 routeKey（用于 LLM 调用）
      const { ProviderRouteKeys } = await import("../../contracts/provider-route-keys.js");
      const { ctx: appCtx, routeKey: rawRouteKey } = await this.ctx?.() ?? {
        ctx: undefined as unknown as import("../../core/app-context.js").AppContext,
        routeKey: ProviderRouteKeys.SCRIPT_QUALITY_SCORING as import("../../contracts/provider-route-keys.js").ProviderRouteKey,
      };
      const routeKey = rawRouteKey as import("../../contracts/provider-route-keys.js").ProviderRouteKey;

      for (const job of jobs) {
        try {
          // 验证 input 字段类型（防止 JSONB 存储为字符串）
          const input = job.input as unknown as ScoringJobInput;
          if (!input || typeof input !== "object" || !input.scriptDataId) {
            throw new Error(`无效的评分任务输入：缺少 scriptDataId，jobId=${job.id}`);
          }

          const record = await scoreScript(input, engineDeps, appCtx, routeKey);

          await insertScore(this.repos, record);

          // 评分闭环：根据分数标记脚本质量状态（动态读取配置）
          const loopConfig = this.resolveScoringLoopConfig?.() ?? DEFAULT_SCORING_LOOP_CONFIG;
          if (loopConfig.enabled) {
            await markScriptQualityStatus(this.repos, input.scriptDataId, record.score, loopConfig);
          }

          // 完成任务（检查是否成功，防止操作已被 cleanup 标记的任务）
          const completed = await this.repos.systemJobs.complete(
            job.id,
            { score: record.score, scoringMethod: record.scoringMethod },
            now,
          );

          if (!completed) {
            this.logger.warn({ jobId: job.id, scriptDataId: input.scriptDataId }, "任务已被其他进程处理（可能被 stuck cleanup 标记为 failed）");
          } else {
            // 结构化日志：记录评分成功的关键字段
            this.logger.info(
              { jobId: job.id, scriptDataId: input.scriptDataId, score: record.score, method: record.scoringMethod },
              "[ScoringDaemon] 评分完成",
            );
          }

          scored++;
        } catch (err) {
          failed++;
          const errorMessage = err instanceof Error ? err.message : String(err);
          this.logger.error({ err, jobId: job.id }, "[ScoringDaemon] 评分失败");

          // 失败任务（检查是否成功，防止操作已被 cleanup 标记的任务）
          const failedJob = await this.repos.systemJobs.fail(job.id, errorMessage, now);
          if (!failedJob) {
            this.logger.warn({ jobId: job.id }, "任务已被其他进程处理，无法标记为失败");
          }
        }
      }
    } catch (err) {
      this.logger.error({ err }, "[ScoringDaemon] processOnce error");
    }

    return { scored, failed };
  }

  /** 递归调度下一轮 */
  private scheduleNextRun(): void {
    this.timer = setTimeout(async () => {
      await this.processOnce();
      this.scheduleNextRun();
    }, this.config.intervalMs);
  }
}
