/**
 * 分镜专业提示词 PostgreSQL Repository
 * 操作 nrm_shot_prompts 表
 */

import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import type {
  ShotPromptsRecord,
  ShotPromptsType,
  CreateShotPromptsParams,
  GetActiveShotPromptsParams,
  ListShotPromptsHistoryParams,
  IShotPromptsRepository,
} from "../../contracts/shot-prompts-contract.js";

/**
 * 数据库行映射
 */
interface ShotPromptsRow {
  id: string;
  project_id: string;
  script_data_id: string | null;
  type: string;
  version: number;
  is_active: boolean;
  shots: unknown;
  character_anchors: unknown;
  emotional_arc: unknown;
  consistency_notes: unknown;
  input_snapshot: unknown;
  generated_at: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

/**
 * 从数据库行映射为 Record
 */
function mapRow(row: ShotPromptsRow): ShotPromptsRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    scriptDataId: row.script_data_id,
    type: row.type as ShotPromptsType,
    version: row.version,
    isActive: row.is_active,
    shots: row.shots as ShotPromptsRecord["shots"],
    characterAnchors: row.character_anchors as ShotPromptsRecord["characterAnchors"],
    emotionalArc: row.emotional_arc as ShotPromptsRecord["emotionalArc"],
    consistencyNotes: row.consistency_notes as ShotPromptsRecord["consistencyNotes"],
    inputSnapshot: row.input_snapshot as ShotPromptsRecord["inputSnapshot"],
    generatedAt: Number(row.generated_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    createdBy: row.created_by,
    deletedAt: row.deleted_at ? Number(row.deleted_at) : null,
    deletedBy: row.deleted_by,
  };
}

/**
 * 分镜专业提示词 PostgreSQL Repository 实现
 */
export class ShotPromptsPgRepository implements IShotPromptsRepository {
  constructor(private pool: Pool, private client?: PoolClient) {}

  /** 事务时用 client，否则用 pool */
  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  async create(params: CreateShotPromptsParams): Promise<ShotPromptsRecord> {
    const now = Date.now();
    const id = randomUUID();

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // 1. 查询当前项目该类型的最大版本号（加锁防止并发冲突）
      // 注意：FOR UPDATE 不能直接与聚合函数一起使用，通过子查询绕过
      const versionResult = await client.query<{ max_version: string | null }>(
        `SELECT MAX(version) as max_version
         FROM nrm_shot_prompts
         WHERE id IN (
           SELECT id FROM nrm_shot_prompts
           WHERE project_id = $1 AND type = $2 AND deleted_at IS NULL
           FOR UPDATE SKIP LOCKED
         )`,
        [params.projectId, params.type]
      );
      const nextVersion = (Number(versionResult.rows[0]?.max_version) || 0) + 1;

      // 2. 将同项目同类型的旧版本设为非激活
      await client.query(
        `UPDATE nrm_shot_prompts
         SET is_active = false, updated_at = $1
         WHERE project_id = $2 AND type = $3 AND is_active = true AND deleted_at IS NULL`,
        [now, params.projectId, params.type]
      );

      // 3. 插入新记录
      const insertResult = await client.query<ShotPromptsRow>(
        `INSERT INTO nrm_shot_prompts (
          id, project_id, script_data_id, type, version, is_active,
          shots, character_anchors, emotional_arc, consistency_notes, input_snapshot,
          generated_at, created_at, updated_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`,
        [
          id,
          params.projectId,
          params.scriptDataId ?? null,
          params.type,
          nextVersion,
          true,
          JSON.stringify(params.shots),
          params.characterAnchors ? JSON.stringify(params.characterAnchors) : null,
          params.emotionalArc ? JSON.stringify(params.emotionalArc) : null,
          params.consistencyNotes ? JSON.stringify(params.consistencyNotes) : null,
          params.inputSnapshot ? JSON.stringify(params.inputSnapshot) : null,
          params.generatedAt,
          now,
          now,
          params.createdBy ?? null,
        ]
      );

      await client.query("COMMIT");
      return mapRow(insertResult.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getActive(params: GetActiveShotPromptsParams): Promise<ShotPromptsRecord | null> {
    const result = await this.queryClient.query<ShotPromptsRow>(
      `SELECT * FROM nrm_shot_prompts
       WHERE project_id = $1 AND type = $2 AND is_active = true AND deleted_at IS NULL
       LIMIT 1`,
      [params.projectId, params.type]
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async getById(id: string): Promise<ShotPromptsRecord | null> {
    const result = await this.queryClient.query<ShotPromptsRow>(
      `SELECT * FROM nrm_shot_prompts WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id]
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async listHistory(params: ListShotPromptsHistoryParams): Promise<ShotPromptsRecord[]> {
    const limit = params.limit ?? 10;
    const result = await this.queryClient.query<ShotPromptsRow>(
      `SELECT * FROM nrm_shot_prompts
       WHERE project_id = $1 AND type = $2 AND deleted_at IS NULL
       ORDER BY version DESC
       LIMIT $3`,
      [params.projectId, params.type, limit]
    );

    return result.rows.map(mapRow);
  }

  async softDeleteByProjectId(projectId: string, deletedBy: string, type?: string): Promise<number> {
    const now = Date.now();
    const typeFilter = type ? ` AND type = $4` : "";
    const params = type ? [now, deletedBy, projectId, type] : [now, deletedBy, projectId];
    const result = await this.queryClient.query(
      `UPDATE nrm_shot_prompts
       SET deleted_at = $1, deleted_by = $2, updated_at = $1
       WHERE project_id = $3 AND deleted_at IS NULL${typeFilter}`,
      params
    );

    return result.rowCount ?? 0;
  }

  async hardDeleteByProjectId(projectId: string): Promise<number> {
    const result = await this.queryClient.query(
      `DELETE FROM nrm_shot_prompts WHERE project_id = $1`,
      [projectId]
    );

    return result.rowCount ?? 0;
  }
}

/**
 * 创建 Repository 实例的工厂函数
 */
export function createShotPromptsRepository(pool: Pool, client?: PoolClient): IShotPromptsRepository {
  return new ShotPromptsPgRepository(pool, client);
}