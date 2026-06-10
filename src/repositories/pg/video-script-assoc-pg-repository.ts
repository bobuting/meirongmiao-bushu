/**
 * 视频脚本关联表 PG 仓库
 *
 * 表名：nrm_video_script_assoc
 * 用途：存储视频与脚本的多对多关系
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

// ========== 类型定义 ==========

/** 视频来源类型 */
export type VideoSource = "hot_trend_asset" | "square_user_work" | "template" | "project";

/** 来源入口 */
export type EntryPoint = "hot_trend_batch" | "square_input" | "square_replica" | "project_create";

/** 视频脚本关联记录 */
export interface VideoScriptAssocRecord {
  id: string;
  videoSource: VideoSource;
  videoId: string;
  videoUrl: string | null;
  scriptId: string | null;
  userId: string | null;
  entryPoint: EntryPoint | null;
  createdAt: number;
  updatedAt: number;
}

/** 创建关联参数 */
export interface CreateVideoScriptAssocInput {
  videoSource: VideoSource;
  videoId: string;
  videoUrl?: string | null;
  scriptId: string;
  userId?: string | null;
  entryPoint?: EntryPoint | null;
}

/** 创建模板视频关联参数 */
export interface CreateTemplateVideoAssocInput {
  videoId: string;
  videoUrl: string | null;
  userId: string;
}

// ========== Repository ==========

export class PgVideoScriptAssocRepository extends PgBaseRepository<VideoScriptAssocRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("video_script_assoc"), client);
  }

  protected mapRow(row: Record<string, unknown>): VideoScriptAssocRecord {
    return {
      id: row.id as string,
      videoSource: row.video_source as VideoSource,
      videoId: row.video_id as string,
      videoUrl: row.video_url as string | null,
      scriptId: row.script_id as string | null,
      userId: row.user_id as string | null,
      entryPoint: row.entry_point as EntryPoint | null,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  protected mapEntity(entity: VideoScriptAssocRecord): Record<string, unknown> {
    return {
      id: entity.id,
      video_source: entity.videoSource,
      video_id: entity.videoId,
      video_url: entity.videoUrl,
      script_id: entity.scriptId,
      user_id: entity.userId,
      entry_point: entity.entryPoint,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  /** 创建或更新视频脚本关联 */
  async upsertAssoc(input: CreateVideoScriptAssocInput): Promise<VideoScriptAssocRecord> {
    const now = Date.now();
    const result = await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        video_source, video_id, video_url, script_id, user_id, entry_point, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (video_source, video_id, script_id)
      DO UPDATE SET
        video_url = EXCLUDED.video_url,
        user_id = EXCLUDED.user_id,
        entry_point = EXCLUDED.entry_point,
        updated_at = EXCLUDED.updated_at
      RETURNING *`,
      [input.videoSource, input.videoId, input.videoUrl ?? null, input.scriptId, input.userId ?? null, input.entryPoint ?? null, now, now],
    );
    return this.mapRow(result.rows[0]);
  }

  /** 根据视频查询关联的脚本列表 */
  async listScriptsByVideo(videoSource: VideoSource, videoId: string): Promise<VideoScriptAssocRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE video_source = $1 AND video_id = $2
       ORDER BY created_at DESC`,
      [videoSource, videoId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 根据脚本查询关联的视频列表 */
  async listVideosByScript(scriptId: string): Promise<VideoScriptAssocRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE script_id = $1
       ORDER BY created_at DESC`,
      [scriptId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 获取视频的最新关联脚本 */
  async getLatestScriptForVideo(videoSource: VideoSource, videoId: string): Promise<VideoScriptAssocRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE video_source = $1 AND video_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [videoSource, videoId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 删除视频脚本关联 */
  async deleteAssoc(videoSource: VideoSource, videoId: string, scriptId: string): Promise<boolean> {
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName}
       WHERE video_source = $1 AND video_id = $2 AND script_id = $3`,
      [videoSource, videoId, scriptId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 删除视频的所有脚本关联 */
  async deleteAllScriptsForVideo(videoSource: VideoSource, videoId: string): Promise<number> {
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName}
       WHERE video_source = $1 AND video_id = $2`,
      [videoSource, videoId],
    );
    return result.rowCount ?? 0;
  }

  /** 创建模板视频关联记录（scriptId 为 null） */
  async insertTemplateVideoAssoc(input: CreateTemplateVideoAssocInput): Promise<VideoScriptAssocRecord> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const result = await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, video_source, video_id, video_url, script_id, user_id, entry_point, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [id, "template", input.videoId, input.videoUrl, null, input.userId, null, now, now],
    );
    return this.mapRow(result.rows[0]);
  }
}
