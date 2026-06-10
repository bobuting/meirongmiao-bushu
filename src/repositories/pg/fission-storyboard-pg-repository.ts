/**
 * 裂变故事分镜 PG 仓库
 * 处理 nrm_fission_storyboards 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 裂变故事分镜记录 */
export interface FissionStoryboardRecord {
  id: string;
  projectId: string;
  creatorId: string;
  fissionType: string;
  characterName: string | null;
  characterDescription: string | null;
  characterAvatar: string | null;
  oldStory: string | null;
  newStory: string | null;
  storyboardImages: string[] | null;
  storyboardVideos: string[] | null;
  status: string;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

/** FissionStoryboardPayload 对应的数据库字段 */
export interface FissionStoryboardPayloadFields {
  characterName: string | null;
  characterDescription: string | null;
  characterAvatar: string | null;
  oldStory: string | null;
  newStory: string | null;
  storyboardImages: string[] | null;
  storyboardVideos: string[] | null;
}

export class PgFissionStoryboardRepository extends PgBaseRepository<FissionStoryboardRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("fission_storyboards"), client);
  }

  protected mapRow(row: Record<string, unknown>): FissionStoryboardRecord {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      creatorId: row.creator_id as string,
      fissionType: row.fission_type as string,
      characterName: (row.character_name as string) ?? null,
      characterDescription: (row.character_description as string) ?? null,
      characterAvatar: (row.character_avatar as string) ?? null,
      oldStory: (row.old_story as string) ?? null,
      newStory: (row.new_story as string) ?? null,
      storyboardImages: row.storyboard_images as string[] | null,
      storyboardVideos: row.storyboard_videos as string[] | null,
      status: row.status as string,
      errorMessage: (row.error_message as string) ?? null,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  protected mapEntity(entity: FissionStoryboardRecord): Record<string, unknown> {
    return {
      id: entity.id,
      project_id: entity.projectId,
      creator_id: entity.creatorId,
      fission_type: entity.fissionType,
      character_name: entity.characterName ?? null,
      character_description: entity.characterDescription ?? null,
      character_avatar: entity.characterAvatar ?? null,
      old_story: entity.oldStory ?? null,
      new_story: entity.newStory ?? null,
      storyboard_images: JSON.stringify(entity.storyboardImages ?? []),
      storyboard_videos: JSON.stringify(entity.storyboardVideos ?? []),
      status: entity.status,
      error_message: entity.errorMessage ?? null,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  /** 查询所有分镜，按创建时间倒序 */
  async listAll(): Promise<FissionStoryboardRecord[]> {
    const result = await this.queryClient.query(
      `SELECT id, project_id, creator_id, fission_type, character_name, character_description,
              character_avatar, old_story, new_story, storyboard_images, storyboard_videos,
              status, error_message, created_at, updated_at
       FROM ${this.tableName}
       ORDER BY created_at DESC`,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 根据项目ID查询分镜 */
  async findByProjectId(projectId: string): Promise<FissionStoryboardRecord | null> {
    const result = await this.queryClient.query(
      `SELECT id, project_id, creator_id, fission_type, character_name, character_description,
              character_avatar, old_story, new_story, storyboard_images, storyboard_videos,
              status, error_message, created_at, updated_at
       FROM ${this.tableName}
       WHERE project_id = $1
       LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 根据创建者ID查询分镜列表 */
  async listByCreatorId(creatorId: string): Promise<FissionStoryboardRecord[]> {
    const result = await this.queryClient.query(
      `SELECT id, project_id, creator_id, fission_type, character_name, character_description,
              character_avatar, old_story, new_story, storyboard_images, storyboard_videos,
              status, error_message, created_at, updated_at
       FROM ${this.tableName}
       WHERE creator_id = $1
       ORDER BY created_at DESC`,
      [creatorId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 检查项目是否已有分镜 */
  async existsByProjectId(projectId: string): Promise<boolean> {
    const result = await this.queryClient.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
    return Number(result.rows[0]?.count ?? 0) > 0;
  }

  /** 创建分镜记录 */
  async createRecord(record: FissionStoryboardRecord): Promise<FissionStoryboardRecord> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName}
        (id, project_id, creator_id, fission_type, character_name, character_description,
         character_avatar, old_story, new_story, storyboard_images, storyboard_videos,
         status, error_message, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        record.id, record.projectId, record.creatorId, record.fissionType,
        record.characterName ?? null, record.characterDescription ?? null, record.characterAvatar ?? null,
        record.oldStory ?? null, record.newStory ?? null,
        JSON.stringify(record.storyboardImages ?? []),
        JSON.stringify(record.storyboardVideos ?? []),
        record.status, record.errorMessage, record.createdAt, record.updatedAt,
      ],
    );
    return record;
  }

  /** 更新分镜记录 */
  async updateRecord(record: FissionStoryboardRecord): Promise<FissionStoryboardRecord> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET project_id = $2, creator_id = $3, fission_type = $4,
           character_name = $5, character_description = $6, character_avatar = $7,
           old_story = $8, new_story = $9, storyboard_images = $10, storyboard_videos = $11,
           status = $12, error_message = $13, updated_at = $14
       WHERE id = $1`,
      [
        record.id, record.projectId, record.creatorId, record.fissionType,
        record.characterName ?? null, record.characterDescription ?? null, record.characterAvatar ?? null,
        record.oldStory ?? null, record.newStory ?? null,
        JSON.stringify(record.storyboardImages ?? []),
        JSON.stringify(record.storyboardVideos ?? []),
        record.status, record.errorMessage, record.updatedAt,
      ],
    );
    return record;
  }

  /** 删除分镜记录，返回是否成功 */
  async deleteById(id: string): Promise<boolean> {
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
