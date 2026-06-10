/**
 * 用户作品 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import type { SquarePublishCategory } from "../../contracts/square-publish-category.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 用户作品实体 */
export interface SquareUserWork {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  coverUrl: string;
  videoUrl: string | null;
  category: SquarePublishCategory;
  views: number;
  likes: number;
  isEnabled: boolean;
  publishedAt: number;
  createdAt: number;
}

// ============================================================================
// 仓库实现
// ============================================================================

/** 用户作品仓库 */
export class PgSquareUserWorkRepository extends PgBaseRepository<SquareUserWork> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("square_user_works"), client);
  }

  protected mapRow(row: Record<string, unknown>): SquareUserWork {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      projectId: row.project_id as string,
      title: row.title as string,
      coverUrl: row.cover_url as string,
      videoUrl: row.video_url as string | null,
      category: row.category as SquarePublishCategory,
      views: row.views as number,
      likes: row.likes as number,
      isEnabled: row.is_enabled as boolean,
      publishedAt: row.published_at as number,
      createdAt: row.created_at as number,
    };
  }

  protected mapEntity(entity: SquareUserWork): Record<string, unknown> {
    return {
      id: entity.id,
      user_id: entity.userId,
      project_id: entity.projectId,
      title: entity.title,
      cover_url: entity.coverUrl,
      video_url: entity.videoUrl,
      category: entity.category,
      views: entity.views,
      likes: entity.likes,
      is_enabled: entity.isEnabled,
      published_at: entity.publishedAt,
      created_at: entity.createdAt,
    };
  }

  /** 按分类查询作品列表 */
  async findByCategory(category: SquarePublishCategory | undefined, limit: number): Promise<SquareUserWork[]> {
    let query = `SELECT * FROM ${this.tableName} WHERE is_enabled = TRUE`;
    const params: (string | number)[] = [];

    if (category) {
      query += ` AND category = $1`;
      params.push(category);
    }

    query += ` ORDER BY published_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.queryClient.query(query, params);
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 创建作品 */
  async create(work: SquareUserWork): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName}
       (id, user_id, project_id, title, cover_url, video_url, category, views, likes, is_enabled, published_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        work.id,
        work.userId,
        work.projectId,
        work.title,
        work.coverUrl,
        work.videoUrl,
        work.category,
        work.views,
        work.likes,
        work.isEnabled,
        work.publishedAt,
        work.createdAt,
      ],
    );
  }
}