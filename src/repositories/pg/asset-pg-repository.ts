/**
 * 项目服饰 PG 仓库
 *
 * 操作 nrm_project_garment_assoc 表（已扩展字段）
 */

import type { Pool, PoolClient } from "pg";
import type { ProjectGarment, OutfitPlan, ProjectOutfitPlanAssoc } from "../../contracts/types.js";
import type { IAssetRepository, IOutfitPlanRepository, IProjectOutfitPlanAssocRepository } from "../../contracts/repository-ports/asset-repository.js";
import type { SquarePublishCategory } from "../../contracts/square-publish-category.js";
import { PgBaseRepository } from "./base-pg-repository.js";
import { PgSoftDeletableRepository } from "./soft-deletable-repository.js";
import { nrm } from "./base-pg-repository.js";

// ============================================================================
// 项目服饰
// ============================================================================

export class PgAssetRepository extends PgBaseRepository<ProjectGarment> implements IAssetRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("project_garment_assoc"), client);
  }

  protected mapRow(row: Record<string, unknown>): ProjectGarment {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      userId: row.user_id as string,
      category: (row.category as string) ?? null,
      garmentAssetId: (row.garment_asset_id as string) ?? null,
      fileName: (row.file_name as string) ?? null,
      sizeMb: (row.size_mb as number) ?? null,
      imageUrl: (row.image_url as string) ?? null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      // 兼容旧字段（已废弃）
      apparelCategory: (row.apparel_category as SquarePublishCategory) ?? undefined,
    };
  }

  protected mapEntity(a: ProjectGarment): Record<string, unknown> {
    return {
      id: a.id,
      project_id: a.projectId,
      user_id: a.userId,
      category: a.category ?? null,
      garment_asset_id: a.garmentAssetId ?? null,
      file_name: a.fileName ?? null,
      size_mb: a.sizeMb ?? null,
      image_url: a.imageUrl ?? null,
      created_at: a.createdAt,
      updated_at: a.updatedAt,
    };
  }

  async findByProjectId(projectId: string): Promise<ProjectGarment[]> {
    return this.findWhere({ project_id: projectId });
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    await this.queryClient.query(`DELETE FROM ${this.tableName} WHERE project_id = $1`, [projectId]);
  }

  /**
   * 更新或插入项目服饰（每个项目对同一服饰资产只能有一条记录）
   */
  async upsertByProjectAndGarmentAsset(garment: ProjectGarment): Promise<void> {
    const entity = this.mapEntity(garment);
    const keys = Object.keys(entity);
    const columns = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const updates = keys
      .filter((k) => k !== "id")
      .map((k) => `${k} = EXCLUDED.${k}`)
      .join(", ");

    const values = Object.values(entity);
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) ON CONFLICT (project_id, garment_asset_id) DO UPDATE SET ${updates}`,
      values,
    );
  }
}

// ============================================================================
// 搭配方案（独立实体，可复用）
// ============================================================================

export class PgOutfitPlanRepository extends PgSoftDeletableRepository<OutfitPlan> implements IOutfitPlanRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("outfit_plans"), client);
  }

  protected mapRow(row: Record<string, unknown>): OutfitPlan {
    return {
      id: row.id as string,
      projectId: (row.project_id as string) ?? undefined,
      userId: row.user_id as string,
      garmentAssetId: (row.garment_asset_id as string) ?? undefined,
      assetIds: PgSoftDeletableRepository.fromJsonb<string[]>(row.asset_ids) ?? [],
      index: (row.index ?? 0) as number,
      title: (row.title as string) ?? undefined,
      reason: (row.reason as string) ?? undefined,
      styleName: (row.style_name as string) ?? undefined,
      analysis: (row.analysis as string) ?? undefined,
      optimizedPrompt: (row.optimized_prompt as string) ?? undefined,
      analysisPrompt: (row.analysis_prompt as string) ?? undefined,
      items: PgSoftDeletableRepository.fromJsonb<OutfitPlan["items"]>(row.items) ?? undefined,
      trendSummary: (row.trend_summary as string) ?? undefined,
      suitableScene: (row.suitable_scene as string) ?? undefined,
      tags: PgSoftDeletableRepository.fromJsonb<string[]>(row.tags) ?? undefined,
      groundingSources: PgSoftDeletableRepository.fromJsonb<Array<{ title: string; url: string }>>(row.grounding_sources) ?? undefined,
      deletedAt: row.deleted_at as number | null | undefined,
      deletedBy: row.deleted_by as string | null | undefined,
    };
  }

  protected mapEntity(p: OutfitPlan): Record<string, unknown> {
    return {
      id: p.id,
      project_id: p.projectId ?? null,
      user_id: p.userId,
      garment_asset_id: p.garmentAssetId ?? null,
      asset_ids: PgSoftDeletableRepository.toJsonb(p.assetIds),
      index: p.index,
      title: p.title ?? null,
      reason: p.reason ?? null,
      style_name: p.styleName ?? null,
      analysis: p.analysis ?? null,
      optimized_prompt: p.optimizedPrompt ?? null,
      analysis_prompt: p.analysisPrompt ?? null,
      items: PgSoftDeletableRepository.toJsonb(p.items),
      trend_summary: p.trendSummary ?? null,
      suitable_scene: p.suitableScene ?? null,
      tags: PgSoftDeletableRepository.toJsonb(p.tags),
      grounding_sources: PgSoftDeletableRepository.toJsonb(p.groundingSources),
      deleted_at: p.deletedAt ?? null,
      deleted_by: p.deletedBy ?? null,
    };
  }

  async findByProjectId(projectId: string): Promise<OutfitPlan[]> {
    // 通过关联表查询项目的搭配方案
    const result = await this.queryClient.query(
      `SELECT op.* FROM ${this.tableName} op
       INNER JOIN nrm_project_outfit_plans pop ON op.id = pop.outfit_plan_id
       WHERE pop.project_id = $1 AND op.deleted_at IS NULL
       ORDER BY op.index`,
      [projectId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    // 先删除关联关系
    await this.queryClient.query(
      `DELETE FROM nrm_project_outfit_plans WHERE project_id = $1`,
      [projectId],
    );
    // 再删除搭配方案记录（全量覆盖）
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
  }

  /** 按项目ID查询搭配方案（JOIN 关联表，返回原始行） */
  async findByProject(projectId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT op.id, op.title, op.reason, op.asset_ids, pop.selected
       FROM nrm_project_outfit_plans pop
       JOIN nrm_outfit_plans op ON pop.outfit_plan_id = op.id
       WHERE pop.project_id = $1
       ORDER BY pop.selected DESC, op.index`,
      [projectId],
    );
    return result.rows;
  }
}

// ============================================================================
// 项目-搭配方案关联
// ============================================================================

export class PgProjectOutfitPlanAssocRepository extends PgBaseRepository<ProjectOutfitPlanAssoc> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("project_outfit_plans"), client);
  }

  protected mapRow(row: Record<string, unknown>): ProjectOutfitPlanAssoc {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      outfitPlanId: row.outfit_plan_id as string,
      selected: (row.selected as boolean) ?? false,
      createdAt: row.created_at as number,
    };
  }

  protected mapEntity(e: ProjectOutfitPlanAssoc): Record<string, unknown> {
    return {
      id: e.id,
      project_id: e.projectId,
      outfit_plan_id: e.outfitPlanId,
      selected: e.selected,
      created_at: e.createdAt,
    };
  }

  async findByProjectId(projectId: string): Promise<ProjectOutfitPlanAssoc[]> {
    return this.findWhere({ project_id: projectId });
  }

  async findByProjectAndOutfit(projectId: string, outfitPlanId: string): Promise<ProjectOutfitPlanAssoc | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE project_id = $1 AND outfit_plan_id = $2`,
      [projectId, outfitPlanId],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async upsert(assoc: ProjectOutfitPlanAssoc): Promise<void> {
    const entity = this.mapEntity(assoc);
    const keys = Object.keys(entity);
    const columns = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const updates = keys
      .filter((k) => k !== "id")
      .map((k) => `${k} = EXCLUDED.${k}`)
      .join(", ");
    const values = Object.values(entity);
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) ON CONFLICT (project_id, outfit_plan_id) DO UPDATE SET ${updates}`,
      values,
    );
  }

  async setSelected(projectId: string, outfitPlanId: string): Promise<void> {
    // 先清除所有选中
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET selected = FALSE WHERE project_id = $1`,
      [projectId],
    );
    // 再设置选中
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET selected = TRUE WHERE project_id = $1 AND outfit_plan_id = $2`,
      [projectId, outfitPlanId],
    );
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    await this.queryClient.query(`DELETE FROM ${this.tableName} WHERE project_id = $1`, [projectId]);
  }
}