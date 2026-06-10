/**
 * 审核相关路由
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { ReviewDecisionStatus } from "../contracts/types.js";
import { requireUser, requireAdmin } from "../services/auth/route-guards.js";
import { normalizeReviewPublishRequestPayload } from "../modules/review-publish-request.js";

export function registerReviewRoutes(app: FastifyInstance, ctx: AppContext): void {


  app.post("/reviews/request", async (request) => {
    const user = await requireUser(ctx, request);
    const body = normalizeReviewPublishRequestPayload(request.body);
    return await ctx.reviewService.applyPublish(user, body.resourceType, body.resourceId, body.squareCategory);
  });

  app.post("/reviews/:reviewId/action", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { reviewId: string };
    const body = request.body as { status: ReviewDecisionStatus };
    return await ctx.reviewService.review(admin, params.reviewId, body.status);
  });

  app.post("/reviews/:reviewId/confirm", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { reviewId: string };
    return await ctx.reviewService.confirmPublish(admin, params.reviewId);
  });
}
