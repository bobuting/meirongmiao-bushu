/**
 * runtime-config-routes.ts
 * 运行时配置 API 路由（前端获取环境信息）
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";

export interface RuntimeConfigRouteDeps {
  ctx: AppContext;
}

/**
 * 注册运行时配置 API 路由
 */
export async function registerRuntimeConfigRoutes(
  app: FastifyInstance,
  deps: RuntimeConfigRouteDeps
): Promise<void> {
  // GET /runtime-config — 返回运行时配置信息（无需认证）
  app.get("/runtime-config", async (request, reply) => {
    const nodeEnv = process.env.NODE_ENV ?? "development";
    const isProduction = nodeEnv === "production";

    return reply.send({
      success: true,
      data: {
        nodeEnv,
        isProduction,
        // 功能开关：换装项目已开放
        outfitChangeEnabled: true,
      },
    });
  });
}