/**
 * 图片项目专用路由注册器
 *
 * Step 1: 服装搭配（Phase 2 实现）
 * Step 3: 模特图生成（Phase 3 实现）
 * Step 4: 电商详情页（Phase 4 实现）
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { RouteRegistrar } from "../index.js";
import { registerImageProjectStep1Routes } from "./step1-handlers.js";
import { registerImageProjectStep3Routes } from "./step3-handlers.js";
import { registerImageProjectStep4Routes } from "./step4-handlers.js";

/**
 * 注册图片项目专用路由
 */
export function registerImageProjectRoutes(app: FastifyInstance, ctx: AppContext): void {
  registerImageProjectStep1Routes(app, ctx);
  registerImageProjectStep3Routes(app, ctx);
  registerImageProjectStep4Routes(app, ctx);
}

/** Route Registrar 实现 */
export const imageProjectRouteRegistrar: RouteRegistrar = {
  id: "image_project_routes",
  register: registerImageProjectRoutes,
};
