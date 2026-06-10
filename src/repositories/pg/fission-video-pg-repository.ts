/**
 * 裂变视频 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgSoftDeletableRepository } from "./soft-deletable-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import type { SoftDeletable } from "../../contracts/types.js";
import type { FissionVideo, TransitionInfo } from "../../contracts/types.js";

/** 裂变视频记录 */
export interface FissionVideoRecord extends SoftDeletable {
  id: string;
  fissionType: string;
  videoPath: string | null;
  thumbnailUrl: string | null;
  status: string;
  createdAt: number;
  projectId: string;
}

/** 裂变视频完整记录（包含所有业务字段） */
export interface FissionVideoFullRow {
  id: string;
  projectId: string;
  fissionType: string;
  thumbnailUrl: string | null;
  videoPath: string | null;
  storyboardIds: string;
  storyboardUrls: string[] | undefined;
  transitionInfo: TransitionInfo | null;
  audioUrl: string | null;
  durationSec: number | null;
  speed: number | null;
  status: string;
  errorMessage: string | null;
  fissionVideoStatusId: string | null;
  creatorId: string;
  createdAt: number;
  updatedAt: number;
  isDeprecated: boolean;
  deprecatedAt: number | null;
  deprecatedBy: string | null;
}

/** FissionVideo 完整字段的 SELECT 列 */
const FISSION_VIDEO_COLUMNS = `id, project_id, fission_type, thumbnail_url, video_path, storyboard_ids,
  transition_info, audio_url, duration_sec, speed, status,
  error_message, creator_id, created_at, updated_at,
  is_deprecated, deprecated_at, deprecated_by`;

export class PgFissionVideoRepository extends PgSoftDeletableRepository<FissionVideoRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("fission_videos"), client);
  }

  protected mapRow(row: Record<string, unknown>): FissionVideoRecord {
    return {
      id: row.id as string,
      fissionType: row.fission_type as string,
      videoPath: row.video_path as string | null,
      thumbnailUrl: row.thumbnail_url as string | null,
      status: row.status as string,
      createdAt: row.created_at as number,
      projectId: row.project_id as string,
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected mapEntity(entity: FissionVideoRecord): Record<string, unknown> {
    return {
      id: entity.id,
      fission_type: entity.fissionType,
      video_path: entity.videoPath ?? null,
      thumbnail_url: entity.thumbnailUrl ?? null,
      status: entity.status,
      created_at: entity.createdAt,
      project_id: entity.projectId,
      deleted_at: entity.deletedAt ?? null,
      deleted_by: entity.deletedBy ?? null,
    };
  }

  /** 按项目查询裂变视频（排除已删除） */
  async findByProject(projectId: string): Promise<FissionVideoRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE project_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [projectId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  // ========== 完整字段操作方法 ==========

  /** 将数据库行映射为完整 FissionVideo 对象 */
  private mapFullRow(row: Record<string, unknown>): FissionVideo {
    let storyboardUrls: string[] | undefined;
    const rawStoryboardUrls = row.storyboard_urls as string | null;
    if (rawStoryboardUrls) {
      try {
        storyboardUrls = JSON.parse(rawStoryboardUrls);
      } catch {
        storyboardUrls = undefined;
      }
    }

    const rawTransitionInfo = row.transition_info as { type: string; durationFrames: number } | null;

    return {
      id: row.id as string,
      projectId: row.project_id as string,
      fissionType: row.fission_type as FissionVideo["fissionType"],
      thumbnailUrl: row.thumbnail_url as string | null,
      videoPath: row.video_path as string | null,
      storyboardIds: row.storyboard_ids as string,
      storyboardUrls,
      transitionInfo: rawTransitionInfo ? {
        type: rawTransitionInfo.type,
        durationFrames: rawTransitionInfo.durationFrames ?? 15,
      } : null,
      audioUrl: row.audio_url as string | null,
      durationSec: row.duration_sec as number | null,
      speed: row.speed as number | null,
      status: row.status as FissionVideo["status"],
      errorMessage: row.error_message as string | null,
      fissionVideoStatusId: row.fission_video_status_id as string | null,
      creatorId: row.creator_id as string,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      isDeprecated: (row.is_deprecated as boolean) ?? false,
      deprecatedAt: row.deprecated_at ? Number(row.deprecated_at) : null,
      deprecatedBy: row.deprecated_by as string | null,
    };
  }

  /** 查询所有裂变视频 */
  async listAllFull(): Promise<FissionVideo[]> {
    const result = await this.queryClient.query(
      `SELECT ${FISSION_VIDEO_COLUMNS} FROM ${this.tableName} ORDER BY created_at DESC`,
    );
    return result.rows.map((row) => this.mapFullRow(row));
  }

  /** 根据ID获取裂变视频 */
  async getFullById(id: string): Promise<FissionVideo | null> {
    const result = await this.queryClient.query(
      `SELECT ${FISSION_VIDEO_COLUMNS} FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.mapFullRow(result.rows[0]);
  }

  /** 根据创建者ID获取裂变视频列表 */
  async listFullByCreator(creatorId: string): Promise<FissionVideo[]> {
    const result = await this.queryClient.query(
      `SELECT ${FISSION_VIDEO_COLUMNS} FROM ${this.tableName} WHERE creator_id = $1 ORDER BY created_at DESC`,
      [creatorId],
    );
    return result.rows.map((row) => this.mapFullRow(row));
  }

  /** 根据项目ID获取裂变视频列表 */
  async listFullByProject(projectId: string, includeDeprecated: boolean = false): Promise<FissionVideo[]> {
    let sql = `SELECT ${FISSION_VIDEO_COLUMNS} FROM ${this.tableName} WHERE project_id = $1`;
    if (!includeDeprecated) {
      sql += ` AND is_deprecated = false`;
    }
    sql += ` ORDER BY created_at DESC`;

    const result = await this.queryClient.query(sql, [projectId]);
    return result.rows.map((row) => this.mapFullRow(row));
  }

  /** 创建裂变视频（完整字段） */
  async createFull(video: FissionVideo): Promise<FissionVideo> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName}
        (id, project_id, fission_type, thumbnail_url, video_path, storyboard_ids, storyboard_urls,
         transition_info, audio_url, duration_sec, speed, status,
         error_message, creator_id, created_at, updated_at, is_deprecated, deprecated_at, deprecated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        video.id,
        video.projectId,
        video.fissionType,
        video.thumbnailUrl,
        video.videoPath,
        video.storyboardIds,
        video.storyboardUrls ? JSON.stringify(video.storyboardUrls) : null,
        video.transitionInfo ? JSON.stringify(video.transitionInfo) : null,
        video.audioUrl,
        video.durationSec,
        video.speed ?? 1.0,
        video.status,
        video.errorMessage,
        video.creatorId,
        video.createdAt,
        video.updatedAt,
        video.isDeprecated ?? false,
        video.deprecatedAt ?? null,
        video.deprecatedBy ?? null,
      ],
    );
    return video;
  }

  /** 更新裂变视频（完整字段） */
  async updateFull(video: FissionVideo): Promise<FissionVideo> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET project_id = $2, fission_type = $3, thumbnail_url = $4, video_path = $5,
           storyboard_ids = $6, transition_info = $7::jsonb,
           audio_url = $8, duration_sec = $9, speed = $10, status = $11, error_message = $12,
           creator_id = $13, updated_at = $14
       WHERE id = $1`,
      [
        video.id,
        video.projectId,
        video.fissionType,
        video.thumbnailUrl,
        video.videoPath,
        video.storyboardIds,
        video.transitionInfo ? JSON.stringify(video.transitionInfo) : null,
        video.audioUrl,
        video.durationSec,
        video.speed ?? 1.0,
        video.status,
        video.errorMessage,
        video.creatorId,
        video.updatedAt,
      ],
    );
    return video;
  }

  /** 弃用裂变视频（软删除） */
  async deprecate(id: string, userId: string): Promise<boolean> {
    const now = Date.now();
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET is_deprecated = true, deprecated_at = $2, deprecated_by = $3, updated_at = $2
       WHERE id = $1`,
      [id, now, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 查询项目中未弃用的所有 storyboard_ids（用于组合去重） */
  async listActiveStoryboardIds(projectId: string): Promise<string[]> {
    const result = await this.queryClient.query<{ storyboard_ids: string }>(
      `SELECT DISTINCT storyboard_ids FROM ${this.tableName}
       WHERE project_id = $1 AND is_deprecated = false`,
      [projectId],
    );
    return result.rows.map((r) => r.storyboard_ids).filter(Boolean);
  }
}
