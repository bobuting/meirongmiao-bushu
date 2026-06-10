import type { ReviewRequest, PublicResource } from "../types.js";

/** 审核仓库端口 */
export interface IReviewRequestRepository {
  findById(id: string): Promise<ReviewRequest | null>;
  findByUserId(userId: string): Promise<ReviewRequest[]>;
  findByStatus(status: string): Promise<ReviewRequest[]>;
  list(): Promise<ReviewRequest[]>;
  upsert(request: ReviewRequest): Promise<void>;
  delete(id: string): Promise<void>;
}

/** 公共资源仓库端口 */
export interface IPublicResourceRepository {
  findById(id: string): Promise<PublicResource | null>;
  findByType(resourceType: string): Promise<PublicResource[]>;
  list(): Promise<PublicResource[]>;
  upsert(resource: PublicResource): Promise<void>;
  delete(id: string): Promise<void>;
}
