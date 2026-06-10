/**
 * 动作模板库 PostgreSQL Repository
 *
 * 内置动作模板 CRUD 操作
 */

import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import type {
  ActionTemplate,
  CreateActionTemplateInput,
  UpdateActionTemplateInput,
  QueryActionTemplatesParams,
  ActionTemplateCategory,
  ActionTemplateSource,
} from "../../contracts/action-transfer-contract.js";
import { getLogger } from "../../core/logger/index.js";

const log = getLogger("action-templates-repository");

// ---------------------------------------------------------------------------
// 查询模板列表
// ---------------------------------------------------------------------------

/**
 * 查询模板列表（分页、筛选、排序）
 */
export async function queryActionTemplates(
  pool: Pool | PoolClient,
  params: QueryActionTemplatesParams = {},
  client?: PoolClient,
): Promise<{ items: ActionTemplate[]; total: number }> {
  const qc = client ?? pool;
  const {
    category,
    isActive,
    source,
    sortBy = "popularity",
    sortOrder = "DESC",
    limit = 50,
    offset = 0,
  } = params;

  // 构建 WHERE 条件
  const conditions: string[] = [];
  const values: (string | number | boolean | null)[] = [];
  let paramIndex = 1;

  if (category) {
    conditions.push(`category = $${paramIndex}`);
    values.push(category);
    paramIndex++;
  }

  if (isActive !== undefined) {
    conditions.push(`is_active = $${paramIndex}`);
    values.push(isActive);
    paramIndex++;
  }

  if (source) {
    conditions.push(`source = $${paramIndex}`);
    values.push(source);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // 排序字段映射
  const sortColumn = sortBy === "duration_sec" ? "duration_sec" :
                      sortBy === "created_at" ? "created_at" :
                      "popularity";

  const order = sortOrder === "ASC" ? "ASC" : "DESC";

  // 查询总数
  const countSql = `SELECT COUNT(*) FROM nrm_action_templates ${whereClause}`;
  const countResult = await qc.query(countSql, values);
  const total = parseInt(countResult.rows[0].count, 10);

  // 查询列表
  const listSql = `
    SELECT
      id, name, category, ali_template_id, duration_sec,
      thumbnail_url, preview_video_url, preview_gif_url,
      description, tags, popularity, is_active, source,
      created_at, updated_at
    FROM nrm_action_templates
    ${whereClause}
    ORDER BY ${sortColumn} ${order}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  values.push(limit, offset);

  const listResult = await qc.query(listSql, values);

  const items: ActionTemplate[] = listResult.rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category as ActionTemplateCategory,
    aliTemplateId: row.ali_template_id,
    durationSec: row.duration_sec,
    thumbnailUrl: row.thumbnail_url,
    previewVideoUrl: row.preview_video_url,
    previewGifUrl: row.preview_gif_url,
    description: row.description,
    tags: row.tags,
    popularity: row.popularity,
    isActive: row.is_active,
    source: row.source as ActionTemplateSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  log.debug({ category, isActive, source, total, limit, offset }, "查询模板列表完成");

  return { items, total };
}

// ---------------------------------------------------------------------------
// 查询模板详情
// ---------------------------------------------------------------------------

/**
 * 查询模板详情（按 ID）
 */
export async function findActionTemplateById(
  pool: Pool | PoolClient,
  id: string,
  client?: PoolClient,
): Promise<ActionTemplate | null> {
  const sql = `
    SELECT
      id, name, category, ali_template_id, duration_sec,
      thumbnail_url, preview_video_url, preview_gif_url,
      description, tags, popularity, is_active, source,
      created_at, updated_at
    FROM nrm_action_templates
    WHERE id = $1
  `;

  const result = await (client ?? pool).query(sql, [id]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    category: row.category as ActionTemplateCategory,
    aliTemplateId: row.ali_template_id,
    durationSec: row.duration_sec,
    thumbnailUrl: row.thumbnail_url,
    previewVideoUrl: row.preview_video_url,
    previewGifUrl: row.preview_gif_url,
    description: row.description,
    tags: row.tags,
    popularity: row.popularity,
    isActive: row.is_active,
    source: row.source as ActionTemplateSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// 创建模板
// ---------------------------------------------------------------------------

/**
 * 创建模板
 */
export async function createActionTemplate(
  pool: Pool | PoolClient,
  input: CreateActionTemplateInput,
  now: number,
  client?: PoolClient,
): Promise<ActionTemplate> {
  // 生成 ID
  const id = `tpl_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const sql = `
    INSERT INTO nrm_action_templates (
      id, name, category, ali_template_id, duration_sec,
      thumbnail_url, preview_video_url, preview_gif_url,
      description, tags, popularity, is_active, source,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
    )
    RETURNING
      id, name, category, ali_template_id, duration_sec,
      thumbnail_url, preview_video_url, preview_gif_url,
      description, tags, popularity, is_active, source,
      created_at, updated_at
  `;

  const values = [
    id,
    input.name,
    input.category,
    input.aliTemplateId ?? null,
    input.durationSec,
    input.thumbnailUrl ?? null,
    input.previewVideoUrl ?? null,
    input.previewGifUrl ?? null,
    input.description ?? null,
    input.tags ?? null,
    0,  // popularity 默认 0
    true,  // is_active 默认 true
    input.source,
    now,
    now,
  ];

  const result = await (client ?? pool).query(sql, values);
  const row = result.rows[0];

  log.info({ id, name: input.name, category: input.category }, "创建模板成功");

  return {
    id: row.id,
    name: row.name,
    category: row.category as ActionTemplateCategory,
    aliTemplateId: row.ali_template_id,
    durationSec: row.duration_sec,
    thumbnailUrl: row.thumbnail_url,
    previewVideoUrl: row.preview_video_url,
    previewGifUrl: row.preview_gif_url,
    description: row.description,
    tags: row.tags,
    popularity: row.popularity,
    isActive: row.is_active,
    source: row.source as ActionTemplateSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// 更新模板
// ---------------------------------------------------------------------------

/**
 * 更新模板（部分字段）
 */
export async function updateActionTemplate(
  pool: Pool | PoolClient,
  id: string,
  input: UpdateActionTemplateInput,
  now: number,
  client?: PoolClient,
): Promise<ActionTemplate | null> {
  // 构建 UPDATE 字段
  const updates: string[] = [];
  const values: (string | number | boolean | string[] | null)[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    values.push(input.name);
    paramIndex++;
  }

  if (input.category !== undefined) {
    updates.push(`category = $${paramIndex}`);
    values.push(input.category);
    paramIndex++;
  }

  if (input.thumbnailUrl !== undefined) {
    updates.push(`thumbnail_url = $${paramIndex}`);
    values.push(input.thumbnailUrl ?? null);
    paramIndex++;
  }

  if (input.previewVideoUrl !== undefined) {
    updates.push(`preview_video_url = $${paramIndex}`);
    values.push(input.previewVideoUrl ?? null);
    paramIndex++;
  }

  if (input.previewGifUrl !== undefined) {
    updates.push(`preview_gif_url = $${paramIndex}`);
    values.push(input.previewGifUrl ?? null);
    paramIndex++;
  }

  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex}`);
    values.push(input.description ?? null);
    paramIndex++;
  }

  if (input.tags !== undefined) {
    updates.push(`tags = $${paramIndex}`);
    values.push(input.tags ?? null);
    paramIndex++;
  }

  if (input.popularity !== undefined) {
    updates.push(`popularity = $${paramIndex}`);
    values.push(input.popularity);
    paramIndex++;
  }

  if (input.isActive !== undefined) {
    updates.push(`is_active = $${paramIndex}`);
    values.push(input.isActive);
    paramIndex++;
  }

  if (updates.length === 0) {
    // 无更新字段，直接返回当前记录
    return findActionTemplateById(pool, id);
  }

  updates.push(`updated_at = $${paramIndex}`);
  values.push(now);
  paramIndex++;

  values.push(id);

  const sql = `
    UPDATE nrm_action_templates
    SET ${updates.join(", ")}
    WHERE id = $${paramIndex}
    RETURNING
      id, name, category, ali_template_id, duration_sec,
      thumbnail_url, preview_video_url, preview_gif_url,
      description, tags, popularity, is_active, source,
      created_at, updated_at
  `;

  const result = await (client ?? pool).query(sql, values);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  log.info({ id }, "更新模板成功");

  return {
    id: row.id,
    name: row.name,
    category: row.category as ActionTemplateCategory,
    aliTemplateId: row.ali_template_id,
    durationSec: row.duration_sec,
    thumbnailUrl: row.thumbnail_url,
    previewVideoUrl: row.preview_video_url,
    previewGifUrl: row.preview_gif_url,
    description: row.description,
    tags: row.tags,
    popularity: row.popularity,
    isActive: row.is_active,
    source: row.source as ActionTemplateSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// 删除模板
// ---------------------------------------------------------------------------

/**
 * 删除模板（物理删除）
 */
export async function deleteActionTemplate(
  pool: Pool | PoolClient,
  id: string,
  client?: PoolClient,
): Promise<boolean> {
  const sql = `DELETE FROM nrm_action_templates WHERE id = $1`;
  const result = await (client ?? pool).query(sql, [id]);

  const deleted = (result.rowCount ?? 0) > 0;
  log.info({ id, deleted }, "删除模板");

  return deleted;
}

// ---------------------------------------------------------------------------
// 增加热度
// ---------------------------------------------------------------------------

/**
 * 增加模板热度（使用次数 +1）
 */
export async function incrementTemplatePopularity(
  pool: Pool | PoolClient,
  id: string,
  client?: PoolClient,
): Promise<void> {
  const sql = `
    UPDATE nrm_action_templates
    SET popularity = popularity + 1, updated_at = $2
    WHERE id = $1
  `;
  await (client ?? pool).query(sql, [id, Date.now()]);
}

// ---------------------------------------------------------------------------
// 批量查询
// ---------------------------------------------------------------------------

/**
 * 批量查询模板（按 ID 列表）
 */
export async function findActionTemplatesByIds(
  pool: Pool | PoolClient,
  ids: string[],
  client?: PoolClient,
): Promise<ActionTemplate[]> {
  if (ids.length === 0) return [];

  const sql = `
    SELECT
      id, name, category, ali_template_id, duration_sec,
      thumbnail_url, preview_video_url, preview_gif_url,
      description, tags, popularity, is_active, source,
      created_at, updated_at
    FROM nrm_action_templates
    WHERE id = ANY($1)
  `;

  const result = await (client ?? pool).query(sql, [ids]);

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category as ActionTemplateCategory,
    aliTemplateId: row.ali_template_id,
    durationSec: row.duration_sec,
    thumbnailUrl: row.thumbnail_url,
    previewVideoUrl: row.preview_video_url,
    previewGifUrl: row.preview_gif_url,
    description: row.description,
    tags: row.tags,
    popularity: row.popularity,
    isActive: row.is_active,
    source: row.source as ActionTemplateSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// ---------------------------------------------------------------------------
// 统计查询
// ---------------------------------------------------------------------------

/**
 * 动作模板统计信息
 */
export interface ActionTemplateStats {
  total: number;
  active: number;
  inactive: number;
  byCategory: Array<{
    category: string;
    count: number;
    totalPopularity: number;
  }>;
  topTemplates: Array<{
    id: string;
    name: string;
    category: string;
    popularity: number;
  }>;
}

/**
 * 查询模板统计数据
 */
export async function getActionTemplateStats(
  pool: Pool | PoolClient,
  client?: PoolClient,
): Promise<ActionTemplateStats> {
  const qc = client ?? pool;

  const [categoryStats, totalStats, topTemplates] = await Promise.all([
    qc.query<{ category: string; count: string; total_popularity: string }>(`
      SELECT category, COUNT(*) as count, SUM(popularity) as total_popularity
      FROM nrm_action_templates
      WHERE is_active = true
      GROUP BY category
      ORDER BY count DESC
    `),
    qc.query<{ total: string; active: string; inactive: string }>(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(*) FILTER (WHERE is_active = false) as inactive
      FROM nrm_action_templates
    `),
    qc.query<{ id: string; name: string; category: string; popularity: number }>(`
      SELECT id, name, category, popularity
      FROM nrm_action_templates
      WHERE is_active = true
      ORDER BY popularity DESC
      LIMIT 10
    `),
  ]);

  return {
    total: parseInt(totalStats.rows[0].total, 10),
    active: parseInt(totalStats.rows[0].active, 10),
    inactive: parseInt(totalStats.rows[0].inactive, 10),
    byCategory: categoryStats.rows.map((r) => ({
      category: r.category,
      count: parseInt(r.count, 10),
      totalPopularity: parseInt(r.total_popularity, 10),
    })),
    topTemplates: topTemplates.rows,
  };
}