/**
 * 发布请求 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 发布请求状态 */
export type PublishRequestStatus = "pending" | "approved" | "rejected";

/** 发布请求实体 */
export interface SquarePublishRequest {
  id: string;
  userId: string;
  projectId: string;
  status: PublishRequestStatus;
  rejectReason: string | null;
  reviewerId: string | null;
  reviewedAt: number | null;
  createdAt: number;
}

// ============================================================================
// 仓库实现
// ============================================================================

/** 发布请求仓库 */
export class PgSquarePublishRequestRepository extends PgBaseRepository<SquarePublishRequest> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("square_publish_requests"), client);
  }

  protected mapRow(row: Record<string, unknown>): SquarePublishRequest {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      projectId: row.project_id as string,
      status: row.status as PublishRequestStatus,
      rejectReason: row.reject_reason as string | null,
      reviewerId: row.reviewer_id as string | null,
      reviewedAt: row.reviewed_at as number | null,
      createdAt: row.created_at as number,
    };
  }

  protected mapEntity(entity: SquarePublishRequest): Record<string, unknown> {
    return {
      id: entity.id,
      user_id: entity.userId,
      project_id: entity.projectId,
      status: entity.status,
      reject_reason: entity.rejectReason,
      reviewer_id: entity.reviewerId,
      reviewed_at: entity.reviewedAt,
      created_at: entity.createdAt,
    };
  }

  /** 创建发布请求 */
  async create(request: SquarePublishRequest): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName}
       (id, user_id, project_id, status, reject_reason, reviewer_id, reviewed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        request.id,
        request.userId,
        request.projectId,
        request.status,
        request.rejectReason,
        request.reviewerId,
        request.reviewedAt,
        request.createdAt,
      ],
    );
  }

  /** 按状态查询请求列表 */
  async findByStatus(status: PublishRequestStatus, limit: number, offset: number): Promise<SquarePublishRequest[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [status, limit, offset],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 统计指定状态的请求数量 */
  async countByStatus(status: PublishRequestStatus): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = $1`,
      [status],
    );
    return parseInt(result.rows[0].count as string, 10);
  }

  /** 更新请求状态 */
  async updateStatus(
    id: string,
    status: PublishRequestStatus,
    reviewerId: string,
    rejectReason?: string,
  ): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = $1, reviewer_id = $2, reviewed_at = $3, reject_reason = $4
       WHERE id = $5`,
      [status, reviewerId, now, rejectReason || null, id],
    );
  }

  /** 检查项目是否已有待处理请求 */
  async hasPendingRequest(projectId: string): Promise<boolean> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as count FROM ${this.tableName}
       WHERE project_id = $1 AND status = 'pending'`,
      [projectId],
    );
    return parseInt(result.rows[0].count as string, 10) > 0;
  }
}