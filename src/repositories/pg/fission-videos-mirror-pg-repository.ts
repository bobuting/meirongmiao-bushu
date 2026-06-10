/**
 * 裂变镜像视频 PG 仓库
 * 处理 nrm_fission_videos_mirror 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 裂变镜像视频记录 */
export interface FissionVideosMirrorRecord {
  id: string;
  projectId: string;
  creatorId: string;
  mirrorVideoUrls: string[];
  mirrorCount: number;
  sourceProjectId: string | null;
  uploadedAt: number | null;
  durationSec: number | null;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export class PgFissionVideosMirrorRepository extends PgBaseRepository<FissionVideosMirrorRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("fission_videos_mirror"), client);
  }

  protected mapRow(row: Record<string, unknown>): FissionVideosMirrorRecord {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      creatorId: row.creator_id as string,
      mirrorVideoUrls: PgBaseRepository.ensureStringArray(row.mirror_video_urls),
      mirrorCount: (row.mirror_count as number) ?? 0,
      sourceProjectId: (row.source_project_id as string) ?? null,
      uploadedAt: (row.uploaded_at as number) ?? null,
      durationSec: (row.duration_sec as number) ?? null,
      status: row.status as string,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  protected mapEntity(entity: FissionVideosMirrorRecord): Record<string, unknown> {
    return {
      id: entity.id,
      project_id: entity.projectId,
      creator_id: entity.creatorId,
      mirror_video_urls: JSON.stringify(entity.mirrorVideoUrls),
      mirror_count: entity.mirrorCount,
      source_project_id: entity.sourceProjectId ?? null,
      uploaded_at: entity.uploadedAt ?? null,
      duration_sec: entity.durationSec ?? null,
      status: entity.status,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  /** 根据ID查询 */
  async getById(id: string): Promise<FissionVideosMirrorRecord | null> {
    const result = await this.queryClient.query(
      `SELECT id, project_id, creator_id, mirror_video_urls, mirror_count,
              source_project_id, uploaded_at, duration_sec, status, created_at, updated_at
       FROM ${this.tableName}
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 根据项目ID查询最新的镜像视频记录 */
  async getByProjectId(projectId: string): Promise<FissionVideosMirrorRecord | null> {
    const result = await this.queryClient.query(
      `SELECT id, project_id, creator_id, mirror_video_urls, mirror_count,
              source_project_id, uploaded_at, duration_sec, status, created_at, updated_at
       FROM ${this.tableName}
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 创建镜像视频记录 */
  async createRecord(record: FissionVideosMirrorRecord): Promise<FissionVideosMirrorRecord> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName}
        (id, project_id, creator_id, mirror_video_urls, mirror_count,
         source_project_id, uploaded_at, duration_sec, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        record.id, record.projectId, record.creatorId,
        JSON.stringify(record.mirrorVideoUrls), record.mirrorCount,
        record.sourceProjectId ?? null, record.uploadedAt ?? null, record.durationSec ?? null,
        record.status, record.createdAt, record.updatedAt,
      ],
    );
    return record;
  }

  /** 更新镜像视频记录 */
  async updateRecord(record: FissionVideosMirrorRecord): Promise<FissionVideosMirrorRecord> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET project_id = $2, creator_id = $3, mirror_video_urls = $4, mirror_count = $5,
           source_project_id = $6, uploaded_at = $7, duration_sec = $8, status = $9, updated_at = $10
       WHERE id = $1`,
      [
        record.id, record.projectId, record.creatorId,
        JSON.stringify(record.mirrorVideoUrls), record.mirrorCount,
        record.sourceProjectId ?? null, record.uploadedAt ?? null, record.durationSec ?? null,
        record.status, record.updatedAt,
      ],
    );
    return record;
  }

  /** 删除镜像视频记录，返回是否成功 */
  async deleteById(id: string): Promise<boolean> {
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
