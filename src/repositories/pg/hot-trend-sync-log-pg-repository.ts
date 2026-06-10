/**
 * 热榜同步日志 PG 仓库
 * 处理 nrm_hot_trend_sync_logs 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 同步触发类型 */
export type HotTrendSyncTriggerType = "scheduled" | "manual";

/** 同步日志状态 */
export type HotTrendSyncLogStatus = "running" | "success" | "failed";

/** 热榜同步日志记录 */
export interface HotTrendSyncLogRecord {
  id: string;
  triggerType: HotTrendSyncTriggerType;
  trendType: string;
  status: HotTrendSyncLogStatus;
  source: string | null;
  topicCount: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

/** 分页查询参数 */
export interface HotTrendSyncLogPageParams {
  page: number;
  limit: number;
  triggerType?: HotTrendSyncTriggerType;
  trendType?: string;
  status?: HotTrendSyncLogStatus;
}

/** 分页查询结果 */
export interface HotTrendSyncLogPageResult {
  items: HotTrendSyncLogRecord[];
  total: number;
  page: number;
  limit: number;
}

export class PgHotTrendSyncLogRepository extends PgBaseRepository<HotTrendSyncLogRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("hot_trend_sync_logs"), client);
  }

  protected mapRow(row: Record<string, unknown>): HotTrendSyncLogRecord {
    return {
      id: row.id as string,
      triggerType: row.trigger_type as HotTrendSyncTriggerType,
      trendType: row.trend_type as string,
      status: row.status as HotTrendSyncLogStatus,
      source: row.source as string | null,
      topicCount: row.topic_count as number | null,
      durationMs: row.duration_ms as number | null,
      errorMessage: row.error_message as string | null,
      startedAt: row.started_at as string,
      finishedAt: row.finished_at as string | null,
      createdAt: row.created_at as string,
    };
  }

  protected mapEntity(entity: HotTrendSyncLogRecord): Record<string, unknown> {
    return {
      id: entity.id,
      trigger_type: entity.triggerType,
      trend_type: entity.trendType,
      status: entity.status,
      source: entity.source,
      topic_count: entity.topicCount,
      duration_ms: entity.durationMs,
      error_message: entity.errorMessage,
      started_at: entity.startedAt,
      finished_at: entity.finishedAt,
      created_at: entity.createdAt,
    };
  }

  /** 插入一条 running 状态的同步日志，返回 ID */
  async insertRunningLog(params: {
    triggerType: HotTrendSyncTriggerType;
    trendType: string;
  }): Promise<string> {
    const result = await this.queryClient.query<{ id: string }>(
      `INSERT INTO ${this.tableName} (trigger_type, trend_type, status)
       VALUES ($1, $2, 'running')
       RETURNING id`,
      [params.triggerType, params.trendType],
    );
    return result.rows[0]!.id;
  }

  /** 更新同步日志为完成状态 */
  async finishLog(
    logId: string,
    status: "success" | "failed",
    data: {
      source?: string | null;
      topicCount: number;
      durationMs: number;
      errorMessage?: string | null;
    },
  ): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = $1, source = COALESCE($2, source), topic_count = $3,
           duration_ms = $4, error_message = $5, finished_at = NOW()
       WHERE id = $6`,
      [status, data.source ?? null, data.topicCount, data.durationMs, data.errorMessage ?? null, logId],
    );
  }

  /** 分页查询同步日志列表 */
  async listPaginated(params: HotTrendSyncLogPageParams): Promise<HotTrendSyncLogPageResult> {
    const offset = (params.page - 1) * params.limit;
    const conditions: string[] = [];
    const queryParams: (string | number)[] = [];

    if (params.triggerType) {
      queryParams.push(params.triggerType);
      conditions.push(`trigger_type = $${queryParams.length}`);
    }
    if (params.trendType) {
      queryParams.push(params.trendType);
      conditions.push(`trend_type = $${queryParams.length}`);
    }
    if (params.status) {
      queryParams.push(params.status);
      conditions.push(`status = $${queryParams.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await this.queryClient.query<{ total: string }>(
      `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`,
      queryParams,
    );

    const listResult = await this.queryClient.query(
      `SELECT id, trigger_type, trend_type, status, source,
              topic_count, duration_ms, error_message,
              started_at, finished_at, created_at
       FROM ${this.tableName}
       ${whereClause}
       ORDER BY started_at DESC
       LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
      [...queryParams, params.limit, offset],
    );

    return {
      items: listResult.rows.map((row) => this.mapRow(row)),
      total: parseInt(countResult.rows[0]!.total, 10),
      page: params.page,
      limit: params.limit,
    };
  }
}