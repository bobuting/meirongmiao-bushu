/**
 * 图片项目扩展信息 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { ImageProjectExt } from "../../contracts/types.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

export class PgImageProjectExtRepository extends PgBaseRepository<ImageProjectExt> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("image_project_ext"), client);
  }

  protected mapRow(row: Record<string, unknown>): ImageProjectExt {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      logoUrl: row.logo_url as string | null,
      logoPosition: row.logo_position as ImageProjectExt["logoPosition"],
      logoWidthRatio: Number(row.logo_width_ratio),
      logoMinWidth: row.logo_min_width as number,
      logoMaxWidth: row.logo_max_width as number,
      logoMargin: row.logo_margin as number,
      logoOpacity: Number(row.logo_opacity),
      stitchImageUrl: row.stitch_image_url as string | null,
      stitchHash: row.stitch_hash as string | null,
      stitchUpdatedAt: row.stitch_updated_at as number | null,
      longImageUrl: row.long_image_url as string | null,
      longImageSketchUrl: row.long_image_sketch_url as string | null,
      imageRelationMode: (row.image_relation_mode as ImageProjectExt["imageRelationMode"]) ?? null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(v: ImageProjectExt): Record<string, unknown> {
    return {
      id: v.id,
      project_id: v.projectId,
      logo_url: v.logoUrl ?? null,
      logo_position: v.logoPosition,
      logo_width_ratio: v.logoWidthRatio,
      logo_min_width: v.logoMinWidth,
      logo_max_width: v.logoMaxWidth,
      logo_margin: v.logoMargin,
      logo_opacity: v.logoOpacity,
      stitch_image_url: v.stitchImageUrl ?? null,
      stitch_hash: v.stitchHash ?? null,
      stitch_updated_at: v.stitchUpdatedAt ?? null,
      long_image_url: v.longImageUrl ?? null,
      long_image_sketch_url: v.longImageSketchUrl ?? null,
      image_relation_mode: v.imageRelationMode ?? null,
      created_at: v.createdAt,
      updated_at: v.updatedAt,
    };
  }

  /** 根据项目 ID 查找 */
  async findByProjectId(projectId: string): Promise<ImageProjectExt | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE project_id = $1 LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 创建或更新（upsert） */
  async upsert(ext: ImageProjectExt): Promise<void> {
    const data = this.mapEntity(ext);
    const keys = Object.keys(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const updates = keys
      .filter((k) => k !== "id" && k !== "project_id")
      .map((k, i) => `${k} = EXCLUDED.${k}`)
      .join(", ");
    const values = Object.values(data);

    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${keys.join(", ")}) VALUES (${placeholders})
       ON CONFLICT (project_id) DO UPDATE SET ${updates}`,
      values,
    );
  }

  /** 更新 Logo URL */
  async updateLogoUrl(projectId: string, logoUrl: string | null): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET logo_url = $1, updated_at = $2 WHERE project_id = $3`,
      [logoUrl, now, projectId],
    );
  }

  /** 创建初始记录（无 logo），仅在记录不存在时 INSERT */
  async createEmpty(projectId: string): Promise<ImageProjectExt> {
    const id = `ipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const ext: ImageProjectExt = {
      id,
      projectId,
      logoUrl: null,
      logoPosition: "top-left",
      logoWidthRatio: 0.25,   // Logo 占图片宽度的 25%（从 20% 增加）
      logoMinWidth: 250,      // 最小 250px（从 200px 增加，配合新的比例）
      logoMaxWidth: 500,      // 最大 500px
      logoMargin: 30,         // 边距 30px（从 20px 增加）
      logoOpacity: 1.0,
      stitchImageUrl: null,
      stitchHash: null,
      stitchUpdatedAt: null,
      longImageUrl: null,
      longImageSketchUrl: null,
      imageRelationMode: null,
      createdAt: now,
      updatedAt: now,
    };
    const data = this.mapEntity(ext);
    const keys = Object.keys(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const values = Object.values(data);
    // ON CONFLICT DO NOTHING：记录已存在时不覆盖（保护 stitch 缓存等字段）
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${keys.join(", ")}) VALUES (${placeholders})
       ON CONFLICT (project_id) DO NOTHING`,
      values,
    );
    return ext;
  }

  /** 更新合成缓存（如果记录不存在则先创建） */
  async updateStitchCache(projectId: string, hash: string, imageUrl: string): Promise<void> {
    const now = Date.now();
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET stitch_image_url = $1, stitch_hash = $2, stitch_updated_at = $3, updated_at = $4 WHERE project_id = $5`,
      [imageUrl, hash, now, now, projectId],
    );
    if (result.rowCount === 0) {
      await this.createEmpty(projectId);
      await this.queryClient.query(
        `UPDATE ${this.tableName} SET stitch_image_url = $1, stitch_hash = $2, stitch_updated_at = $3, updated_at = $4 WHERE project_id = $5`,
        [imageUrl, hash, now, now, projectId],
      );
    }
  }

  /** 获取合成缓存 */
  async getStitchCache(projectId: string): Promise<{ hash: string | null; imageUrl: string | null }> {
    const result = await this.queryClient.query(
      `SELECT stitch_hash, stitch_image_url FROM ${this.tableName} WHERE project_id = $1 LIMIT 1`,
      [projectId],
    );
    if (!result.rows[0]) return { hash: null, imageUrl: null };
    return {
      hash: result.rows[0].stitch_hash as string | null,
      imageUrl: result.rows[0].stitch_image_url as string | null,
    };
  }

  /** 动态更新 Logo 配置字段（仅更新非 undefined 字段） */
  async updateLogoConfig(projectId: string, updates: Record<string, unknown>): Promise<void> {
    if (Object.keys(updates).length === 0) return;
    const keys = Object.keys(updates);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${setClause} WHERE project_id = $${keys.length}`,
      [...Object.values(updates), projectId],
    );
  }

  /** 更新万相营造长图结果 */
  async updateLongImage(projectId: string, imageUrl: string, sketchUrl?: string | null): Promise<void> {
    const now = Date.now();
    if (sketchUrl !== undefined) {
      await this.queryClient.query(
        `UPDATE ${this.tableName} SET long_image_url = $1, long_image_sketch_url = $2, updated_at = $3 WHERE project_id = $4`,
        [imageUrl, sketchUrl, now, projectId],
      );
    } else {
      await this.queryClient.query(
        `UPDATE ${this.tableName} SET long_image_url = $1, updated_at = $2 WHERE project_id = $3`,
        [imageUrl, now, projectId],
      );
    }
  }

  /** 获取万相营造长图 URL */
  async getLongImage(projectId: string): Promise<{ imageUrl: string | null; sketchUrl: string | null }> {
    const result = await this.queryClient.query(
      `SELECT long_image_url, long_image_sketch_url FROM ${this.tableName} WHERE project_id = $1 LIMIT 1`,
      [projectId],
    );
    if (!result.rows[0]) return { imageUrl: null, sketchUrl: null };
    return {
      imageUrl: result.rows[0].long_image_url as string | null,
      sketchUrl: result.rows[0].long_image_sketch_url as string | null,
    };
  }
}