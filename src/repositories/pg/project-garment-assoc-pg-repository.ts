/**
 * 项目服饰关联 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { ProjectGarmentAssoc } from "../../contracts/types.js";
import type { IProjectGarmentAssocRepository } from "../../contracts/repository-ports/garment-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

export class PgProjectGarmentAssocRepository
  extends PgBaseRepository<ProjectGarmentAssoc>
  implements IProjectGarmentAssocRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("project_garment_assoc"), client);
  }

  protected mapRow(row: Record<string, unknown>): ProjectGarmentAssoc {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      garmentAssetId: row.garment_asset_id as string,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(a: ProjectGarmentAssoc): Record<string, unknown> {
    return {
      id: a.id,
      project_id: a.projectId,
      garment_asset_id: a.garmentAssetId,
      created_at: a.createdAt,
      updated_at: a.updatedAt,
    };
  }

  async findByProjectId(projectId: string): Promise<ProjectGarmentAssoc[]> {
    return this.findWhere({ project_id: projectId });
  }

  async findByGarmentAssetId(assetId: string): Promise<ProjectGarmentAssoc[]> {
    return this.findWhere({ garment_asset_id: assetId });
  }

  async findAssetIdsByProjectId(projectId: string): Promise<string[]> {
    const result = await this.queryClient.query(
      `SELECT garment_asset_id FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
    return result.rows.map((row) => row.garment_asset_id as string);
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
  }

  /** 按项目ID查询服饰关联列表（JOIN 服饰资产表，返回原始行） */
  async findByProjectWithAsset(projectId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT pga.id, pga.garment_asset_id, pga.image_url, pga.category,
              ga.name, ga.main_image_url, ga.sub_image_url_1, ga.sub_image_url_2,
              ga.sub_image_url_3, ga.flat_lay_image_url
       FROM nrm_project_garment_assoc pga
       LEFT JOIN nrm_garment_assets ga ON pga.garment_asset_id = ga.id
       WHERE pga.project_id = $1
       ORDER BY pga.created_at`,
      [projectId],
    );
    return result.rows;
  }
}