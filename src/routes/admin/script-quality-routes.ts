/**
 * 脚本质量评分 Dashboard API
 *
 * 提供管理端查询评分数据和 prompt 版本效果对比的接口。
 * 所有接口需要 admin 权限。
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import { requireAdmin } from "../../services/auth/route-guards.js";
import { getScoreByScriptId } from "../../modules/script-quality/scoring-repository.js";
import {
  getStrategyOverview,
  getMetricsByPromptCode,
  getMetricsByVersion,
  recomputeMetrics,
} from "../../modules/script-quality/metrics-aggregator.js";
import { AppError } from "../../core/errors.js";

export function registerScriptQualityRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  // GET /admin/quality-scores/overview — 各策略评分概览
  app.get("/admin/quality-scores/overview", async (request) => {
    await requireAdmin(ctx, request);
    const query = request.query as { sinceMs?: string };
    const sinceMs = query.sinceMs ? Number(query.sinceMs) : Date.now() - 7 * 24 * 60 * 60 * 1000;
    return { overview: await getStrategyOverview(ctx.repos, sinceMs) };
  });

  // GET /admin/quality-scores/by-prompt/:code — 指定 prompt 各版本对比
  app.get("/admin/quality-scores/by-prompt/:code", async (request) => {
    await requireAdmin(ctx, request);
    const params = request.params as { code: string };
    return { metrics: await getMetricsByPromptCode(ctx.repos, params.code) };
  });

  // GET /admin/quality-scores/by-version/:code/:version — 单版本详细指标
  app.get("/admin/quality-scores/by-version/:code/:version", async (request) => {
    await requireAdmin(ctx, request);
    const params = request.params as { code: string; version: string };
    const metrics = await getMetricsByVersion(ctx.repos, params.code, params.version);
    if (!metrics) return { metrics: null };
    return { metrics };
  });

  // GET /admin/quality-scores/by-script/:scriptDataId — 单脚本的评分详情
  app.get("/admin/quality-scores/by-script/:scriptDataId", async (request) => {
    await requireAdmin(ctx, request);
    const params = request.params as { scriptDataId: string };
    const score = await getScoreByScriptId(ctx.repos, params.scriptDataId);
    return { score };
  });

  // POST /admin/quality-scores/recompute — 手动触发指标重算
  app.post("/admin/quality-scores/recompute", async (request) => {
    await requireAdmin(ctx, request);
    const body = request.body as { promptCode?: string; promptVersion?: string } | undefined;

    if (body?.promptCode && body?.promptVersion) {
      const metrics = await recomputeMetrics(ctx.repos, body.promptCode, body.promptVersion);
      return { recomputed: 1, metrics };
    }

    // 不指定时重算全部
    const { recomputeAllMetrics } = await import("../../modules/script-quality/metrics-aggregator.js");
    const count = await recomputeAllMetrics(ctx.repos);
    return { recomputed: count };
  });

  // GET /admin/quality-scores/compare/:code/:v1/:v2 — 两版本 A/B 对比
  app.get("/admin/quality-scores/compare/:code/:v1/:v2", async (request) => {
    await requireAdmin(ctx, request);
    const params = request.params as { code: string; v1: string; v2: string };
    const [metricsA, metricsB] = await Promise.all([
      getMetricsByVersion(ctx.repos, params.code, params.v1),
      getMetricsByVersion(ctx.repos, params.code, params.v2),
    ]);

    if (!metricsA || !metricsB) {
      throw new AppError(404, "NO_METRICS_DATA", "One or both versions have no metrics data");
    }

    const delta = {
      avgScore: metricsA.avgScore - metricsB.avgScore,
      passRate: metricsA.passRate - metricsB.passRate,
    };

    const winner = Math.abs(delta.avgScore) < 2 ? "tie" as const
      : delta.avgScore > 0 ? "A" as const : "B" as const;

    return {
      versionA: { version: params.v1, ...metricsA },
      versionB: { version: params.v2, ...metricsB },
      winner,
      delta,
    };
  });
}
