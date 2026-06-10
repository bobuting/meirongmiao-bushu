/**
 * 广场达人目标 PG 仓库
 * 处理 nrm_square_creator_targets 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 创作者内容类型 */
export type CreatorContentType = 'aesthetic' | 'fashion_film' | 'scene';

/** 创作者来源 */
export type CreatorSource = 'discovery' | 'manual';

/** 达人目标记录 */
export interface SquareCreatorTargetRecord {
  id: string;
  secUid: string;
  nickname: string;
  avatarUrl: string;
  fansCount: number;
  contentType: CreatorContentType;
  enabled: boolean;
  confidenceScore: number;
  source: CreatorSource;
  discoveryKeywords: string;
  llmEvaluation: string;
  lastSyncedAt: number;
  syncIntervalHours: number;
  videoCount: number;
  createdAt: number;
  updatedAt: number;
}

/** 创建/更新创作者目标输入参数 */
export interface UpsertCreatorTargetInput {
  secUid: string;
  nickname: string;
  avatarUrl?: string;
  fansCount?: number;
  contentType: CreatorContentType;
  confidenceScore?: number;
  source?: CreatorSource;
  discoveryKeywords?: string;
  llmEvaluation?: string;
}

export class PgSquareCreatorTargetRepository extends PgBaseRepository<SquareCreatorTargetRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("square_creator_targets"), client);
  }

  protected mapRow(row: Record<string, unknown>): SquareCreatorTargetRecord {
    return {
      id: row.id as string,
      secUid: row.sec_uid as string,
      nickname: row.nickname as string,
      avatarUrl: row.avatar_url as string,
      fansCount: row.fans_count as number,
      contentType: row.content_type as CreatorContentType,
      enabled: row.enabled as boolean,
      confidenceScore: row.confidence_score as number,
      source: row.source as CreatorSource,
      discoveryKeywords: row.discovery_keywords as string,
      llmEvaluation: row.llm_evaluation as string,
      lastSyncedAt: row.last_synced_at as number,
      syncIntervalHours: row.sync_interval_hours as number,
      videoCount: row.video_count as number,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(entity: SquareCreatorTargetRecord): Record<string, unknown> {
    return {
      id: entity.id,
      sec_uid: entity.secUid,
      nickname: entity.nickname,
      avatar_url: entity.avatarUrl,
      fans_count: entity.fansCount,
      content_type: entity.contentType,
      enabled: entity.enabled,
      confidence_score: entity.confidenceScore,
      source: entity.source,
      discovery_keywords: entity.discoveryKeywords,
      llm_evaluation: entity.llmEvaluation,
      last_synced_at: entity.lastSyncedAt,
      sync_interval_hours: entity.syncIntervalHours,
      video_count: entity.videoCount,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  /** 动态更新达人字段 */
  async updateFieldsById(id: string, fields: {
    nickname?: string;
    contentType?: string;
    enabled?: boolean;
  }, updatedAt: number): Promise<SquareCreatorTargetRecord | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (fields.nickname !== undefined) { sets.push(`nickname = $${idx++}`); params.push(fields.nickname); }
    if (fields.contentType !== undefined) { sets.push(`content_type = $${idx++}`); params.push(fields.contentType); }
    if (fields.enabled !== undefined) { sets.push(`enabled = $${idx++}`); params.push(fields.enabled); }

    sets.push(`updated_at = $${idx++}`);
    params.push(updatedAt);
    params.push(id);

    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      params,
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 切换 enabled 状态 */
  async toggleEnabled(id: string, updatedAt: number): Promise<SquareCreatorTargetRecord | null> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET enabled = NOT enabled, updated_at = $1 WHERE id = $2 RETURNING *`,
      [updatedAt, id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 根据 secUid 查找创作者目标 */
  async findBySecUid(secUid: string): Promise<SquareCreatorTargetRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE sec_uid = $1 LIMIT 1`,
      [secUid],
    );
    return result.rows.length === 0 ? null : this.mapRow(result.rows[0]);
  }

  /** 分页查询达人列表（Admin 管理用） */
  async listPaginated(opts: {
    page: number;
    pageSize: number;
    contentType?: string;
    enabled?: boolean;
    source?: string;
  }): Promise<{ data: SquareCreatorTargetRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts.contentType) {
      conditions.push(`content_type = $${idx++}`);
      params.push(opts.contentType);
    }
    if (opts.enabled !== undefined) {
      conditions.push(`enabled = $${idx++}`);
      params.push(opts.enabled);
    }
    if (opts.source) {
      conditions.push(`source = $${idx++}`);
      params.push(opts.source);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await this.queryClient.query(
      `SELECT COUNT(*) as total FROM ${this.tableName} ${where}`,
      params,
    );
    const total = Number(countResult.rows[0].total);

    const offset = (opts.page - 1) * opts.pageSize;
    const dataResult = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} ${where} ORDER BY confidence_score DESC, created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, opts.pageSize, offset],
    );

    return { data: dataResult.rows.map(row => this.mapRow(row)), total };
  }

  /** 获取到期需要同步的达人列表 */
  async listDueForSync(limit: number): Promise<SquareCreatorTargetRecord[]> {
    const result = await this.queryClient.query(
      `SELECT *
       FROM ${this.tableName}
       WHERE enabled = TRUE
         AND (
           last_synced_at IS NULL
           OR last_synced_at = 0
           OR last_synced_at < (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint - sync_interval_hours * 3600000
         )
       ORDER BY confidence_score DESC, created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  /** 创建或更新创作者目标（upsert by secUid） */
  async upsertCreator(input: UpsertCreatorTargetInput): Promise<SquareCreatorTargetRecord> {
    const now = Date.now();
    const confidenceScore = input.confidenceScore ?? 0;
    const source = input.source ?? 'discovery';
    const discoveryKeywords = input.discoveryKeywords ?? '';
    const llmEvaluation = input.llmEvaluation ?? '';
    const avatarUrl = input.avatarUrl ?? '';
    const fansCount = input.fansCount ?? 0;
    const syncIntervalHours = calcSyncIntervalHours(confidenceScore);

    const query = `
      INSERT INTO ${this.tableName} (
        sec_uid, nickname, avatar_url, fans_count, content_type,
        confidence_score, source, discovery_keywords, llm_evaluation,
        enabled, video_count, last_synced_at, sync_interval_hours, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, 0, $10, $11, $10, $10)
      ON CONFLICT (sec_uid) DO UPDATE SET
        nickname = EXCLUDED.nickname,
        avatar_url = EXCLUDED.avatar_url,
        fans_count = EXCLUDED.fans_count,
        confidence_score = EXCLUDED.confidence_score,
        sync_interval_hours = EXCLUDED.sync_interval_hours,
        llm_evaluation = EXCLUDED.llm_evaluation,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `;

    const values = [
      input.secUid, input.nickname, avatarUrl, fansCount, input.contentType,
      confidenceScore, source, discoveryKeywords, llmEvaluation,
      now, syncIntervalHours,
    ];

    const result = await this.queryClient.query(query, values);
    return this.mapRow(result.rows[0]);
  }

  /** 更新最后同步时间 */
  async updateLastSynced(id: string): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET last_synced_at = $1, updated_at = $1 WHERE id = $2`,
      [now, id],
    );
  }

  /** 禁用创作者目标 */
  async disable(id: string): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET enabled = FALSE, updated_at = $1 WHERE id = $2`,
      [now, id],
    );
  }

  /** 增加视频计数 */
  async incrementVideoCount(id: string): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET video_count = video_count + 1, updated_at = $1 WHERE id = $2`,
      [now, id],
    );
  }
}

/** 根据置信度计算同步间隔：S 级(>=0.8)=12h，A 级(>=0.6)=24h，B 级=72h */
function calcSyncIntervalHours(confidenceScore: number): number {
  if (confidenceScore >= 0.8) return 12;
  if (confidenceScore >= 0.6) return 24;
  return 72;
}
