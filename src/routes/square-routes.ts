/**
 * 广场热榜路由（仅保留 resolve-video-url，热榜同步分析已迁移至 admin-routes）
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { AppError } from "../core/errors.js";
import { requireUser } from "../services/auth/route-guards.js";
import { normalizeDouyinReverseInputUrl, isLikelyDirectPlayableVideoUrl, pickPreferredResolvedVideoUrl } from "../services/media/video-reverse.js";

export interface SquareRouteDeps {
  readonly buildSquareTrendVideoResolveOrchestrator: () => { execute: (input: { userId: string; projectId: string; url: string }) => Promise<{ success: boolean; resolvedVideoUrl: string | null; traceId: string; finalStage: string | null }> };
}

export function registerSquareRoutes(app: FastifyInstance, ctx: AppContext, deps: SquareRouteDeps): void {
  const { buildSquareTrendVideoResolveOrchestrator } = deps;

  app.post("/square/trends/resolve-video-url", async (request) => {
    const user = await requireUser(ctx, request);
    const body = (request.body as { url?: string; itemId?: string | null } | undefined) ?? {};
    const rawUrl = String(body.url ?? "").trim();
    const rawItemId = String(body.itemId ?? "").trim();
    const fallbackUrl =
      rawUrl.length > 0
        ? rawUrl
        : /^\d{10,24}$/.test(rawItemId)
          ? `https://www.douyin.com/video/${rawItemId}`
          : "";
    if (!fallbackUrl) {
      throw new AppError(400, "URL_REQUIRED", "URL required");
    }
    const normalizedInput = normalizeDouyinReverseInputUrl(fallbackUrl);
    if (isLikelyDirectPlayableVideoUrl(normalizedInput)) {
      return {
        inputUrl: normalizedInput,
        resolvedVideoUrl: normalizedInput,
        resolved: true,
        source: "input",
        traceId: null as string | null,
        finalStage: null as string | null,
      };
    }

    try {
      const trace = await buildSquareTrendVideoResolveOrchestrator().execute({
        userId: user.id,
        projectId: `square-resolve:${user.id}`,
        url: normalizedInput,
      });
      const resolvedUrl = pickPreferredResolvedVideoUrl(normalizedInput, trace);
      if (trace.success && trace.resolvedVideoUrl) {
        return {
          inputUrl: normalizedInput,
          resolvedVideoUrl: resolvedUrl,
          resolved: resolvedUrl !== normalizedInput || isLikelyDirectPlayableVideoUrl(resolvedUrl),
          source: "orchestrator",
          traceId: trace.traceId,
          finalStage: trace.finalStage,
        };
      }
      return {
        inputUrl: normalizedInput,
        resolvedVideoUrl: normalizedInput,
        resolved: false,
        source: "fallback_input",
        traceId: trace.traceId,
        finalStage: trace.finalStage,
      };
    } catch {
      return {
        inputUrl: normalizedInput,
        resolvedVideoUrl: normalizedInput,
        resolved: false,
        source: "fallback_input",
        traceId: null as string | null,
        finalStage: null as string | null,
      };
    }
  });

}
