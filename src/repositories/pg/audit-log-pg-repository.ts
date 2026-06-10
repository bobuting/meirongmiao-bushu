/**
 * 审计日志 PG 仓库（积分消耗统计 + 操作审计查询）
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 审计日志记录（精简，仅供积分统计用） */
export interface AuditLogRecord {
  id: string;
  action: string;
  metaJson: Record<string, unknown> | null;
}

/** 审计日志列表查询过滤条件 */
export interface AuditLogFilterOptions {
  startDate?: number;
  endDate?: number;
  userId?: string;
  keyword?: string;
}

/** 分页查询结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

/** 构建 WHERE 子句的辅助函数 */
function buildAuditLogWhere(filter: AuditLogFilterOptions): { whereClause: string; values: (string | number)[] } {
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
  if (filter.userId) {
    conditions.push(`actor_user_id = $${paramIndex}`);
    values.push(filter.userId);
    paramIndex++;
  }
  if (filter.keyword) {
    conditions.push(`(action ILIKE $${paramIndex})`);
    values.push(`%${filter.keyword}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereClause, values };
}

export class PgAuditLogRepository extends PgBaseRepository<AuditLogRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("audit_logs"), client);
  }

  protected mapRow(row: Record<string, unknown>): AuditLogRecord {
    return {
      id: row.id as string,
      action: row.action as string,
      metaJson: row.meta_json as Record<string, unknown> | null,
    };
  }

  protected mapEntity(entity: AuditLogRecord): Record<string, unknown> {
    return {
      id: entity.id,
      action: entity.action,
      meta_json: entity.metaJson ?? null,
    };
  }

  /** 统计项目的积分消耗总额 */
  async sumCreditConsumptionByProject(projectId: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COALESCE(SUM((meta_json->>'amount')::int), 0) as total
       FROM ${this.tableName}
       WHERE action = 'credit_spent_by_user' AND meta_json->>'projectId' = $1`,
      [projectId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  /** 根据 ID 查找原始行（不过滤列，直接返回完整行） */
  async findRawById(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** 分页查询审计日志列表（含总数） */
  async findPaginated(
    filter: AuditLogFilterOptions,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const { whereClause, values } = buildAuditLogWhere(filter);
    const offset = (page - 1) * pageSize;

    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} ${whereClause} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
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

  /** 导出全部审计日志（最多 limit 条） */
  async exportAll(limit: number): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  /** 插入审计日志（UPSERT） */
  async upsertAuditLog(record: { id: string; actorUserId: string; action: string; targetId: string; createdAt: number; metaJson?: unknown }): Promise<void> {
    const metaJsonStr = record.metaJson ? JSON.stringify(record.metaJson) : null;
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (id, actor_user_id, action, target_id, created_at, updated_at, meta_json)
       VALUES ($1, $2, $3, $4, $5, $5, $6)
       ON CONFLICT (id) DO UPDATE SET actor_user_id = EXCLUDED.actor_user_id, action = EXCLUDED.action, target_id = EXCLUDED.target_id, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, meta_json = EXCLUDED.meta_json`,
      [record.id, record.actorUserId, record.action, record.targetId, record.createdAt, metaJsonStr],
    );
  }

  /** 查询审计日志（按过滤条件） */
  async queryLogs(filter?: { actorUserId?: string; action?: string; targetId?: string }): Promise<Record<string, unknown>[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filter?.actorUserId) {
      conditions.push(`actor_user_id = $${idx++}`);
      params.push(filter.actorUserId);
    }
    if (filter?.action) {
      conditions.push(`action = $${idx++}`);
      params.push(filter.action);
    }
    if (filter?.targetId) {
      conditions.push(`target_id = $${idx++}`);
      params.push(filter.targetId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.queryClient.query(
      `SELECT id, actor_user_id, action, target_id, created_at, meta_json FROM ${this.tableName} ${where}
       ORDER BY created_at DESC`,
      params,
    );
    return result.rows;
  }
}
