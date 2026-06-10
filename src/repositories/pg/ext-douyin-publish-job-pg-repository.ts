/**
 * 扩展抖音发布任务 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 扩展发布任务记录 */
export interface ExtDouyinPublishJobRecord {
  id: string;
  userId: string;
  projectId: string;
  accountId: string;
  status: JobStatus;
  stage: string | null;
  inputJson: PublishJobInput;
  resultJson: PublishJobResult | null;
  errorJson: JobError | null;
  createdAt: number;
  updatedAt: number;
  claimedAt: number | null;
  completedAt: number | null;
}

export type JobStatus =
  | "pending"
  | "claimed"
  | "running"
  | "completed"
  | "failed"
  | "expired";

export interface PublishJobInput {
  videoUrl: string;
  title: string;
  tags: string[];
  coverImageUrl: string | null;
  publishDate: number;
  aiGeneratedDeclaration: boolean;
}

export interface PublishJobResult {
  ok: boolean;
  message: string;
  douyinItemId: string | null;
}

export interface JobError {
  code: string;
  message: string;
}

export class PgExtDouyinPublishJobRepository extends PgBaseRepository<ExtDouyinPublishJobRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("ext_douyin_publish_jobs"), client);
  }

  protected mapRow(row: Record<string, unknown>): ExtDouyinPublishJobRecord {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      projectId: row.project_id as string,
      accountId: row.account_id as string,
      status: row.status as JobStatus,
      stage: (row.stage as string) ?? null,
      inputJson: this.parseJsonField<PublishJobInput>(row.input_json),
      resultJson: row.result_json != null ? this.parseJsonField<PublishJobResult>(row.result_json) : null,
      errorJson: row.error_json != null ? this.parseJsonField<JobError>(row.error_json) : null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      claimedAt: (row.claimed_at as number) ?? null,
      completedAt: (row.completed_at as number) ?? null,
    };
  }

  protected mapEntity(entity: ExtDouyinPublishJobRecord): Record<string, unknown> {
    return {
      id: entity.id,
      user_id: entity.userId,
      project_id: entity.projectId,
      account_id: entity.accountId,
      status: entity.status,
      stage: entity.stage,
      input_json: JSON.stringify(entity.inputJson),
      result_json: entity.resultJson != null ? JSON.stringify(entity.resultJson) : null,
      error_json: entity.errorJson != null ? JSON.stringify(entity.errorJson) : null,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
      claimed_at: entity.claimedAt,
      completed_at: entity.completedAt,
    };
  }

  private parseJsonField<T>(value: unknown): T {
    if (typeof value === "string") return JSON.parse(value) as T;
    return value as T;
  }

  /** 创建发布任务 */
  async createJob(input: {
    id: string;
    userId: string;
    projectId: string;
    accountId: string;
    inputJson: PublishJobInput;
    now: number;
  }): Promise<ExtDouyinPublishJobRecord> {
    const result = await this.queryClient.query(
      `INSERT INTO ${this.tableName}
       (id, user_id, project_id, account_id, status, input_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $6)
       RETURNING *`,
      [input.id, input.userId, input.projectId, input.accountId, JSON.stringify(input.inputJson), input.now]
    );
    return this.mapRow(result.rows[0]!);
  }

  /** 查询用户的发布任务列表 */
  async listByUserId(userId: string, limit = 50): Promise<ExtDouyinPublishJobRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 查询单条发布任务 */
  async findByIdAndUserId(userId: string, jobId: string): Promise<ExtDouyinPublishJobRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1 AND user_id = $2`,
      [jobId, userId]
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]!) : null;
  }

  /** 过期超时的 claimed/running 任务（超过 2 小时未更新视为卡死） */
  async expireStaleJobs(userId: string, ttlMs = 2 * 60 * 60 * 1_000): Promise<number> {
    const cutoff = Date.now() - ttlMs;
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = 'expired',
           error_json = $1,
           completed_at = $2,
           updated_at = $2
       WHERE user_id = $3
         AND status IN ('claimed', 'running')
         AND claimed_at IS NOT NULL
         AND updated_at < $4`,
      [JSON.stringify({ code: "TIMEOUT", message: "任务超时，可能因扩展重启或页面关闭" }), Date.now(), userId, cutoff]
    );
    return result.rowCount ?? 0;
  }

  /** 扩展轮询：获取下一个待执行任务 */
  async pollNextPending(userId: string): Promise<ExtDouyinPublishJobRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 1`,
      [userId]
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]!) : null;
  }

  /** 扩展认领任务（pending → claimed，原子操作） */
  async claimJob(userId: string, jobId: string, now: number): Promise<boolean> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = 'claimed', claimed_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3 AND status = 'pending'`,
      [now, jobId, userId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  /** 扩展上报进度（仅允许从 claimed/running 转换） */
  async reportProgress(userId: string, jobId: string, stage: string, now: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = 'running', stage = $1, updated_at = $2
       WHERE id = $3 AND user_id = $4 AND status IN ('claimed', 'running')`,
      [stage, now, jobId, userId]
    );
  }

  /** 扩展完成任务（仅允许从 claimed/running 转换） */
  async completeJob(userId: string, jobId: string, result: PublishJobResult, now: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = 'completed', result_json = $1, completed_at = $2, updated_at = $2
       WHERE id = $3 AND user_id = $4 AND status IN ('claimed', 'running')`,
      [JSON.stringify(result), now, jobId, userId]
    );
  }

  /** 扩展失败（仅允许从 claimed/running 转换） */
  async failJob(userId: string, jobId: string, error: JobError, now: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = 'failed', error_json = $1, completed_at = $2, updated_at = $2
       WHERE id = $3 AND user_id = $4 AND status IN ('claimed', 'running')`,
      [JSON.stringify(error), now, jobId, userId]
    );
  }
}