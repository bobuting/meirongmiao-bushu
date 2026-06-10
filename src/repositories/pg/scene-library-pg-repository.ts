/**
 * 场景库 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 场景库记录 */
export interface SceneLibraryRecord {
  id: string;
  sceneCategory: string;
  sceneCategoryCn: string | null;
  sceneName: string;
  sceneNameCn: string | null;
  sceneDescription: string;
  sceneDescriptionCn: string | null;
  sceneTags: string[];
  lightingType: string | null;
  suitability: string[];
  popularityScore: number;
  trendPeriod: string;
  source: string;
  sourceImageUrl: string | null;
  ossImageUrl: string | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export class PgSceneLibraryRepository extends PgBaseRepository<SceneLibraryRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("scene_library"), client);
  }

  protected mapRow(row: Record<string, unknown>): SceneLibraryRecord {
    return {
      id: row.id as string,
      sceneCategory: row.scene_category as string,
      sceneCategoryCn: (row.scene_category_cn as string) ?? null,
      sceneName: row.scene_name as string,
      sceneNameCn: (row.scene_name_cn as string) ?? null,
      sceneDescription: row.scene_description as string,
      sceneDescriptionCn: (row.scene_description_cn as string) ?? null,
      sceneTags: (row.scene_tags as string[]) ?? [],
      lightingType: (row.lighting_type as string) ?? null,
      suitability: (row.suitability as string[]) ?? [],
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

  protected mapEntity(entity: SceneLibraryRecord): Record<string, unknown> {
    return {
      id: entity.id,
      scene_category: entity.sceneCategory,
      scene_category_cn: entity.sceneCategoryCn,
      scene_name: entity.sceneName,
      scene_name_cn: entity.sceneNameCn,
      scene_description: entity.sceneDescription,
      scene_description_cn: entity.sceneDescriptionCn,
      scene_tags: entity.sceneTags,
      lighting_type: entity.lightingType,
      suitability: entity.suitability,
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
  async getStatistics(): Promise<{ totalCount: number; categoryDistribution: Record<string, number>; recentUpdates: number }> {
    const totalResult = await this.queryClient.query<{ total: string }>(
      `SELECT COUNT(*) as total FROM ${this.tableName} WHERE is_active = true`,
    );

    const categoryResult = await this.queryClient.query<{ scene_category: string; count: string }>(
      `SELECT scene_category, COUNT(*) as count FROM ${this.tableName} WHERE is_active = true GROUP BY scene_category ORDER BY count DESC`,
    );

    const recentResult = await this.queryClient.query<{ recent: string }>(
      `SELECT COUNT(*) as recent FROM ${this.tableName} WHERE is_active = true AND updated_at > EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days') * 1000`,
    );

    const categoryDistribution: Record<string, number> = {};
    for (const row of categoryResult.rows) {
      categoryDistribution[row.scene_category] = parseInt(row.count, 10);
    }

    return {
      totalCount: parseInt(totalResult.rows[0].total, 10),
      categoryDistribution,
      recentUpdates: parseInt(recentResult.rows[0].recent, 10),
    };
  }

  /** 分页查询场景列表 */
  async findPaginated(params: {
    sceneCategory?: string;
    page: number;
    limit: number;
  }): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const conditions: string[] = ["is_active = true"];
    const queryParams: (string | number)[] = [];

    if (params.sceneCategory) {
      queryParams.push(params.sceneCategory);
      conditions.push(`scene_category = $${queryParams.length}`);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const countResult = await this.queryClient.query<{ total: string }>(
      `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`,
      queryParams,
    );

    const listResult = await this.queryClient.query(
      `SELECT id, scene_category, scene_category_cn, scene_name, scene_name_cn,
              scene_description, scene_description_cn, scene_tags, lighting_type,
              suitability, popularity_score, source, source_image_url, oss_image_url,
              created_at, updated_at
       FROM ${this.tableName} ${whereClause}
       ORDER BY popularity_score DESC, created_at DESC
       LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
      [...queryParams, params.limit, offset],
    );

    return { items: listResult.rows, total: parseInt(countResult.rows[0].total, 10) };
  }

  /** 添加场景 */
  async createScene(data: {
    id: string;
    sceneCategory: string;
    sceneCategoryCn: string;
    sceneName: string;
    sceneNameCn: string | null;
    sceneDescription: string;
    sceneDescriptionCn: string | null;
    sceneTags: string[];
    lightingType: string | null;
    suitability: string[];
    popularityScore: number;
    trendPeriod: string;
    source: string;
    sourceMetadata: Record<string, unknown>;
    now: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, scene_category, scene_category_cn, scene_name, scene_name_cn,
        scene_description, scene_description_cn, scene_tags, lighting_type,
        suitability, popularity_score, trend_period, source, source_metadata,
        created_at, updated_at, is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,true)`,
      [
        data.id, data.sceneCategory, data.sceneCategoryCn,
        data.sceneName, data.sceneNameCn,
        data.sceneDescription, data.sceneDescriptionCn,
        data.sceneTags, data.lightingType,
        data.suitability, data.popularityScore,
        data.trendPeriod, data.source,
        JSON.stringify(data.sourceMetadata), data.now,
      ],
    );
  }

  /** 编辑场景（动态字段更新） */
  async updateScene(id: string, data: {
    sceneName?: string;
    sceneDescription?: string;
    sceneTags?: string[];
    lightingType?: string;
    suitability?: string[];
    popularityScore?: number;
  }, now: number): Promise<boolean> {
    const updates: string[] = [];
    const values: (string | number | string[])[] = [];
    let paramIndex = 1;

    if (data.sceneName !== undefined) { updates.push(`scene_name = $${paramIndex++}`); values.push(data.sceneName); }
    if (data.sceneDescription !== undefined) { updates.push(`scene_description = $${paramIndex++}`); values.push(data.sceneDescription); }
    if (data.sceneTags !== undefined) { updates.push(`scene_tags = $${paramIndex++}`); values.push(data.sceneTags); }
    if (data.lightingType !== undefined) { updates.push(`lighting_type = $${paramIndex++}`); values.push(data.lightingType); }
    if (data.suitability !== undefined) { updates.push(`suitability = $${paramIndex++}`); values.push(data.suitability); }
    if (data.popularityScore !== undefined) { updates.push(`popularity_score = $${paramIndex++}`); values.push(data.popularityScore); }

    if (updates.length === 0) return false;

    updates.push(`updated_at = $${paramIndex++}`);
    values.push(now);
    values.push(id);

    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${updates.join(", ")} WHERE id = $${paramIndex} AND is_active = true`,
      values,
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 软删除场景 */
  async softDelete(id: string, now: number): Promise<boolean> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_active = false, updated_at = $1 WHERE id = $2 AND is_active = true`,
      [now, id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 获取热度排行 */
  async findPopularityRanking(params: {
    sceneCategory?: string;
    limit: number;
  }): Promise<Record<string, unknown>[]> {
    const conditions: string[] = ["is_active = true"];
    const queryParams: (string | number)[] = [];

    if (params.sceneCategory) {
      queryParams.push(params.sceneCategory);
      conditions.push(`scene_category = $${queryParams.length}`);
    }

    const result = await this.queryClient.query(
      `SELECT id, scene_name, scene_name_cn, popularity_score, trend_period
       FROM ${this.tableName}
       WHERE ${conditions.join(" AND ")}
       ORDER BY popularity_score DESC
       LIMIT $${queryParams.length + 1}`,
      [...queryParams, params.limit],
    );
    return result.rows;
  }

  /** 提取高热度场景特征（按适用类型、趋势周期、热度筛选） */
  async extractFeatures(suitability: string[], trendPeriod: string): Promise<Array<{
    sceneName: string;
    sceneNameCn: string | null;
    sceneDescription: string;
    sceneDescriptionCn: string | null;
    sceneCategory: string;
    sceneCategoryCn: string | null;
    lightingType: string | null;
    popularityScore: number;
  }>> {
    const result = await this.queryClient.query(
      `SELECT scene_name, scene_name_cn, scene_description, scene_description_cn,
              scene_category, scene_category_cn, lighting_type, popularity_score
       FROM ${this.tableName}
       WHERE suitability && $1
         AND trend_period = $2
         AND popularity_score >= 0.5
         AND is_active = true
       ORDER BY popularity_score DESC, RANDOM()
       LIMIT 10`,
      [suitability, trendPeriod],
    );

    return result.rows.map((row) => ({
      sceneName: row.scene_name,
      sceneNameCn: row.scene_name_cn ?? null,
      sceneDescription: row.scene_description,
      sceneDescriptionCn: row.scene_description_cn ?? null,
      sceneCategory: row.scene_category,
      sceneCategoryCn: row.scene_category_cn ?? null,
      lightingType: row.lighting_type ?? null,
      popularityScore: row.popularity_score,
    }));
  }

  /** upsert 场景特征（按 scene_name 去重） */
  async upsertFeature(feature: {
    id: string;
    sceneCategory: string;
    sceneCategoryCn: string | null;
    sceneName: string;
    sceneNameCn: string | null;
    sceneDescription: string;
    sceneDescriptionCn: string | null;
    sceneTags: string[];
    lightingType: string | null;
    suitability: string[];
    popularityScore: number;
    trendPeriod: string;
    source: string;
    sourceMetadata: Record<string, unknown>;
    sourceImageUrl: string | null;
    ossImageUrl: string | null;
    now: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, scene_category, scene_category_cn, scene_name, scene_name_cn,
        scene_description, scene_description_cn, scene_tags, lighting_type,
        suitability, popularity_score, trend_period, source, source_metadata,
        created_at, updated_at, is_active, source_image_url, oss_image_url
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,true,$16,$17)
      ON CONFLICT (scene_name) DO UPDATE SET
        popularity_score = EXCLUDED.popularity_score,
        trend_period = EXCLUDED.trend_period,
        source_metadata = EXCLUDED.source_metadata,
        source_image_url = EXCLUDED.source_image_url,
        oss_image_url = EXCLUDED.oss_image_url,
        updated_at = EXCLUDED.updated_at`,
      [
        feature.id, feature.sceneCategory, feature.sceneCategoryCn,
        feature.sceneName, feature.sceneNameCn,
        feature.sceneDescription, feature.sceneDescriptionCn,
        feature.sceneTags, feature.lightingType,
        feature.suitability, feature.popularityScore, feature.trendPeriod,
        feature.source, JSON.stringify(feature.sourceMetadata),
        feature.now, feature.sourceImageUrl, feature.ossImageUrl,
      ],
    );
  }

  /** 按场景描述调整热度评分 */
  async adjustPopularityByFeedback(sceneDescription: string, delta: number, now: number): Promise<void> {
    const direction = delta > 0 ? "LEAST(1.0, popularity_score + $1)" : "GREATEST(0.0, popularity_score + $1)";
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET popularity_score = ${direction},
           updated_at = $2
       WHERE scene_description = $3 AND is_active = true`,
      [delta, now, sceneDescription],
    );
  }

  /** 停用低热度场景（popularity < 0.3） */
  async deactivateLowPopularity(now: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET is_active = false, updated_at = $1
       WHERE popularity_score < 0.3 AND is_active = true`,
      [now],
    );
  }

  /** 批量更新流行度评分（综合社交媒体数据） */
  async updatePopularityScores(): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET popularity_score = LEAST(1.0, (
         0.4 * COALESCE(source_metadata->>'likes_count', '0')::DECIMAL / 10000 +
         0.2 * COALESCE(source_metadata->>'fans_count', '0')::DECIMAL / 500000 +
         0.4 * popularity_score
       )),
       updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
       WHERE is_active = true`,
    );
  }
}