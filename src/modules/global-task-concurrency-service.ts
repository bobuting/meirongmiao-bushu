/**
 * 全局任务并发控制服务
 * 使用 PostgreSQL advisory lock 实现原子并发检查
 * 超并发时任务写入 pending 排队，由 QueueDispatcher 调度提升为 running
 */

import type { Pool } from "pg";
import { getLogger } from "../core/logger/index.js";
import type { BusinessConfigService } from "./business-config-service.js";
import {
  DEFAULT_GLOBAL_TASK_CONFIG,
  type GlobalTaskConfig,
} from "../contracts/business-config-contract.js";
import { sseManager } from "./sse-manager.js";

const log = getLogger("global-task-concurrency");

/** 并发检查结果 */
export interface ConcurrencyCheckResult {
  allowed: boolean;
  reason?: string;
  errorCode?: string;
  /** 当前全局 running 任务数 */
  globalActiveCount: number;
  /** 当前用户 running 任务数 */
  userActiveCount: number;
  /** 当前全局排队任务数 */
  globalQueuedCount: number;
  /** 当前用户排队任务数 */
  userQueuedCount: number;
}

/** 任务创建结果 */
export interface JobCreatedResult {
  jobId: string;
  /** 是否直接获得执行槽位（false 表示在排队） */
  running: boolean;
  /** 排队位置（running=true 时为 0） */
  queuePosition: number;
}

/** 任务创建失败结果 */
export interface JobRejectedResult {
  error: string;
  errorCode: string;
}

/** Advisory lock ID（固定值，用于全局并发控制） */
const CONCURRENCY_LOCK_ID = 12345;

/**
 * 全局任务并发控制服务
 * 并发检查只数 running 状态；超限时写入 pending 排队
 */
export class GlobalTaskConcurrencyService {
  private onJobCreatedCallback?: (jobId: string, running: boolean) => void;

  constructor(
    private pool: Pool,
    private businessConfigService: BusinessConfigService,
  ) {}

  /** 注册任务创建回调（QueueDispatcher 使用） */
  onJobCreated(callback: (jobId: string, running: boolean) => void): void {
    this.onJobCreatedCallback = callback;
  }

  /**
   * 原子并发检查 + 任务创建
   * - initialStatus="pending"：强制创建为 pending，由 QueueDispatcher 调度
   * - initialStatus 未指定：
   *   - 有 running 槽位：创建 pending 并立即标记 running
   *   - 无 running 槽位但队列未满：创建 pending 排队
   *   - 队列已满：拒绝
   */
  async createJobWithConcurrencyCheck(
    userId: string,
    jobType: string,
    projectId: string | null,
    input: Record<string, unknown>,
    now: number,
    parentJobId?: string,
    dependsOn?: string[],
    initialStatus?: "pending" | "running",
    executionMode?: "once" | "poll",
  ): Promise<JobCreatedResult | JobRejectedResult> {
    const config = this.getConfig();
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // 1. 获取全局锁（防止并发创建竞态）
      await client.query(`SELECT pg_advisory_xact_lock(${CONCURRENCY_LOCK_ID})`);

      // 2. 统计 running 任务数（并发槽位占用）
      const runningResult = await client.query(
        `SELECT COUNT(*) as count FROM nrm_async_jobs WHERE status = 'running'`,
      );
      const runningCount = Number(runningResult.rows[0]?.count ?? 0);

      // 3. 统计用户 running 任务数
      const userRunningResult = await client.query(
        `SELECT COUNT(*) as count FROM nrm_async_jobs WHERE user_id = $1 AND status = 'running'`,
        [userId],
      );
      const userRunningCount = Number(userRunningResult.rows[0]?.count ?? 0);

      // 4. 判断是否能直接获得执行槽位
      const hasGlobalSlot = runningCount < config.maxGlobalConcurrent;
      const hasUserSlot = userRunningCount < config.maxPerUserConcurrent;

      // 【并发改造】initialStatus="pending" 时强制创建为 pending，由 QueueDispatcher 调度
      // 统一模式：所有任务都由 QueueDispatcher 驱动，不再立即执行
      if (initialStatus === "pending") {
        // 检查队列限制
        const queuedResult = await client.query(
          `SELECT COUNT(*) as count FROM nrm_async_jobs WHERE status = 'pending'`,
        );
        const queuedCount = Number(queuedResult.rows[0]?.count ?? 0);

        const userQueuedResult = await client.query(
          `SELECT COUNT(*) as count FROM nrm_async_jobs WHERE user_id = $1 AND status = 'pending'`,
          [userId],
        );
        const userQueuedCount = Number(userQueuedResult.rows[0]?.count ?? 0);

        if (queuedCount >= config.maxQueueSize) {
          await client.query("ROLLBACK");
          log.warn({ userId, jobType, queuedCount, limit: config.maxQueueSize }, "全局队列已满");
          return {
            error: "系统任务队列已满，请稍后再试",
            errorCode: "GLOBAL_QUEUE_FULL",
          };
        }

        if (userQueuedCount >= config.maxPerUserQueued) {
          await client.query("ROLLBACK");
          log.warn({ userId, jobType, userQueuedCount, limit: config.maxPerUserQueued }, "用户排队限制");
          return {
            error: `您的排队任务数已达上限（${config.maxPerUserQueued}个），请等待当前任务完成后再试`,
            errorCode: "USER_QUEUE_FULL",
          };
        }

        // 强制创建为 pending
        const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await client.query(
          `INSERT INTO nrm_async_jobs (id, user_id, job_type, project_id, input, status, created_at, updated_at, visible_to_user, parent_job_id, depends_on, execution_mode)
           VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, true, $8, $9, $10)`,
          [jobId, userId, jobType, projectId, JSON.stringify(input), now, now, parentJobId ?? null, dependsOn ?? null, executionMode ?? "once"],
        );
        await client.query("COMMIT");

        // 排队位置
        const positionResult = await this.pool.query(
          `SELECT COUNT(*) as count FROM nrm_async_jobs
           WHERE status = 'pending' AND created_at < (SELECT created_at FROM nrm_async_jobs WHERE id = $1)`,
          [jobId],
        );
        const queuePosition = Number(positionResult.rows[0]?.count ?? 0) + 1;

        log.info({ jobId, userId, jobType, queuePosition, forcedPending: true }, "任务强制排队（统一模式）");
        this.onJobCreatedCallback?.(jobId, false);
        return { jobId, running: false, queuePosition };
      }

      // 原有逻辑：有槽位时直接创建为 running
      if (hasGlobalSlot && hasUserSlot) {
        // 直接创建为 running
        const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await client.query(
          `INSERT INTO nrm_async_jobs (id, user_id, job_type, project_id, input, status, created_at, updated_at, visible_to_user, parent_job_id, depends_on, execution_mode)
           VALUES ($1, $2, $3, $4, $5, 'running', $6, $7, true, $8, $9, $10)`,
          [jobId, userId, jobType, projectId, JSON.stringify(input), now, now, parentJobId ?? null, dependsOn ?? null, executionMode ?? "once"],
        );
        await client.query("COMMIT");
        log.info({ jobId, userId, jobType, runningCount, userRunningCount }, "任务直接执行");
        this.onJobCreatedCallback?.(jobId, true);
        return { jobId, running: true, queuePosition: 0 };
      }

      // 5. 无执行槽位，检查队列限制
      const queuedResult = await client.query(
        `SELECT COUNT(*) as count FROM nrm_async_jobs WHERE status = 'pending'`,
      );
      const queuedCount = Number(queuedResult.rows[0]?.count ?? 0);

      const userQueuedResult = await client.query(
        `SELECT COUNT(*) as count FROM nrm_async_jobs WHERE user_id = $1 AND status = 'pending'`,
        [userId],
      );
      const userQueuedCount = Number(userQueuedResult.rows[0]?.count ?? 0);

      if (queuedCount >= config.maxQueueSize) {
        await client.query("ROLLBACK");
        log.warn({ userId, jobType, queuedCount, limit: config.maxQueueSize }, "全局队列已满");
        return {
          error: "系统任务队列已满，请稍后再试",
          errorCode: "GLOBAL_QUEUE_FULL",
        };
      }

      if (userQueuedCount >= config.maxPerUserQueued) {
        await client.query("ROLLBACK");
        log.warn({ userId, jobType, userQueuedCount, limit: config.maxPerUserQueued }, "用户排队限制");
        return {
          error: `您的排队任务数已达上限（${config.maxPerUserQueued}个），请等待当前任务完成后再试`,
          errorCode: "USER_QUEUE_FULL",
        };
      }

      // 6. 写入 pending 排队
      const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await client.query(
        `INSERT INTO nrm_async_jobs (id, user_id, job_type, project_id, input, status, created_at, updated_at, visible_to_user, parent_job_id, depends_on, execution_mode)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, true, $8, $9, $10)`,
        [jobId, userId, jobType, projectId, JSON.stringify(input), now, now, parentJobId ?? null, dependsOn ?? null, executionMode ?? "once"],
      );
      await client.query("COMMIT");

      // 排队位置 = 该用户 pending 任务中排在自己前面的数量
      const positionResult = await this.pool.query(
        `SELECT COUNT(*) as count FROM nrm_async_jobs
         WHERE status = 'pending' AND created_at < (SELECT created_at FROM nrm_async_jobs WHERE id = $1)`,
        [jobId],
      );
      const queuePosition = Number(positionResult.rows[0]?.count ?? 0) + 1;

      log.info({ jobId, userId, jobType, queuePosition }, "任务进入排队");
      this.onJobCreatedCallback?.(jobId, false);
      return { jobId, running: false, queuePosition };

    } catch (err) {
      await client.query("ROLLBACK");
      log.error({ userId, jobType, err }, "任务创建失败");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * 检查是否允许创建新任务（不实际创建）
   * 返回当前状态和队列信息
   */
  async checkCanCreateJob(userId: string): Promise<ConcurrencyCheckResult> {
    const config = this.getConfig();

    const runningResult = await this.pool.query(
      `SELECT COUNT(*) as count FROM nrm_async_jobs WHERE status = 'running'`,
    );
    const globalActiveCount = Number(runningResult.rows[0]?.count ?? 0);

    const userRunningResult = await this.pool.query(
      `SELECT COUNT(*) as count FROM nrm_async_jobs WHERE user_id = $1 AND status = 'running'`,
      [userId],
    );
    const userActiveCount = Number(userRunningResult.rows[0]?.count ?? 0);

    const queuedResult = await this.pool.query(
      `SELECT COUNT(*) as count FROM nrm_async_jobs WHERE status = 'pending'`,
    );
    const globalQueuedCount = Number(queuedResult.rows[0]?.count ?? 0);

    const userQueuedResult = await this.pool.query(
      `SELECT COUNT(*) as count FROM nrm_async_jobs WHERE user_id = $1 AND status = 'pending'`,
      [userId],
    );
    const userQueuedCount = Number(userQueuedResult.rows[0]?.count ?? 0);

    // 用户队列已满 → 拒绝
    if (userQueuedCount >= config.maxPerUserQueued) {
      return {
        allowed: false,
        reason: `您的排队任务数已达上限（${config.maxPerUserQueued}个），请等待当前任务完成`,
        errorCode: "USER_QUEUE_FULL",
        globalActiveCount,
        userActiveCount,
        globalQueuedCount,
        userQueuedCount,
      };
    }

    // 全局队列已满 → 拒绝
    if (globalQueuedCount >= config.maxQueueSize) {
      return {
        allowed: false,
        reason: "系统任务队列已满，请稍后再试",
        errorCode: "GLOBAL_QUEUE_FULL",
        globalActiveCount,
        userActiveCount,
        globalQueuedCount,
        userQueuedCount,
      };
    }

    return {
      allowed: true,
      globalActiveCount,
      userActiveCount,
      globalQueuedCount,
      userQueuedCount,
    };
  }

  /**
   * 清理超时的 pending 任务（排队超时）
   * 同时清理其所有子任务（防止父任务排队超时后子任务继续运行）
   */
  async timeoutPendingJobs(): Promise<{ parentCount: number; childCount: number }> {
    const config = this.getConfig();
    const timeoutMs = config.queueTimeoutMinutes * 60 * 1000;
    const now = Date.now();

    // 1. 查询超时的 pending 父任务（parent_job_id IS NULL）
    const parentResult = await this.pool.query(
      `SELECT id, user_id, job_type FROM nrm_async_jobs
       WHERE status = 'pending' AND created_at < $1 AND parent_job_id IS NULL`,
      [now - timeoutMs],
    );

    const parentCount = parentResult.rows.length;

    if (parentCount === 0) {
      return { parentCount: 0, childCount: 0 };
    }

    const parentIds = parentResult.rows.map((r) => r.id as string);

    // 2. 递归查询所有子任务（pending/running）并收集 SSE 信息
    const childJobsForSSE: Array<{ jobId: string; jobType: string; userId: string }> = [];
    const childCount = await this.timeoutChildJobs(parentIds, now, childJobsForSSE);

    // 3. 将父任务标记为 failed
    await this.pool.query(
      `UPDATE nrm_async_jobs
       SET status = 'failed',
           error = $1,
           updated_at = $2
       WHERE id = ANY($3)`,
      [
        JSON.stringify({
          code: "QUEUE_TIMEOUT",
          message: `排队超时（超过${config.queueTimeoutMinutes}分钟），请重试`,
        }),
        now,
        parentIds,
      ],
    );

    log.info(
      { parentCount, childCount, timeoutMinutes: config.queueTimeoutMinutes },
      "清理排队超时任务及其子任务",
    );

    // 4. 推送 SSE 信号
    // 推送父任务超时信号
    for (const row of parentResult.rows) {
      sseManager.pushToUser(row.user_id, {
        type: "job_failed",
        jobId: row.id,
        jobType: row.job_type,
        status: "failed",
        error: { code: "QUEUE_TIMEOUT", message: `排队超时（超过${config.queueTimeoutMinutes}分钟），请重试` },
        timestamp: now,
      });
    }

    // 推送子任务取消信号
    for (const job of childJobsForSSE) {
      sseManager.pushToUser(job.userId, {
        type: "job_failed",
        jobId: job.jobId,
        jobType: job.jobType,
        status: "failed",
        error: { code: "PARENT_QUEUE_TIMEOUT", message: "父任务排队超时，子任务自动取消" },
        timestamp: now,
      });
    }

    return { parentCount, childCount };
  }

  /**
   * 递归清理子任务
   * 给定父任务 ID 列表，查找并清理所有 pending/running 子任务
   */
  private async timeoutChildJobs(
    parentIds: string[],
    now: number,
    sseJobs: Array<{ jobId: string; jobType: string; userId: string }>,
  ): Promise<number> {
    if (parentIds.length === 0) return 0;

    // 查询直接子任务
    const childResult = await this.pool.query(
      `SELECT id, job_type, user_id FROM nrm_async_jobs
       WHERE parent_job_id = ANY($1) AND status IN ('pending', 'running')`,
      [parentIds],
    );

    const childIds = childResult.rows.map((r) => r.id as string);
    const childCount = childIds.length;

    if (childCount === 0) return 0;

    // 将子任务标记为 failed
    await this.pool.query(
      `UPDATE nrm_async_jobs
       SET status = 'failed',
           error = $1,
           updated_at = $2
       WHERE id = ANY($3)`,
      [
        JSON.stringify({
          code: "PARENT_QUEUE_TIMEOUT",
          message: "父任务排队超时，子任务自动取消",
        }),
        now,
        childIds,
      ],
    );

    log.info({ childCount, parentIds }, "清理父任务排队超时的子任务");

    // 收集 SSE 推送信息
    for (const row of childResult.rows) {
      sseJobs.push({
        jobId: row.id,
        jobType: row.job_type,
        userId: row.user_id,
      });
    }

    // 递归清理子任务的子任务（多层级任务树）
    const nestedChildCount = await this.timeoutChildJobs(childIds, now, sseJobs);

    return childCount + nestedChildCount;
  }

  /**
   * 获取当前配置
   */
  private getConfig(): GlobalTaskConfig {
    return this.businessConfigService.get("global_task", DEFAULT_GLOBAL_TASK_CONFIG);
  }
}
