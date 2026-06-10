/**
 * 成片视频 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 成片类型 */
export type FinalVideoType = "step4" | "fission" | "outfit_merge";

/** 成片视频完整记录 */
export interface FinalVideoRecord {
  id: string;
  projectId: string;
  videoType: FinalVideoType;
  videoUrl: string;
  durationSec: number | null;
  fileSize: number | null;
  coverImageUrl: string | null;
  backgroundMusicUrl: string | null;
  backgroundMusicTitle: string | null;
  transitionType: string | null;
  storyboardIds: string | null;
  storyboardUrls: string[] | null;
  creatorId: string | null;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
}

/** 创建成片参数 */
export interface CreateFinalVideoParams {
  projectId: string;
  videoType: FinalVideoType;
  videoUrl: string;
  durationSec?: number | null;
  fileSize?: number | null;
  coverImageUrl?: string | null;
  backgroundMusicUrl?: string | null;
  backgroundMusicTitle?: string | null;
  transitionType?: string | null;
  storyboardIds?: string | null;
  storyboardUrls?: string[] | null;
  creatorId?: string | null;
}

export class PgFinalVideoRepository extends PgBaseRepository<FinalVideoRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("final_videos"), client);
  }

  protected mapRow(row: Record<string, unknown>): FinalVideoRecord {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      videoType: row.video_type as FinalVideoType,
      videoUrl: row.video_url as string,
      durationSec: row.duration_sec as number | null,
      fileSize: row.file_size as number | null,
      coverImageUrl: row.cover_image_url as string | null,
      backgroundMusicUrl: row.background_music_url as string | null,
      backgroundMusicTitle: row.background_music_title as string | null,
      transitionType: row.transition_type as string | null,
      storyboardIds: row.storyboard_ids as string | null,
      storyboardUrls: row.storyboard_urls as string[] | null,
      creatorId: row.creator_id as string | null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      isDeleted: row.is_deleted as boolean,
    };
  }

  protected mapEntity(entity: FinalVideoRecord): Record<string, unknown> {
    return {
      id: entity.id,
      project_id: entity.projectId,
      video_type: entity.videoType,
      video_url: entity.videoUrl,
      duration_sec: entity.durationSec,
      file_size: entity.fileSize,
      cover_image_url: entity.coverImageUrl,
      background_music_url: entity.backgroundMusicUrl,
      background_music_title: entity.backgroundMusicTitle,
      transition_type: entity.transitionType,
      storyboard_ids: entity.storyboardIds,
      storyboard_urls: entity.storyboardUrls ? JSON.stringify(entity.storyboardUrls) : null,
      creator_id: entity.creatorId,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
      is_deleted: entity.isDeleted,
    };
  }

  /** 创建成片记录 */
  async create(params: CreateFinalVideoParams): Promise<FinalVideoRecord> {
    const now = Date.now();
    const id = crypto.randomUUID();

    const result = await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, project_id, video_type, video_url, duration_sec, file_size,
        cover_image_url, background_music_url, background_music_title,
        transition_type, storyboard_ids, storyboard_urls,
        creator_id, created_at, updated_at, is_deleted
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, false)
       RETURNING *`,
      [
        id,
        params.projectId,
        params.videoType,
        params.videoUrl,
        params.durationSec ?? null,
        params.fileSize ?? null,
        params.coverImageUrl ?? null,
        params.backgroundMusicUrl ?? null,
        params.backgroundMusicTitle ?? null,
        params.transitionType ?? null,
        params.storyboardIds ?? null,
        params.storyboardUrls ? JSON.stringify(params.storyboardUrls) : null,
        params.creatorId ?? null,
        now,
        now,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  /** 按项目ID查询所有成片 */
  async findByProjectId(projectId: string, limit?: number): Promise<FinalVideoRecord[]> {
    const sql = limit
      ? `SELECT * FROM ${this.tableName} WHERE project_id = $1 AND is_deleted = false ORDER BY created_at DESC LIMIT $2`
      : `SELECT * FROM ${this.tableName} WHERE project_id = $1 AND is_deleted = false ORDER BY created_at DESC`;

    const result = await this.queryClient.query(sql, limit ? [projectId, limit] : [projectId]);
    return result.rows.map((row: Record<string, unknown>) => this.mapRow(row));
  }

  /** 按项目ID和类型查询成片 */
  async findByProjectIdAndType(projectId: string, videoType: FinalVideoType): Promise<FinalVideoRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE project_id = $1 AND video_type = $2 AND is_deleted = false
       ORDER BY created_at DESC`,
      [projectId, videoType],
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapRow(row));
  }

  /** 按ID查询成片 */
  async findById(id: string): Promise<FinalVideoRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1 AND is_deleted = false`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 获取项目最新的 Step4 成片 */
  async findLatestStep4Video(projectId: string): Promise<FinalVideoRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE project_id = $1 AND video_type = 'step4' AND is_deleted = false
       ORDER BY created_at DESC
       LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 软删除成片 */
  async softDelete(id: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_deleted = true, updated_at = $1 WHERE id = $2`,
      [Date.now(), id],
    );
  }

  /** 按项目ID软删除所有成片 */
  async softDeleteByProjectId(projectId: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_deleted = true, updated_at = $1 WHERE project_id = $2`,
      [Date.now(), projectId],
    );
  }

  /** 按项目和视频类型查询成片 */
  async findByProjectAndType(projectId: string, videoType: string, limit = 50): Promise<FinalVideoRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE project_id = $1 AND video_type = $2 AND is_deleted = false
       ORDER BY created_at DESC
       LIMIT $3`,
      [projectId, videoType, limit],
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapRow(row));
  }

  /** 按项目和多个视频类型查询成片 */
  async findByProjectAndTypes(projectId: string, types: string[], limit = 50): Promise<FinalVideoRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE project_id = $1 AND video_type = ANY($2) AND is_deleted = false
       ORDER BY created_at DESC
       LIMIT $3`,
      [projectId, types, limit],
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapRow(row));
  }

  /** 管理后台：查询有成片的项目列表（多表 JOIN，驱动表 nrm_final_videos） */
  async adminListProjects(options: {
    userId?: string;
    search?: string;
    limit: number;
    offset: number;
  }): Promise<Record<string, unknown>[]> {
    const conditions: string[] = ["fv.is_deleted = false"];
    const params: unknown[] = [];
    let idx = 1;

    if (options.userId) {
      conditions.push(`p.user_id = $${idx++}`);
      params.push(options.userId);
    }

    if (options.search) {
      const isUuid = /^[a-f0-9-]{36}$/i.test(options.search);
      if (isUuid) {
        conditions.push(`p.id = $${idx++}`);
        params.push(options.search);
      } else {
        conditions.push(`(p.name ILIKE $${idx} OR u.email ILIKE $${idx})`);
        params.push(`%${options.search}%`);
        idx++;
      }
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const result = await this.queryClient.query(
      `SELECT
        p.id, p.name, p.user_id AS "userId", u.email AS "userEmail",
        p.project_kind AS "projectKind",
        COUNT(fv.id) AS "finalVideoCount",
        COALESCE(MAX(fv.updated_at), p.updated_at) AS "updatedAt",
        (SELECT COALESCE(fv2.cover_image_url, fv2.video_url) FROM ${this.tableName} fv2
         WHERE fv2.project_id = p.id AND fv2.is_deleted = false
         ORDER BY fv2.created_at DESC LIMIT 1) AS "coverImageUrl"
       FROM ${this.tableName} fv
       JOIN nrm_projects p ON fv.project_id = p.id
       JOIN nrm_users u ON p.user_id = u.id
       ${where}
       GROUP BY p.id, p.name, p.user_id, u.email, p.project_kind
       ORDER BY "updatedAt" DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, options.limit, options.offset],
    );
    return result.rows;
  }

  /** 管理后台：按项目查询成片列表（含项目和创建者信息） */
  async adminListByProject(projectId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT
        fv.id, fv.project_id AS "projectId", fv.video_type AS "videoType",
        fv.video_url AS "videoUrl", fv.duration_sec AS "durationSec",
        fv.file_size AS "fileSize", fv.cover_image_url AS "coverImageUrl",
        fv.background_music_title AS "backgroundMusicTitle",
        fv.background_music_url AS "backgroundMusicUrl",
        fv.storyboard_urls AS "storyboardUrls",
        fv.transition_type AS "transitionType",
        fv.creator_id AS "creatorId", fv.created_at AS "createdAt",
        fv.updated_at AS "updatedAt", fv.is_deleted AS "isDeleted",
        p.name AS "projectName", u.email AS "creatorEmail"
       FROM ${this.tableName} fv
       LEFT JOIN nrm_projects p ON fv.project_id = p.id
       LEFT JOIN nrm_users u ON fv.creator_id = u.id
       WHERE fv.project_id = $1 AND fv.is_deleted = false
       ORDER BY fv.created_at DESC`,
      [projectId],
    );
    return result.rows;
  }

  /** 管理后台：查询成片的创建者（用于删除前校验） */
  async findCreatorId(id: string): Promise<string | null> {
    const result = await this.queryClient.query<{ creator_id: string | null }>(
      `SELECT creator_id FROM ${this.tableName} WHERE id = $1 AND is_deleted = false`,
      [id],
    );
    return result.rows[0]?.creator_id ?? null;
  }

  /** 管理后台：软删除成片（带 updatedAt 参数） */
  async adminSoftDelete(id: string, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_deleted = true, updated_at = $1 WHERE id = $2`,
      [updatedAt, id],
    );
  }
}
