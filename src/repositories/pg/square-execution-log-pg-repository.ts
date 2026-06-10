/**
 * 广场自动化执行日志 PG 仓库
 * 处理 nrm_square_execution_logs 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 执行类型 */
export type ExecutionType = "discovery" | "auto_publish";

/** 执行状态 */
export type ExecutionStatus = "running" | "success" | "failed";

/** 执行日志记录 */
export interface ExecutionLogRecord {
  id: string;
  type: ExecutionType;
  status: ExecutionStatus;
  summary: string | null;
  resultData: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export class PgSquareExecutionLogRepository extends PgBaseRepository<ExecutionLogRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("square_execution_logs"), client);
  }

  protected mapRow(row: Record<string, unknown>): ExecutionLogRecord {
    return {
      id: row.id as string,
      type: row.type as ExecutionType,
      status: row.status as ExecutionStatus,
      summary: row.summary as string | null,
      resultData: typeof row.result_data === "string"
        ? JSON.parse(row.result_data)
        : (row.result_data as Record<string, unknown> | null),
      startedAt: row.started_at as string,
      completedAt: row.completed_at as string | null,
      errorMessage: row.error_message as string | null,
      createdAt: row.created_at as string,
    };
  }

  protected mapEntity(entity: ExecutionLogRecord): Record<string, unknown> {
    return {
      id: entity.id,
      type: entity.type,
      status: entity.status,
      summary: entity.summary,
      result_data: entity.resultData ? JSON.stringify(entity.resultData) : null,
      started_at: entity.startedAt,
      completed_at: entity.completedAt,
      error_message: entity.errorMessage,
      created_at: entity.createdAt,
    };
  }

  /** 开始执行时插入一条 running 日志 */
  async start(type: ExecutionType): Promise<string> {
    const result = await this.queryClient.query(
      `INSERT INTO ${this.tableName} (type, status) VALUES ($1, 'running') RETURNING id`,
      [type],
    );
    return result.rows[0].id;
  }

  /** 检查今天是否已有成功执行记录 */
  async hasSucceededToday(type: ExecutionType): Promise<boolean> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*)::int as count
       FROM ${this.tableName}
       WHERE type = $1
         AND status = 'success'
         AND started_at >= CURRENT_DATE
         AND started_at < CURRENT_DATE + INTERVAL '1 day'`,
      [type],
    );
    return result.rows[0].count > 0;
  }

  /** 执行成功，更新日志 */
  async succeed(id: string, summary: string, resultData: Record<string, unknown>): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = 'success', summary = $1, result_data = $2, completed_at = now() WHERE id = $3`,
      [summary, JSON.stringify(resultData), id],
    );
  }

  /** 执行失败，更新日志 */
  async fail(id: string, errorMessage: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = 'failed', error_message = $1, completed_at = now() WHERE id = $2`,
      [errorMessage, id],
    );
  }

  /** 清理上次崩溃残留的 running 状态执行日志 */
  async cleanupStaleRunningLogs(): Promise<number> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = 'failed', error_message = '服务异常退出，执行中断', completed_at = NOW() WHERE status = 'running' AND type = 'auto_publish' RETURNING id`,
    );
    return result.rows.length;
  }

  /** 分页查询执行日志 */
  async listPaginated(params: {
    type?: ExecutionType;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: ExecutionLogRecord[]; total: number }> {
    const { type, page = 1, pageSize = 20 } = params;
    const offset = (page - 1) * pageSize;

    const where = type ? `WHERE type = $1` : "";
    const countParams = type ? [type] : [];

    const countResult = await this.queryClient.query(
      `SELECT COUNT(*)::int as total FROM ${this.tableName} ${where}`,
      countParams,
    );

    const dataResult = await this.queryClient.query(
      `SELECT *
       FROM ${this.tableName} ${where}
       ORDER BY started_at DESC
       LIMIT $${type ? 2 : 1} OFFSET $${type ? 3 : 2}`,
      type ? [type, pageSize, offset] : [pageSize, offset],
    );

    return { data: dataResult.rows.map(row => this.mapRow(row)), total: countResult.rows[0].total };
  }
}
