import type { PublicResource, ReviewDecisionStatus, ReviewRequest, User } from "../contracts/types.js";
import type { IScriptVersionRepository } from "../contracts/repository-ports/script-repository.js";
import type { IReviewRequestRepository } from "../contracts/repository-ports/review-repository.js";
import type { IPublicResourceRepository } from "../contracts/repository-ports/review-repository.js";
import type { IProjectRepository } from "../contracts/repository-ports/project-repository.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { IReviewService } from "../contracts/services.js";
import type { IAuditStore } from "../persistence/audit-store.js";
import { assertCondition } from "../core/errors.js";

const REVIEW_DECISION_STATUSES: readonly ReviewDecisionStatus[] = [
  "approved",
  "rejected",
  "needs_changes",
];

export class ReviewService implements IReviewService {
  constructor(
    private readonly repos: {
      scripts: IScriptVersionRepository;
      reviewRequests: IReviewRequestRepository;
      publicResources: IPublicResourceRepository;
      projects: IProjectRepository;
    },
    private readonly clock: IRepositoryClock,
    private readonly auditStore: IAuditStore,
  ) {}

  async applyPublish(
    user: User,
    resourceType: "reverse_script",
    resourceId: string,
    squareCategory: "男装" | "女装" | "男童装" | "女童装" | null,
  ): Promise<ReviewRequest> {
    assertCondition(resourceType === "reverse_script", 400, "RESOURCE_TYPE_INVALID", "Resource type invalid");
    assertCondition(resourceId.trim().length > 0, 400, "RESOURCE_REQUIRED", "Resource required");
    const script = await this.repos.scripts.findById(resourceId);
    assertCondition(Boolean(script), 404, "SCRIPT_NOT_FOUND", "Script not found");
    const scriptOwnerId = (script as { userId: string }).userId;
    assertCondition(scriptOwnerId === user.id, 403, "FORBIDDEN", "Script owner only");
    const allPublic = await this.repos.publicResources.list();
    const alreadyPublished = allPublic.some(
      (x) => x.resourceType === resourceType && x.resourceId === resourceId,
    );
    assertCondition(!alreadyPublished, 409, "ALREADY_PUBLISHED", "Resource already published");

    const allReviews = await this.repos.reviewRequests.list();
    const duplicatedPending = allReviews.some(
      (x) => x.userId === user.id && x.resourceId === resourceId && x.status === "pending",
    );
    assertCondition(!duplicatedPending, 409, "REVIEW_PENDING_EXISTS", "Review request already pending");

    const approvedNotPublishedExists = allReviews.some(
      (x) =>
        x.userId === user.id &&
        x.resourceId === resourceId &&
        x.status === "approved" &&
        !x.published,
    );
    assertCondition(
      !approvedNotPublishedExists,
      409,
      "REVIEW_APPROVED_PENDING_CONFIRM",
      "Review already approved and waiting for publish confirmation",
    );

    const now = this.clock.now();
    const req: ReviewRequest = {
      id: this.clock.generateId(),
      userId: user.id,
      resourceType,
      resourceId,
      squareCategory,
      status: "pending",
      published: false,
      createdAt: now,
      reviewedAt: null,
      reviewedBy: null,
    };
    await this.repos.reviewRequests.upsert(req);
    await this.writeAudit(user.id, "review_requested", req.id, {
      resourceType,
      resourceId,
      squareCategory,
    });
    return req;
  }

  async review(actor: User, reviewId: string, status: ReviewDecisionStatus): Promise<ReviewRequest> {
    assertCondition(actor.role === "admin", 403, "FORBIDDEN", "Admin only");
    assertCondition(
      typeof status === "string" && REVIEW_DECISION_STATUSES.includes(status),
      400,
      "REVIEW_STATUS_INVALID",
      "Review status invalid",
    );
    const review = await this.repos.reviewRequests.findById(reviewId);
    assertCondition(Boolean(review), 404, "NOT_FOUND", "Review request not found");
    const existing = review as ReviewRequest;
    assertCondition(existing.status === "pending", 409, "REVIEW_ALREADY_DECIDED", "Review already decided");
    assertCondition(!existing.published, 409, "ALREADY_PUBLISHED", "Resource already published");
    existing.status = status;
    existing.reviewedAt = this.clock.now();
    existing.reviewedBy = actor.id;
    await this.repos.reviewRequests.upsert(existing);
    await this.writeAudit(actor.id, "review_decision", reviewId, { status });
    return existing;
  }

  async confirmPublish(actor: User, reviewId: string): Promise<PublicResource> {
    assertCondition(actor.role === "admin", 403, "FORBIDDEN", "Admin only");
    const review = await this.repos.reviewRequests.findById(reviewId);
    assertCondition(Boolean(review), 404, "NOT_FOUND", "Review request not found");
    const existing = review as ReviewRequest;
    assertCondition(existing.status === "approved", 400, "REVIEW_NOT_APPROVED", "Review not approved");
    assertCondition(!existing.published, 409, "ALREADY_PUBLISHED", "Resource already published");

    existing.published = true;
    existing.reviewedAt = this.clock.now();
    existing.reviewedBy = actor.id;
    await this.repos.reviewRequests.upsert(existing);
    const resource: PublicResource = {
      id: this.clock.generateId(),
      resourceType: existing.resourceType,
      resourceId: existing.resourceId,
      ownerUserId: existing.userId,
      squareCategory: existing.squareCategory ?? null,
      publishedAt: this.clock.now(),
    };
    await this.repos.publicResources.upsert(resource);

    const publishedScript = await this.repos.scripts.findById(existing.resourceId);
    if (publishedScript) {
      const project = await this.repos.projects.findById((publishedScript as { projectId: string }).projectId);
      if (project) {
        project.status = "PUBLISHED";
        project.updatedAt = this.clock.now();
        await this.repos.projects.upsert(project);
      }
    }

    await this.writeAudit(actor.id, "review_published", reviewId, {
      publicResourceId: resource.id,
      resourceId: resource.resourceId,
      squareCategory: resource.squareCategory,
    });
    return resource;
  }

  private async writeAudit(
    actorUserId: string,
    action: string,
    targetId: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    const id = this.clock.generateId();
    this.auditStore.insertAuditLog({
      id,
      actorUserId,
      action,
      targetId,
      meta,
      createdAt: this.clock.now(),
    });
  }
}
