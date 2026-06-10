/**
 * 脚本数据表 PG 仓库
 * 处理 nrm_script_data 表
 */

import type { Pool, PoolClient } from "pg";
import { ScriptType } from "../../contracts/types.js";
import type { ScriptData, ScriptTypeValue, VideoType } from "../../contracts/types.js";
import type { VideoScriptPayload } from "../../service/scripts-data-db-service.js";
import type { InsertScriptDataItem } from "../../service/scripts-data-db-service.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import type { PgShotBreakdownRepository, ShotBreakdownRaw } from "./shot-breakdown-pg-repository.js";

/** 脚本数据完整列列表（与 ScriptsDataDbService.SELECT_COLUMNS 一致） */
const FULL_COLUMNS = `
  id, type, title, title_candidates, duration_seconds, source, time_of_day, weather,
  theme, summary, primary_emotion, emotion_arc, video_type, video_style, target_audience,
  fashion_suitable, fashion_reason,
  emotion_detail, on_screen_presence, fashion_styles, editing_analysis,
  source_script_id, project_id, previous_script_id, source_oss_url, shot_prompts, created_at, updated_at,
  main_scene, atmosphere, is_selected, is_confirmed, key_elements, placement_notes,
  content, basic_info, storyboard, tags
`;

/** 插入参数 */
export interface InsertScriptDataParams {
  id: string;
  type: number;
  title: string;
  updatedAt: number;
}

/**
 * 脚本数据 Repository
 */
export class PgScriptDataRepository extends PgBaseRepository<ScriptData> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("script_data"), client);
  }

  protected mapRow(row: Record<string, unknown>): ScriptData {
    return {
      id: row.id as string,
      type: row.type as ScriptTypeValue,
      title: row.title as string,
      theme: row.theme as string | null,
      summary: row.summary as string | null,
      videoType: row.video_type as VideoType | null,
      videoStyle: row.video_style as string | null,
      targetAudience: row.target_audience as string | null,
      fashionSuitable: row.fashion_suitable as boolean | null,
      fashionReason: row.fashion_reason as string | null,
      emotionDetail: row.emotion_detail as string | null,
      onScreenPresence: row.on_screen_presence as string | null,
      fashionStyles: row.fashion_styles as string | null,
      editingAnalysis: row.editing_analysis as unknown | null,
      // 场景信息
      mainScene: row.main_scene as string | null,
      timeOfDay: row.time_of_day as string | null,
      weather: row.weather as string | null,
      atmosphere: row.atmosphere as string | null,
      // 分析元数据
      durationSeconds: row.duration_seconds as number | null,
      primaryEmotion: row.primary_emotion as string | null,
      sourceOssUrl: row.source_oss_url as string | null,
      source: row.source as string | null,
      // 用户归属与关联
      userId: (row.user_id as string) ?? "",
      projectId: row.project_id as string | null,
      sourceScriptId: row.source_script_id as string | null,
      previousScriptId: row.previous_script_id as string | null,
      tags: PgBaseRepository.fromJsonb<string[]>(row.tags) ?? [],
      content: (row.content as string) ?? "",
      updatedAt: Number(row.updated_at),
      createdAt: Number(row.created_at),
    };
  }

  protected mapEntity(entity: ScriptData): Record<string, unknown> {
    return {
      id: entity.id,
      type: entity.type,
      title: entity.title,
      theme: entity.theme,
      summary: entity.summary,
      video_type: entity.videoType,
      video_style: entity.videoStyle,
      target_audience: entity.targetAudience,
      fashion_suitable: entity.fashionSuitable,
      fashion_reason: entity.fashionReason,
      emotion_detail: entity.emotionDetail,
      on_screen_presence: entity.onScreenPresence,
      fashion_styles: entity.fashionStyles,
      editing_analysis: entity.editingAnalysis,
      // 场景信息
      main_scene: entity.mainScene,
      time_of_day: entity.timeOfDay,
      weather: entity.weather,
      atmosphere: entity.atmosphere,
      // 分析元数据
      duration_seconds: entity.durationSeconds,
      primary_emotion: entity.primaryEmotion,
      source_oss_url: entity.sourceOssUrl,
      source: entity.source,
      // 用户归属与关联
      user_id: entity.userId,
      project_id: entity.projectId,
      source_script_id: entity.sourceScriptId,
      previous_script_id: entity.previousScriptId,
      tags: entity.tags,
      content: entity.content,
      updated_at: entity.updatedAt,
      created_at: entity.createdAt,
    };
  }

  /** 插入或返回已存在的记录 */
  async insertOrReturn(params: InsertScriptDataParams): Promise<ScriptData> {
    const result = await this.queryClient.query(
      `INSERT INTO ${this.tableName} (id, type, title, updated_at, created_at)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [params.id, params.type, params.title, params.updatedAt],
    );
    return this.mapRow(result.rows[0]);
  }

  /** 插入逆向脚本的初始占位记录（reverse-service 使用） */
  async insertReversePlaceholder(params: {
    id: string;
    projectId: string;
    userId: string;
    basicInfo: string;
    now: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (id, project_id, user_id, source_type, duration_seconds, basic_info, role_table, outfit_table, storyboard, is_confirmed, created_at, updated_at)
       VALUES ($1, $2, $3, 'reverse', 30, $4, '', '', '', true, $5, $5)`,
      [params.id, params.projectId, params.userId, params.basicInfo, params.now],
    );
  }

  /** 查询关联热点资产和脚本数据的洞察列表（用于脚本效果分析） */
  async findHotTrendInsights(limit: number = 50): Promise<Array<Record<string, unknown>>> {
    const result = await this.queryClient.query(
      `SELECT
        a.id, a.topic, a.rank, a.hot_value, a.source, a.trend_type,
        a.script_id,
        s.title as script_title,
        s.theme, s.summary, s.primary_emotion, s.video_type, s.video_style,
        s.fashion_suitable, s.fashion_reason,
        s.emotion_detail, s.fashion_styles
      FROM nrm_hot_trend_assets a
      LEFT JOIN ${this.tableName} s ON a.script_id = s.id
      WHERE a.script_id IS NOT NULL
        AND s.title IS NOT NULL
      ORDER BY a.updated_at DESC
      LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  /** 金标脚本样本精确匹配（narrativeTechnique + characterDynamic） */
  async findGoldenExamplesExactMatch(narrativeTechnique: string, characterDynamic: string, limit: number): Promise<Array<Record<string, unknown>>> {
    const result = await this.queryClient.query(
      `SELECT id, title, story_concept, narrative_technique, character_dynamic,
              core_emotion, scene_type, tags, quality_score
       FROM nrm_golden_script_examples
       WHERE is_active = true
         AND narrative_technique = $1
         AND character_dynamic = $2
       ORDER BY quality_score DESC
       LIMIT $3`,
      [narrativeTechnique, characterDynamic, limit],
    );
    return result.rows;
  }

  /** 金标脚本样本放宽匹配（仅 narrativeTechnique，排除已有 ID） */
  async findGoldenExamplesRelaxedMatch(narrativeTechnique: string, excludeIds: string[], limit: number): Promise<Array<Record<string, unknown>>> {
    const result = await this.queryClient.query(
      `SELECT id, title, story_concept, narrative_technique, character_dynamic,
              core_emotion, scene_type, tags, quality_score
       FROM nrm_golden_script_examples
       WHERE is_active = true
         AND narrative_technique = $1
         AND id NOT IN (SELECT unnest($2::uuid[]))
       ORDER BY quality_score DESC
       LIMIT $3`,
      [narrativeTechnique, excludeIds, limit],
    );
    return result.rows;
  }

  /** 金标脚本样本兜底匹配（排除已有 ID，按质量+随机排序） */
  async findGoldenExamplesFallback(excludeIds: string[], limit: number): Promise<Array<Record<string, unknown>>> {
    const result = await this.queryClient.query(
      `SELECT id, title, story_concept, narrative_technique, character_dynamic,
              core_emotion, scene_type, tags, quality_score
       FROM nrm_golden_script_examples
       WHERE is_active = true
         AND id NOT IN (SELECT unnest($1::uuid[]))
       ORDER BY quality_score DESC, RANDOM()
       LIMIT $2`,
      [excludeIds, limit],
    );
    return result.rows;
  }

  /** 按项目ID查询脚本列表 */
  async findByProjectId(projectId: string): Promise<ScriptData[]> {
    return this.findWhere({ project_id: projectId });
  }

  /** 按用户ID查询脚本列表 */
  async findByUserId(userId: string): Promise<ScriptData[]> {
    return this.findWhere({ user_id: userId });
  }

  /** 按源脚本ID查询衍生脚本 */
  async findBySourceScriptId(sourceScriptId: string): Promise<ScriptData[]> {
    return this.findWhere({ source_script_id: sourceScriptId });
  }

  /** 创建脚本 */
  async create(params: {
    id: string;
    userId: string;
    title: string;
    content: string;
    type: ScriptTypeValue;
    projectId?: string;
    sourceScriptId?: string;
    previousScriptId?: string;
    tags?: string[];
    /** LLM 反推结构化分析数据 */
    analysis?: {
      theme?: string;
      summary?: string;
      primaryEmotion?: string;
      videoType?: string;
      videoStyle?: string;
      fashionSuitable?: boolean;
      fashionReason?: string;
      emotionDetail?: Record<string, unknown>;
      onScreenPresence?: Record<string, unknown>;
      fashionStyles?: Record<string, unknown>[];
      editingAnalysis?: Record<string, unknown>;
      durationSeconds?: number;
      sourceOssUrl?: string;
      source?: string;
    };
  }): Promise<ScriptData> {
    const now = Date.now();
    const a = params.analysis;
    const entity: ScriptData = {
      id: params.id,
      type: params.type,
      title: params.title,
      theme: a?.theme ?? null,
      summary: a?.summary ?? null,
      videoType: (a?.videoType as VideoType) ?? null,
      videoStyle: a?.videoStyle ?? null,
      targetAudience: null,
      fashionSuitable: a?.fashionSuitable ?? null,
      fashionReason: a?.fashionReason ?? null,
      emotionDetail: a?.emotionDetail ? JSON.stringify(a.emotionDetail) : null,
      onScreenPresence: a?.onScreenPresence ? JSON.stringify(a.onScreenPresence) : null,
      fashionStyles: a?.fashionStyles
        ? JSON.stringify(a.fashionStyles)
        : null,
      editingAnalysis: a?.editingAnalysis ? JSON.stringify(a.editingAnalysis) : null,
      durationSeconds: a?.durationSeconds ?? null,
      primaryEmotion: a?.primaryEmotion ?? null,
      sourceOssUrl: a?.sourceOssUrl ?? null,
      source: a?.source ?? null,
      mainScene: null,
      timeOfDay: null,
      weather: null,
      atmosphere: null,
      userId: params.userId,
      projectId: params.projectId ?? null,
      sourceScriptId: params.sourceScriptId ?? null,
      previousScriptId: params.previousScriptId ?? null,
      tags: params.tags ?? [],
      content: params.content,
      updatedAt: now,
      createdAt: now,
    };
    await this.upsert(entity);
    return entity;
  }

  /** 按项目ID查询脚本列表（摘要字段） */
  async findByProject(projectId: string, limit: number = 50): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT id, title, summary, duration_seconds, primary_emotion, theme, video_style,
              is_confirmed, is_selected, type, source, source_type, source_oss_url, content, created_at
       FROM ${this.tableName}
       WHERE project_id = $1 AND deleted_at IS NULL
       ORDER BY is_confirmed DESC, is_selected DESC, created_at DESC
       LIMIT $2`,
      [projectId, limit],
    );
    return result.rows;
  }

  /** 按项目ID查询脚本列表（完整字段，返回原始行） */
  async findByProjectFull(projectId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT id, title, type, is_selected, is_confirmed, created_at, title_candidates,
              duration_seconds, source, time_of_day, weather, main_scene, theme, summary,
              primary_emotion, video_type, video_style, target_audience, emotion_detail,
              on_screen_presence, fashion_suitable, fashion_reason, fashion_styles,
              key_elements, placement_notes, atmosphere, editing_analysis, shot_prompts
       FROM ${this.tableName}
       WHERE project_id = $1 AND deleted_at IS NULL
       ORDER BY is_confirmed DESC, is_selected DESC, created_at DESC`,
      [projectId],
    );
    return result.rows;
  }

  /** 按ID查询脚本（完整字段，返回原始行或 null） */
  async findFullById(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT id, title, type, is_selected, is_confirmed, created_at, title_candidates,
              duration_seconds, source, time_of_day, weather, main_scene, theme, summary,
              primary_emotion, video_type, video_style, target_audience, emotion_detail,
              on_screen_presence, fashion_suitable, fashion_reason, fashion_styles,
              key_elements, placement_notes, atmosphere, editing_analysis, shot_prompts
       FROM ${this.tableName}
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** 批量删除 */
  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE id = ANY($1)`,
      [ids],
    );
  }

  /** 按 ID 查询标题、内容、标签（反推到用户脚本库时使用） */
  async findTitleContentTagsById(id: string): Promise<{ title: string; content: string; tags: string[] } | null> {
    const result = await this.queryClient.query<{ title: string; content: string; tags: string[] }>(
      `SELECT title, content, tags FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** 查询项目已确认脚本（摘要字段，返回原始行） */
  async findConfirmedByProjectId(projectId: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT id, source_type, duration_seconds, basic_info, role_table, outfit_table, storyboard
       FROM ${this.tableName} WHERE project_id = $1 AND is_confirmed = true LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ?? null;
  }

  /** 管理后台分页查询脚本列表（排除热榜资产） */
  async findAdminPaged(params: {
    excludeTag: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const { excludeTag, limit, offset } = params;
    const [dataResult, countResult] = await Promise.all([
      this.queryClient.query(
        `SELECT s.id, s.title, s.tags, s.user_id, s.updated_at,
                u.email as owner_email
         FROM ${this.tableName} s
         LEFT JOIN nrm_users u ON s.user_id = u.id
         WHERE NOT ($3 = ANY(s.tags))
           AND s.deleted_at IS NULL
         ORDER BY s.updated_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset, excludeTag],
      ),
      this.queryClient.query(
        `SELECT COUNT(*) as total FROM ${this.tableName}
         WHERE NOT ($1 = ANY(tags))
           AND deleted_at IS NULL`,
        [excludeTag],
      ),
    ]);
    return { rows: dataResult.rows, total: Number(countResult.rows[0]?.total ?? 0) };
  }

  /** 按脚本版本ID查询（含 user_id、project_id、basic_info） */
  async findScriptVersionById(scriptVersionId: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT id, user_id, project_id, basic_info FROM ${this.tableName} WHERE id = $1`,
      [scriptVersionId],
    );
    return result.rows[0] ?? null;
  }

  /** 更新脚本 */
  async update(scriptId: string, params: {
    title?: string;
    content?: string;
    tags?: string[];
  }): Promise<ScriptData> {
    const existing = await this.findById(scriptId);
    if (!existing) {
      throw new Error(`Script not found: ${scriptId}`);
    }
    const now = Date.now();
    const updated: ScriptData = {
      ...existing,
      title: params.title ?? existing.title,
      content: params.content ?? existing.content,
      tags: params.tags ?? existing.tags,
      updatedAt: now,
    };
    await this.upsert(updated);
    return updated;
  }

  /** 管理后台：分页查询脚本列表（含筛选） */
  async adminList(options: {
    strategy?: string;
    search?: string;
    pageSize: number;
    offset: number;
  }): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (options.strategy) {
      conditions.push(`source_type = $${idx++}`);
      params.push(options.strategy);
    }

    if (options.search) {
      conditions.push(`(title ILIKE $${idx} OR content ILIKE $${idx})`);
      params.push(`%${options.search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const dataResult = await this.queryClient.query(
      `SELECT id, project_id, user_id, title,
              COALESCE(summary, theme, '') as content,
              type, source_type, video_style, created_at, updated_at
       FROM ${this.tableName}
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, options.pageSize, options.offset],
    );

    // 计数查询（不包含分页参数）
    const countResult = await this.queryClient.query(
      `SELECT COUNT(*) as total FROM ${this.tableName} ${where}`,
      params,
    );

    return { rows: dataResult.rows, total: Number(countResult.rows[0]?.total ?? 0) };
  }

  /** 管理后台：查询未评分的脚本（用于批量评分） */
  async findUnscored(options: {
    excludeType: number;
    limit: number;
  }): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT s.id, s.title, s.summary, s.theme, s.type, s.source, s.video_type, s.video_style
       FROM ${this.tableName} s
       WHERE s.type != $1
       AND NOT EXISTS (
         SELECT 1 FROM nrm_script_quality_scores qs WHERE qs.script_data_id = s.id
       )
       ORDER BY s.created_at DESC
       LIMIT $2`,
      [options.excludeType, options.limit],
    );
    return result.rows;
  }

  /** 按用户 ID 删除所有脚本 */
  async deleteByUserId(userId: string): Promise<number> {
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE user_id = $1`,
      [userId],
    );
    return result.rowCount ?? 0;
  }

  /** 插入广场发现反推的脚本数据（模板自动发布调度器使用） */
  async insertFromSquareDiscovery(input: {
    title: string;
    durationSeconds?: number | null;
    source?: string;
    sourceOssUrl?: string | null;
    timeOfDay?: string | null;
    weather?: string | null;
    mainScene?: string | null;
    atmosphere?: string | null;
    theme?: string | null;
    summary?: string | null;
    primaryEmotion?: string | null;
    videoType?: string | null;
    videoStyle?: string | null;
    fashionSuitable?: boolean | null;
    fashionReason?: string | null;
    emotionDetail?: Record<string, unknown> | null;
    onScreenPresence?: Record<string, unknown> | null;
    fashionStyles?: Record<string, unknown>[] | null;
    editingAnalysis?: Record<string, unknown> | null;
    payloadJson?: Record<string, unknown>;
  }): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const type = (input.onScreenPresence?.has_real_person === true)
      ? ScriptType.REVERSE
      : ScriptType.PRODUCT_SHOWCASE;

    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, type, title, duration_seconds, source, source_oss_url,
        time_of_day, weather, main_scene, atmosphere, theme, summary,
        primary_emotion, video_type, video_style,
        fashion_suitable, fashion_reason,
        emotion_detail, on_screen_presence, fashion_styles, editing_analysis,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, $22, $22
      )`,
      [
        id, type, input.title, input.durationSeconds, input.source ?? "square_discovery", input.sourceOssUrl,
        input.timeOfDay, input.weather, input.mainScene, input.atmosphere, input.theme, input.summary,
        input.primaryEmotion, input.videoType, input.videoStyle,
        input.fashionSuitable, input.fashionReason,
        JSON.stringify(input.emotionDetail ?? {}),
        JSON.stringify(input.onScreenPresence ?? {}),
        JSON.stringify(input.fashionStyles ?? []),
        JSON.stringify(input.editingAnalysis ?? {}),
        now,
      ],
    );
    return id;
  }

  /** 清空脚本 userId（确认后原脚本不再属于任何用户） */
  async clearUserId(scriptId: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET user_id = '' WHERE id = $1`,
      [scriptId],
    );
  }

  /** 查询项目已确认的脚本 ID */
  async findConfirmedIdByProject(projectId: string): Promise<string | null> {
    const result = await this.queryClient.query<{ id: string }>(
      `SELECT id FROM ${this.tableName} WHERE project_id = $1 AND is_confirmed = true LIMIT 1`,
      [projectId],
    );
    return result.rows[0]?.id ?? null;
  }

  /** 按 ID 查询脚本摘要（id + title） */
  async findIdAndTitleById(id: string): Promise<{ id: string; title: string | null } | null> {
    const result = await this.queryClient.query<{ id: string; title: string | null }>(
      `SELECT id, title FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** 查询项目已确认脚本的摘要（id + title） */
  async findConfirmedIdAndTitleByProject(projectId: string): Promise<{ id: string; title: string | null } | null> {
    const result = await this.queryClient.query<{ id: string; title: string | null }>(
      `SELECT id, title FROM ${this.tableName} WHERE project_id = $1 AND is_confirmed = true LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ?? null;
  }

  /** 查询项目已有的脚本 ID（用于排除） */
  async findIdsByProjectId(projectId: string): Promise<string[]> {
    const result = await this.queryClient.query<{ id: string }>(
      `SELECT id FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
    return result.rows.map((row) => row.id);
  }

  /** 更新脚本质量状态 */
  async updateQualityStatus(scriptDataId: string, status: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET quality_status = $1, updated_at = $2 WHERE id = $3`,
      [status, Date.now(), scriptDataId],
    );
  }

  /** 查询所有已标记为 deprecated 的脚本 ID */
  async findDeprecatedIds(): Promise<Set<string>> {
    const result = await this.queryClient.query<{ id: string }>(
      `SELECT id FROM ${this.tableName} WHERE quality_status = 'deprecated'`,
    );
    return new Set(result.rows.map((r) => r.id));
  }

  /** 查询项目已确认脚本的主要情绪 */
  async findPrimaryEmotionByProject(projectId: string): Promise<string | null> {
    const result = await this.queryClient.query<{ primary_emotion: string | null }>(
      `SELECT primary_emotion FROM ${this.tableName} WHERE project_id = $1 AND is_confirmed = true LIMIT 1`,
      [projectId],
    );
    return result.rows[0]?.primary_emotion ?? null;
  }

  /** 查询指定时间范围内创建的脚本（评分调度器用） */
  async findCreatedBetween(startMs: number, endMs: number): Promise<Array<{
    id: string;
    title: string;
    summary: string | null;
    theme: string | null;
    type: number;
    source: string | null;
    videoType: string | null;
    videoStyle: string | null;
    createdAt: number;
  }>> {
    const result = await this.queryClient.query(
      `SELECT id, title, summary, theme, type, source, video_type, video_style, created_at
       FROM ${this.tableName}
       WHERE created_at >= $1 AND created_at <= $2
       ORDER BY created_at ASC`,
      [startMs, endMs],
    );
    return result.rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      summary: r.summary as string | null,
      theme: r.theme as string | null,
      type: r.type as number,
      source: r.source as string | null,
      videoType: r.video_type as string | null,
      videoStyle: r.video_style as string | null,
      createdAt: Number(r.created_at),
    }));
  }

  // =====================================================
  // 从 NrmScriptRepository 迁移的方法
  // =====================================================

  /**
   * 插入脚本数据（effectiveness 策略用，含 shot_breakdown 联动）
   * 使用 VideoScriptPayload 格式写入各列
   */
  async insertFromEffectiveness(params: {
    id: string;
    type: number;
    payload: VideoScriptPayload;
    sourceScriptId?: string | null;
    projectId?: string | null;
    shotBreakdowns: PgShotBreakdownRepository;
  }): Promise<void> {
    const p = params.payload;
    const now = Date.now();

    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, type,
        title, duration_seconds, source, time_of_day, weather,
        theme, summary, primary_emotion, emotion_detail, video_type, video_style, target_audience,
        fashion_suitable, fashion_reason,
        on_screen_presence, fashion_styles, editing_analysis,
        updated_at, created_at, source_script_id, project_id
      ) VALUES (
        $1, $2,
        $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14,
        $15, $16,
        $17, $18, $19,
        $20, $21, $22, $23
      )
      ON CONFLICT (id) DO UPDATE SET
        updated_at = EXCLUDED.updated_at,
        project_id = COALESCE(${this.tableName}.project_id, EXCLUDED.project_id)`,
      [
        params.id,
        params.type,
        p.video_info?.title ?? null,
        p.video_info?.duration_seconds ?? null,
        p.video_info?.source ?? null,
        p.video_info?.time_of_day ?? null,
        p.video_info?.weather ?? null,
        p.video_analysis?.theme ?? null,
        p.video_analysis?.summary ?? null,
        p.video_analysis?.emotion?.primary ?? null,
        p.video_analysis?.emotion ? JSON.stringify(p.video_analysis.emotion) : null,
        p.video_analysis?.video_type ?? null,
        p.video_analysis?.video_style ?? null,
        p.video_analysis?.target_audience ?? null,
        p.video_analysis?.fashion_placement?.suitable ?? null,
        p.video_analysis?.fashion_placement?.reason ?? null,
        p.video_analysis?.on_screen_presence
          ? JSON.stringify(p.video_analysis.on_screen_presence)
          : null,
        p.video_analysis?.fashion_placement?.recommended_styles
          ? JSON.stringify(p.video_analysis.fashion_placement.recommended_styles)
          : null,
        p.editing_analysis ? JSON.stringify(p.editing_analysis) : null,
        now,
        now,
        params.sourceScriptId ?? null,
        params.projectId ?? null,
      ],
    );

    // 插入镜头数据到独立表
    if (p.shot_breakdown && p.shot_breakdown.length > 0) {
      await params.shotBreakdowns.batchInsert({
        scriptDataId: params.id,
        shots: p.shot_breakdown,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  /**
   * 根据 ID 查询脚本，重构为 VideoScriptPayload 格式
   */
  async getByIdWithPayload(id: string): Promise<{
    id: string;
    type: number;
    payloadJson: VideoScriptPayload;
  } | null> {
    const result = await this.queryClient.query(
      `SELECT
        id, type, title, theme, summary,
        emotion_detail, on_screen_presence, fashion_styles, editing_analysis,
        duration_seconds, created_at, updated_at
      FROM ${this.tableName}
      WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id as string,
      type: row.type as number,
      payloadJson: this.reconstructPayload(row),
    };
  }

  /**
   * 按类型查询脚本列表，重构为 VideoScriptPayload 格式
   */
  async listByTypeWithPayload(type: number, limit: number = 20): Promise<Array<{
    id: string;
    type: number;
    payloadJson: VideoScriptPayload;
  }>> {
    const result = await this.queryClient.query(
      `SELECT
        id, type, title, theme, summary, duration_seconds,
        emotion_detail, on_screen_presence, fashion_styles, editing_analysis,
        created_at, updated_at
      FROM ${this.tableName}
      WHERE type = $1
      ORDER BY created_at DESC
      LIMIT $2`,
      [type, limit],
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      type: row.type as number,
      payloadJson: this.reconstructPayload(row),
    }));
  }

  // =====================================================
  // 从 ScriptsDataDbService 迁移的方法（返回原始行供 mapRow 使用）
  // =====================================================

  /** 按 type 查询，DISTINCT ON title，要求有 shot_breakdown 且有真人出镜（返回原始行） */
  /** 查询指定 type 的脚本（含完整字段），支持时间范围过滤 */
  async queryByTypeWithFullColumns(options: {
    type: number;
    limit: number;
    order: "DESC" | "ASC";
    excludeIds: string[];
    /** 时间范围过滤：只查询 updated_at >= minUpdatedAt 的脚本（可选） */
    minUpdatedAt?: number;
  }): Promise<Record<string, unknown>[]> {
    const { type, limit, order, excludeIds, minUpdatedAt } = options;
    const excludeCondition = excludeIds.length > 0
      ? `AND s.id NOT IN (${excludeIds.map((_, i) => `$${i + 3 + (minUpdatedAt ? 1 : 0)}`).join(", ")})`
      : "";

    const timeCondition = minUpdatedAt
      ? `AND s.updated_at >= $3`
      : "";

    const query = `
      SELECT DISTINCT ON (s.title) ${FULL_COLUMNS.replace(/nrm_script_data/g, "s")}
      FROM nrm_script_data s
      WHERE s.type = $1
        AND s.title IS NOT NULL
        AND s.duration_seconds IS NOT NULL
        AND s.source IS NOT NULL
        AND (s.on_screen_presence->>'has_real_person')::boolean = true
        AND EXISTS (
          SELECT 1 FROM nrm_shot_breakdown sb WHERE sb.script_data_id = s.id
        )
        ${timeCondition}
        ${excludeCondition}
      ORDER BY s.title, s.updated_at ${order}
      LIMIT $2
    `;

    // 参数顺序：type, limit, minUpdatedAt（可选）, excludeIds
    const params: unknown[] = [type, limit];
    if (minUpdatedAt) {
      params.push(minUpdatedAt);
    }
    params.push(...excludeIds);

    const result = await this.queryClient.query(query, params);
    return result.rows;
  }

  /** 查询 type != excludeType，要求有 shot_breakdown 且有真人出镜（返回原始行） */
  async queryTypeNotWithFullColumns(options: {
    excludeType: number;
    limit: number;
    order: "DESC" | "ASC";
    excludeIds: string[];
  }): Promise<Record<string, unknown>[]> {
    const { excludeType, limit, order, excludeIds } = options;
    const excludeCondition = excludeIds.length > 0
      ? `AND s.id NOT IN (${excludeIds.map((_, i) => `$${i + 3}`).join(", ")})`
      : "";

    const query = `
      SELECT ${FULL_COLUMNS.replace(/nrm_script_data/g, "s")}
      FROM nrm_script_data s
      WHERE s.type != $1
        AND s.fashion_suitable IS NOT NULL
        AND s.title IS NOT NULL
        AND s.duration_seconds IS NOT NULL
        AND s.source IS NOT NULL
        AND (s.on_screen_presence->>'has_real_person')::boolean = true
        AND EXISTS (
          SELECT 1 FROM nrm_shot_breakdown sb WHERE sb.script_data_id = s.id
        )
        ${excludeCondition}
      ORDER BY s.updated_at ${order}
      LIMIT $2
    `;

    const params: unknown[] = [excludeType, limit, ...excludeIds];
    const result = await this.queryClient.query(query, params);
    return result.rows;
  }

  /** 按 ID 查询完整列（返回原始行或 null） */
  async findFullColumnsById(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT ${FULL_COLUMNS} FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** 批量按 ID 查询完整列（返回原始行） */
  async findFullColumnsByIds(ids: string[]): Promise<Record<string, unknown>[]> {
    if (ids.length === 0) return [];
    const result = await this.queryClient.query(
      `SELECT ${FULL_COLUMNS} FROM ${this.tableName} WHERE id = ANY($1)`,
      [ids],
    );
    return result.rows;
  }

  /** 按 type 统计数量 */
  async countByType(type: number): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as total FROM ${this.tableName} WHERE type = $1`,
      [type],
    );
    return parseInt(result.rows[0].total, 10);
  }

  /** 按 type + projectId 统计数量 */
  async countByTypeAndProjectId(type: number, projectId: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as total FROM ${this.tableName} WHERE type = $1 AND project_id = $2`,
      [type, projectId],
    );
    return parseInt(result.rows[0].total, 10);
  }

  /**
   * 批量插入脚本数据（从 VideoScriptPayload 拆解到 DDL 传统列）
   * ON CONFLICT 更新关联字段
   */
  async batchInsertFromPayload(params: {
    items: InsertScriptDataItem[];
    shotBreakdowns: PgShotBreakdownRepository;
  }): Promise<number> {
    const { items, shotBreakdowns } = params;
    if (items.length === 0) return 0;

    const batchSize = 20;
    let insertedCount = 0;
    const now = Date.now();

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const valuePlaceholders: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      for (const item of batch) {
        const c = this.extractPayloadColumns(item.payloadJson, item.skillCode);
        valuePlaceholders.push(
          `($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, $${paramIndex+8}, $${paramIndex+9}, $${paramIndex+10}, $${paramIndex+11}, $${paramIndex+12}, $${paramIndex+13}, $${paramIndex+14}, $${paramIndex+15}, $${paramIndex+16}::jsonb, $${paramIndex+17}::jsonb, $${paramIndex+18}::jsonb, $${paramIndex+19}::jsonb, $${paramIndex+20}, $${paramIndex+21}, $${paramIndex+22}, $${paramIndex+23}, $${paramIndex+24}, $${paramIndex+25}, $${paramIndex+26}, $${paramIndex+27}, $${paramIndex+28}, $${paramIndex+29}, $${paramIndex+30}, $${paramIndex+31}::jsonb, $${paramIndex+32}, $${paramIndex+33}::jsonb)`
        );
        values.push(
          item.id, item.type,
          c.title, c.duration_seconds, c.source, c.time_of_day, c.weather,
          c.theme, c.summary, c.primary_emotion, c.emotion_arc, c.video_type, c.video_style, c.target_audience,
          c.fashion_suitable, c.fashion_reason,
          c.emotion_detail, c.on_screen_presence, c.fashion_styles, c.editing_analysis,
          now, now,
          item.sourceScriptId ?? null, item.projectId ?? null,
          item.userId ?? null, item.sourceOssUrl ?? null,
          c.main_scene, c.atmosphere,
          item.isSelected ?? false, item.isConfirmed ?? false,
          item.previousScriptId ?? null,
          c.key_elements, c.placement_notes,
          c.title_candidates,
        );
        paramIndex += 34;
      }

      const query = `
        INSERT INTO ${this.tableName} (
          id, type,
          title, duration_seconds, source, time_of_day, weather,
          theme, summary, primary_emotion, emotion_arc, video_type, video_style, target_audience,
          fashion_suitable, fashion_reason,
          emotion_detail, on_screen_presence, fashion_styles, editing_analysis,
          updated_at, created_at, source_script_id, project_id, user_id, source_oss_url,
          main_scene, atmosphere, is_selected, is_confirmed, previous_script_id, key_elements, placement_notes, title_candidates
        )
        VALUES ${valuePlaceholders.join(", ")}
        ON CONFLICT (id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          source_oss_url = EXCLUDED.source_oss_url,
          main_scene = EXCLUDED.main_scene,
          atmosphere = EXCLUDED.atmosphere,
          is_selected = EXCLUDED.is_selected,
          is_confirmed = EXCLUDED.is_confirmed,
          key_elements = EXCLUDED.key_elements,
          placement_notes = EXCLUDED.placement_notes,
          title_candidates = EXCLUDED.title_candidates,
          updated_at = EXCLUDED.updated_at
      `;

      const result = await this.queryClient.query(query, values);
      insertedCount += result.rowCount ?? 0;
    }

    // 批量插入镜头数据到独立表
    for (const item of items) {
      if (item.payloadJson.shot_breakdown && item.payloadJson.shot_breakdown.length > 0) {
        await shotBreakdowns.batchInsert({
          scriptDataId: item.id,
          shots: item.payloadJson.shot_breakdown as ShotBreakdownRaw[],
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return insertedCount;
  }

  /** 按项目ID查询完整列（返回原始行） */
  async findFullColumnsByProjectId(projectId: string, limit: number = 100): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT ${FULL_COLUMNS} FROM ${this.tableName} WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [projectId, limit],
    );
    return result.rows;
  }

  /** 更新 shot_prompts */
  async updateShotPrompts(id: string, shotPromptsJson: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET shot_prompts = $2, updated_at = $3 WHERE id = $1`,
      [id, shotPromptsJson, Date.now()],
    );
  }

  /** 更新 shot_prompts 和 project_id */
  async updateShotPromptsAndProjectId(id: string, shotPromptsJson: string, projectId: string | null): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET shot_prompts = $2, project_id = COALESCE($3, project_id), updated_at = $4 WHERE id = $1`,
      [id, shotPromptsJson, projectId, Date.now()],
    );
  }

  /** 获取项目最新的脚本（完整列，返回原始行或 null） */
  async findLatestFullByProjectId(projectId: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT ${FULL_COLUMNS} FROM ${this.tableName} WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ?? null;
  }

  /** 清空项目所有脚本的选中状态 */
  async clearProjectSelections(projectId: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_selected = false, is_confirmed = false, updated_at = $2 WHERE project_id = $1`,
      [projectId, Date.now()],
    );
  }

  /** 设置脚本为选中状态 */
  async setSelected(id: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_selected = true, updated_at = $2 WHERE id = $1`,
      [id, Date.now()],
    );
  }

  /** 设置脚本为确认状态（同时设为选中） */
  async setConfirmed(id: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET is_selected = true, is_confirmed = true, updated_at = $2 WHERE id = $1`,
      [id, Date.now()],
    );
  }

  /** 获取项目当前选中的脚本（完整列，返回原始行或 null） */
  async findSelectedFullByProjectId(projectId: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT ${FULL_COLUMNS} FROM ${this.tableName} WHERE project_id = $1 AND is_selected = true LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ?? null;
  }

  /** 获取项目当前确认的脚本（完整列，返回原始行或 null） */
  async findConfirmedFullByProjectId(projectId: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT ${FULL_COLUMNS} FROM ${this.tableName} WHERE project_id = $1 AND is_confirmed = true LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ?? null;
  }

  /** Skill code 到 source 字段的映射 */
  private static readonly SKILL_CODE_TO_SOURCE: Record<string, string> = {
    video_step3_script_generation: "video_step3",
    fashion_script_generation: "fashion_script",
    custom_scenario_script_generation: "custom_scenario_script",
    script_effectiveness_generation: "effectiveness_script",
    fission_story_generation: "fission",
    emotion_archetype: "emotion_archetype",
    video_storyboard_analysis: "video_storyboard_analysis",
    hot_trend_video: "hot_trend_video",
  };

  /** 从 VideoScriptPayload 提取 DDL 列值 */
  private extractPayloadColumns(p: VideoScriptPayload, skillCode?: string): Record<string, unknown> {
    const payloadSource = p.video_info?.source ?? null;
    const inferredSource = skillCode ? (PgScriptDataRepository.SKILL_CODE_TO_SOURCE[skillCode] ?? null) : null;
    const source = payloadSource || inferredSource;

    return {
      title: p.video_info?.title ?? p.video_analysis?.title ?? null,
      title_candidates: Array.isArray(p.video_info?.title_candidates) ? JSON.stringify(p.video_info.title_candidates) : null,
      duration_seconds: p.video_info?.duration_seconds ?? null,
      source,
      time_of_day: p.video_info?.time_of_day ?? null,
      weather: p.video_info?.weather ?? null,
      theme: p.video_analysis?.theme ?? null,
      summary: p.video_analysis?.summary ?? null,
      primary_emotion: p.video_analysis?.emotion?.primary ?? null,
      emotion_arc: p.video_analysis?.emotion?.emotion_arc ?? null,
      video_type: p.video_analysis?.video_type ?? null,
      video_style: p.video_analysis?.video_style ?? null,
      target_audience: p.video_analysis?.target_audience ?? null,
      fashion_suitable: p.video_analysis?.fashion_placement?.suitable ?? null,
      fashion_reason: p.video_analysis?.fashion_placement?.reason ?? null,
      emotion_detail: p.video_analysis?.emotion ? JSON.stringify(p.video_analysis.emotion) : null,
      on_screen_presence: p.video_analysis?.on_screen_presence ? JSON.stringify(p.video_analysis.on_screen_presence) : null,
      fashion_styles: p.video_analysis?.fashion_placement?.recommended_styles ? JSON.stringify(p.video_analysis.fashion_placement.recommended_styles) : null,
      editing_analysis: p.editing_analysis ? JSON.stringify(p.editing_analysis) : null,
      main_scene: p.video_info?.main_scene ?? p.main_scene ?? null,
      atmosphere: p.video_analysis?.atmosphere ?? p.atmosphere ?? null,
      key_elements: Array.isArray(p.video_analysis?.key_elements) ? JSON.stringify(p.video_analysis.key_elements) : null,
      placement_notes: p.video_analysis?.fashion_placement?.placement_notes ?? null,
    };
  }

  /**
   * 重构 payload：将数据库行数据重构为 VideoScriptPayload 结构
   * 注意：shot_breakdown 已迁移到独立表，此处不返回
   */
  private reconstructPayload(row: Record<string, unknown>): VideoScriptPayload {
    return {
      video_info: {
        title: row.title as string | undefined,
        duration_seconds: row.duration_seconds as number | undefined,
      },
      video_analysis: {
        theme: row.theme as string | undefined,
        summary: row.summary as string | undefined,
        emotion: row.emotion_detail as VideoScriptPayload["video_analysis"]["emotion"],
        on_screen_presence: row.on_screen_presence as VideoScriptPayload["video_analysis"]["on_screen_presence"],
        fashion_placement: row.fashion_styles
          ? {
              recommended_styles: row.fashion_styles as Array<{
                style: string;
                fit_score?: number;
                reason?: string;
                recommended_items?: string[];
              }>,
            }
          : undefined,
      },
      editing_analysis: row.editing_analysis as VideoScriptPayload["editing_analysis"],
    };
  }

  /**
   * 热榜脚本数据 upsert：按 id 去重，冲突时更新分析字段
   * 从 hot-trend-db-operations.ts 的 insertScriptData 迁移
   */
  async upsertFromHotTrend(input: {
    id: string;
    type: number;
    title: string;
    durationSeconds?: number;
    source?: string;
    theme?: string;
    summary?: string;
    primaryEmotion?: string;
    videoType?: string;
    videoStyle?: string;
    fashionSuitable?: boolean;
    fashionReason?: string;
    emotionDetail?: Record<string, unknown>;
    onScreenPresence?: Record<string, unknown>;
    fashionStyles?: Record<string, unknown>[];
    editingAnalysis?: Record<string, unknown>;
    sourceOssUrl?: string | null;
    timeOfDay?: string;
    weather?: string;
    now: number;
  }): Promise<string> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, type, title, duration_seconds, source,
        theme, summary, primary_emotion, video_type, video_style,
        fashion_suitable, fashion_reason,
        emotion_detail, on_screen_presence, fashion_styles, editing_analysis,
        source_oss_url, time_of_day, weather, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17, $18, $19, $20, $20
      )
      ON CONFLICT (id)
      DO UPDATE SET title = EXCLUDED.title, duration_seconds = EXCLUDED.duration_seconds,
        theme = EXCLUDED.theme, summary = EXCLUDED.summary,
        primary_emotion = EXCLUDED.primary_emotion, video_type = EXCLUDED.video_type,
        video_style = EXCLUDED.video_style, fashion_suitable = EXCLUDED.fashion_suitable,
        fashion_reason = EXCLUDED.fashion_reason,
        emotion_detail = EXCLUDED.emotion_detail, on_screen_presence = EXCLUDED.on_screen_presence,
        fashion_styles = EXCLUDED.fashion_styles, editing_analysis = EXCLUDED.editing_analysis,
        source_oss_url = EXCLUDED.source_oss_url, time_of_day = EXCLUDED.time_of_day,
        weather = EXCLUDED.weather, updated_at = EXCLUDED.updated_at`,
      [
        input.id, input.type, input.title, input.durationSeconds ?? null, input.source ?? "hot_trend_video",
        input.theme ?? null, input.summary ?? null, input.primaryEmotion ?? null,
        input.videoType ?? null, input.videoStyle ?? null,
        input.fashionSuitable ?? null, input.fashionReason ?? null,
        JSON.stringify(input.emotionDetail ?? {}),
        JSON.stringify(input.onScreenPresence ?? {}),
        JSON.stringify(input.fashionStyles ?? []),
        JSON.stringify(input.editingAnalysis ?? {}),
        input.sourceOssUrl ?? null, input.timeOfDay ?? null, input.weather ?? null, input.now,
      ],
    );
    return input.id;
  }
}