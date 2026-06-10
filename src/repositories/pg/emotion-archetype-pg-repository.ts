/**
 * 情感原型库 PG 仓库
 * 处理 nrm_emotion_archetype_library 和 nrm_emotion_archetype_library_run_logs 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

// ---------------------------------------------------------------------------
// nrm_emotion_archetype_library
// ---------------------------------------------------------------------------

/** 情感原型记录 */
export interface EmotionArchetypeRecord {
  id: string;
  name: string;
  category: string;
  emotionCore: string;
  moment: string;
  conflict: string;
  clothingRole: string;
  popularityScore: number;
  useCount: number;
  isActive: boolean;
  source: string;
  updatedAt: number;
  createdAt: number;
}

/** 统计数据 */
export interface EmotionArchetypeStatistics {
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  manualCount: number;
  llmExtractedCount: number;
  avgPopularity: string;
  categoryStats: { category: string; count: number }[];
}

/** 分页查询参数 */
export interface ArchetypeListOptions {
  category?: string;
  source?: string;
  isActive?: boolean;
  sortBy?: string;
  limit: number;
  offset: number;
}

/** 分页查询结果 */
export interface ArchetypeListPage {
  items: Record<string, unknown>[];
  total: number;
}

/** 排行查询参数 */
export interface ArchetypeRankingOptions {
  category?: string;
  limit: number;
}

export class PgEmotionArchetypeLibraryRepository extends PgBaseRepository<EmotionArchetypeRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("emotion_archetype_library"), client);
  }

  protected mapRow(row: Record<string, unknown>): EmotionArchetypeRecord {
    return {
      id: row.id as string,
      name: row.name as string,
      category: row.category as string,
      emotionCore: row.emotion_core as string,
      moment: row.moment as string,
      conflict: row.conflict as string,
      clothingRole: row.clothing_role as string,
      popularityScore: Number(row.popularity_score ?? 0),
      useCount: Number(row.use_count ?? 0),
      isActive: row.is_active as boolean,
      source: row.source as string,
      updatedAt: Number(row.updated_at),
      createdAt: Number(row.created_at),
    };
  }

  protected mapEntity(entity: EmotionArchetypeRecord): Record<string, unknown> {
    return {
      id: entity.id,
      name: entity.name,
      category: entity.category,
      emotion_core: entity.emotionCore,
      moment: entity.moment,
      conflict: entity.conflict,
      clothing_role: entity.clothingRole,
      popularity_score: entity.popularityScore,
      use_count: entity.useCount,
      is_active: entity.isActive,
      source: entity.source,
      updated_at: entity.updatedAt,
      created_at: entity.createdAt,
    };
  }

  /** 获取统计数据（按 category 分组 + 汇总） */
  async getStatistics(): Promise<EmotionArchetypeStatistics> {
    const [categoryResult, totalResult] = await Promise.all([
      this.queryClient.query(`
        SELECT category, COUNT(*) as category_count
        FROM ${this.tableName}
        GROUP BY category
        ORDER BY category_count DESC
      `),
      this.queryClient.query(`
        SELECT
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE is_active = true) as active_count,
          COUNT(*) FILTER (WHERE is_active = false) as inactive_count,
          COUNT(*) FILTER (WHERE source = 'manual') as manual_count,
          COUNT(*) FILTER (WHERE source = 'hot_trend_llm') as llm_extracted_count,
          AVG(popularity_score) FILTER (WHERE is_active = true) as avg_popularity
        FROM ${this.tableName}
      `),
    ]);

    const totalRow = totalResult.rows[0];
    return {
      totalCount: Number(totalRow?.total_count || 0),
      activeCount: Number(totalRow?.active_count || 0),
      inactiveCount: Number(totalRow?.inactive_count || 0),
      manualCount: Number(totalRow?.manual_count || 0),
      llmExtractedCount: Number(totalRow?.llm_extracted_count || 0),
      avgPopularity: Number(totalRow?.avg_popularity || 0).toFixed(2),
      categoryStats: categoryResult.rows.map((row) => ({
        category: row.category as string,
        count: Number(row.category_count),
      })),
    };
  }

  /** 分页查询原型列表（动态条件） */
  async findArchetypesPaginated(options: ArchetypeListOptions): Promise<ArchetypeListPage> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (options.category) {
      conditions.push(`category = $${paramIndex}`);
      params.push(options.category);
      paramIndex++;
    }
    if (options.source) {
      conditions.push(`source = $${paramIndex}`);
      params.push(options.source);
      paramIndex++;
    }
    if (options.isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex}`);
      params.push(options.isActive);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sortBy = options.sortBy || "popularity_score";

    const [countResult, listResult] = await Promise.all([
      this.queryClient.query(
        `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`,
        params,
      ),
      this.queryClient.query(
        `SELECT
          id, name, category, emotion_core, moment, conflict, clothing_role,
          popularity_score, use_count, avg_user_rating, last_used_at, is_active, source,
          suitable_styles, suitable_age, suitable_gender, created_at, updated_at
         FROM ${this.tableName}
         ${whereClause}
         ORDER BY ${sortBy} DESC, created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, options.limit, options.offset],
      ),
    ]);

    return {
      items: listResult.rows,
      total: Number(countResult.rows[0]?.total || 0),
    };
  }

  /** 插入新原型 */
  async insertArchetype(params: {
    id: string;
    name: string;
    category: string;
    emotionCore: string;
    moment: string;
    conflict: string;
    clothingRole: string;
    visualCues: string[];
    duration: string;
    shotCount: number;
    syncMode: string;
    suitableStyles: string[];
    suitableAge: string[];
    suitableGender: string[];
    createdAt: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, name, category, emotion_core, moment, conflict, clothing_role,
        visual_cues, duration, shot_count, sync_mode,
        suitable_styles, suitable_age, suitable_gender,
        popularity_score, use_count, is_active, source, source_metadata,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8::jsonb, $9, $10, $11,
        $12::jsonb, $13::jsonb, $14::jsonb,
        $15, $16, $17, $18, $19::jsonb,
        $20, $20
      )`,
      [
        params.id, params.name, params.category, params.emotionCore,
        params.moment, params.conflict, params.clothingRole,
        JSON.stringify(params.visualCues), params.duration, params.shotCount, params.syncMode,
        JSON.stringify(params.suitableStyles), JSON.stringify(params.suitableAge), JSON.stringify(params.suitableGender),
        0.6, 0, true, "manual", JSON.stringify({ createdBy: "admin" }),
        params.createdAt,
      ],
    );
  }

  /** 动态更新原型字段 */
  async updateArchetypeDynamic(id: string, updates: { field: string; value: unknown; isJsonb?: boolean }[], updatedAt: number): Promise<void> {
    if (updates.length === 0) return;

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const u of updates) {
      if (u.isJsonb) {
        setClauses.push(`${u.field} = $${paramIndex}::jsonb`);
      } else {
        setClauses.push(`${u.field} = $${paramIndex}`);
      }
      values.push(u.value);
      paramIndex++;
    }

    setClauses.push(`updated_at = $${paramIndex}`);
    values.push(updatedAt);
    paramIndex++;
    values.push(id);

    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`,
      values,
    );
  }

  /** 软删除（标记为 inactive） */
  async deactivateById(id: string, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_active = false, updated_at = $1 WHERE id = $2`,
      [updatedAt, id],
    );
  }

  /** 热度排行 */
  async findRanking(options: ArchetypeRankingOptions): Promise<Record<string, unknown>[]> {
    const conditions: string[] = ["is_active = true"];
    const params: unknown[] = [];

    if (options.category) {
      conditions.push(`category = $1`);
      params.push(options.category);
    }

    const result = await this.queryClient.query(
      `SELECT id, name, category, emotion_core, popularity_score, use_count, avg_user_rating
       FROM ${this.tableName}
       WHERE ${conditions.join(" AND ")}
       ORDER BY popularity_score DESC, use_count DESC
       LIMIT $${params.length + 1}`,
      [...params, options.limit],
    );
    return result.rows;
  }

  /**
   * 迁移用 upsert：插入或更新原型（ON CONFLICT DO UPDATE）
   * 用于将硬编码的原型库迁移到数据库
   */
  async upsertFromMigration(params: {
    id: string;
    name: string;
    category: string;
    emotionCore: string;
    moment: string;
    conflict: string;
    clothingRole: string;
    visualCues: string[];
    duration: string;
    shotCount: number;
    syncMode: string;
    suitableStyles: string[];
    suitableAge: string[];
    suitableGender: string[];
    popularityScore: number;
    useCount: number;
    isActive: boolean;
    source: string;
    now: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, name, category, emotion_core, moment, conflict, clothing_role,
        visual_cues, duration, shot_count, sync_mode,
        suitable_styles, suitable_age, suitable_gender,
        popularity_score, use_count, is_active, source, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $19)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        emotion_core = EXCLUDED.emotion_core,
        moment = EXCLUDED.moment,
        conflict = EXCLUDED.conflict,
        clothing_role = EXCLUDED.clothing_role,
        visual_cues = EXCLUDED.visual_cues,
        duration = EXCLUDED.duration,
        shot_count = EXCLUDED.shot_count,
        sync_mode = EXCLUDED.sync_mode,
        suitable_styles = EXCLUDED.suitable_styles,
        suitable_age = EXCLUDED.suitable_age,
        suitable_gender = EXCLUDED.suitable_gender,
        updated_at = EXCLUDED.updated_at`,
      [
        params.id, params.name, params.category, params.emotionCore,
        params.moment, params.conflict, params.clothingRole,
        JSON.stringify(params.visualCues), params.duration, params.shotCount, params.syncMode,
        JSON.stringify(params.suitableStyles), JSON.stringify(params.suitableAge), JSON.stringify(params.suitableGender),
        params.popularityScore, params.useCount, params.isActive, params.source, params.now,
      ],
    );
  }

  /** 查询高流行度原型（动态条件 + 随机排序） */
  async findHighPopularity(options: {
    excludeIds?: string[];
    characterAge?: number;
    characterGender?: "male" | "female";
    outfitStyle?: string;
  }): Promise<Record<string, unknown>[]> {
    const conditions: string[] = [
      "is_active = true",
      "popularity_score >= 0.5",
    ];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (options.excludeIds && options.excludeIds.length > 0) {
      const placeholders = options.excludeIds.map(() => `$${paramIdx++}`).join(", ");
      conditions.push(`id NOT IN (${placeholders})`);
      params.push(...options.excludeIds);
    }

    if (options.characterAge) {
      conditions.push(`suitable_age::text LIKE '%' || $${paramIdx} || '%'`);
      params.push(options.characterAge.toString());
      paramIdx++;
    }

    if (options.characterGender) {
      conditions.push(`suitable_gender::jsonb @> $${paramIdx}::jsonb`);
      params.push(JSON.stringify([options.characterGender]));
      paramIdx++;
    }

    if (options.outfitStyle && options.outfitStyle !== "所有风格") {
      conditions.push(`(suitable_styles::jsonb @> $${paramIdx}::jsonb OR suitable_styles::jsonb @> '["所有风格"]'::jsonb)`);
      params.push(JSON.stringify([options.outfitStyle]));
      paramIdx++;
    }

    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE ${conditions.join(" AND ")}
       ORDER BY popularity_score DESC, RANDOM()
       LIMIT 20`,
      params,
    );
    return result.rows;
  }

  /** 更新使用次数 + 最后使用时间 */
  async incrementUseCount(id: string, now: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET use_count = use_count + 1, last_used_at = $1 WHERE id = $2`,
      [now, id],
    );
  }

  /** 更新平均评分（增量公式） */
  async updateAvgRating(id: string, rating: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET avg_user_rating = (
         CASE WHEN avg_user_rating IS NULL THEN $1
         ELSE (avg_user_rating * use_count + $1) / (use_count + 1)
         END
       )
       WHERE id = $2`,
      [rating, id],
    );
  }

  /** 更新流行度分数 */
  async updatePopularity(id: string, score: number, now: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET popularity_score = $1, updated_at = $2 WHERE id = $3 AND is_active = true`,
      [score, now, id],
    );
  }

  /** 重新计算所有活跃原型的综合流行度 */
  async recalculateAllPopularity(): Promise<number> {
    const result = await this.queryClient.query(`
      UPDATE ${this.tableName}
      SET popularity_score = (
        0.3 * scores.base_score +
        0.3 * scores.use_count_score +
        0.2 * scores.rating_score +
        0.2 * scores.freshness_score
      ),
      updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
      FROM (
        SELECT
          id,
          0.7 as base_score,
          LEAST(use_count / 100.0, 1.0) as use_count_score,
          CASE WHEN avg_user_rating IS NULL THEN 0.5
               ELSE avg_user_rating / 5.0
          END as rating_score,
          CASE WHEN last_used_at IS NULL THEN 0.3
               ELSE LEAST((EXTRACT(EPOCH FROM NOW()) * 1000 - last_used_at) / (7 * 24 * 60 * 60 * 1000), 1.0)
          END as freshness_score
        FROM ${this.tableName}
        WHERE is_active = true
      ) AS scores
      WHERE ${this.tableName}.id = scores.id
        AND ${this.tableName}.is_active = true
    `);
    return result.rowCount || 0;
  }

  /** 淘汰低流行度且长期未使用的原型 */
  async deactivateLowPopularityLongUnused(cutoffTime: number, now: number): Promise<number> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET is_active = false, updated_at = $1
       WHERE popularity_score < 0.3
         AND (last_used_at IS NULL OR last_used_at < $2)
         AND is_active = true`,
      [now, cutoffTime],
    );
    return result.rowCount || 0;
  }

  /** upsert 原型（INSERT ON CONFLICT DO UPDATE） */
  async upsertArchetype(archetype: {
    id: string;
    name: string;
    category: string;
    emotionCore: string;
    moment: string;
    conflict: string;
    clothingRole: string;
    visualCues: string[];
    duration: string;
    shotCount: number;
    syncMode: string;
    suitableStyles: string[];
    suitableAge: string[];
    suitableGender: string[];
    popularityScore: number;
    useCount: number;
    isActive: boolean;
    source: string;
    sourceMetadata: Record<string, unknown>;
  }): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, name, category, emotion_core, moment, conflict, clothing_role,
        visual_cues, duration, shot_count, sync_mode,
        suitable_styles, suitable_age, suitable_gender,
        popularity_score, use_count, is_active, source, source_metadata,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17, $18, $19,
        $20, $20
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        emotion_core = EXCLUDED.emotion_core,
        popularity_score = EXCLUDED.popularity_score,
        source = EXCLUDED.source,
        source_metadata = EXCLUDED.source_metadata,
        updated_at = EXCLUDED.updated_at`,
      [
        archetype.id,
        archetype.name,
        archetype.category,
        archetype.emotionCore,
        archetype.moment,
        archetype.conflict,
        archetype.clothingRole,
        JSON.stringify(archetype.visualCues || []),
        archetype.duration,
        archetype.shotCount,
        archetype.syncMode,
        JSON.stringify(archetype.suitableStyles || ["所有风格"]),
        JSON.stringify(archetype.suitableAge || ["18-45"]),
        JSON.stringify(archetype.suitableGender || ["male", "female"]),
        archetype.popularityScore || 0.6,
        archetype.useCount || 0,
        archetype.isActive ?? true,
        archetype.source || "manual",
        JSON.stringify(archetype.sourceMetadata || {}),
        now,
      ],
    );
  }

  /** 查找重复的 emotion_core（去重合并用） */
  async findDuplicateEmotionCores(): Promise<Array<{ emotionCore: string; ids: string[] }>> {
    const result = await this.queryClient.query(
      `SELECT emotion_core, ARRAY_AGG(id ORDER BY popularity_score DESC) as ids
       FROM ${this.tableName}
       WHERE is_active = true
       GROUP BY emotion_core
       HAVING COUNT(*) > 1`,
    );
    return result.rows.map((row) => ({
      emotionCore: row.emotion_core as string,
      ids: row.ids as string[],
    }));
  }

  /** 合并使用次数到目标原型 */
  async mergeUseCount(targetId: string, sourceIds: string[]): Promise<void> {
    if (sourceIds.length === 0) return;
    const placeholders = sourceIds.map((_, i) => `$${i + 1}`).join(", ");
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET use_count = use_count + (
         SELECT COALESCE(SUM(use_count), 0) FROM ${this.tableName} WHERE id IN (${placeholders})
       )
       WHERE id = $${sourceIds.length + 1}`,
      [...sourceIds, targetId],
    );
  }

  /** 批量停用（按 ID 列表） */
  async deactivateByIds(ids: string[], now: number): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET is_active = false, updated_at = $${ids.length + 1}
       WHERE id IN (${placeholders})`,
      [...ids, now],
    );
  }

  /** 统计活跃原型数量 */
  async countActive(): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE is_active = true`,
    );
    return Number(result.rows[0]?.count || 0);
  }

  /** 查询流行度最低的 N 个活跃原型 ID（用于裁剪） */
  async findLowestPopularityIds(limit: number): Promise<string[]> {
    const result = await this.queryClient.query(
      `SELECT id FROM ${this.tableName}
       WHERE is_active = true
       ORDER BY popularity_score ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => row.id as string);
  }

  /** 查询迁移验证数据：总数、按类别统计、启用数 */
  async findMigrationVerification(): Promise<{
    totalCount: number;
    categoryCount: Record<string, number>;
    activeCount: number;
  }> {
    const [totalResult, categoryResult, activeResult] = await Promise.all([
      this.queryClient.query(`SELECT COUNT(*) as total FROM ${this.tableName}`),
      this.queryClient.query(`SELECT category, COUNT(*) as count FROM ${this.tableName} GROUP BY category ORDER BY category`),
      this.queryClient.query(`SELECT COUNT(*) as active FROM ${this.tableName} WHERE is_active = true`),
    ]);
    const totalCount = Number(totalResult.rows[0]?.total || 0);
    const categoryCount: Record<string, number> = {};
    for (const row of categoryResult.rows) {
      categoryCount[row.category as string] = Number(row.count);
    }
    const activeCount = Number(activeResult.rows[0]?.active || 0);
    return { totalCount, categoryCount, activeCount };
  }

  /** 按 emotion_core 去重插入原型（冲突时递增 use_count） */
  async upsertArchetypeByEmotionCore(input: {
    archetypeId: string;
    name: string;
    category: string;
    emotionCore: string;
    moment: string;
    conflict: string;
    clothingRole: string;
    source: string;
    sourceMetadata: Record<string, unknown>;
    now: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, name, category, emotion_core, moment, conflict, clothing_role,
        visual_cues, duration, shot_count, sync_mode,
        suitable_styles, suitable_age, suitable_gender,
        popularity_score, use_count, is_active, source, source_metadata,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8::jsonb, $9, $10, $11,
        $12::jsonb, $13::jsonb, $14::jsonb,
        $15, $16, $17, $18, $19::jsonb,
        $20, $20
      )
      ON CONFLICT (emotion_core)
      DO UPDATE SET
        use_count = ${this.tableName}.use_count + 1,
        last_used_at = $20,
        updated_at = $20`,
      [
        input.archetypeId, input.name, input.category, input.emotionCore,
        input.moment, input.conflict, input.clothingRole,
        JSON.stringify([]), "12-18秒", 3, "情绪同步",
        JSON.stringify(["所有风格"]), JSON.stringify(["18-45"]), JSON.stringify(["male", "female"]),
        0.6, 0, true, input.source,
        JSON.stringify(input.sourceMetadata), input.now,
      ],
    );
  }

  /** 查询已分析但未提取情感原型的视频热点脚本数据 */
  async findVideoHotTrendScriptsForExtraction(): Promise<Array<{
    id: string; title: string; primaryEmotion: string;
    emotionDetail: string | null; theme: string | null; summary: string | null;
    videoType: string | null; videoStyle: string | null;
    fashionSuitable: boolean | null; fashionReason: string | null;
    topic: string | null;
  }>> {
    const result = await this.queryClient.query(
      `SELECT sd.id, sd.title, sd.primary_emotion, sd.emotion_detail, sd.theme, sd.summary,
              sd.video_type, sd.video_style, sd.fashion_suitable, sd.fashion_reason,
              hta.topic
       FROM nrm_script_data sd
       JOIN nrm_hot_trend_assets hta ON hta.script_id = sd.id
       WHERE hta.trend_type = 'video'
         AND sd.primary_emotion IS NOT NULL
         AND sd.fashion_suitable = true
         AND NOT EXISTS (
           SELECT 1 FROM ${this.tableName} eal
           WHERE eal.source IN ('hot_trend_video', 'hot_trend_llm')
             AND eal.source_metadata::text LIKE '%' || sd.id || '%'
         )
       ORDER BY sd.created_at DESC
       LIMIT 50`,
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string, title: row.title as string,
      primaryEmotion: row.primary_emotion as string,
      emotionDetail: row.emotion_detail as string | null,
      theme: row.theme as string | null, summary: row.summary as string | null,
      videoType: row.video_type as string | null, videoStyle: row.video_style as string | null,
      fashionSuitable: row.fashion_suitable as boolean | null,
      fashionReason: row.fashion_reason as string | null,
      topic: row.topic as string | null,
    }));
  }

  /** 查询未处理的实时热点（7天内） */
  async findRealtimeTrendsForExtraction(cutoffTime: number): Promise<Array<{ topic: string; source: string }>> {
    const result = await this.queryClient.query(
      `SELECT topic, source FROM nrm_hot_trend_assets hta
       WHERE trend_type = 'realtime' AND created_at > $1
         AND NOT EXISTS (
           SELECT 1 FROM ${this.tableName} eal
           WHERE eal.source = 'hot_trend_realtime'
             AND eal.source_metadata::text LIKE '%' || hta.topic || '%'
         )
       ORDER BY created_at DESC LIMIT 50`,
      [cutoffTime],
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      topic: row.topic as string, source: row.source as string,
    }));
  }

  /** 查询未处理的日报 */
  async findDailyReportsForExtraction(): Promise<Array<{
    reportDate: string; emotionAtmosphere: unknown[];
    creativeSuggestions: unknown[]; outfitAngles: unknown[]; coreTrends: unknown[];
  }>> {
    const result = await this.queryClient.query(
      `SELECT report_date, emotion_atmosphere, creative_suggestions, outfit_angles, core_trends
       FROM nrm_hot_trend_daily_report hdr
       WHERE NOT EXISTS (
         SELECT 1 FROM ${this.tableName} eal
         WHERE eal.source = 'daily_report'
           AND eal.source_metadata::text LIKE '%' || hdr.report_date || '%'
       )
       ORDER BY report_date DESC LIMIT 3`,
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      reportDate: row.report_date as string,
      emotionAtmosphere: Array.isArray(row.emotion_atmosphere) ? row.emotion_atmosphere : [],
      creativeSuggestions: Array.isArray(row.creative_suggestions) ? row.creative_suggestions : [],
      outfitAngles: Array.isArray(row.outfit_angles) ? row.outfit_angles : [],
      coreTrends: Array.isArray(row.core_trends) ? row.core_trends : [],
    }));
  }
}

// ---------------------------------------------------------------------------
// nrm_emotion_archetype_library_run_logs
// ---------------------------------------------------------------------------

/** 运行日志记录 */
export interface EmotionArchetypeRunLogRecord {
  id: string;
  runType: string;
  triggerType: string;
  status: string;
  updatedAt: number;
  createdAt: number;
}

/** 运行日志分页查询参数 */
export interface RunLogListOptions {
  runType?: string;
  status?: string;
  limit: number;
  offset: number;
}

/** 运行日志分页查询结果 */
export interface RunLogListPage {
  items: Record<string, unknown>[];
  total: number;
}

export class PgEmotionArchetypeRunLogRepository extends PgBaseRepository<EmotionArchetypeRunLogRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("emotion_archetype_library_run_logs"), client);
  }

  protected mapRow(row: Record<string, unknown>): EmotionArchetypeRunLogRecord {
    return {
      id: row.id as string,
      runType: row.run_type as string,
      triggerType: row.trigger_type as string,
      status: row.status as string,
      updatedAt: Number(row.updated_at),
      createdAt: Number(row.created_at),
    };
  }

  protected mapEntity(entity: EmotionArchetypeRunLogRecord): Record<string, unknown> {
    return {
      id: entity.id,
      run_type: entity.runType,
      trigger_type: entity.triggerType,
      status: entity.status,
      updated_at: entity.updatedAt,
      created_at: entity.createdAt,
    };
  }

  /** 插入运行日志，返回 id */
  async insertRunLog(params: { runType: string; triggerType: string; startedAt: number }): Promise<string> {
    const result = await this.queryClient.query<{ id: string }>(
      `INSERT INTO ${this.tableName} (run_type, trigger_type, status, started_at)
       VALUES ($1, $2, 'running', $3)
       RETURNING id`,
      [params.runType, params.triggerType, params.startedAt],
    );
    return result.rows[0]!.id;
  }

  /** 更新运行日志为完成状态 */
  async updateRunLogCompleted(id: string, params: { taskResults: unknown; durationMs: number; completedAt: number }): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = 'completed', task_results = $1::jsonb, duration_ms = $2, completed_at = $3
       WHERE id = $4`,
      [JSON.stringify(params.taskResults), params.durationMs, params.completedAt, id],
    );
  }

  /** 更新运行日志为失败状态 */
  async updateRunLogFailed(id: string, params: { errorMessage: string; durationMs: number; completedAt: number }): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = 'failed', error_message = $1, duration_ms = $2, completed_at = $3
       WHERE id = $4`,
      [params.errorMessage, params.durationMs, params.completedAt, id],
    );
  }

  /** 分页查询运行日志 */
  async findRunLogsPaginated(options: RunLogListOptions): Promise<RunLogListPage> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (options.runType) {
      conditions.push(`run_type = $${paramIndex}`);
      params.push(options.runType);
      paramIndex++;
    }
    if (options.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(options.status);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countResult, listResult] = await Promise.all([
      this.queryClient.query(
        `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`,
        params,
      ),
      this.queryClient.query(
        `SELECT id, run_type, trigger_type, status, task_results, archetype_id, project_id,
                error_message, duration_ms, started_at, completed_at, created_at
         FROM ${this.tableName}
         ${whereClause}
         ORDER BY started_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, options.limit, options.offset],
      ),
    ]);

    return {
      items: listResult.rows,
      total: Number(countResult.rows[0]?.total || 0),
    };
  }

  /** 记录原型使用到运行日志（用于 emotion_archetype 策略） */
  async insertUsageLog(params: {
    archetypeId: string;
    archetypeName: string;
    projectId: string;
    success: boolean;
    durationMs?: number;
    errorMessage?: string;
    now: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName}
       (run_type, trigger_type, status, task_results, archetype_id, project_id, error_message, duration_ms, started_at, completed_at, created_at)
       VALUES ('archetype_usage', 'auto', $1, $2::jsonb, $3, $4, $5, $6, $7, $7, $7)`,
      [
        params.success ? "completed" : "failed",
        JSON.stringify({ archetypeName: params.archetypeName }),
        params.archetypeId,
        params.projectId,
        params.errorMessage || null,
        params.durationMs || null,
        params.now,
      ],
    );
  }
}
