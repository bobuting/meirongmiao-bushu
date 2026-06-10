/**
 * 错误日志 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import type {
  ErrorLog,
  ErrorLogFilters,
  ErrorCodeCountResult,
  DateCountResult,
  CleanupStats,
  ErrorSeverity,
} from "../../contracts/error-log-contract.js";

export class PgErrorLogRepository extends PgBaseRepository<ErrorLog> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("error_logs"), client);
  }

  protected mapRow(row: Record<string, unknown>): ErrorLog {
    return {
      id: row.id as string,
      errorCode: row.error_code as string,
      errorMessage: row.error_message as string,
      errorStack: row.error_stack as string | null,
      severity: row.severity as ErrorSeverity,
      createdAt: row.created_at as number,
      userId: row.user_id as string | null,
      requestId: row.request_id as string | null,
      apiPath: row.api_path as string | null,
      sourceModule: row.source_module as string | null,
      llmModel: row.llm_model as string | null,
      llmInput: row.llm_input as string | null,
      llmOutput: row.llm_output as string | null,
      projectId: row.project_id as string | null,
      inputParams: row.input_params as Record<string, unknown> | null,
      serviceVersion: row.service_version as string | null,
    };
  }

  protected mapEntity(entity: ErrorLog): Record<string, unknown> {
    return {
      id: entity.id,
      error_code: entity.errorCode,
      error_message: entity.errorMessage,
      error_stack: entity.errorStack ?? null,
      severity: entity.severity,
      created_at: entity.createdAt,
      user_id: entity.userId ?? null,
      request_id: entity.requestId ?? null,
      api_path: entity.apiPath ?? null,
      source_module: entity.sourceModule ?? null,
      llm_model: entity.llmModel ?? null,
      llm_input: entity.llmInput ?? null,
      llm_output: entity.llmOutput ?? null,
      project_id: entity.projectId ?? null,
      input_params: entity.inputParams ?? null,
      service_version: entity.serviceVersion ?? null,
    };
  }

  /** 批量插入错误日志 */
  async batchInsert(logs: ErrorLog[]): Promise<void> {
    if (logs.length === 0) return;

    const fields = [
      "id", "error_code", "error_message", "error_stack", "severity", "created_at",
      "user_id", "request_id", "api_path", "source_module",
      "llm_model", "llm_input", "llm_output",
      "project_id", "input_params", "service_version",
    ];

    const values: (string | number | null | Record<string, unknown>)[] = [];
    const placeholders: string[] = [];

    logs.forEach((log, index) => {
      const base = index * fields.length;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16})`,
      );
      values.push(
        log.id,
        log.errorCode,
        log.errorMessage,
        log.errorStack ?? null,
        log.severity,
        log.createdAt,
        log.userId ?? null,
        log.requestId ?? null,
        log.apiPath ?? null,
        log.sourceModule ?? null,
        log.llmModel ?? null,
        log.llmInput ?? null,
        log.llmOutput ?? null,
        log.projectId ?? null,
        log.inputParams ?? null,
        log.serviceVersion ?? null,
      );
    });

    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${fields.join(", ")}) VALUES ${placeholders.join(", ")}`,
      values,
    );
  }

  /** 按条件查询错误日志 */
  async findByFilters(filters: ErrorLogFilters): Promise<ErrorLog[]> {
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (filters.severity) {
      conditions.push(`severity = $${paramIndex++}`);
      values.push(filters.severity);
    }

    if (filters.errorCode) {
      conditions.push(`error_code = $${paramIndex++}`);
      values.push(filters.errorCode);
    }

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(filters.userId);
    }

    if (filters.sourceModule) {
      conditions.push(`source_module = $${paramIndex++}`);
      values.push(filters.sourceModule);
    }

    if (filters.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, pageSize, offset],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /** 统计错误数量（按错误码分组） */
  async countByErrorCode(startDate: number, endDate: number, severity?: ErrorSeverity): Promise<ErrorCodeCountResult[]> {
    let query = `SELECT error_code, COUNT(*) as count FROM ${this.tableName} WHERE created_at >= $1 AND created_at <= $2`;
    const params: (number | string)[] = [startDate, endDate];

    if (severity) {
      query += ` AND severity = $3`;
      params.push(severity);
    }

    query += ` GROUP BY error_code ORDER BY count DESC`;

    const result = await this.queryClient.query(query, params);
    return result.rows.map((row) => ({
      errorCode: row.error_code as string,
      count: parseInt(row.count as string, 10),
    }));
  }

  /** 统计错误趋势（按日期分组） */
  async countByDate(startDate: number, endDate: number, severity?: ErrorSeverity): Promise<DateCountResult[]> {
    let query = `SELECT DATE(TO_TIMESTAMP(created_at / 1000)) as date, COUNT(*) as count FROM ${this.tableName} WHERE created_at >= $1 AND created_at <= $2`;
    const params: (number | string)[] = [startDate, endDate];

    if (severity) {
      query += ` AND severity = $3`;
      params.push(severity);
    }

    query += ` GROUP BY date ORDER BY date`;

    const result = await this.queryClient.query(query, params);
    return result.rows.map((row) => ({
      date: row.date as string,
      count: parseInt(row.count as string, 10),
    }));
  }

  /** 清理过期日志 */
  async deleteExpiredLogs(): Promise<CleanupStats> {
    const nowMs = Date.now();
    const stats: CleanupStats = {
      criticalDeleted: 0,
      errorDeleted: 0,
      warnDeleted: 0,
      totalDeleted: 0,
    };

    // Critical: 保留 90 天
    const criticalCutoff = nowMs - 90 * 24 * 60 * 60 * 1000;
    const criticalResult = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE severity = 'critical' AND created_at < $1`,
      [criticalCutoff],
    );
    stats.criticalDeleted = criticalResult.rowCount ?? 0;

    // Error: 保留 30 天
    const errorCutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
    const errorResult = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE severity = 'error' AND created_at < $1`,
      [errorCutoff],
    );
    stats.errorDeleted = errorResult.rowCount ?? 0;

    // Warn: 保留 7 天
    const warnCutoff = nowMs - 7 * 24 * 60 * 60 * 1000;
    const warnResult = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE severity = 'warn' AND created_at < $1`,
      [warnCutoff],
    );
    stats.warnDeleted = warnResult.rowCount ?? 0;

    stats.totalDeleted = stats.criticalDeleted + stats.errorDeleted + stats.warnDeleted;
    return stats;
  }
}