/**
 * 长图生成历史记录 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { LongImageGeneration } from "../../contracts/types.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

export class PgLongImageGenerationRepository extends PgBaseRepository<LongImageGeneration> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("long_image_generations"), client);
  }

  protected mapRow(row: Record<string, unknown>): LongImageGeneration {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      templateId: row.template_id as string | null,
      templateName: row.template_name as string | null,
      imageUrl: row.image_url as string,
      sketchUrl: row.sketch_url as string | null,
      isActive: row.is_active as boolean,
      createdAt: row.created_at as number,
    };
  }

  protected mapEntity(v: LongImageGeneration): Record<string, unknown> {
    return {
      id: v.id,
      project_id: v.projectId,
      template_id: v.templateId ?? null,
      template_name: v.templateName ?? null,
      image_url: v.imageUrl,
      sketch_url: v.sketchUrl ?? null,
      is_active: v.isActive,
      created_at: v.createdAt,
    };
  }

  /** 查询项目的全部历史记录（按创建时间倒序） */
  async findByProjectId(projectId: string): Promise<LongImageGeneration[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId],
    );
    return result.rows.map((r: Record<string, unknown>) => this.mapRow(r));
  }

  /** 查询项目当前激活的记录 */
  async findActiveByProjectId(projectId: string): Promise<LongImageGeneration | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE project_id = $1 AND is_active = true LIMIT 1`,
      [projectId],
    );
    if (!result.rows[0]) return null;
    return this.mapRow(result.rows[0] as Record<string, unknown>);
  }

  /** 激活指定记录，同时取消其他记录的激活状态 */
  async activate(projectId: string, generationId: string): Promise<boolean> {
    // 先验证记录归属本项目
    const check = await this.queryClient.query(
      `SELECT id FROM ${this.tableName} WHERE id = $1 AND project_id = $2`,
      [generationId, projectId],
    );
    if (check.rows.length === 0) return false;

    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_active = false WHERE project_id = $1 AND id != $2`,
      [projectId, generationId],
    );
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_active = true WHERE id = $1 AND project_id = $2`,
      [generationId, projectId],
    );
    return true;
  }
}
