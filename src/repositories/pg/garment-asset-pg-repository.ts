/**
 * 服饰资产 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { GarmentAsset } from "../../contracts/types.js";
import type { IGarmentAssetRepository } from "../../contracts/repository-ports/garment-repository.js";
import { PgSoftDeletableRepository } from "./soft-deletable-repository.js";
import { nrm } from "./base-pg-repository.js";

export class PgGarmentAssetRepository
  extends PgSoftDeletableRepository<GarmentAsset>
  implements IGarmentAssetRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("garment_assets"), client);
  }

  protected mapRow(row: Record<string, unknown>): GarmentAsset {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      name: row.name as string,
      type: row.type as GarmentAsset["type"],
      category: row.category as GarmentAsset["category"],
      mainImageUrl: row.main_image_url as string,
      subImageUrl1: (row.sub_image_url_1 as string) ?? null,
      subImageUrl2: (row.sub_image_url_2 as string) ?? null,
      subImageUrl3: (row.sub_image_url_3 as string) ?? null,
      flatLayImageUrl: (row.flat_lay_image_url as string) ?? null,
      maskedImageUrl: (row.masked_image_url as string) ?? null,
      sizeMb: (row.size_mb as number) ?? null,
      source: (row.source as string) ?? null,
      // 服饰扩展属性
      description: (row.description as string) ?? null,
      mainColor: (row.main_color as string) ?? null,
      material: (row.material as string) ?? null,
      pattern: (row.pattern as string) ?? null,
      fit: (row.fit as string) ?? null,
      length: (row.length as string) ?? null,
      neckline: (row.neckline as string) ?? null,
      sleeve: (row.sleeve as string) ?? null,
      style: (row.style as string) ?? null,
      occasion: (row.occasion as string) ?? null,
      aiCategory: (row.ai_category as string) ?? null,
      aiViewLabel: (row.ai_view_label as string) ?? null,
      aiConfidence: (row.ai_confidence as number) ?? null,
      aiReason: (row.ai_reason as string) ?? null,
      garmentRegions: PgSoftDeletableRepository.fromJsonb<GarmentAsset["garmentRegions"]>(row.garment_regions) ?? undefined,
      sellingPoints: PgSoftDeletableRepository.fromJsonb<GarmentAsset["sellingPoints"]>(row.selling_points) ?? undefined,
      // 适穿属性
      targetAgeRange: (row.target_age_range as GarmentAsset["targetAgeRange"]) ?? null,
      targetGender: (row.target_gender as GarmentAsset["targetGender"]) ?? null,
      variantGroupId: (row.variant_group_id as string) ?? null,
      variantColor: (row.variant_color as string) ?? null,
      isPrimaryVariant: (row.is_primary_variant as boolean) ?? false,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      deletedAt: (row.deleted_at as number) ?? null,
      deletedBy: (row.deleted_by as string) ?? null,
    };
  }

  protected mapEntity(a: GarmentAsset): Record<string, unknown> {
    return {
      id: a.id,
      user_id: a.userId,
      name: a.name,
      type: a.type,
      category: a.category,
      main_image_url: a.mainImageUrl,
      sub_image_url_1: a.subImageUrl1 ?? null,
      sub_image_url_2: a.subImageUrl2 ?? null,
      sub_image_url_3: a.subImageUrl3 ?? null,
      flat_lay_image_url: a.flatLayImageUrl ?? null,
      masked_image_url: a.maskedImageUrl ?? null,
      size_mb: a.sizeMb ?? null,
      source: a.source ?? null,
      // 服饰扩展属性
      description: a.description ?? null,
      main_color: a.mainColor ?? null,
      material: a.material ?? null,
      pattern: a.pattern ?? null,
      fit: a.fit ?? null,
      length: a.length ?? null,
      neckline: a.neckline ?? null,
      sleeve: a.sleeve ?? null,
      style: a.style ?? null,
      occasion: a.occasion ?? null,
      ai_category: a.aiCategory ?? null,
      ai_view_label: a.aiViewLabel ?? null,
      ai_confidence: a.aiConfidence ?? null,
      ai_reason: a.aiReason ?? null,
      garment_regions: PgSoftDeletableRepository.toJsonb(a.garmentRegions),
      selling_points: PgSoftDeletableRepository.toJsonb(a.sellingPoints),
      // 适穿属性
      target_age_range: a.targetAgeRange ?? null,
      target_gender: a.targetGender ?? null,
      variant_group_id: a.variantGroupId ?? null,
      variant_color: a.variantColor ?? null,
      is_primary_variant: a.isPrimaryVariant ?? false,
      created_at: a.createdAt,
      updated_at: a.updatedAt,
      deleted_at: a.deletedAt ?? null,
      deleted_by: a.deletedBy ?? null,
    };
  }

  async findByUserId(userId: string): Promise<GarmentAsset[]> {
    return this.findWhere({ user_id: userId });
  }

  async findByIds(ids: string[]): Promise<GarmentAsset[]> {
    if (ids.length === 0) return [];
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE id = ANY($1) AND deleted_at IS NULL`,
      [ids],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findPublicAssets(): Promise<GarmentAsset[]> {
    return this.findWhere({ user_id: "system" });
  }

  /** 用户资产 + 公共资产合并分页查询 */
  async findByUserIdPaged(
    userId: string,
    options?: {
      page?: number;
      pageSize?: number;
      category?: string;
      keyword?: string;
    },
  ): Promise<{
    items: GarmentAsset[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ["(user_id = $1 OR user_id = 'system')", "deleted_at IS NULL"];
    const params: unknown[] = [userId];
    let paramIndex = 2;

    if (options?.category && options.category !== "all") {
      // suit 和 outfit 归为"套装"
      if (options.category === "suit") {
        conditions.push(`(category = $${paramIndex} OR category = 'outfit')`);
      } else {
        conditions.push(`category = $${paramIndex}`);
      }
      params.push(options.category);
      paramIndex++;
    }

    if (options?.keyword) {
      conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR main_color ILIKE $${paramIndex} OR style ILIKE $${paramIndex} OR material ILIKE $${paramIndex})`);
      params.push(`%${options.keyword}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");
    const tableName = this.tableName;

    const countResult = await this.queryClient.query(
      `SELECT COUNT(*) as total FROM ${tableName} WHERE ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const dataResult = await this.queryClient.query(
      `SELECT * FROM ${tableName} WHERE ${whereClause} ORDER BY updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSize, offset],
    );

    const items = dataResult.rows.map((row) => this.mapRow(row as Record<string, unknown>));
    const totalPages = Math.ceil(total / pageSize);
    const hasMore = page < totalPages;

    return { items, total, page, pageSize, totalPages, hasMore };
  }

  /** 更新变体关联字段 */
  async updateVariantFields(
    id: string,
    fields: { variantGroupId: string | null; variantColor: string | null; isPrimaryVariant: boolean },
  ): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET variant_group_id = $1, variant_color = $2, is_primary_variant = $3, updated_at = $4 WHERE id = $5`,
      [fields.variantGroupId, fields.variantColor, fields.isPrimaryVariant, Date.now(), id],
    );
  }

  /** 查询服饰主图 URL */
  async findMainImageUrlById(id: string): Promise<{ main_image_url: string | null } | null> {
    const result = await this.queryClient.query<{ main_image_url: string | null }>(
      "SELECT main_image_url FROM " + this.tableName + " WHERE id = $1",
      [id],
    );
    return result.rows[0] ?? null;
  }
}