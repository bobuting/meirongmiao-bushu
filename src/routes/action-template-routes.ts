/**
 * action-template-routes.ts
 * 内置动作模板库 API 路由（用户端）
 *
 * 端点：
 * - GET /action-templates          — 查询模板列表（分页、筛选）
 * - GET /action-templates/:id      — 查询模板详情
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { ActionTemplateCategory } from "../contracts/action-transfer-contract.js";
import { AppError } from "../core/errors.js";
import { requireUser } from "../services/auth/route-guards.js";
import { getLogger } from "../core/logger/index.js";
import {
  queryActionTemplates,
  findActionTemplateById,
} from "../repositories/pg/action-templates-pg-repository.js";

const log = getLogger("action-template-routes");

/** 路由依赖 */
export interface ActionTemplateRouteDeps {
  ctx: AppContext;
}

/**
 * 注册动作模板库 API 路由
 */
export async function registerActionTemplateRoutes(
  app: FastifyInstance,
  deps: ActionTemplateRouteDeps
): Promise<void> {
  const { ctx } = deps;
  const pool = ctx.pool;

  // ===========================================================================
  // GET /action-templates
  // 查询模板列表
  // ===========================================================================
  app.get("/action-templates", async (request, reply) => {
    await requireUser(ctx, request);

    const query = request.query as {
      category?: ActionTemplateCategory;
      source?: string;
      sortBy?: "popularity" | "duration_sec" | "created_at";
      sortOrder?: "ASC" | "DESC";
      limit?: number;
      offset?: number;
    };

    const { items, total } = await queryActionTemplates(pool, {
      category: query.category,
      isActive: true,  // 用户端只返回启用的模板
      source: query.source as any,
      sortBy: query.sortBy || "popularity",
      sortOrder: query.sortOrder || "DESC",
      limit: query.limit ? parseInt(String(query.limit), 10) : 50,
      offset: query.offset ? parseInt(String(query.offset), 10) : 0,
    });

    return reply.send({
      success: true,
      data: {
        items,
        total,
        hasMore: (query.offset || 0) + items.length < total,
      },
    });
  });

  // ===========================================================================
  // GET /action-templates/:id
  // 查询模板详情
  // ===========================================================================
  app.get("/action-templates/:id", async (request, reply) => {
    await requireUser(ctx, request);

    const params = request.params as { id: string };
    const template = await findActionTemplateById(pool, params.id);

    if (!template || !template.isActive) {
      throw new AppError(404, "TEMPLATE_NOT_FOUND", "模板不存在或已禁用");
    }

    return reply.send({ success: true, data: template });
  });

  log.info("动作模板库 API 路由已注册");
}