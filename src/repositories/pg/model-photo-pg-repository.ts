/**
 * 模特图 PG 仓库（图片项目 Step 3）
 */

import type { Pool, PoolClient } from "pg";
import type { ModelPhoto } from "../../contracts/types.js";
import type { IModelPhotoRepository } from "../../contracts/repository-ports/library-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

export class PgModelPhotoRepository
  extends PgBaseRepository<ModelPhoto>
  implements IModelPhotoRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("model_photos"), client);
  }

  protected mapRow(row: Record<string, unknown>): ModelPhoto {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      imageUrl: row.image_url as string | null,
      poseLabel: row.pose_label as string,
      bgLabel: row.bg_label as string,
      isSelected: row.is_selected as boolean,
      status: row.status as ModelPhoto["status"],
      errorMessage: row.error_message as string | null,
      order: row.sort_order as number,
      characterIds: PgBaseRepository.fromJsonb<string[]>(row.character_ids) ?? undefined,
      colorAssignments: PgBaseRepository.fromJsonb<Record<string, string>>(row.color_assignments) ?? undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(v: ModelPhoto): Record<string, unknown> {
    return {
      id: v.id,
      project_id: v.projectId,
      image_url: v.imageUrl ?? null,
      pose_label: v.poseLabel,
      bg_label: v.bgLabel,
      is_selected: v.isSelected,
      status: v.status,
      error_message: v.errorMessage ?? null,
      sort_order: v.order,
      character_ids: PgBaseRepository.toJsonb(v.characterIds),
      color_assignments: PgBaseRepository.toJsonb(v.colorAssignments),
      created_at: v.createdAt,
      updated_at: v.updatedAt,
    };
  }

  async findByProjectId(projectId: string): Promise<ModelPhoto[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE project_id = $1 ORDER BY sort_order ASC`,
      [projectId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findMinSortOrder(projectId: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COALESCE(MIN(sort_order), 0) as min_order FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
    return result.rows[0]?.min_order ?? 0;
  }

  async findMaxSortOrder(projectId: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COALESCE(MAX(sort_order), 0) as max_order FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
    return result.rows[0]?.max_order ?? 0;
  }

  async create(photo: ModelPhoto): Promise<void> {
    const data = this.mapEntity(photo);
    const keys = Object.keys(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const values = Object.values(data);
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${keys.join(", ")}) VALUES (${placeholders})`,
      values,
    );
  }

  async update(photo: ModelPhoto): Promise<void> {
    const data = this.mapEntity(photo);
    const keys = Object.keys(data).filter((k) => k !== "id");
    const updates = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const values = keys.map((k) => data[k]);
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${updates} WHERE id = $${keys.length + 1}`,
      [...values, photo.id],
    );
  }

  async bulkCreate(photos: ModelPhoto[]): Promise<void> {
    if (photos.length === 0) return;

    const rows = photos.map((p) => this.mapEntity(p));
    const keys = Object.keys(rows[0]!);
    const valuesPerRow = keys.length;
    const allValues: unknown[] = [];
    const valuePlaceholders: string[] = [];

    rows.forEach((row, i) => {
      const rowPlaceholders = keys.map((_, j) => `$${i * valuesPerRow + j + 1}`);
      valuePlaceholders.push(`(${rowPlaceholders.join(", ")})`);
      keys.forEach((key) => {
        allValues.push(row[key]);
      });
    });

    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${keys.join(", ")}) VALUES ${valuePlaceholders.join(", ")}`,
      allValues,
    );
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
  }

  async deleteById(photoId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [photoId],
    );
  }

  async countSelected(projectId: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as cnt FROM ${this.tableName} WHERE project_id = $1 AND is_selected = true`,
      [projectId],
    );
    return Number(result.rows[0]?.cnt ?? 0);
  }

  /** 查询项目已选中的模特照片（最多10张） */
  async findSelectedByProjectId(projectId: string, limit = 10): Promise<Array<{ id: string; imageUrl: string; poseLabel: string | null }>> {
    const result = await this.queryClient.query(
      `SELECT id, image_url, pose_label FROM ${this.tableName} WHERE project_id = $1 AND is_selected = true AND status = 'success' ORDER BY sort_order ASC LIMIT $2`,
      [projectId, limit],
    );
    return result.rows.map((row) => ({
      id: row.id as string,
      imageUrl: row.image_url as string,
      poseLabel: (row.pose_label as string) ?? null,
    }));
  }

  /** 按项目ID查询模特图列表（摘要字段，返回原始行） */
  async findByProject(projectId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT id, image_url, pose_label, bg_label, is_selected, status, error_message, sort_order
       FROM ${this.tableName}
       WHERE project_id = $1
       ORDER BY is_selected DESC, sort_order DESC, created_at`,
      [projectId],
    );
    return result.rows;
  }
}
