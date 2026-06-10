/**
 * 审核 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { ReviewRequest, PublicResource } from "../../contracts/types.js";
import type { IReviewRequestRepository, IPublicResourceRepository } from "../../contracts/repository-ports/review-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

// ============================================================================
// 审核请求
// ============================================================================

export class PgReviewRequestRepository extends PgBaseRepository<ReviewRequest> implements IReviewRequestRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("review_requests"), client);
  }

  protected mapRow(row: Record<string, unknown>): ReviewRequest {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      resourceType: row.resource_type as ReviewRequest["resourceType"],
      resourceId: row.resource_id as string,
      squareCategory: row.square_category as ReviewRequest["squareCategory"],
      status: row.status as ReviewRequest["status"],
      published: (row.published as boolean) ?? false,
      createdAt: row.created_at as number,
      reviewedAt: row.reviewed_at as number | null,
      reviewedBy: row.reviewed_by as string | null,
    };
  }

  protected mapEntity(r: ReviewRequest): Record<string, unknown> {
    return {
      id: r.id,
      user_id: r.userId,
      resource_type: r.resourceType,
      resource_id: r.resourceId,
      square_category: r.squareCategory,
      status: r.status,
      published: r.published,
      created_at: r.createdAt,
      reviewed_at: r.reviewedAt,
      reviewed_by: r.reviewedBy,
    };
  }

  async findByResourceId(resourceId: string): Promise<ReviewRequest[]> {
    return this.findWhere({ resource_id: resourceId });
  }

  async findByUserId(userId: string): Promise<ReviewRequest[]> {
    return this.findWhere({ user_id: userId });
  }

  async findByStatus(status: string): Promise<ReviewRequest[]> {
    return this.findWhere({ status });
  }
}

// ============================================================================
// 公开资源
// ============================================================================

export class PgPublicResourceRepository extends PgBaseRepository<PublicResource> implements IPublicResourceRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("public_resources"), client);
  }

  protected mapRow(row: Record<string, unknown>): PublicResource {
    return {
      id: row.id as string,
      resourceType: row.resource_type as PublicResource["resourceType"],
      resourceId: row.resource_id as string,
      ownerUserId: row.owner_user_id as string,
      squareCategory: row.square_category as PublicResource["squareCategory"],
      publishedAt: row.published_at as number,
    };
  }

  protected mapEntity(p: PublicResource): Record<string, unknown> {
    return {
      id: p.id,
      resource_type: p.resourceType,
      resource_id: p.resourceId,
      owner_user_id: p.ownerUserId,
      square_category: p.squareCategory,
      published_at: p.publishedAt,
    };
  }

  async findByResourceType(resourceType: string): Promise<PublicResource[]> {
    return this.findWhere({ resource_type: resourceType });
  }

  async findBySquareCategory(category: string): Promise<PublicResource[]> {
    return this.findWhere({ square_category: category });
  }

  async findByType(resourceType: string): Promise<PublicResource[]> {
    return this.findByResourceType(resourceType);
  }
}