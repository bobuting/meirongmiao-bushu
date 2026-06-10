/**
 * 提示词调用日志 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import type {
  PromptCallLog,
  PromptStatsOverview,
  PromptStatsByTemplate,
  ListLogsQuery,
} from "../../contracts/prompt-template-contract.js";

/** 调用日志创建请求 */
export interface CreatePromptCallLogRequest {
  templateId?: string;
  templateCode?: string;
  version?: number;
  inputVariables?: Record<string, unknown>;
  renderedContent?: string;
  llmVendor?: string;
  llmModel?: string;
  success: boolean;
  responseTimeMs?: number;
  tokenInput?: number;
  tokenOutput?: number;
  errorMessage?: string;
  projectId?: string;
  userId?: string;
}

/** 分页查询结果 */
export interface PaginatedLogsResult {
  items: PromptCallLog[];
  total: number;
}

/** 统计查询参数 */
export interface StatsQueryParams {
  templateId?: string;
  startDate?: number;
  endDate?: number;
}

/** 按模板统计查询参数 */
export interface StatsByTemplateParams {
  startDate?: number;
  endDate?: number;
}

export class PgPromptCallLogRepository extends PgBaseRepository<PromptCallLog> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("prompt_call_logs"), client);
  }

  protected mapRow(row: Record<string, unknown>): PromptCallLog {
    return {
      id: row.id as string,
      templateId: row.template_id as string | undefined,
      templateCode: row.template_code as string | undefined,
      version: row.version as string | undefined,
      inputVariables: row.input_variables as Record<string, unknown> | undefined,
      renderedContent: row.rendered_content as string | undefined,
      llmVendor: row.llm_vendor as string | undefined,
      llmModel: row.llm_model as string | undefined,
      success: row.success as boolean,
      responseTimeMs: row.response_time_ms as number | undefined,
      tokenInput: row.token_input as number | undefined,
      tokenOutput: row.token_output as number | undefined,
      errorMessage: row.error_message as string | undefined,
      createdAt: row.created_at as number,
      projectId: row.project_id as string | undefined,
      userId: row.user_id as string | undefined,
    };
  }

  protected mapEntity(entity: PromptCallLog): Record<string, unknown> {
    return {
      id: entity.id,
      template_id: entity.templateId ?? null,
      template_code: entity.templateCode ?? null,
      version: entity.version ?? null,
      input_variables: entity.inputVariables ? JSON.stringify(entity.inputVariables) : null,
      rendered_content: entity.renderedContent ?? null,
      llm_vendor: entity.llmVendor ?? null,
      llm_model: entity.llmModel ?? null,
      success: entity.success,
      response_time_ms: entity.responseTimeMs ?? null,
      token_input: entity.tokenInput ?? null,
      token_output: entity.tokenOutput ?? null,
      error_message: entity.errorMessage ?? null,
      created_at: entity.createdAt,
      project_id: entity.projectId ?? null,
      user_id: entity.userId ?? null,
    };
  }

  /**
   * 创建调用日志
   */
  async create(request: CreatePromptCallLogRequest, id: string, createdAt: number): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName}
       (id, template_id, template_code, version, input_variables, rendered_content,
        llm_vendor, llm_model, success, response_time_ms, token_input, token_output,
        error_message, created_at, project_id, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        id,
        request.templateId || null,
        request.templateCode || null,
        request.version || null,
        request.inputVariables ? JSON.stringify(request.inputVariables) : null,
        request.renderedContent || null,
        request.llmVendor || null,
        request.llmModel || null,
        request.success,
        request.responseTimeMs || null,
        request.tokenInput || null,
        request.tokenOutput || null,
        request.errorMessage || null,
        createdAt,
        request.projectId || null,
        request.userId || null,
      ],
    );
  }

  /**
   * 分页查询日志列表
   */
  async findPaginated(params: ListLogsQuery): Promise<PaginatedLogsResult> {
    const {
      templateId,
      templateCode,
      success,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
    } = params;

    const conditions: string[] = [];
    const values: (string | number | boolean)[] = [];
    let paramIndex = 1;

    if (templateId) {
      conditions.push(`template_id = $${paramIndex++}`);
      values.push(templateId);
    }
    if (templateCode) {
      conditions.push(`template_code = $${paramIndex++}`);
      values.push(templateCode);
    }
    if (success !== undefined) {
      conditions.push(`success = $${paramIndex++}`);
      values.push(success);
    }
    if (startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(startDate);
    }
    if (endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 查询总数
    const countResult = await this.queryClient.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`,
      values,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // 分页查询
    const offset = (page - 1) * pageSize;
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, pageSize, offset],
    );

    const items = result.rows.map((row) => this.mapRow(row));

    return { items, total };
  }

  /**
   * 获取统计概览（含 JOIN 查询）
   * nrm_prompt_call_logs 是驱动表，因此此方法归属本仓库
   */
  async findStatsOverview(params: StatsQueryParams): Promise<PromptStatsOverview> {
    const { templateId, startDate, endDate } = params;
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (templateId) {
      conditions.push(`l.template_id = $${paramIndex++}`);
      values.push(templateId);
    }
    if (startDate) {
      conditions.push(`l.created_at >= $${paramIndex++}`);
      values.push(startDate);
    }
    if (endDate) {
      conditions.push(`l.created_at <= $${paramIndex++}`);
      values.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 总体统计
    const statsResult = await this.queryClient.query(
      `SELECT
        COUNT(*) as total_calls,
        COALESCE(AVG(CASE WHEN success THEN 1 ELSE 0 END) * 100, 0) as success_rate,
        COALESCE(AVG(response_time_ms), 0) as avg_response_time,
        COALESCE(SUM(token_input), 0) as total_token_input,
        COALESCE(SUM(token_output), 0) as total_token_output
       FROM ${this.tableName} l
       ${whereClause}`,
      values,
    );

    const stats = statsResult.rows[0];

    // 按类型统计（关联模板表）
    const byTypeResult = await this.queryClient.query(
      `SELECT t.type, COUNT(l.id) as count
       FROM ${this.tableName} l
       LEFT JOIN ${nrm("prompt_templates")} t ON l.template_id = t.id
       ${whereClause}
       GROUP BY t.type`,
      values,
    );

    // 按类型统计（动态获取数据库中实际存在的类型）
    const callsByType: Record<string, number> = {};

    for (const row of byTypeResult.rows) {
      if (row.type) {
        callsByType[row.type as string] = parseInt(row.count, 10);
      }
    }

    // 按天统计趋势
    const trendResult = await this.queryClient.query(
      `SELECT
        TO_CHAR(TO_TIMESTAMP(created_at / 1000), 'YYYY-MM-DD') as date,
        COUNT(*) as calls,
        AVG(CASE WHEN success THEN 1 ELSE 0 END) * 100 as success_rate
       FROM ${this.tableName} l
       ${whereClause}
       GROUP BY date
       ORDER BY date DESC
       LIMIT 30`,
      values,
    );

    const callsTrend = trendResult.rows.map((row) => ({
      date: row.date,
      calls: parseInt(row.calls, 10),
      successRate: parseFloat(row.success_rate) || 0,
    }));

    return {
      totalCalls: parseInt(stats.total_calls, 10),
      successRate: parseFloat(stats.success_rate) || 0,
      avgResponseTimeMs: parseFloat(stats.avg_response_time) || 0,
      totalTokenInput: parseInt(stats.total_token_input, 10),
      totalTokenOutput: parseInt(stats.total_token_output, 10),
      callsByType,
      callsTrend,
    };
  }

  /**
   * 按模板统计（含 JOIN 查询）
   * nrm_prompt_call_logs 是驱动表（LEFT JOIN 的右侧），因此此方法归属本仓库
   */
  async findStatsByTemplate(params: StatsByTemplateParams): Promise<PromptStatsByTemplate[]> {
    const { startDate, endDate } = params;
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`l.created_at >= $${paramIndex++}`);
      values.push(startDate);
    }
    if (endDate) {
      conditions.push(`l.created_at <= $${paramIndex++}`);
      values.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await this.queryClient.query(
      `SELECT
        t.id as template_id,
        t.code as template_code,
        t.name as template_name,
        COUNT(l.id) as total_calls,
        AVG(CASE WHEN l.success THEN 1 ELSE 0 END) * 100 as success_rate,
        AVG(l.response_time_ms) as avg_response_time,
        AVG(l.token_input) as avg_token_input,
        AVG(l.token_output) as avg_token_output
       FROM ${nrm("prompt_templates")} t
       LEFT JOIN ${this.tableName} l ON t.id = l.template_id
       ${whereClause}
       GROUP BY t.id, t.code, t.name
       ORDER BY total_calls DESC`,
      values,
    );

    return result.rows.map((row) => ({
      templateId: row.template_id,
      templateCode: row.template_code,
      templateName: row.template_name,
      totalCalls: parseInt(row.total_calls, 10),
      successRate: parseFloat(row.success_rate) || 0,
      avgResponseTimeMs: parseFloat(row.avg_response_time) || 0,
      avgTokenInput: parseFloat(row.avg_token_input) || 0,
      avgTokenOutput: parseFloat(row.avg_token_output) || 0,
    }));
  }
}