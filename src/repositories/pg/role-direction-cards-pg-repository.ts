/**
 * 角色预设卡片 PG 仓库
 * 每个项目一行，cards_json 存储角色方向卡片数组
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

export interface RoleDirectionCardsRecord {
  projectId: string;
  cardsJson: unknown[];
}

export class PgRoleDirectionCardsRepository extends PgBaseRepository<RoleDirectionCardsRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("role_direction_cards"), client);
  }

  protected mapRow(row: Record<string, unknown>): RoleDirectionCardsRecord {
    return {
      projectId: row.project_id as string,
      cardsJson: Array.isArray(row.cards_json) ? row.cards_json : [],
    };
  }

  protected mapEntity(entity: RoleDirectionCardsRecord): Record<string, unknown> {
    return {
      project_id: entity.projectId,
      cards_json: JSON.stringify(entity.cardsJson),
    };
  }

  /** 按项目 ID 查询 */
  async findByProjectId(projectId: string): Promise<RoleDirectionCardsRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE project_id = $1 LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 写入或更新角色卡片（按 project_id UPSERT） */
  async saveCards(projectId: string, cards: unknown[]): Promise<void> {
    const cardsJson = JSON.stringify(cards);
    const now = Date.now();
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (project_id, cards_json, created_at, updated_at)
       VALUES ($1, $2, $3, $3)
       ON CONFLICT (project_id) DO UPDATE SET
         cards_json = EXCLUDED.cards_json,
         updated_at = EXCLUDED.updated_at`,
      [projectId, cardsJson, now],
    );
  }

  /** 更新指定卡片的 portraitUrl */
  async updateCardPortraitUrl(projectId: string, directionId: string, portraitUrl: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET cards_json = (
         SELECT jsonb_agg(
           CASE WHEN (elem->>'directionId') = $2
             THEN elem || jsonb_build_object('portraitUrl', $3::text)
             ELSE elem
           END
         )
         FROM jsonb_array_elements(cards_json::jsonb) elem
       ),
       updated_at = $4
       WHERE project_id = $1`,
      [projectId, directionId, portraitUrl, Date.now()],
    );
  }

  /** 按项目 ID 删除 */
  async deleteByProjectId(projectId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
  }
}
