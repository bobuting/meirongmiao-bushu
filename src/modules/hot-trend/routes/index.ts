/**
 * 热榜路由模块入口
 * 注册所有热榜相关的API路由
 *
 * 注意: 路由提取需要保持与app.ts中服务的连接
 * 当前为骨架文件，实际路由仍在app.ts中
 */

import type { FastifyInstance } from "fastify";
import type { HotTrendModuleContext } from "../context.js";

/**
 * 注册热榜模块所有路由
 *
 * 迁移源: app.ts 中的热榜相关路由
 * - /admin/scripts/hot-trends/* (管理后台)
 * - /scripts/hot-trend-assets/* (脚本资产)
 * - /square/trends/* (广场接口)
 */
export function registerHotTrendRoutes(
  _app: FastifyInstance,
  _ctx: HotTrendModuleContext,
): void {
  // TODO: 实现路由注册
  // 当前路由仍在 app.ts 中，需要在 Phase 6 完成迁移
  // registerAdminRoutes(app, ctx);
  // registerSquareRoutes(app, ctx);
  // registerScriptRoutes(app, ctx);
}

/**
 * 注册管理后台路由
 * 路由: /admin/scripts/hot-trends/*
 *
 * 迁移源: app.ts 行 21116-21630
 */
export function registerAdminRoutes(
  _app: FastifyInstance,
  _ctx: HotTrendModuleContext,
): void {
  // GET /admin/scripts/hot-trends - 获取热榜资产列表
  // POST /admin/scripts/hot-trends/sync - 触发同步
  // POST /admin/scripts/hot-trends - 创建热榜资产
  // PATCH /admin/scripts/hot-trends/:scriptId - 更新资产
  // DELETE /admin/scripts/hot-trends/:scriptId - 删除资产
  // POST /admin/scripts/hot-trends/batch-delete - 批量删除
  // POST /admin/scripts/hot-trends/:scriptId/reverse-to-smart-storyboard - 反推到智能故事板
  // POST /admin/scripts/hot-trends/video-prune-unlinked - 清理未关联视频资产
  // POST /admin/scripts/hot-trends/relabel - 重新打标
}

/**
 * 注册广场路由
 * 路由: /square/trends/*
 *
 * 迁移源: app.ts 行 19964-20000
 */
export function registerSquareRoutes(
  _app: FastifyInstance,
  _ctx: HotTrendModuleContext,
): void {
  // GET /square/trends - 获取广场热榜
  // POST /square/trends/resolve-video-url - 解析视频URL
}

/**
 * 注册脚本资产路由
 * 路由: /scripts/hot-trend-assets/*
 *
 * 迁移源: app.ts 行 20336-20420
 */
export function registerScriptRoutes(
  _app: FastifyInstance,
  _ctx: HotTrendModuleContext,
): void {
  // GET /scripts/hot-trend-assets - 获取热榜资产
  // POST /scripts/hot-trend-assets/:scriptId/reverse-to-library - 反推到脚本库
}