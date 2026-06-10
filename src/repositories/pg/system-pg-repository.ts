/**
 * 系统 PG 仓库（配置、死信、背景音乐）
 * 这些使用 payload_json 兼容模式，与现有 nrm_ 表结构对齐
 */

import type { Pool, PoolClient } from "pg";
import type { AppConfig, DeadLetter, VideoMusic } from "../../contracts/types.js";
import type { IConfigRepository, IDeadLetterRepository, IVideoMusicRepository } from "../../contracts/repository-ports/system-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import { PgSoftDeletableRepository } from "./soft-deletable-repository.js";
import { DEFAULT_CONFIG } from "../../core/config.js";

// ============================================================================
// 系统配置（单行 global 记录，payload_json 模式）
// ============================================================================

export class PgConfigRepository implements IConfigRepository {
  private readonly table = nrm("config");
  private static readonly ROW_ID = "global";

  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  /** 事务时用 client，否则用 pool */
  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  async get(): Promise<AppConfig | null> {
    const result = await this.queryClient.query(
      `SELECT payload_json FROM ${this.table} WHERE id = $1 LIMIT 1`,
      [PgConfigRepository.ROW_ID],
    );
    if (result.rows.length === 0) return null;
    const raw = result.rows[0].payload_json;
    if (!raw || typeof raw !== "object") return null;
    return { ...DEFAULT_CONFIG, ...raw as Partial<AppConfig> };
  }

  async upsert(config: AppConfig): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.table} (id, payload_json, updated_at)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (id) DO UPDATE SET
         payload_json = EXCLUDED.payload_json,
         updated_at = EXCLUDED.updated_at`,
      [PgConfigRepository.ROW_ID, PgBaseRepository.toJsonb(config), Date.now()],
    );
  }
}

// ============================================================================
// 死信（传统字段模式）
// ============================================================================

export class PgDeadLetterRepository extends PgBaseRepository<DeadLetter> implements IDeadLetterRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("dead_letters"), client);
  }

  protected mapRow(row: Record<string, unknown>): DeadLetter {
    return {
      id: row.id as string,
      type: row.type as DeadLetter["type"],
      resourceId: row.resource_id as string,
      reason: row.reason as DeadLetter["reason"],
      attempts: row.attempts as number,
      createdAt: row.created_at as number,
      meta: PgBaseRepository.fromJsonb<Record<string, unknown>>(row.meta) ?? undefined,
    };
  }

  protected mapEntity(d: DeadLetter): Record<string, unknown> {
    return {
      id: d.id,
      type: d.type,
      resource_id: d.resourceId,
      reason: d.reason,
      attempts: d.attempts,
      created_at: d.createdAt,
      meta: PgBaseRepository.toJsonb(d.meta),
    };
  }

  async findByResourceId(resourceId: string): Promise<DeadLetter[]> {
    return this.findWhere({ resource_id: resourceId });
  }

  async list(): Promise<DeadLetter[]> {
    return this.findWhere({});
  }
}

// ============================================================================
// 背景音乐（传统字段模式）
// ============================================================================

export class PgVideoMusicRepository extends PgSoftDeletableRepository<VideoMusic> implements IVideoMusicRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("video_musics"), client);
  }

  protected mapRow(row: Record<string, unknown>): VideoMusic {
    return {
      id: row.id as string,
      title: (row.title ?? "") as string,
      musicUrl: (row.music_url ?? "") as string,
      localPath: (row.local_path ?? null) as string | null,
      sourceUrl: (row.source_url ?? null) as string | null,
      atmospheres: (row.atmospheres ?? []) as string[],
      durationSec: (row.duration_sec ?? null) as number | null,
      artist: (row.artist ?? null) as string | null,
      album: (row.album ?? null) as string | null,
      coverUrl: (row.cover_url ?? null) as string | null,
      genre: (row.genre ?? null) as string | null,
      creatorId: (row.creator_id ?? null) as string | null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected mapEntity(m: VideoMusic): Record<string, unknown> {
    return {
      id: m.id,
      title: m.title,
      music_url: m.musicUrl,
      local_path: m.localPath,
      source_url: m.sourceUrl,
      atmospheres: JSON.stringify(m.atmospheres),
      duration_sec: m.durationSec,
      artist: m.artist,
      album: m.album,
      cover_url: m.coverUrl,
      genre: m.genre,
      creator_id: m.creatorId,
      created_at: m.createdAt,
      updated_at: Date.now(),
      deleted_at: m.deletedAt ?? null,
      deleted_by: m.deletedBy ?? null,
    };
  }

  /** 根据氛围列表匹配背景音乐（JSONB 数组包含操作） */
  async findByAtmospheres(atmospheres: string[], limit: number = 20): Promise<VideoMusic[]> {
    const params = atmospheres.map(atm => JSON.stringify([atm]));
    const conditions = atmospheres.map((_, i) => `atmospheres @> $${i + 1}::jsonb`).join(' OR ');

    const result = await this.queryClient.query(
      `SELECT id, title, music_url, atmospheres, duration_sec
       FROM ${this.tableName}
       WHERE ${conditions}
       LIMIT ${limit}`,
      params,
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      title: (row.title ?? '') as string,
      musicUrl: (row.music_url ?? '') as string,
      localPath: null,
      sourceUrl: null,
      atmospheres: Array.isArray(row.atmospheres) ? row.atmospheres as string[] : [],
      durationSec: (row.duration_sec ?? null) as number | null,
      artist: null,
      album: null,
      coverUrl: null,
      genre: null,
      creatorId: null,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
      deletedBy: null,
    }));
  }

  /** 查询阳光类型的背景音乐（fallback） */
  async findSunshineMusics(limit: number = 10): Promise<VideoMusic[]> {
    const result = await this.queryClient.query(
      `SELECT id, title, music_url, atmospheres, duration_sec
       FROM ${this.tableName}
       WHERE atmospheres @> '["阳光"]'::jsonb
       LIMIT ${limit}`,
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      title: (row.title ?? '') as string,
      musicUrl: (row.music_url ?? '') as string,
      localPath: null,
      sourceUrl: null,
      atmospheres: Array.isArray(row.atmospheres) ? row.atmospheres as string[] : [],
      durationSec: (row.duration_sec ?? null) as number | null,
      artist: null,
      album: null,
      coverUrl: null,
      genre: null,
      creatorId: null,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
      deletedBy: null,
    }));
  }
}
