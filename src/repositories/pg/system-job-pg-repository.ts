/**
 * 系统任务 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { getLogger } from "../../core/logger/index.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

const log = getLogger("SystemJobRepo");

/** 系统任务状态 */
export type SystemJobStatus = "pending" | "running" | "completed" | "failed" | "retrying";

/** 系统任务记录（完整字段，含 input/result） */
export interface SystemJobRecord {
  id: string;
  jobType: string;
  input: Record<string, unknown>;
  status: SystemJobStatus;
  priority: number;
  retryCount: number;
  maxRetries: number;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  scheduledAt: number | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export class PgSystemJobRepository extends PgBaseRepository<SystemJobRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("system_jobs"), client);
  }

  protected mapRow(row: Record<string, unknown>): SystemJobRecord {
    return {
      id: row.id as string,
      jobType: row.job_type as string,
      input: row.input as Record<string, unknown>,
      status: row.status as SystemJobStatus,
      priority: (row.priority as number) ?? 0,
      retryCount: (row.retry_count as number) ?? 0,
      maxRetries: (row.max_retries as number) ?? 0,
      result: row.result as Record<string, unknown> | null,
      errorMessage: (row.error_message as string) ?? null,
      scheduledAt: (row.scheduled_at as number) ?? null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      startedAt: (row.started_at as number) ?? null,
      completedAt: (row.completed_at as number) ?? null,
    };
  }

  protected mapEntity(entity: SystemJobRecord): Record<string, unknown> {
    return {
      id: entity.id,
      job_type: entity.jobType,
      input: entity.input,
      status: entity.status,
      priority: entity.priority,
      retry_count: entity.retryCount,
      max_retries: entity.maxRetries,
      result: entity.result,
      error_message: entity.errorMessage,
      scheduled_at: entity.scheduledAt,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
      started_at: entity.startedAt,
      completed_at: entity.completedAt,
    };
  }

  /** 管理员系统任务列表（动态过滤 + 分页） */
  async findWithFilters(options: {
    jobType?: string;
    status?: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: Record<string, unknown>[]; total: number; stats: Record<string, number> }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (options.jobType) {
      conditions.push(`job_type = $${idx++}`);
      params.push(options.jobType);
    }
    if (options.status) {
      conditions.push(`status = $${idx++}`);
      params.push(options.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const dataResult = await this.queryClient.query(
      `SELECT id, job_type, input, status, priority, retry_count, max_retries, result, error_message,
              scheduled_at, created_at, updated_at, started_at, completed_at
       FROM ${this.tableName}
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, options.limit, options.offset],
    );

    const countResult = await this.queryClient.query(
      `SELECT COUNT(*) as total FROM ${this.tableName} ${where}`,
      params,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const statsResult = await this.queryClient.query(
      `SELECT status, COUNT(*) as count FROM ${this.tableName} ${where} GROUP BY status`,
      params,
    );
    const stats: Record<string, number> = {};
    for (const row of statsResult.rows) {
      stats[row.status as string] = Number(row.count);
    }

    return { rows: dataResult.rows, total, stats };
  }

  /** 创建系统任务 */
  async insertSystemJob(params: {
    id: string;
    jobType: string;
    input: Record<string, unknown>;
    priority?: number;
    maxRetries?: number;
    scheduledAt?: number | null;
    now: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (id, job_type, input, status, priority, retry_count, max_retries, scheduled_at, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, 'pending', $4, 0, $5, $6, $7, $7)`,
      [
        params.id,
        params.jobType,
        JSON.stringify(params.input),
        params.priority ?? 0,
        params.maxRetries ?? 3,
        params.scheduledAt ?? null,
        params.now,
      ],
    );
  }

  /** 批量获取待处理任务（不锁定，仅用于查询统计等场景） */
  async fetchPending(jobType: string, limit: number, now: number): Promise<SystemJobRecord[]> {
    const { rows } = await this.queryClient.query(
      `SELECT id, job_type, input, status, priority, retry_count, max_retries, result, error_message,
              scheduled_at, created_at, updated_at, started_at, completed_at
       FROM ${this.tableName}
       WHERE job_type = $1 AND status IN ('pending', 'retrying')
         AND (scheduled_at IS NULL OR scheduled_at <= $2)
       ORDER BY priority DESC, created_at ASC
       LIMIT $3`,
      [jobType, now, limit],
    );
    return rows.map((row: Record<string, unknown>) => this.mapRow(row));
  }

  /**
   * 原子获取并锁定待处理任务（防止多实例竞态）
   *
   * 使用 FOR UPDATE SKIP LOCKED 行级锁：
   * - 锁定选中行，阻止其他事务同时获取
   * - SKIP LOCKED 跳过已被锁定的行，不会阻塞等待
   * - 在同一事务内立即更新状态为 running
   */
  async fetchAndMarkRunning(jobType: string, limit: number, now: number): Promise<SystemJobRecord[]> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // SELECT ... FOR UPDATE SKIP LOCKED 锁定行并跳过已被锁定的行
      const { rows } = await client.query(
        `SELECT id, job_type, input, status, priority, retry_count, max_retries, result, error_message,
                scheduled_at, created_at, updated_at, started_at, completed_at
         FROM ${this.tableName}
         WHERE job_type = $1 AND status IN ('pending', 'retrying')
           AND (scheduled_at IS NULL OR scheduled_at <= $2)
         ORDER BY priority DESC, created_at ASC
         LIMIT $3
         FOR UPDATE SKIP LOCKED`,
        [jobType, now, limit],
      );

      if (rows.length === 0) {
        await client.query("COMMIT");
        return [];
      }

      // 批量更新状态为 running，使用 RETURNING 获取实际更新的行
      const jobIds = rows.map((r: Record<string, unknown>) => r.id);
      const { rows: updatedRows } = await client.query(
        `UPDATE ${this.tableName}
         SET status = 'running', started_at = $2, updated_at = $2
         WHERE id = ANY($1)
         RETURNING id, job_type, input, status, priority, retry_count, max_retries, result, error_message,
                    scheduled_at, created_at, updated_at, started_at, completed_at`,
        [jobIds, now],
      );

      await client.query("COMMIT");
      return updatedRows.map((row: Record<string, unknown>) => this.mapRow(row));
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        log.error({ error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr) }, "ROLLBACK failed");
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /** 更新任务状态为运行中 */
  async markRunning(jobId: string, now: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = 'running', started_at = $2, updated_at = $2 WHERE id = $1`,
      [jobId, now],
    );
  }

  /**
   * 完成任务（成功）
   * 只更新状态为 running 的任务，防止操作已被 stuck cleanup 标记为 failed 的超时任务
   */
  async complete(jobId: string, result: Record<string, unknown>, now: number): Promise<boolean> {
    const { rowCount } = await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = 'completed', result = $2::jsonb, completed_at = $3, updated_at = $3
       WHERE id = $1 AND status = 'running'`,
      [jobId, JSON.stringify(result), now],
    );
    return rowCount !== null && rowCount > 0;
  }

  /**
   * 完成任务（失败）
   * 只更新状态为 running 的任务，防止操作已被 stuck cleanup 标记为 failed 的超时任务
   */
  async fail(jobId: string, errorMessage: string, now: number): Promise<boolean> {
    // 先查询当前重试次数（只查询 running 状态）
    const { rows } = await this.queryClient.query(
      `SELECT retry_count, max_retries FROM ${this.tableName} WHERE id = $1 AND status = 'running'`,
      [jobId],
    );

    if (rows.length === 0) return false;

    const retryCount = rows[0].retry_count as number;
    const maxRetries = rows[0].max_retries as number;

    // 判断是否可以重试
    if (retryCount < maxRetries) {
      const { rowCount } = await this.queryClient.query(
        `UPDATE ${this.tableName}
         SET status = 'retrying', retry_count = $2, error_message = $3, updated_at = $4
         WHERE id = $1 AND status = 'running'`,
        [jobId, retryCount + 1, errorMessage, now],
      );
      return rowCount !== null && rowCount > 0;
    } else {
      const { rowCount } = await this.queryClient.query(
        `UPDATE ${this.tableName}
         SET status = 'failed', error_message = $2, completed_at = $3, updated_at = $3
         WHERE id = $1 AND status = 'running'`,
        [jobId, errorMessage, now],
      );
      return rowCount !== null && rowCount > 0;
    }
  }

  /** 获取任务统计 */
  async getStats(jobType: string): Promise<{
    pending: number;
    running: number;
    completed: number;
    failed: number;
    retrying: number;
  }> {
    const { rows } = await this.queryClient.query(
      `SELECT status, COUNT(*) as count FROM ${this.tableName} WHERE job_type = $1 GROUP BY status`,
      [jobType],
    );

    const stats = { pending: 0, running: 0, completed: 0, failed: 0, retrying: 0 };
    for (const row of rows) {
      stats[row.status as keyof typeof stats] = Number(row.count);
    }
    return stats;
  }

  /** 清理过期任务（保留最近 N 天） */
  async cleanupOld(retentionDays: number, now: number): Promise<number> {
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE status IN ('completed', 'failed') AND completed_at < $1`,
      [cutoff],
    );
    return result.rowCount ?? 0;
  }

  // ===== stuck-job-cleanup-scheduler 所需方法 =====

  /** 查询超时的 running 系统任务 */
  async findStuckRunning(cutoff: number): Promise<Array<{ id: string; job_type: string; input: string }>> {
    const result = await this.queryClient.query(
      `SELECT id, job_type, input
       FROM ${this.tableName}
       WHERE status = 'running' AND created_at < $1`,
      [cutoff],
    );
    return result.rows;
  }

  /** 将超时系统任务标记为 failed */
  async markStuckFailed(jobId: string, errorMessage: string, now: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = 'failed', error_message = $2, updated_at = $3
       WHERE id = $1`,
      [jobId, errorMessage, now],
    );
  }
}
