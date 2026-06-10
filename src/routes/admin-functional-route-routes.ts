/**
 * 功能路由管理 API 路由
 * 提供功能路由的 CRUD 操作接口
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { AppError } from "../core/errors.js";
import { requireAdmin } from "../services/auth/route-guards.js";
import { parseFunctionalRouteType, type FunctionalRouteType } from "../contracts/functional-route-contract.js";

/**
 * 注册功能路由管理 API 路由
 */
export function registerFunctionalRouteRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  // GET /admin/functional-routes - 获取所有功能路由配置
  app.get("/admin/functional-routes", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const routes = await ctx.functionalRouteService.listRoutes(admin);
    return { routes };
  });

  // GET /admin/functional-routes/:type - 获取单个功能路由配置
  app.get("/admin/functional-routes/:type", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { type: string };

    let type: FunctionalRouteType;
    try {
      type = parseFunctionalRouteType(params.type);
    } catch (error) {
      throw new AppError(400, "INVALID_FUNCTIONAL_TYPE", error instanceof Error ? error.message : "Invalid functional route type");
    }

    const route = await ctx.functionalRouteService.getRoute(admin, type);
    if (!route) {
      throw new AppError(404, "NOT_FOUND", "Functional route not found");
    }
    return { route };
  });

  // PUT /admin/functional-routes/:type - 设置单个功能路由配置
  app.put("/admin/functional-routes/:type", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { type: string };
    const body = request.body as {
      providerId: string;
      fallbackProviderIds?: string[];
      enabled?: boolean;
    };

    let type: FunctionalRouteType;
    try {
      type = parseFunctionalRouteType(params.type);
    } catch (error) {
      throw new AppError(400, "INVALID_FUNCTIONAL_TYPE", error instanceof Error ? error.message : "Invalid functional route type");
    }

    if (!body.providerId || typeof body.providerId !== "string") {
      throw new AppError(400, "PROVIDER_ID_REQUIRED", "providerId is required");
    }

    const route = await ctx.functionalRouteService.setRoute(admin, {
      type,
      providerId: body.providerId,
      fallbackProviderIds: body.fallbackProviderIds,
      enabled: body.enabled,
    });

    return route;
  });

  // POST /admin/functional-routes/batch - 批量设置功能路由配置
  app.post("/admin/functional-routes/batch", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const body = request.body as {
      routes: Array<{
        type: string;
        providerId: string;
        fallbackProviderIds?: string[];
        enabled?: boolean;
      }>;
    };

    if (!Array.isArray(body.routes) || body.routes.length === 0) {
      throw new AppError(400, "INVALID_INPUT", "routes array is required");
    }

    // 解析并验证所有 type
    const inputs = body.routes.map((item) => {
      try {
        return {
          type: parseFunctionalRouteType(item.type),
          providerId: item.providerId,
          fallbackProviderIds: item.fallbackProviderIds,
          enabled: item.enabled,
        };
      } catch (error) {
        throw new AppError(400, "INVALID_FUNCTIONAL_TYPE", `Invalid functional route type: ${item.type}`);
      }
    });

    const routes = await ctx.functionalRouteService.setRoutes(admin, inputs);
    return { routes };
  });

  // DELETE /admin/functional-routes/:type - 删除功能路由配置
  app.delete("/admin/functional-routes/:type", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { type: string };

    let type: FunctionalRouteType;
    try {
      type = parseFunctionalRouteType(params.type);
    } catch (error) {
      throw new AppError(400, "INVALID_FUNCTIONAL_TYPE", error instanceof Error ? error.message : "Invalid functional route type");
    }

    await ctx.functionalRouteService.deleteRoute(admin, type);
    return { ok: true };
  });
}
