/**
 * 审美特征库 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 审美特征库记录 */
export interface AestheticLibraryRecord {
  id: string;
  featureCategory: string;
  featureCategoryCn: string | null;
  featureName: string;
  featureNameCn: string | null;
  featureDescription: string;
  featureDescriptionCn: string | null;
  ethnicityApplicable: string[];
  ageRange: string;
  popularityScore: number;
  trendPeriod: string;
  source: string;
  sourceImageUrl: string | null;
  ossImageUrl: string | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export class PgAestheticLibraryRepository extends PgBaseRepository<AestheticLibraryRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("aesthetic_feature_library"), client);
  }

  protected mapRow(row: Record<string, unknown>): AestheticLibraryRecord {
    return {
      id: row.id as string,
      featureCategory: row.feature_category as string,
      featureCategoryCn: (row.feature_category_cn as string) ?? null,
      featureName: row.feature_name as string,
      featureNameCn: (row.feature_name_cn as string) ?? null,
      featureDescription: row.feature_description as string,
      featureDescriptionCn: (row.feature_description_cn as string) ?? null,
      ethnicityApplicable: PgBaseRepository.ensureStringArray(row.ethnicity_applicable),
      ageRange: row.age_range as string,
      popularityScore: (row.popularity_score as number) ?? 0,
      trendPeriod: row.trend_period as string,
      source: row.source as string,
      sourceImageUrl: (row.source_image_url as string) ?? null,
      ossImageUrl: (row.oss_image_url as string) ?? null,
      isActive: (row.is_active as boolean) ?? true,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(entity: AestheticLibraryRecord): Record<string, unknown> {
    return {
      id: entity.id,
      feature_category: entity.featureCategory,
      feature_category_cn: entity.featureCategoryCn,
      feature_name: entity.featureName,
      feature_name_cn: entity.featureNameCn,
      feature_description: entity.featureDescription,
      feature_description_cn: entity.featureDescriptionCn,
      ethnicity_applicable: entity.ethnicityApplicable,
      age_range: entity.ageRange,
      popularity_score: entity.popularityScore,
      trend_period: entity.trendPeriod,
      source: entity.source,
      source_image_url: entity.sourceImageUrl,
      oss_image_url: entity.ossImageUrl,
      is_active: entity.isActive,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  /** 获取统计数据 */
  async getStatistics(): Promise<{
    totalCount: number;
    childCount: number;
    adultCount: number;
    categoryDistribution: Record<string, number>;
    recentUpdates: number;
  }> {
    // 总数统计（按年龄范围分类）
    const totalResult = await this.queryClient.query<{
      total: string;
      child: string;
      adult: string;
    }>(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE age_range IN ('0-1', '2-3', '4-6', '7-12', '13-17')) as child,
        COUNT(*) FILTER (WHERE age_range IN ('18-25', '26-30')) as adult
      FROM ${this.tableName}
      WHERE is_active = true`
    );

    // 分类分布统计
    const categoryResult = await this.queryClient.query<{
      feature_category: string;
      count: string;
    }>(
      `SELECT feature_category, COUNT(*) as count
      FROM ${this.tableName}
      WHERE is_active = true
      GROUP BY feature_category
      ORDER BY count DESC`
    );

    // 近 7 天更新数
    const recentResult = await this.queryClient.query<{ recent: string }>(
      `SELECT COUNT(*) as recent
      FROM ${this.tableName}
      WHERE is_active = true
        AND updated_at > EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days') * 1000`
    );

    const categoryDistribution: Record<string, number> = {};
    for (const row of categoryResult.rows) {
      categoryDistribution[row.feature_category] = parseInt(row.count, 10);
    }

    return {
      totalCount: parseInt(totalResult.rows[0].total, 10),
      childCount: parseInt(totalResult.rows[0].child, 10),
      adultCount: parseInt(totalResult.rows[0].adult, 10),
      categoryDistribution,
      recentUpdates: parseInt(recentResult.rows[0].recent, 10),
    };
  }

  /** 分页查询特征列表 */
  async findPaginated(params: {
    ageRange?: string;
    featureCategory?: string;
    page: number;
    limit: number;
  }): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const conditions: string[] = ["is_active = true"];
    const queryParams: (string | number)[] = [];

    if (params.ageRange) {
      queryParams.push(params.ageRange);
      conditions.push(`age_range = $${queryParams.length}`);
    }

    if (params.featureCategory) {
      queryParams.push(params.featureCategory);
      conditions.push(`feature_category = $${queryParams.length}`);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const countResult = await this.queryClient.query<{ total: string }>(
      `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`,
      queryParams
    );

    const listResult = await this.queryClient.query(
      `SELECT
        id,
        feature_category,
        feature_category_cn,
        feature_name,
        feature_name_cn,
        feature_description,
        feature_description_cn,
        ethnicity_applicable,
        age_range,
        popularity_score,
        source,
        source_image_url,
        oss_image_url,
        created_at,
        updated_at
      FROM ${this.tableName}
      ${whereClause}
      ORDER BY popularity_score DESC, created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
      [...queryParams, params.limit, offset]
    );

    return {
      items: listResult.rows,
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  /** 添加特征 */
  async createFeature(data: {
    id: string;
    featureCategory: string;
    featureName: string;
    featureDescription: string;
    ethnicityApplicable: string[];
    ageRange: string;
    trendPeriod: string;
    source: string;
    sourceMetadata: Record<string, unknown>;
    now: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id,
        feature_category,
        feature_name,
        feature_description,
        ethnicity_applicable,
        age_range,
        popularity_score,
        trend_period,
        source,
        source_metadata,
        created_at,
        updated_at,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, true)`,
      [
        data.id,
        data.featureCategory,
        data.featureName,
        data.featureDescription,
        data.ethnicityApplicable,
        data.ageRange,
        0, // 初始流行度评分
        data.trendPeriod,
        data.source,
        JSON.stringify(data.sourceMetadata),
        data.now,
      ]
    );
  }

  /** 编辑特征（动态字段更新） */
  async updateFeature(
    id: string,
    data: {
      featureName?: string;
      featureDescription?: string;
      ethnicityApplicable?: string[];
      popularityScore?: number;
    },
    now: number
  ): Promise<boolean> {
    const updates: string[] = [];
    const values: (string | number | string[])[] = [];
    let paramIndex = 1;

    if (data.featureName !== undefined) {
      updates.push(`feature_name = $${paramIndex++}`);
      values.push(data.featureName);
    }

    if (data.featureDescription !== undefined) {
      updates.push(`feature_description = $${paramIndex++}`);
      values.push(data.featureDescription);
    }

    if (data.ethnicityApplicable !== undefined) {
      updates.push(`ethnicity_applicable = $${paramIndex++}`);
      values.push(data.ethnicityApplicable);
    }

    if (data.popularityScore !== undefined) {
      updates.push(`popularity_score = $${paramIndex++}`);
      values.push(data.popularityScore);
    }

    if (updates.length === 0) return false;

    updates.push(`updated_at = $${paramIndex++}`);
    values.push(now);
    values.push(id);

    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${updates.join(", ")} WHERE id = $${paramIndex} AND is_active = true`,
      values
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 软删除特征 */
  async softDelete(id: string, now: number): Promise<boolean> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_active = false, updated_at = $1 WHERE id = $2 AND is_active = true`,
      [now, id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 获取热度排行 */
  async findPopularityRanking(params: {
    ageRange?: string;
    limit: number;
  }): Promise<Record<string, unknown>[]> {
    const conditions: string[] = ["is_active = true"];
    const queryParams: (string | number)[] = [];

    if (params.ageRange) {
      queryParams.push(params.ageRange);
      conditions.push(`age_range = $${queryParams.length}`);
    }

    const result = await this.queryClient.query(
      `SELECT
        id,
        feature_name,
        feature_name_cn,
        popularity_score,
        trend_period
      FROM ${this.tableName}
      WHERE ${conditions.join(" AND ")}
      ORDER BY popularity_score DESC
      LIMIT $${queryParams.length + 1}`,
      [...queryParams, params.limit]
    );
    return result.rows;
  }

  async extractFeatures(params: {
    ethnicityList: string[];
    ageRange: string;
    trendPeriod: string;
  }): Promise<Array<{ feature_category: string; feature_description: string; popularity_score: number }>> {
    const result = await this.queryClient.query(
      `SELECT feature_category, feature_name, feature_description, popularity_score
       FROM ${this.tableName}
       WHERE
         ethnicity_applicable && $1
         AND age_range = $2
         AND trend_period = $3
         AND popularity_score >= 0.7
         AND is_active = true
       ORDER BY popularity_score DESC, RANDOM()
       LIMIT 20`,
      [params.ethnicityList, params.ageRange, params.trendPeriod],
    );
    return result.rows;
  }

  async boostFeaturePopularity(category: string, description: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET
         popularity_score = LEAST(1.0, popularity_score + 0.05),
         updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
       WHERE
         feature_category = $1
         AND feature_description = $2
         AND is_active = true`,
      [category, description],
    );
  }

  async reduceFeaturePopularity(category: string, description: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET
         popularity_score = GREATEST(0.0, popularity_score - 0.1),
         updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
       WHERE
         feature_category = $1
         AND feature_description = $2
         AND is_active = true`,
      [category, description],
    );
  }

  async deactivateLowPopularity(): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET is_active = false, updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
       WHERE popularity_score < 0.3 AND is_active = true`,
    );
  }

  async upsertFeature(feature: {
    id: string;
    featureCategory: string;
    featureName: string;
    featureDescription: string;
    ethnicityApplicable: string[];
    ageRange: string;
    popularityScore: number;
    trendPeriod: string;
    source: string;
    sourceMetadata: Record<string, unknown>;
    createdAt: number;
    sourceImageUrl: string | null;
    ossImageUrl: string | null;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
         id, feature_category, feature_name, feature_description,
         ethnicity_applicable, age_range, popularity_score,
         trend_period, source, source_metadata, created_at, updated_at, is_active,
         source_image_url, oss_image_url
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, true, $12, $13)
       ON CONFLICT (feature_name) DO UPDATE SET
         popularity_score = EXCLUDED.popularity_score,
         trend_period = EXCLUDED.trend_period,
         source_metadata = EXCLUDED.source_metadata,
         source_image_url = EXCLUDED.source_image_url,
         oss_image_url = EXCLUDED.oss_image_url,
         updated_at = EXCLUDED.updated_at`,
      [
        feature.id,
        feature.featureCategory,
        feature.featureName,
        feature.featureDescription,
        feature.ethnicityApplicable,
        feature.ageRange,
        feature.popularityScore,
        feature.trendPeriod,
        feature.source,
        JSON.stringify(feature.sourceMetadata),
        feature.createdAt,
        feature.sourceImageUrl,
        feature.ossImageUrl,
      ],
    );
  }

  /** 批量更新流行度评分（综合社交媒体数据） */
  async updatePopularityScores(): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET popularity_score = (
         0.4 * COALESCE(source_metadata->>'likes_count', '0')::DECIMAL / 10000 +
         0.2 * COALESCE(source_metadata->>'fans_count', '0')::DECIMAL / 500000 +
         0.4 * popularity_score
       ),
       updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
       WHERE is_active = true`,
    );
  }
}