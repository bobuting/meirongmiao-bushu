/**
 * 视频项目业务数据 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { VideoProjectBusinessData } from "../../contracts/types.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

export class PgVideoProjectBusinessDataRepository extends PgBaseRepository<VideoProjectBusinessData> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("video_project_business_data"), client);
  }

  protected mapRow(row: Record<string, unknown>): VideoProjectBusinessData {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      availableStrategies: row.available_strategies as string[],
      ageGroup: row.age_group as string | null,
      characterAge: row.character_age as number | null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(v: VideoProjectBusinessData): Record<string, unknown> {
    return {
      id: v.id,
      project_id: v.projectId,
      available_strategies: JSON.stringify(v.availableStrategies),
      age_group: v.ageGroup ?? null,
      character_age: v.characterAge ?? null,
      created_at: v.createdAt,
      updated_at: v.updatedAt,
    };
  }

  /** 根据项目 ID 查找 */
  async findByProjectId(projectId: string): Promise<VideoProjectBusinessData | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE project_id = $1 LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 创建或更新策略数据（upsert） */
  async upsertStrategies(
    projectId: string,
    strategies: string[],
    ageGroup: string | null,
    characterAge: number | null,
  ): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (id, project_id, available_strategies, age_group, character_age, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (project_id) DO UPDATE SET
         available_strategies = EXCLUDED.available_strategies,
         age_group = EXCLUDED.age_group,
         character_age = EXCLUDED.character_age,
         updated_at = EXCLUDED.updated_at`,
      [`vpb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, projectId, JSON.stringify(strategies), ageGroup, characterAge, now],
    );
  }
}
