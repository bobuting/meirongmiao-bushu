/**
 * 广场发现视频 PG 仓库
 * 处理 nrm_square_discovered_videos 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 发现视频状态 */
export type DiscoveredVideoStatus = 'pending' | 'classified' | 'approved' | 'reversing' | 'reversed' | 'published' | 'rejected' | 'failed';

/** 发现视频完整记录 */
export interface SquareDiscoveredVideoRecord {
  id: string;
  awemeId: string;
  creatorTargetId: string;
  secUid: string;
  videoUrl: string;
  coverUrl: string;
  description: string;
  duration: number;
  likesCount: number;
  commentsCount: number;
  shareCount: number;
  playCount: number;
  publishTime: number;
  category: string;
  classificationResult: string;
  classificationScore: number;
  status: DiscoveredVideoStatus;
  squareTemplateId: string | null;
  reverseScriptText: string;
  reverseError: string;
  createdAt: number;
  updatedAt: number;
}

/** 插入发现视频输入参数 */
export interface InsertDiscoveredVideoInput {
  awemeId: string;
  creatorTargetId: string;
  secUid: string;
  videoUrl?: string;
  coverUrl?: string;
  description?: string;
  duration?: number;
  likesCount?: number;
  commentsCount?: number;
  shareCount?: number;
  playCount?: number;
  publishTime?: number;
}

export class PgSquareDiscoveredVideoRepository extends PgBaseRepository<SquareDiscoveredVideoRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("square_discovered_videos"), client);
  }

  protected mapRow(row: Record<string, unknown>): SquareDiscoveredVideoRecord {
    return {
      id: row.id as string,
      awemeId: row.aweme_id as string,
      creatorTargetId: row.creator_target_id as string,
      secUid: row.sec_uid as string,
      videoUrl: row.video_url as string,
      coverUrl: row.cover_url as string,
      description: row.description as string,
      duration: row.duration as number,
      likesCount: row.likes_count as number,
      commentsCount: row.comments_count as number,
      shareCount: row.share_count as number,
      playCount: row.play_count as number,
      publishTime: row.publish_time as number,
      category: row.category as string,
      classificationResult: row.classification_result as string,
      classificationScore: row.classification_score as number,
      status: row.status as DiscoveredVideoStatus,
      squareTemplateId: row.square_template_id as string | null,
      reverseScriptText: row.reverse_script_text as string,
      reverseError: row.reverse_error as string,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(entity: SquareDiscoveredVideoRecord): Record<string, unknown> {
    return {
      id: entity.id,
      aweme_id: entity.awemeId,
      creator_target_id: entity.creatorTargetId,
      sec_uid: entity.secUid,
      video_url: entity.videoUrl,
      cover_url: entity.coverUrl,
      description: entity.description,
      duration: entity.duration,
      likes_count: entity.likesCount,
      comments_count: entity.commentsCount,
      share_count: entity.shareCount,
      play_count: entity.playCount,
      publish_time: entity.publishTime,
      category: entity.category,
      classification_result: entity.classificationResult,
      classification_score: entity.classificationScore,
      status: entity.status,
      square_template_id: entity.squareTemplateId,
      reverse_script_text: entity.reverseScriptText,
      reverse_error: entity.reverseError,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  /** 分页查询发现视频列表（Admin 管理用），关联达人表获取昵称 */
  async listPaginatedWithCreatorNickname(opts: {
    page: number;
    pageSize: number;
    status?: string;
  }): Promise<{ data: (SquareDiscoveredVideoRecord & { creatorNickname: string | null })[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts.status) {
      conditions.push(`v.status = $${idx++}`);
      params.push(opts.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await this.queryClient.query(
      `SELECT COUNT(*) as total FROM ${this.tableName} v ${where}`,
      params,
    );
    const total = Number(countResult.rows[0].total);

    const offset = (opts.page - 1) * opts.pageSize;
    const dataResult = await this.queryClient.query(
      `SELECT v.*, c.nickname as creator_nickname
       FROM ${this.tableName} v
       LEFT JOIN ${nrm("square_creator_targets")} c ON v.creator_target_id = c.id
       ${where}
       ORDER BY v.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, opts.pageSize, offset],
    );

    const data = dataResult.rows.map(row => ({
      ...this.mapRow(row),
      creatorNickname: row.creator_nickname as string | null,
    }));
    return { data, total };
  }

  /** 根据 awemeId 查找发现视频 */
  async findByAwemeId(awemeId: string): Promise<SquareDiscoveredVideoRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE aweme_id = $1 LIMIT 1`,
      [awemeId],
    );
    return result.rows.length === 0 ? null : this.mapRow(result.rows[0]);
  }

  /** 批量检查 awemeId 是否已存在，返回已存在的 awemeId 集合 */
  async batchCheckAwemeIds(awemeIds: string[]): Promise<Set<string>> {
    if (awemeIds.length === 0) return new Set();
    const result = await this.queryClient.query(
      `SELECT aweme_id FROM ${this.tableName} WHERE aweme_id = ANY($1)`,
      [awemeIds],
    );
    return new Set(result.rows.map(row => row.aweme_id as string));
  }

  /** 插入新的发现视频 */
  async insert(input: InsertDiscoveredVideoInput): Promise<SquareDiscoveredVideoRecord> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const query = `
      INSERT INTO ${this.tableName} (
        id, aweme_id, creator_target_id, sec_uid, video_url, cover_url,
        description, duration, likes_count, comments_count, share_count,
        play_count, publish_time, category, classification_result,
        classification_score, status, square_template_id,
        reverse_script_text, reverse_error, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, '', '', 0, 'pending', NULL, '', '', $14, $14)
      RETURNING *
    `;

    const values = [
      id,
      input.awemeId,
      input.creatorTargetId,
      input.secUid,
      input.videoUrl ?? '',
      input.coverUrl ?? '',
      input.description ?? '',
      input.duration ?? 0,
      input.likesCount ?? 0,
      input.commentsCount ?? 0,
      input.shareCount ?? 0,
      input.playCount ?? 0,
      input.publishTime ?? 0,
      now,
    ];

    const result = await this.queryClient.query(query, values);
    return this.mapRow(result.rows[0]);
  }

  /** 根据状态列出发现视频，按创建时间升序 */
  async listByStatus(status: DiscoveredVideoStatus, limit: number): Promise<SquareDiscoveredVideoRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE status = $1 ORDER BY created_at ASC LIMIT $2`,
      [status, limit],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  /** 按达人分散 + 互动量加权选择候选视频 */
  async listByStatusDistributed(status: DiscoveredVideoStatus, limit: number): Promise<SquareDiscoveredVideoRecord[]> {
    const query = `
      WITH ranked AS (
        SELECT v.*,
          ROW_NUMBER() OVER (PARTITION BY v.sec_uid ORDER BY v.likes_count DESC) AS creator_rank
        FROM ${this.tableName} v
        WHERE v.status = $1
          AND v.video_url LIKE 'http%'
      )
      SELECT r.*
      FROM ranked r
      JOIN ${nrm("square_creator_targets")} c ON r.creator_target_id = c.id
      ORDER BY r.creator_rank, c.confidence_score DESC NULLS LAST, r.likes_count DESC
      LIMIT $2
    `;
    const result = await this.queryClient.query(query, [status, limit]);
    return result.rows.map(row => this.mapRow(row));
  }

  /** 更新视频状态，支持额外字段的更新 */
  async updateStatus(
    id: string,
    status: DiscoveredVideoStatus,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const now = Date.now();

    if (extra && Object.keys(extra).length > 0) {
      const updates: string[] = [`status = $2`, `updated_at = $3`];
      const values: (string | number | boolean | null)[] = [id, status, now];
      let paramIndex = 4;

      for (const [key, value] of Object.entries(extra)) {
        const columnName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        updates.push(`${columnName} = $${paramIndex}`);
        values.push(value as string | number | boolean | null);
        paramIndex++;
      }

      await this.queryClient.query(
        `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = $1`,
        values,
      );
    } else {
      await this.queryClient.query(
        `UPDATE ${this.tableName} SET status = $2, updated_at = $3 WHERE id = $1`,
        [id, status, now],
      );
    }
  }

  /** 更新视频的封面和播放地址 */
  async updateUrls(id: string, coverUrl: string, videoUrl: string): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET cover_url = COALESCE(NULLIF($2, ''), cover_url),
           video_url = COALESCE(NULLIF($3, ''), video_url),
           updated_at = $4
       WHERE id = $1`,
      [id, coverUrl, videoUrl, now],
    );
  }

  /** 更新分类结果 */
  async updateClassification(
    id: string,
    category: string,
    score: number,
    result: string,
    newStatus: DiscoveredVideoStatus,
  ): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET category = $2, classification_score = $3, classification_result = $4, status = $5, updated_at = $6
       WHERE id = $1`,
      [id, category, score, result, newStatus, now],
    );
  }

  /** 更新逆向结果（清理 markdown 包裹） */
  async updateReverseResult(
    id: string,
    scriptText: string,
    newStatus: DiscoveredVideoStatus,
  ): Promise<string> {
    const now = Date.now();
    let cleanText = scriptText.trim();
    if (cleanText.startsWith("```json")) cleanText = cleanText.slice(7);
    if (cleanText.startsWith("```")) cleanText = cleanText.slice(3);
    if (cleanText.endsWith("```")) cleanText = cleanText.slice(0, -3);
    cleanText = cleanText.trim();

    await this.queryClient.query(
      `UPDATE ${this.tableName} SET reverse_script_text = $2, status = $3, updated_at = $4 WHERE id = $1`,
      [id, cleanText, newStatus, now],
    );
    return cleanText;
  }

  /** 标记为已发布 */
  async markPublished(id: string, templateId: string): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = 'published', square_template_id = $2, updated_at = $3 WHERE id = $1`,
      [id, templateId, now],
    );
  }

  /** 标记为失败 */
  async markFailed(id: string, error: string): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = 'failed', reverse_error = $2, updated_at = $3 WHERE id = $1`,
      [id, error, now],
    );
  }

  /** 清理无 OSS URL 的 pending 记录（入库后 OSS 转存失败的残留） */
  async cleanupPendingWithoutOss(now: number): Promise<number> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = 'failed', reverse_error = 'OSS 转存未完成，无可用 URL', updated_at = $1
       WHERE status = 'pending'
         AND (video_url = '' OR video_url NOT LIKE 'http%')
       RETURNING id`,
      [now],
    );
    return result.rows.length;
  }
}
