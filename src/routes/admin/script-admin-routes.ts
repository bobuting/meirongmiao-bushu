/**
 * 脚本管理路由（管理后台）
 *
 * 提供：
 * 1. 脚本列表查询（分页、筛选）
 * 2. 脚本评分数据查询
 */

import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../services/auth/route-guards.js";
import type { AppContext } from "../../core/app-context.js";

/** 脚本列表查询参数 */
interface ScriptListQuery {
  page?: number;
  pageSize?: number;
  strategy?: string;
  hasScore?: boolean;
  search?: string;
}

/** 安全解析 JSONB 数组 */
function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * 注册脚本管理路由
 */
export async function registerScriptAdminRoutes(
  app: FastifyInstance,
  deps: { ctx: AppContext },
) {
  const { ctx } = deps;

  /**
   * 查询脚本列表（分页）
   */
  app.get("/scripts", async (request, reply) => {
    await requireAdmin(ctx, request);

    const query = request.query as ScriptListQuery;
    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 20, 100);
    const offset = (page - 1) * pageSize;

    // 通过仓库查询脚本数据
    const { rows: scripts, total } = await ctx.repos.scriptData.adminList({
      strategy: query.strategy,
      search: query.search,
      pageSize,
      offset,
    });

    // 批量查询评分数据
    const scriptIds = scripts.map((s) => s.id as string);
    let scoresMap: Record<string, unknown> = {};

    if (scriptIds.length > 0) {
      const scores = await ctx.repos.scriptQualityScores.findByScriptDataIds(scriptIds);
      scoresMap = scores.reduce((acc, row) => {
        acc[row.scriptDataId] = {
          id: row.id,
          scriptDataId: row.scriptDataId,
          strategy: row.strategy,
          score: row.score,
          viewerScore: row.viewerScore,
          directorScore: row.directorScore,
          strategistScore: row.strategistScore,
          ruleBasedScore: row.ruleBasedScore,
          scoringMethod: row.scoringMethod,
          strengths: row.strengths,
          weaknesses: row.weaknesses,
          suggestions: row.suggestions,
          scoreSpread: row.scoreSpread,
          createdAt: row.createdAt,
        };
        return acc;
      }, {} as Record<string, unknown>);
    }

    // 筛选：是否已评分
    let filteredScripts = scripts;
    if (query.hasScore !== undefined) {
      filteredScripts = scripts.filter((s) =>
        query.hasScore ? scoresMap[s.id as string] : !scoresMap[s.id as string],
      );
    }

    return reply.send({
      success: true,
      data: {
        items: filteredScripts.map((row) => ({
          id: row.id,
          projectId: row.project_id,
          userId: row.user_id,
          title: row.title,
          content: row.content,
          type: row.type,
          sourceType: row.source_type,
          videoStyle: row.video_style,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at),
        })),
        total: query.hasScore !== undefined ? filteredScripts.length : total,
        scoresMap,
      },
    });
  });

  /**
   * 查询单个脚本的评分详情
   */
  app.get("/scripts/:scriptId/score", async (request, reply) => {
    await requireAdmin(ctx, request);

    const { scriptId } = request.params as { scriptId: string };
    const score = await ctx.repos.scriptQualityScores.findByScriptDataId(scriptId);

    if (!score) {
      return reply.send({ success: true, data: null });
    }

    return reply.send({
      success: true,
      data: {
        id: score.id,
        scriptDataId: score.scriptDataId,
        strategy: score.strategy,
        score: score.score,
        viewerScore: score.viewerScore,
        directorScore: score.directorScore,
        strategistScore: score.strategistScore,
        ruleBasedScore: score.ruleBasedScore,
        scoringMethod: score.scoringMethod,
        strengths: score.strengths,
        weaknesses: score.weaknesses,
        suggestions: score.suggestions,
        scoreSpread: score.scoreSpread,
        createdAt: score.createdAt,
      },
    });
  });

  /**
   * 查询评分统计概览
   */
  app.get("/scripts/stats", async (request, reply) => {
    await requireAdmin(ctx, request);

    const [strategyStats, overallStats] = await Promise.all([
      ctx.repos.scriptQualityScores.statsByStrategy(),
      ctx.repos.scriptQualityScores.overallStats(),
    ]);

    return reply.send({
      success: true,
      data: {
        strategyStats,
        overallStats,
      },
    });
  });
}
