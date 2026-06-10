/**
 * 队列调度器
 * 将 pending 任务按 FIFO 提升为 running
 * 支持：周期扫描兜底 + 任务完成时即时触发
 * 提升后清除 queued stage 并发出回调通知执行层
 */

import type { Pool } from "pg";
import { getLogger } from "../core/logger/index.js";
import type { BusinessConfigService } from "./business-config-service.js";
import type { ExecutorRegistry } from "../core/executor-registry.js";
import type { AppContext } from "../core/app-context.js";
import {
  DEFAULT_GLOBAL_TASK_CONFIG,
  type GlobalTaskConfig,
} from "../contracts/business-config-contract.js";
import { sseManager } from "./sse-manager.js";
import { PgAsyncJobRepository } from "../repositories/pg/async-job-pg-repository.js";

const log = getLogger("queue-dispatcher");

/** 调度器配置 */
export interface QueueDispatcherConfig {
  /** 周期扫描间隔（毫秒），默认 10 秒 */
  intervalMs: number;
}

const DEFAULT_DISPATCHER_CONFIG: QueueDispatcherConfig = {
  intervalMs: 10_000,
};

/** 单次提升结果 */
export interface PromoteResult {
  /** 提升的任务数 */
  promoted: number;
  /** 跳过的任务数（用户槽位不足） */
  skipped: number;
}

/** 提升事件 */
export interface PromoteEvent {
  jobId: string;
  jobType: string;
  userId: string;
  projectId: string | null;
}

export class QueueDispatcher {
  private timer?: NodeJS.Timeout;
  private promoting = false;
  /** AppContext 引用（在 ctx 构建完成后通过 setter 注入） */
  private ctx?: AppContext;

  constructor(
    private pool: Pool,
    private businessConfigService: BusinessConfigService,
    private executorRegistry: ExecutorRegistry,
    private config: QueueDispatcherConfig = DEFAULT_DISPATCHER_CONFIG,
  ) {}

  /** 注入 AppContext（解决循环依赖：ctx 构建完成后调用） */
  setContext(ctx: AppContext): void {
    this.ctx = ctx;
  }

  /** 启动周期扫描 */
  start(): void {
    log.info({ intervalMs: this.config.intervalMs }, "QueueDispatcher started");
    this.scheduleNextRun();
  }

  /** 停止周期扫描 */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    log.info("QueueDispatcher stopped");
  }

  /**
   * 尝试提升 pending 任务为 running
   * 任务完成时调用（即时触发），也可由周期扫描触发
   *
   * 注意：事务内部通过 PgAsyncJobRepository（使用 client）执行所有 SQL，
   * 符合 Route → Module → Repository 分层规范
   */
  async tryPromote(): Promise<PromoteResult> {
    // 防止重入
    if (this.promoting) {
      return { promoted: 0, skipped: 0 };
    }
    this.promoting = true;

    try {
      const config = this.getConfig();
      const client = await this.pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(`SELECT pg_advisory_xact_lock(12345)`);

        // 创建事务级别的 repo（所有 SQL 通过 client 执行）
        const txRepo = new PgAsyncJobRepository(this.pool, client);
        const now = Date.now();

        // 1. 统计当前 running 数量
        const runningCount = await txRepo.countRunning();
        const globalSlotsAvailable = config.maxGlobalConcurrent - runningCount;

        if (globalSlotsAvailable <= 0) {
          await client.query("COMMIT");
          return { promoted: 0, skipped: 0 };
        }

        // 收集所有失败任务的 SSE 推送信息
        const failedJobsForSSE: Array<{ jobId: string; jobType: string; userId: string; error: { code: string; message: string } }> = [];

        // 1.5. 清理 orphaned 帧任务：父批量任务已结束但子帧仍卡在 pending
        const orphanedCleanupRows = await txRepo.cleanupOrphanedFrameJobs(
          JSON.stringify({ code: "ORPHANED", message: "父批量任务已结束，子帧任务自动取消" }),
          now,
        );

        if (orphanedCleanupRows.length > 0) {
          log.info({ count: orphanedCleanupRows.length }, "清理 orphaned 帧任务：父任务已结束");
          for (const row of orphanedCleanupRows) {
            failedJobsForSSE.push({
              jobId: row.id,
              jobType: row.job_type,
              userId: row.user_id,
              error: { code: "ORPHANED", message: "父批量任务已结束，子帧任务自动取消" },
            });
          }
        }

        // 1.6. 失败传播：将依赖 failed job 的 pending job 标记为 failed
        const failedPropagationRows = await txRepo.propagateDependencyFailures(
          JSON.stringify({ code: "DEPENDENCY_FAILED", message: "依赖的上游任务已失败，本任务自动取消" }),
          now,
        );

        if (failedPropagationRows.length > 0) {
          const failedIds = failedPropagationRows.map(r => r.id);
          log.info({ count: failedPropagationRows.length, ids: failedIds }, "失败传播：依赖 failed 的 pending job 已标记为 failed");

          for (const row of failedPropagationRows) {
            failedJobsForSSE.push({
              jobId: row.id,
              jobType: row.job_type,
              userId: row.user_id,
              error: { code: "DEPENDENCY_FAILED", message: "依赖的上游任务已失败，本任务自动取消" },
            });
          }

          // 收集受影响的父任务 ID，取消同一父任务下的所有其他 running/pending 子任务
          const affectedParentIds = [...new Set(failedPropagationRows.map(r => r.parent_job_id).filter(Boolean) as string[])];
          if (affectedParentIds.length > 0) {
            // 取消父任务下所有 running/pending 子任务（排除已标记为 failed 的）
            const cancelRows = await txRepo.cancelSiblingsByParentIds(
              affectedParentIds,
              failedIds,
              JSON.stringify({ code: "PARENT_CANCELED", message: "父任务因子任务失败而取消" }),
              now,
            );
            if (cancelRows.length > 0) {
              log.info({ count: cancelRows.length, parentIds: affectedParentIds }, "父任务取消：停止所有 running/pending 子任务");
              for (const row of cancelRows) {
                failedJobsForSSE.push({
                  jobId: row.id,
                  jobType: row.job_type,
                  userId: row.user_id,
                  error: { code: "PARENT_CANCELED", message: "父任务因子任务失败而取消" },
                });
              }
            }

            // 标记父任务为 failed
            const parentFailRows = await txRepo.failParentJobs(
              affectedParentIds,
              JSON.stringify({ code: "CHILD_FAILED", message: "子任务失败，父任务自动取消" }),
              now,
            );
            if (parentFailRows.length > 0) {
              log.info({ parentIds: affectedParentIds }, "父任务已标记为 failed");
              for (const row of parentFailRows) {
                failedJobsForSSE.push({
                  jobId: row.id,
                  jobType: row.job_type,
                  userId: row.user_id,
                  error: { code: "CHILD_FAILED", message: "子任务失败，父任务自动取消" },
                });
              }
            }
          }
        }

        // 2. 按 FIFO 获取 pending 任务（排除依赖未满足的）
        const pendingRows = await txRepo.findPromotablePending(
          Math.min(globalSlotsAvailable + 50, 200),
        );

        if (pendingRows.length === 0) {
          await client.query("COMMIT");
          return { promoted: 0, skipped: 0 };
        }

        // 3. 统计每个用户的 running 数量
        const userRunningMap = await txRepo.countRunningByUser();

        // 4. 逐个提升，检查用户限制
        let promoted = 0;
        let skipped = 0;
        const promotedJobs: PromoteEvent[] = [];

        for (const row of pendingRows) {
          if (promoted >= globalSlotsAvailable) break;

          const userId = row.user_id;
          const currentRunning = userRunningMap.get(userId) ?? 0;

          if (currentRunning >= config.maxPerUserConcurrent) {
            skipped++;
            continue;
          }

          promotedJobs.push({
            jobId: row.id,
            jobType: row.job_type,
            userId,
            projectId: row.project_id ?? null,
          });
          userRunningMap.set(userId, currentRunning + 1);
          promoted++;
        }

        // 5. 批量提升 + 清除 queued stage
        if (promotedJobs.length > 0) {
          const ids = promotedJobs.map((j) => j.jobId);
          await txRepo.batchPromoteToRunning(ids, now);
          log.info({ promoted, skipped, ids }, "提升 pending 任务为 running");
        }

        await client.query("COMMIT");

        // 6. 事务提交后推送 SSE 信号（不阻塞主流程）
        for (const job of failedJobsForSSE) {
          sseManager.pushToUser(job.userId, {
            type: "job_failed",
            jobId: job.jobId,
            jobType: job.jobType,
            status: "failed",
            error: job.error,
            timestamp: now,
          });
        }

        for (const job of promotedJobs) {
          sseManager.pushToUser(job.userId, {
            type: "job_updated",
            jobId: job.jobId,
            jobType: job.jobType,
            timestamp: now,
          });
        }

        // 7. 调用 executor（异步，不阻塞提升流程）
        if (promotedJobs.length > 0) {
          this.invokeExecutors(promotedJobs);
        }

        return { promoted, skipped };

      } catch (err) {
        await client.query("ROLLBACK");
        log.error({ err }, "提升任务失败");
        throw err;
      } finally {
        client.release();
      }
    } finally {
      this.promoting = false;
    }
  }

  private getConfig(): GlobalTaskConfig {
    return this.businessConfigService.get("global_task", DEFAULT_GLOBAL_TASK_CONFIG);
  }

  private invokeExecutors(promotedJobs: PromoteEvent[]): void {
    for (const job of promotedJobs) {
      const executor = this.executorRegistry.get(job.jobType);
      if (!executor) {
        log.error({ jobId: job.jobId, jobType: job.jobType }, "executor 未注册，立即标记为 failed");
        this.finalizeUnregisteredJob(job.jobId, job.jobType, job.userId);
        continue;
      }

      if (!this.ctx) {
        log.error({ jobId: job.jobId }, "ctx 未注入，立即标记为 failed");
        this.finalizeUnregisteredJob(job.jobId, job.jobType, job.userId);
        continue;
      }

      // 异步调用 executor（不等待完成）
      executor({
        pool: this.pool,
        repos: this.ctx.repos as import("../repositories/pg/index.js").PgRepositoryCollection,
        jobId: job.jobId,
        ctx: this.ctx,
        dispatcher: this,
      }).catch((err: unknown) => {
        log.error({ err, jobId: job.jobId, jobType: job.jobType }, "executor 执行失败");
        this.finalizeCrashedJob(job.jobId, job.jobType, job.userId, err);
      });
    }
  }

  /** 处理未注册 executor 的任务（立即 finalize） */
  private async finalizeUnregisteredJob(jobId: string, jobType: string, userId: string): Promise<void> {
    const now = Date.now();
    const repo = this.getAsyncJobRepo();
    await repo.markAsFailed(
      jobId,
      JSON.stringify({ code: "EXECUTOR_NOT_FOUND", message: `executor ${jobType} 未注册` }),
      now,
    );
    sseManager.pushToUser(userId, {
      type: "job_failed",
      jobId,
      jobType,
      status: "failed",
      error: { code: "EXECUTOR_NOT_FOUND", message: `executor ${jobType} 未注册` },
      timestamp: now,
    });
  }

  /** executor 异常崩溃时 finalize 为 failed，防止 task 永远卡在 running */
  private async finalizeCrashedJob(jobId: string, jobType: string, userId: string, err: unknown): Promise<void> {
    const errMsg = err instanceof Error ? err.message : String(err);
    const now = Date.now();
    try {
      const repo = this.getAsyncJobRepo();
      const result = await repo.markAsFailedIfRunning(
        jobId,
        JSON.stringify({ code: "EXECUTOR_CRASH", message: `executor 异常: ${errMsg}` }),
        now,
      );
      if (result) {
        sseManager.pushToUser(userId, {
          type: "job_failed",
          jobId,
          jobType,
          status: "failed",
          error: { code: "EXECUTOR_CRASH", message: `executor 异常: ${errMsg}` },
          timestamp: now,
        });

        // 级联通知父任务
        if (result.parent_job_id) {
          const { checkAndFinalizeParent } = await import("../service/async-job-service.js");
          await checkAndFinalizeParent(this.ctx!.repos as import("../repositories/pg/index.js").PgRepositoryCollection, result.parent_job_id!, this, now);
        }
      }
    } catch (finalizeErr) {
      log.error({ err: finalizeErr, jobId }, "finalize crashed job 也失败");
    }
  }

  /**
   * 轮询 running 状态的 Query 任务
   * Query 任务查询外部 API，如果还没完成就保持 running，由这里定期重新调用
   * 用 updated_at 节流：至少间隔 30 秒才重新查询
   */
  private async pollRunningAsyncTasks(): Promise<void> {
    if (!this.ctx) return;

    const now = Date.now();
    // 节流时间改为 10秒，与调度器间隔同步，减少外部 API 完成后的等待时间
    const minUpdatedAt = now - 10_000;
    const repo = this.getAsyncJobRepo();
    const rows = await repo.findPollableRunning(minUpdatedAt, 20);

    if (rows.length === 0) return;

    // 先批量更新 updated_at，防止 executor 还没跑完就被下一个 poll 周期重复选取
    const polledJobIds = rows.map((r) => r.id);
    await repo.batchUpdateHeartbeat(polledJobIds, now);

    log.info({ count: rows.length }, "轮询 running Query 任务");

    for (const row of rows) {
      const executor = this.executorRegistry.get(row.job_type);
      if (!executor || !this.ctx) continue;

      executor({
        pool: this.pool,
        repos: this.ctx.repos as import("../repositories/pg/index.js").PgRepositoryCollection,
        jobId: row.id,
        ctx: this.ctx,
        dispatcher: this,
      }).catch((err: unknown) => {
        log.error({ err, jobId: row.id, jobType: row.job_type }, "轮询 running 任务执行失败");
        this.finalizeCrashedJob(row.id, row.job_type, row.user_id, err);
      });
    }
  }

  /** 获取 AsyncJob repo（优先从 ctx.repos，回退到独立创建） */
  private getAsyncJobRepo(): PgAsyncJobRepository {
    if (this.ctx) {
      return this.ctx.repos.asyncJobs as PgAsyncJobRepository;
    }
    return new PgAsyncJobRepository(this.pool);
  }

  private scheduleNextRun(): void {
    this.timer = setTimeout(async () => {
      try {
        await this.tryPromote();
      } catch {
        // 错误已在 tryPromote 内部记录
      }
      try {
        await this.pollRunningAsyncTasks();
      } catch {
        // 错误已在内部记录
      }
      this.scheduleNextRun();
    }, this.config.intervalMs);
  }
}
