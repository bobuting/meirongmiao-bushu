/**
 * 广场模板 PG 仓库
 * 处理 nrm_square_templates 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 审核状态 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

/** 广场模板完整记录 */
export interface SquareTemplateRecord {
  id: string;
  title: string;
  category: string;
  author: string;
  coverUrl: string;
  videoUrl: string | null;
  views: number;
  likes: number;
  sortOrder: number;
  isEnabled: boolean;
  creatorId: string;
  scriptDataId: string | null;
  projectId: string | null;
  reviewStatus: ReviewStatus;
  reviewerId: string | null;
  reviewedAt: number | null;
  rejectReason: string | null;
  createdAt: number;
  updatedAt: number;
}

/** 创建模板输入参数 */
export interface CreateSquareTemplateInput {
  title: string;
  category: string;
  author: string;
  coverUrl: string;
  videoUrl?: string | null;
  views?: number;
  likes?: number;
  sortOrder?: number;
  isEnabled?: boolean;
  creatorId: string;
  projectId?: string | null;
  reviewStatus?: ReviewStatus;
  scriptDataId?: string | null;
}

/** 更新模板输入参数 */
export interface UpdateSquareTemplateInput {
  title?: string;
  category?: string;
  author?: string;
  coverUrl?: string;
  videoUrl?: string | null;
  views?: number;
  likes?: number;
  sortOrder?: number;
  isEnabled?: boolean;
}

export class PgSquareTemplateRepository extends PgBaseRepository<SquareTemplateRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("square_templates"), client);
  }

  protected mapRow(row: Record<string, unknown>): SquareTemplateRecord {
    return {
      id: row.id as string,
      title: row.title as string,
      category: row.category as string,
      author: row.author as string,
      coverUrl: row.cover_url as string,
      videoUrl: row.video_url as string | null,
      views: row.views as number,
      likes: row.likes as number,
      sortOrder: row.sort_order as number,
      isEnabled: row.is_enabled as boolean,
      creatorId: row.creator_id as string,
      scriptDataId: row.script_data_id as string | null,
      projectId: row.project_id as string | null,
      reviewStatus: (row.review_status as ReviewStatus) || 'pending',
      reviewerId: row.reviewer_id as string | null,
      reviewedAt: row.reviewed_at as number | null,
      rejectReason: row.reject_reason as string | null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(entity: SquareTemplateRecord): Record<string, unknown> {
    return {
      id: entity.id,
      title: entity.title,
      category: entity.category,
      author: entity.author,
      cover_url: entity.coverUrl,
      video_url: entity.videoUrl ?? null,
      views: entity.views,
      likes: entity.likes,
      sort_order: entity.sortOrder,
      is_enabled: entity.isEnabled,
      creator_id: entity.creatorId,
      script_data_id: entity.scriptDataId ?? null,
      project_id: entity.projectId ?? null,
      review_status: entity.reviewStatus,
      reviewer_id: entity.reviewerId ?? null,
      reviewed_at: entity.reviewedAt ?? null,
      reject_reason: entity.rejectReason ?? null,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  /** 按分类查询启用的模板（推荐列表用） */
  async findEnabledByCategory(category: string | undefined, limit: number): Promise<Record<string, unknown>[]> {
    let query = `
      SELECT id, title, category, author, cover_url, video_url,
             views, likes, created_at, sort_order
      FROM ${this.tableName}
      WHERE is_enabled = TRUE`;
    const params: (string | number)[] = [];
    if (category) {
      query += ` AND category = $1`;
      params.push(category);
    }
    query += ` ORDER BY sort_order ASC, created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    const result = await this.queryClient.query(query, params);
    return result.rows;
  }

  /** 按项目查询广场模板 */
  async findByProject(projectId: string, limit = 50): Promise<SquareTemplateRecord[]> {
    const result = await this.queryClient.query(
      `SELECT id, title, video_url, created_at, review_status
       FROM ${this.tableName}
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [projectId, limit],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 更新模板关联的 script_data_id（反推完成后调用） */
  async updateScriptDataId(id: string, scriptDataId: string, updatedAt: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET script_data_id = $1, updated_at = $2 WHERE id = $3`,
      [scriptDataId, updatedAt, id],
    );
  }

  /** 查询项目是否有未处理的发布记录（pending 或 approved） */
  async findActiveByProject(projectId: string): Promise<{ id: string; reviewStatus: string }[]> {
    const result = await this.queryClient.query(
      `SELECT id, review_status FROM ${this.tableName} WHERE project_id = $1 AND review_status IN ('pending', 'approved')`,
      [projectId],
    );
    return result.rows.map((row) => ({
      id: row.id as string,
      reviewStatus: row.review_status as string,
    }));
  }

  /** 查询项目的发布状态记录（按创建时间倒序） */
  async findPublishStatusByProject(projectId: string, creatorId: string): Promise<{
    id: string;
    reviewStatus: string;
    rejectReason: string | null;
    createdAt: number;
    reviewedAt: number | null;
  }[]> {
    const result = await this.queryClient.query(
      `SELECT id, review_status, reject_reason, created_at, reviewed_at
       FROM ${this.tableName}
       WHERE project_id = $1 AND creator_id = $2
       ORDER BY created_at DESC`,
      [projectId, creatorId],
    );
    return result.rows.map((row) => ({
      id: row.id as string,
      reviewStatus: row.review_status as string,
      rejectReason: (row.reject_reason as string) ?? null,
      createdAt: row.created_at as number,
      reviewedAt: (row.reviewed_at as number) ?? null,
    }));
  }

  /** 获取启用的模板列表（只返回已审核通过且已启用） */
  async listEnabled(): Promise<SquareTemplateRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE is_enabled = TRUE AND review_status = 'approved'
       ORDER BY sort_order ASC, created_at DESC`,
    );
    return result.rows.map(row => this.mapRow(row));
  }

  /** 分页查询模板列表，支持搜索、分类和审核状态过滤 */
  async listPaginated(
    page: number,
    pageSize: number,
    search?: string,
    category?: string,
    reviewStatus?: ReviewStatus,
  ): Promise<{ data: SquareTemplateRecord[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (search && search.trim()) {
      const searchPattern = `%${search.trim().toLowerCase()}%`;
      conditions.push(`(LOWER(title) LIKE $${paramIndex} OR LOWER(author) LIKE $${paramIndex})`);
      params.push(searchPattern);
      paramIndex++;
    }

    if (category && category.trim()) {
      conditions.push(`category = $${paramIndex}`);
      params.push(category.trim());
      paramIndex++;
    }

    if (reviewStatus && this.isValidReviewStatus(reviewStatus)) {
      conditions.push(`review_status = $${paramIndex}`);
      params.push(reviewStatus);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.queryClient.query(
      `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const offset = (page - 1) * pageSize;
    const dataResult = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} ${whereClause}
       ORDER BY sort_order ASC, created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSize, offset],
    );

    return {
      data: dataResult.rows.map(row => this.mapRow(row)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 创建模板 */
  async create(input: CreateSquareTemplateInput): Promise<SquareTemplateRecord> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const reviewStatus = input.reviewStatus || 'pending';

    const query = `
      INSERT INTO ${this.tableName} (
        id, title, category, author, cover_url, video_url,
        views, likes, sort_order, is_enabled, creator_id, created_at, updated_at,
        project_id, review_status, script_data_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const values = [
      id, input.title, input.category, input.author, input.coverUrl,
      input.videoUrl || null, input.views || 0, input.likes || 0,
      input.sortOrder || 0,
      input.isEnabled !== undefined ? input.isEnabled : true,
      input.creatorId, now, now,
      input.projectId || null, reviewStatus, input.scriptDataId || null,
    ];

    const result = await this.queryClient.query(query, values);
    return this.mapRow(result.rows[0]);
  }

  /** 从 Step5 发布创建模板（待审核状态） */
  async createFromPublish(input: {
    title: string;
    category: string;
    author: string;
    coverUrl: string;
    videoUrl: string;
    projectId: string;
    creatorId: string;
    scriptDataId?: string | null;
  }): Promise<SquareTemplateRecord> {
    return this.create({
      title: input.title,
      category: input.category,
      author: input.author,
      coverUrl: input.coverUrl,
      videoUrl: input.videoUrl,
      projectId: input.projectId,
      creatorId: input.creatorId,
      reviewStatus: 'pending',
      isEnabled: true,
      scriptDataId: input.scriptDataId,
    });
  }

  /** 更新模板（动态字段） */
  async update(id: string, input: UpdateSquareTemplateInput): Promise<SquareTemplateRecord | null> {
    const updates: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) { updates.push(`title = $${paramIndex}`); values.push(input.title); paramIndex++; }
    if (input.category !== undefined) { updates.push(`category = $${paramIndex}`); values.push(input.category); paramIndex++; }
    if (input.author !== undefined) { updates.push(`author = $${paramIndex}`); values.push(input.author); paramIndex++; }
    if (input.coverUrl !== undefined) { updates.push(`cover_url = $${paramIndex}`); values.push(input.coverUrl); paramIndex++; }
    if (input.videoUrl !== undefined) { updates.push(`video_url = $${paramIndex}`); values.push(input.videoUrl); paramIndex++; }
    if (input.views !== undefined) { updates.push(`views = $${paramIndex}`); values.push(input.views); paramIndex++; }
    if (input.likes !== undefined) { updates.push(`likes = $${paramIndex}`); values.push(input.likes); paramIndex++; }
    if (input.sortOrder !== undefined) { updates.push(`sort_order = $${paramIndex}`); values.push(input.sortOrder); paramIndex++; }
    if (input.isEnabled !== undefined) { updates.push(`is_enabled = $${paramIndex}`); values.push(input.isEnabled); paramIndex++; }

    if (updates.length === 0) return this.findById(id);

    updates.push(`updated_at = $${paramIndex}`);
    values.push(Date.now());
    paramIndex++;
    values.push(id);

    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );
    return result.rows.length === 0 ? null : this.mapRow(result.rows[0]);
  }

  /** 删除模板 */
  async deleteTemplate(id: string): Promise<boolean> {
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 关联脚本到模板 */
  async linkScript(id: string, scriptDataId: string): Promise<boolean> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET script_data_id = $2, updated_at = $3 WHERE id = $1`,
      [id, scriptDataId, Date.now()],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 审核模板 */
  async reviewTemplate(
    id: string,
    action: 'approve' | 'reject',
    reviewerId: string,
    reason?: string,
  ): Promise<SquareTemplateRecord | null> {
    const newStatus: ReviewStatus = action === 'approve' ? 'approved' : 'rejected';
    const now = Date.now();

    const result = await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET review_status = $2, reviewer_id = $3, reviewed_at = $4, reject_reason = $5, updated_at = $6
       WHERE id = $1
       RETURNING *`,
      [id, newStatus, reviewerId, now, action === 'reject' ? (reason || null) : null, now],
    );
    return result.rows.length === 0 ? null : this.mapRow(result.rows[0]);
  }

  /** 查询启用的模板数据（聚合查询用），按 category 筛选和 keyword 搜索 */
  async listForAggregate(category?: string, keyword?: string): Promise<SquareTemplateRecord[]> {
    let query = `
      SELECT *
      FROM ${this.tableName}
      WHERE is_enabled = TRUE AND review_status = 'approved'
    `;
    const params: string[] = [];

    if (category) {
      query += ` AND category = $1`;
      params.push(category);
    }

    if (keyword && keyword.length > 0) {
      const paramIndex = params.length + 1;
      query += ` AND title ILIKE $${paramIndex}`;
      params.push(`%${keyword}%`);
    }

    query += ` ORDER BY sort_order ASC, created_at DESC`;

    const result = await this.queryClient.query(query, params);
    return result.rows.map(row => this.mapRow(row));
  }

  private isValidReviewStatus(status: string): status is ReviewStatus {
    return ['pending', 'approved', 'rejected'].includes(status);
  }
}
