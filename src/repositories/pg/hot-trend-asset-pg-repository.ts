/**
 * 热榜资产 PG 仓库
 * 处理 nrm_hot_trend_assets 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 热榜资产基础记录 */
export interface HotTrendAssetRecord {
  id: string;
  topic: string;
  url: string | null;
  rank: number | null;
  hotValue: string | null;
  section: string | null;
  source: string;
  trendType: string;
  scriptId: string | null;
  sourceOssUrl: string | null;
  updatedAt: number;
  createdAt: number;
  itemId: string | null;
  status: string | null;
  videoTitle: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  createTime: number | null;
  playCount: number | null;
  commentCount: number | null;
  diggCount: number | null;
  shareCount: number | null;
  collectCount: number | null;
  recommendCount: number | null;
  nickname: string | null;
  duration: number | null;
  scriptText: string | null;
  coverUrl: string | null;
}

/** 热榜资产分页查询参数 */
export interface HotTrendAssetPageOptions {
  trendType?: "video" | "realtime";
  limit?: number;
  offset?: number;
}

/** 热榜资产分页查询结果 */
export interface HotTrendAssetPage {
  rows: Record<string, unknown>[];
  total: number;
}

export class PgHotTrendAssetRepository extends PgBaseRepository<HotTrendAssetRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("hot_trend_assets"), client);
  }

  protected mapRow(row: Record<string, unknown>): HotTrendAssetRecord {
    return {
      id: row.id as string,
      topic: row.topic as string,
      url: row.url as string | null,
      rank: row.rank as number | null,
      hotValue: row.hot_value as string | null,
      section: row.section as string | null,
      source: row.source as string,
      trendType: row.trend_type as string,
      scriptId: row.script_id as string | null,
      sourceOssUrl: row.source_oss_url as string | null,
      updatedAt: Number(row.updated_at),
      createdAt: Number(row.created_at),
      itemId: row.item_id as string | null,
      status: row.status as string | null,
      videoTitle: row.video_title as string | null,
      videoUrl: row.video_url as string | null,
      audioUrl: row.audio_url as string | null,
      createTime: row.create_time as number | null,
      playCount: row.play_count as number | null,
      commentCount: row.comment_count as number | null,
      diggCount: row.digg_count as number | null,
      shareCount: row.share_count as number | null,
      collectCount: row.collect_count as number | null,
      recommendCount: row.recommend_count as number | null,
      nickname: row.nickname as string | null,
      duration: row.duration as number | null,
      scriptText: row.script_text as string | null,
      coverUrl: row.cover_url as string | null,
    };
  }

  protected mapEntity(entity: HotTrendAssetRecord): Record<string, unknown> {
    return {
      id: entity.id,
      topic: entity.topic,
      url: entity.url,
      rank: entity.rank,
      hot_value: entity.hotValue,
      section: entity.section,
      source: entity.source,
      trend_type: entity.trendType,
      script_id: entity.scriptId,
      source_oss_url: entity.sourceOssUrl,
      updated_at: entity.updatedAt,
      created_at: entity.createdAt,
      item_id: entity.itemId,
      status: entity.status,
      video_title: entity.videoTitle,
      video_url: entity.videoUrl,
      audio_url: entity.audioUrl,
      create_time: entity.createTime,
      play_count: entity.playCount,
      comment_count: entity.commentCount,
      digg_count: entity.diggCount,
      share_count: entity.shareCount,
      collect_count: entity.collectCount,
      recommend_count: entity.recommendCount,
      nickname: entity.nickname,
      duration: entity.duration,
      script_text: entity.scriptText,
      cover_url: entity.coverUrl,
    };
  }

  /** 分页查询热榜资产（JOIN nrm_script_data），返回原始行 */
  async findWithScriptDataPaginated(options?: HotTrendAssetPageOptions): Promise<HotTrendAssetPage> {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (options?.trendType) {
      params.push(options.trendType);
      conditions.push(`a.trend_type = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
    const limit = options?.limit ?? 500;
    const offset = options?.offset ?? 0;
    params.push(limit, offset);

    const baseSelect = `SELECT
        a.id, a.topic, a.url, a.rank, a.hot_value, a.section, a.source, a.trend_type, a.script_id,
        a.source_oss_url, a.updated_at, a.created_at, a.item_id, a.status,
        a.video_title, a.video_url, a.audio_url, a.create_time,
        a.play_count, a.comment_count, a.digg_count, a.share_count, a.collect_count, a.recommend_count,
        a.nickname, a.duration, a.script_text,
        s.title as sd_title, s.summary as sd_content,
        s.duration_seconds as sd_duration_seconds, s.primary_emotion as sd_primary_emotion,
        s.video_type as sd_video_type, s.video_style as sd_video_style,
        s.fashion_suitable as sd_fashion_suitable, s.on_screen_presence as sd_on_screen_presence,
        s.emotion_detail as sd_emotion_detail, s.fashion_reason as sd_fashion_reason,
        s.emotion_arc as sd_emotion_arc, s.fashion_styles as sd_fashion_styles,
        s.editing_analysis as sd_editing_analysis, s.shot_prompts as sd_shot_prompts,
        s.basic_info as sd_basic_info, s.role_table as sd_role_table,
        s.outfit_table as sd_outfit_table, s.storyboard as sd_storyboard,
        s.main_scene as sd_main_scene, s.atmosphere as sd_atmosphere
       FROM ${this.tableName} a
       LEFT JOIN nrm_script_data s ON a.script_id = s.id
       WHERE 1=1 ${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      this.queryClient.query(
        `${baseSelect}
         ORDER BY a.updated_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      this.queryClient.query(
        `SELECT COUNT(*)::int AS total
         FROM ${this.tableName} a
         WHERE 1=1 ${whereClause}`,
        params.slice(0, -2),
      ),
    ]);

    return {
      rows: dataResult.rows,
      total: (countResult.rows[0] as Record<string, unknown>)?.total as number ?? 0,
    };
  }

  /** 按 trend_type 统计数量 */
  async countByTrendType(trendType: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*)::int AS total FROM ${this.tableName} WHERE trend_type = $1`,
      [trendType],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  /** 按 topic + trend_type 查找（去重检查） */
  async findByTopicAndType(topic: string, trendType: string): Promise<{ id: string } | null> {
    const result = await this.queryClient.query<{ id: string }>(
      `SELECT id FROM ${this.tableName} WHERE topic = $1 AND trend_type = $2 LIMIT 1`,
      [topic, trendType],
    );
    return result.rows[0] ?? null;
  }

  /** 插入管理员手动创建的资产 */
  async insertManual(params: {
    id: string;
    topic: string;
    videoUrl: string | null;
    trendType: string;
    createdAt: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, topic, url, rank, hot_value, section, source, trend_type,
        video_url, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [params.id, params.topic, params.videoUrl ?? null, null, null, null, "admin_manual", params.trendType, params.videoUrl ?? null, params.createdAt],
    );
  }

  /** 更新 script_id 关联 */
  async updateScriptId(id: string, scriptId: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET script_id = $1 WHERE id = $2`,
      [scriptId, id],
    );
  }

  /** 更新 topic */
  async updateTopic(id: string, topic: string, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET topic = $1, updated_at = $2 WHERE id = $3`,
      [topic, updatedAt, id],
    );
  }

  /** 更新 topic + trend_type */
  async updateTopicAndType(id: string, topic: string, trendType: string, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET topic = $1, trend_type = $2, updated_at = $3 WHERE id = $4`,
      [topic, trendType, updatedAt, id],
    );
  }

  /** 按 ID 查找基础字段（topic, trend_type） */
  async findByIdBasic(id: string): Promise<{ topic: string; trend_type: string } | null> {
    const result = await this.queryClient.query<{ topic: string; trend_type: string }>(
      `SELECT topic, trend_type FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** 按 ID 查找（含 script_id） */
  async findByIdWithScriptId(id: string): Promise<{ id: string; script_id: string | null } | null> {
    const result = await this.queryClient.query<{ id: string; script_id: string | null }>(
      `SELECT id, script_id FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** 按 ID 列查找（含 script_id） */
  async findByIdsWithScriptId(ids: string[]): Promise<{ id: string; script_id: string | null }[]> {
    if (ids.length === 0) return [];
    const result = await this.queryClient.query<{ id: string; script_id: string | null }>(
      `SELECT id, script_id FROM ${this.tableName} WHERE id = ANY($1)`,
      [ids],
    );
    return result.rows;
  }

  /** 按 ID 查找（JOIN script_data，用于反推等场景） */
  async findByIdWithScriptData(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT
        a.id, a.topic, a.video_url, a.video_title, a.duration, a.nickname,
        a.play_count, a.digg_count, a.comment_count, a.share_count, a.collect_count, a.recommend_count,
        a.script_id, a.rank,
        s.title as sd_title, s.summary as sd_content
       FROM ${this.tableName} a
       LEFT JOIN nrm_script_data s ON a.script_id = s.id
       WHERE a.id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /**
   * 同步场景 upsert：按 topic + trend_type 去重，冲突时更新多个字段
   * 用于 hot-trend-sync.ts 的热榜同步
   */
  async upsertForSync(params: {
    id: string;
    topic: string;
    url: string | null;
    rank: number;
    source: string;
    trendType: "realtime" | "video";
    dateWindow: "24h" | "7d" | "30d";
    section: string | null;
    hotValue?: string | null;
    itemId?: string | null;
    normalizedKey?: string | null;
    hash?: string | null;
    rawPayload?: Record<string, unknown> | null;
    createdAt: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, topic, url, rank, source, trend_type, date_window,
        section, hot_value, item_id, normalized_key, hash, raw_payload,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
      ON CONFLICT (topic, trend_type) DO UPDATE SET
        url = EXCLUDED.url,
        rank = EXCLUDED.rank,
        source = EXCLUDED.source,
        section = COALESCE(EXCLUDED.section, ${this.tableName}.section),
        hot_value = COALESCE(EXCLUDED.hot_value, ${this.tableName}.hot_value),
        item_id = COALESCE(EXCLUDED.item_id, ${this.tableName}.item_id),
        hash = COALESCE(EXCLUDED.hash, ${this.tableName}.hash),
        raw_payload = COALESCE(EXCLUDED.raw_payload, ${this.tableName}.raw_payload),
        updated_at = EXCLUDED.updated_at`,
      [
        params.id,
        params.topic,
        params.url,
        params.rank,
        params.source,
        params.trendType,
        params.dateWindow,
        params.section,
        params.hotValue ?? null,
        params.itemId ?? null,
        params.normalizedKey ?? null,
        params.hash ?? null,
        params.rawPayload ? JSON.stringify(params.rawPayload) : null,
        params.createdAt,
      ],
    );
  }

  /** 查询指定趋势类型的最新资产（用于 fallback） */
  async queryByTrendType(
    trendType: "realtime" | "video",
    limit: number,
  ): Promise<Array<{
    id: string;
    topic: string;
    url: string | null;
    rank: number | null;
    source: string;
    itemId: string | null;
    rawPayload: Record<string, unknown> | null;
    updatedAt: number;
  }>> {
    const result = await this.queryClient.query<{
      id: string;
      topic: string;
      url: string | null;
      rank: number | null;
      source: string;
      item_id: string | null;
      raw_payload: Record<string, unknown> | null;
      updated_at: number;
    }>(
      `SELECT id, topic, url, rank, source, item_id, raw_payload, updated_at
       FROM ${this.tableName}
       WHERE trend_type = $1
       ORDER BY updated_at DESC, rank ASC
       LIMIT $2`,
      [trendType, limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      topic: row.topic,
      url: row.url,
      rank: row.rank,
      source: row.source,
      itemId: row.item_id,
      rawPayload: row.raw_payload,
      updatedAt: row.updated_at,
    }));
  }

  /** 批量删除 */
  async deleteByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE id = ANY($1)`,
      [ids],
    );
    return result.rowCount ?? 0;
  }

  /** 更新 video_url + updated_at */
  async updateVideoUrl(id: string, videoUrl: string, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET video_url = $1, updated_at = $2 WHERE id = $3`,
      [videoUrl, updatedAt, id],
    );
  }

  /**
   * 反推场景 upsert：按 topic + trend_type 去重，冲突时更新 url/script_id/cover_url/source_oss_url
   * 返回插入或更新后的 id
   */
  async upsertForReverse(params: {
    id: string;
    topic: string;
    url: string;
    rank: number;
    section: string;
    source: string;
    trendType: string;
    sourceOssUrl: string;
    coverUrl: string | null;
    scriptId: string;
    createdAt: number;
    updatedAt: number;
  }): Promise<string> {
    const result = await this.queryClient.query<{ id: string }>(
      `INSERT INTO ${this.tableName} (id, topic, url, rank, hot_value, section, source, trend_type, source_oss_url, cover_url, script_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (topic, trend_type) DO UPDATE SET
         url = EXCLUDED.url,
         script_id = EXCLUDED.script_id,
         cover_url = COALESCE(EXCLUDED.cover_url, ${this.tableName}.cover_url),
         source_oss_url = COALESCE(EXCLUDED.source_oss_url, ${this.tableName}.source_oss_url),
         updated_at = EXCLUDED.updated_at
       RETURNING id`,
      [
        params.id, params.topic, params.url, params.rank, null,
        params.section, params.source, params.trendType, params.sourceOssUrl,
        params.coverUrl, params.scriptId, params.createdAt, params.updatedAt,
      ],
    );
    return result.rows[0]!.id;
  }

  /** 查询视频热榜资产（有 OSS 链接且在时效阈值内） */
  async findVideoTrendsWithOss(updatedSince: number, limit: number): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT id, topic, url, rank, hot_value, section, source, source_oss_url, cover_url, script_id, created_at, updated_at
       FROM ${this.tableName}
       WHERE updated_at >= $1 AND trend_type = 'video' AND source_oss_url IS NOT NULL AND source_oss_url != ''
       ORDER BY rank ASC, hot_value DESC
       LIMIT $2`,
      [updatedSince, limit],
    );
    return result.rows;
  }

  /** 获取热点数据（用于脚本生成策略，按热度排序） */
  async findTopTrends(limit: number = 10): Promise<Array<{ topic: string; trend_type: string | null }>> {
    const result = await this.queryClient.query<{ topic: string; trend_type: string | null }>(
      `SELECT topic, trend_type FROM ${this.tableName} ORDER BY hot_value DESC LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  /** 按 topic + trend_type 查找完整详情（含视频元数据） */
  async findDetailByTopicAndType(topic: string, trendType: string): Promise<HotTrendAssetRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE topic = $1 AND trend_type = $2 LIMIT 1`,
      [topic, trendType],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0] as Record<string, unknown>);
  }

  /** 更新 source_oss_url */
  async updateSourceOssUrl(id: string, sourceOssUrl: string, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET source_oss_url = $1, updated_at = $2 WHERE id = $3`,
      [sourceOssUrl, updatedAt, id],
    );
  }

  /**
   * 视频/实时热榜 upsert：按 topic + trend_type 去重，冲突时更新视频元数据
   * 从 hot-trend-db-operations.ts 的 insertHotTrendAsset 迁移
   */
  async upsertWithVideoMetadata(input: {
    id: string;
    topic: string;
    url: string | null;
    rank: number | null;
    hotValue: string | null;
    section: string | null;
    source: string;
    trendType: "video" | "realtime";
    sourceOssUrl?: string | null;
    coverUrl?: string | null;
    videoTitle?: string | null;
    videoUrl?: string | null;
    audioUrl?: string | null;
    createTime?: number | null;
    playCount?: number | null;
    commentCount?: number | null;
    diggCount?: number | null;
    shareCount?: number | null;
    collectCount?: number | null;
    recommendCount?: number | null;
    nickname?: string | null;
    duration?: number | null;
    scriptText?: string | null;
    now: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, topic, url, rank, hot_value, section, source, trend_type, source_oss_url, cover_url,
        video_title, video_url, audio_url, create_time,
        play_count, comment_count, digg_count, share_count, collect_count, recommend_count,
        nickname, duration, script_text,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
        $24, $24
      )
      ON CONFLICT (topic, trend_type)
      DO UPDATE SET
        url = EXCLUDED.url, rank = EXCLUDED.rank,
        hot_value = EXCLUDED.hot_value, section = EXCLUDED.section, source = EXCLUDED.source,
        source_oss_url = COALESCE(EXCLUDED.source_oss_url, ${this.tableName}.source_oss_url),
        cover_url = COALESCE(EXCLUDED.cover_url, ${this.tableName}.cover_url),
        video_title = COALESCE(EXCLUDED.video_title, ${this.tableName}.video_title),
        video_url = COALESCE(EXCLUDED.video_url, ${this.tableName}.video_url),
        audio_url = COALESCE(EXCLUDED.audio_url, ${this.tableName}.audio_url),
        create_time = COALESCE(EXCLUDED.create_time, ${this.tableName}.create_time),
        play_count = COALESCE(EXCLUDED.play_count, ${this.tableName}.play_count),
        comment_count = COALESCE(EXCLUDED.comment_count, ${this.tableName}.comment_count),
        digg_count = COALESCE(EXCLUDED.digg_count, ${this.tableName}.digg_count),
        share_count = COALESCE(EXCLUDED.share_count, ${this.tableName}.share_count),
        collect_count = COALESCE(EXCLUDED.collect_count, ${this.tableName}.collect_count),
        recommend_count = COALESCE(EXCLUDED.recommend_count, ${this.tableName}.recommend_count),
        nickname = COALESCE(EXCLUDED.nickname, ${this.tableName}.nickname),
        duration = COALESCE(EXCLUDED.duration, ${this.tableName}.duration),
        script_text = COALESCE(EXCLUDED.script_text, ${this.tableName}.script_text),
        updated_at = EXCLUDED.updated_at`,
      [
        input.id, input.topic, input.url, input.rank, input.hotValue, input.section, input.source, input.trendType, input.sourceOssUrl ?? null, input.coverUrl ?? null,
        input.videoTitle ?? null, input.videoUrl ?? null, input.audioUrl ?? null, input.createTime ?? null,
        input.playCount ?? null, input.commentCount ?? null, input.diggCount ?? null, input.shareCount ?? null, input.collectCount ?? null, input.recommendCount ?? null,
        input.nickname ?? null, input.duration ?? null, input.scriptText ?? null,
        input.now,
      ],
    );
  }
}
