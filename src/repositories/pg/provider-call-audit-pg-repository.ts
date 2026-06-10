/**
 * LLM 提供商调用审计 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 提供商调用审计记录（精简，仅供统计用） */
export interface ProviderCallAuditRecord {
  id: string;
  projectId: string | null;
  routeKey: string | null;
}

/** 调用审计列表查询过滤条件 */
export interface CallAuditFilterOptions {
  startDate?: number;
  endDate?: number;
  provider?: string;
  projectId?: string;
}

/** 调用审计统计结果 */
export interface CallAuditStats {
  total: number;
  successCount: number;
  successRate: number;
  avgLatency: number;
  totalCost: number;
}

/** 分页查询结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

/** 构建 WHERE 子句的辅助函数 */
function buildCallAuditWhere(filter: CallAuditFilterOptions): { whereClause: string; values: (string | number)[] } {
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  let paramIndex = 1;

  if (filter.startDate) {
    conditions.push(`created_at >= $${paramIndex}`);
    values.push(filter.startDate);
    paramIndex++;
  }
  if (filter.endDate) {
    conditions.push(`created_at <= $${paramIndex}`);
    values.push(filter.endDate);
    paramIndex++;
  }
  if (filter.provider) {
    conditions.push(`provider_id = $${paramIndex}`);
    values.push(filter.provider);
    paramIndex++;
  }
  if (filter.projectId) {
    conditions.push(`project_id = $${paramIndex}`);
    values.push(filter.projectId);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereClause, values };
}

export class PgProviderCallAuditRepository extends PgBaseRepository<ProviderCallAuditRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("provider_call_audits"), client);
  }

  protected mapRow(row: Record<string, unknown>): ProviderCallAuditRecord {
    return {
      id: row.id as string,
      projectId: row.project_id as string | null,
      routeKey: row.route_key as string | null,
    };
  }

  protected mapEntity(entity: ProviderCallAuditRecord): Record<string, unknown> {
    return {
      id: entity.id,
      project_id: entity.projectId ?? null,
      route_key: entity.routeKey ?? null,
    };
  }

  /** 统计项目的 LLM 调用次数 */
  async countByProject(projectId: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as cnt FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
    return Number(result.rows[0]?.cnt ?? 0);
  }

  /** 统计项目按 route_key 模式匹配的调用次数 */
  async countByProjectAndRouteKeyPattern(projectId: string, pattern: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as cnt FROM ${this.tableName} WHERE project_id = $1 AND route_key LIKE $2`,
      [projectId, pattern],
    );
    return Number(result.rows[0]?.cnt ?? 0);
  }

  /** 按异步任务 ID 查询调用详情 */
  async findByAsyncJobId(asyncJobId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT id, provider_id, route_key, status, latency_ms, error_code, error_message,
              request_summary, response_summary, created_at, actual_model, provider_vendor,
              input_tokens, output_tokens, ttft_ms, call_mode, messages_json, query_params_json
       FROM ${this.tableName}
       WHERE async_job_id = $1
       ORDER BY created_at ASC`,
      [asyncJobId],
    );
    return result.rows;
  }

  /** 分页查询调用审计列表（含总数） */
  async findPaginated(
    filter: CallAuditFilterOptions,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const { whereClause, values } = buildCallAuditWhere(filter);
    const offset = (page - 1) * pageSize;

    const result = await this.queryClient.query(
      `SELECT
        id, provider_id, route_key, status, latency_ms, cost, created_at,
        error_message, actual_model, provider_vendor, call_mode,
        input_tokens, output_tokens, project_id, messages_json, call_context
       FROM ${this.tableName} ${whereClause} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    );

    const totalResult = await this.queryClient.query(
      `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`,
      values,
    );

    return {
      items: result.rows,
      total: Number(totalResult.rows[0].total),
    };
  }

  /** 查询调用审计统计信息 */
  async findStats(filter: CallAuditFilterOptions): Promise<CallAuditStats> {
    const { whereClause, values } = buildCallAuditWhere(filter);

    const result = await this.queryClient.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'success') as success_count,
        AVG(latency_ms) as avg_latency,
        SUM(cost) as total_cost
      FROM ${this.tableName} ${whereClause}`,
      values,
    );

    const row = result.rows[0];
    const total = Number(row.total);
    const successCount = Number(row.success_count);
    return {
      total,
      successCount,
      successRate: total > 0 ? successCount / total : 0,
      avgLatency: row.avg_latency ? Number(row.avg_latency) : 0,
      totalCost: row.total_cost ? Number(row.total_cost) : 0,
    };
  }

  /** 按异步任务 ID 查询调用详情（精简字段，不包含 messages_json / query_params_json） */
  async findForJobProviderCalls(asyncJobId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT id, provider_id, route_key, status, latency_ms, error_code, error_message,
              request_summary, response_summary, created_at, actual_model, provider_vendor,
              input_tokens, output_tokens, ttft_ms, call_mode
       FROM ${this.tableName}
       WHERE async_job_id = $1
       ORDER BY created_at ASC`,
      [asyncJobId],
    );
    return result.rows;
  }

  /** 导出全部调用审计（最多 limit 条） */
  async exportAll(limit: number): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  /** 根据 ID 查找完整调用审计 */
  async findFullById(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT id, provider_id, route_key, request_id, status, latency_ms, timeout_ms, slow_request,
              cost, error_code, error_message, request_summary, response_summary, created_at,
              call_context, messages_json, query_params_json, actual_model, provider_vendor, provider_base_url,
              actual_endpoint, request_headers_json, request_body_json,
              input_tokens, output_tokens, ttft_ms, project_id, user_id, async_job_id, attempts_json, call_mode
       FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** 查询最近调用审计（降序） */
  async listRecent(limit: number): Promise<Record<string, unknown>[]> {
    const normalizedLimit = Math.max(1, Math.min(limit, 500));
    const result = await this.queryClient.query(
      `SELECT id, provider_id, route_key, request_id, status, latency_ms, timeout_ms, slow_request,
              cost, error_code, error_message, request_summary, response_summary, created_at,
              call_context, messages_json, query_params_json, actual_model, provider_vendor, provider_base_url,
              actual_endpoint, request_headers_json, request_body_json,
              input_tokens, output_tokens, ttft_ms, project_id, user_id, async_job_id, attempts_json, call_mode
       FROM ${this.tableName}
       ORDER BY created_at DESC
       LIMIT $1`,
      [normalizedLimit],
    );
    return result.rows;
  }

  /** 查询最近调用审计摘要（排除大 JSON 字段，用于列表展示） */
  async listRecentSummary(limit: number): Promise<Record<string, unknown>[]> {
    const normalizedLimit = Math.max(1, Math.min(limit, 500));
    const result = await this.queryClient.query(
      `SELECT id, provider_id, route_key, request_id, status, latency_ms, timeout_ms, slow_request,
              cost, error_code, error_message, request_summary, response_summary, created_at,
              call_context, query_params_json, actual_model, provider_vendor, provider_base_url,
              actual_endpoint,
              input_tokens, output_tokens, ttft_ms, project_id, user_id, async_job_id, call_mode
       FROM ${this.tableName}
       ORDER BY created_at DESC
       LIMIT $1`,
      [normalizedLimit],
    );
    return result.rows;
  }

  /** 清除所有调用审计，返回删除数量 */
  async clearAll(): Promise<number> {
    const countResult = await this.queryClient.query(`SELECT COUNT(*)::int AS cnt FROM ${this.tableName}`);
    const count = countResult.rows[0]?.cnt ?? 0;
    await this.queryClient.query(`DELETE FROM ${this.tableName}`);
    return count;
  }

  /** 写入/更新调用审计（UPSERT） */
  async upsertCallAudit(record: Record<string, unknown>): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, provider_id, route_key, request_id, status, latency_ms, timeout_ms, slow_request,
        cost, error_code, error_message, request_summary, response_summary, created_at, updated_at,
        call_context, messages_json, query_params_json, actual_model, provider_vendor, provider_base_url,
        actual_endpoint, request_headers_json, request_body_json,
        input_tokens, output_tokens, ttft_ms, project_id, user_id, async_job_id, attempts_json, call_mode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
      ON CONFLICT (id) DO UPDATE SET
        provider_id = EXCLUDED.provider_id, route_key = EXCLUDED.route_key, request_id = EXCLUDED.request_id,
        status = EXCLUDED.status, latency_ms = EXCLUDED.latency_ms, timeout_ms = EXCLUDED.timeout_ms,
        slow_request = EXCLUDED.slow_request, cost = EXCLUDED.cost, error_code = EXCLUDED.error_code,
        error_message = EXCLUDED.error_message, request_summary = EXCLUDED.request_summary,
        response_summary = EXCLUDED.response_summary, created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        call_context = EXCLUDED.call_context, messages_json = EXCLUDED.messages_json,
        query_params_json = EXCLUDED.query_params_json, actual_model = EXCLUDED.actual_model,
        provider_vendor = EXCLUDED.provider_vendor, provider_base_url = EXCLUDED.provider_base_url,
        actual_endpoint = EXCLUDED.actual_endpoint,
        request_headers_json = EXCLUDED.request_headers_json, request_body_json = EXCLUDED.request_body_json,
        input_tokens = EXCLUDED.input_tokens, output_tokens = EXCLUDED.output_tokens,
        ttft_ms = EXCLUDED.ttft_ms, project_id = EXCLUDED.project_id, user_id = EXCLUDED.user_id,
        async_job_id = EXCLUDED.async_job_id, attempts_json = EXCLUDED.attempts_json, call_mode = EXCLUDED.call_mode`,
      [
        record.id, record.providerId, record.routeKey, record.requestId, record.status,
        record.latencyMs, record.timeoutMs ?? null, record.slowRequest ?? null,
        record.cost, record.errorCode ?? null, record.errorMessage ?? null,
        record.requestSummary ?? null, record.responseSummary ?? null, record.createdAt,
        record.callContext ?? null, record.messagesJson ?? null, record.queryParamsJson ?? null,
        record.actualModel ?? null, record.providerVendor ?? null, record.providerBaseUrl ?? null,
        record.actualEndpoint ?? null,
        record.requestHeadersJson ?? null, record.requestBodyJson ?? null,
        record.inputTokens ?? null, record.outputTokens ?? null, record.ttftMs ?? null,
        record.projectId ?? null, record.userId ?? null, record.asyncJobId ?? null,
        record.attemptsJson ?? null, record.callMode ?? null,
      ],
    );
  }
}
