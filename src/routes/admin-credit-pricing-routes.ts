/**
 * 积分定价管理路由
 *
 * 端点：
 * - GET  /admin/credit-pricing              获取所有积分定价配置
 * - POST /admin/credit-pricing              设置单个定价
 * - POST /admin/credit-pricing/batch        批量设置定价
 * - DELETE /admin/credit-pricing/:routeKey  失效定价
 * - GET  /admin/credit-pricing/:routeKey/history 获取变更历史
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { requireAdmin } from "../services/auth/route-guards.js";
import { AppError } from "../core/errors.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("credit-pricing-routes");

/**
 * 注册积分定价管理路由
 */
export function registerCreditPricingRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  /**
   * 获取所有积分定价配置
   * GET /admin/credit-pricing
   */
  app.get("/admin/credit-pricing", async (request) => {
    await requireAdmin(ctx, request);

    const records = await ctx.creditPricingService.getAllPricingDetails();

    return {
      success: true,
      data: records.map((r) => ({
        routeKey: r.routeKey,
        creditCost: r.creditCost,
        description: r.description,
        category: r.category,
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  });

  /**
   * 设置单个定价
   * POST /admin/credit-pricing
   *
   * Body: { routeKey: string, creditCost: number, description?: string, category?: string, changeReason?: string }
   */
  app.post("/admin/credit-pricing", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const body = (request.body as {
      routeKey?: string;
      creditCost?: number;
      description?: string;
      category?: string;
      changeReason?: string;
    }) ?? {};

    const routeKey = body.routeKey?.trim();
    if (!routeKey) {
      throw new AppError(400, "ROUTE_KEY_REQUIRED", "routeKey 必填");
    }

    const creditCost = body.creditCost;
    if (creditCost === undefined || !Number.isInteger(creditCost) || creditCost < 0) {
      throw new AppError(400, "INVALID_COST", "积分成本必须为非负整数");
    }

    const result = await ctx.creditPricingService.setPricing(
      routeKey,
      creditCost,
      body.description,
      body.category,
      admin.id,
      body.changeReason,
    );

    log.info({ adminId: admin.id, routeKey, creditCost }, "积分定价已设置");

    return {
      success: true,
      data: {
        routeKey: result.routeKey,
        creditCost: result.creditCost,
        description: result.description,
        category: result.category,
        isActive: result.isActive,
        updatedAt: result.updatedAt,
      },
    };
  });

  /**
   * 批量设置定价
   * POST /admin/credit-pricing/batch
   *
   * Body: { pricings: Array<{ routeKey: string, creditCost: number, description?: string, category?: string }>, changeReason?: string }
   */
  app.post("/admin/credit-pricing/batch", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const body = (request.body as {
      pricings?: Array<{ routeKey: string; creditCost: number; description?: string; category?: string }>;
      changeReason?: string;
    }) ?? {};

    const pricings = body.pricings ?? [];
    if (pricings.length === 0) {
      throw new AppError(400, "PRICINGS_REQUIRED", "pricings 数组不能为空");
    }

    // 校验每个定价
    for (const p of pricings) {
      if (!p.routeKey?.trim()) {
        throw new AppError(400, "ROUTE_KEY_REQUIRED", "routeKey 必填");
      }
      if (!Number.isInteger(p.creditCost) || p.creditCost < 0) {
        throw new AppError(400, "INVALID_COST", `积分成本必须为非负整数: ${p.routeKey}`);
      }
    }

    const results = await ctx.creditPricingService.setPricingBatch(
      pricings,
      admin.id,
      body.changeReason,
    );

    log.info({ adminId: admin.id, count: results.length }, "积分定价批量设置");

    return {
      success: true,
      data: results.map((r) => ({
        routeKey: r.routeKey,
        creditCost: r.creditCost,
        description: r.description,
        category: r.category,
        isActive: r.isActive,
        updatedAt: r.updatedAt,
      })),
    };
  });

  /**
   * 失效定价
   * DELETE /admin/credit-pricing/:routeKey
   */
  app.delete("/admin/credit-pricing/:routeKey", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { routeKey: string };
    const query = request.query as { changeReason?: string };

    const routeKey = params.routeKey;
    await ctx.creditPricingService.deactivatePricing(
      routeKey,
      admin.id,
      query.changeReason ?? "管理员失效定价",
    );

    log.info({ adminId: admin.id, routeKey }, "积分定价已失效");

    return {
      success: true,
      message: `已失效 ${routeKey} 的积分定价`,
    };
  });

  /**
   * 获取变更历史
   * GET /admin/credit-pricing/:routeKey/history
   */
  app.get("/admin/credit-pricing/:routeKey/history", async (request) => {
    await requireAdmin(ctx, request);

    const params = request.params as { routeKey: string };
    const query = request.query as { limit?: string };

    const limit = query.limit ? Math.min(100, Math.max(1, parseInt(query.limit, 10))) : 50;
    const history = await ctx.creditPricingService.getHistory(params.routeKey, limit);

    return {
      success: true,
      data: history,
    };
  });
}