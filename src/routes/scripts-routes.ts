/**
 * scripts-routes.ts
 * 系统相关路由
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { requireUser } from "../services/auth/route-guards.js";

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------

export function registerScriptsRoutes(app: FastifyInstance, ctx: AppContext): void {
  // ---------------------------------------------------------------------------
  // GET /system/reverse-ui-settings — 系统反向工程 UI 设置
  // ---------------------------------------------------------------------------

  app.get("/system/reverse-ui-settings", async (request) => {
    requireUser(ctx, request);
    return {};
  });
}