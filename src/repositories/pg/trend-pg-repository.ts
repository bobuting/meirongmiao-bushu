/**
 * 热榜 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { TrendEntry, TrendSyncJob } from "../../contracts/types.js";
import type { ITrendEntryRepository, ITrendSyncJobRepository } from "../../contracts/repository-ports/trend-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

// ============================================================================
// 热榜条目
// ============================================================================

export class PgTrendEntryRepository extends PgBaseRepository<TrendEntry> implements ITrendEntryRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("trend_entries"), client);
  }

  protected mapRow(row: Record<string, unknown>): TrendEntry {
    return {
      id: row.id as string,
      source: row.source as string,
      trendType: row.trend_type as TrendEntry["trendType"],
      dateWindow: row.date_window as TrendEntry["dateWindow"],
      normalizedKey: row.normalized_key as string,
      title: row.title as string,
      url: row.url as string,
      itemId: row.item_id as string | undefined,
      trend: row.trend as TrendEntry["trend"],
      rank: row.rank as number,
      hash: row.hash as string,
      syncedAt: row.synced_at as number,
      rawPayload: PgBaseRepository.fromJsonb<Record<string, unknown>>(row.raw_payload) ?? undefined,
    };
  }

  protected mapEntity(e: TrendEntry): Record<string, unknown> {
    return {
      id: e.id,
      source: e.source,
      trend_type: e.trendType,
      date_window: e.dateWindow,
      normalized_key: e.normalizedKey,
      title: e.title,
      url: e.url,
      item_id: e.itemId,
      trend: e.trend,
      rank: e.rank,
      hash: e.hash,
      synced_at: e.syncedAt,
      raw_payload: PgBaseRepository.toJsonb(e.rawPayload),
    };
  }
}

// ============================================================================
// 热榜同步任务
// ============================================================================

export class PgTrendSyncJobRepository extends PgBaseRepository<TrendSyncJob> implements ITrendSyncJobRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("trend_sync_jobs"), client);
  }

  protected mapRow(row: Record<string, unknown>): TrendSyncJob {
    return {
      id: row.id as string,
      trendType: row.trend_type as TrendSyncJob["trendType"],
      source: row.source as string,
      dateWindow: row.date_window as TrendSyncJob["dateWindow"],
      status: row.status as TrendSyncJob["status"],
      startedAt: row.started_at as number,
      finishedAt: row.finished_at as number | null,
      elapsedMs: row.elapsed_ms as number | null,
      topicCount: row.topic_count as number,
      errorCode: row.error_code as string | null,
      errorMessage: row.error_message as string | null,
    };
  }

  protected mapEntity(j: TrendSyncJob): Record<string, unknown> {
    return {
      id: j.id,
      trend_type: j.trendType,
      source: j.source,
      date_window: j.dateWindow,
      status: j.status,
      started_at: j.startedAt,
      finished_at: j.finishedAt,
      elapsed_ms: j.elapsedMs,
      topic_count: j.topicCount,
      error_code: j.errorCode,
      error_message: j.errorMessage,
    };
  }
}