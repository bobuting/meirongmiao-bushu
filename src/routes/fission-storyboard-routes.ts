/**
 * 裂变分镜路由（占位）
 * 当前功能已在 fission-video-routes.ts 中实现
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";

export function registerFissionStoryboardRoutes(
  app: FastifyInstance,
  ctx: AppContext
): void {
  // 占位：当前 storyboard 功能已在 fission-video-routes.ts 中
  // 如需独立路由，可在此扩展
}

export const fissionStoryboardRouteRegistrar = {
  id: "fission_storyboard_routes" as const,
  register: registerFissionStoryboardRoutes,
};
