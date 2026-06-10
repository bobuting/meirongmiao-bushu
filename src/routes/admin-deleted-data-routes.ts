/**
 * admin-deleted-data-routes.ts
 * 管理员伪删除数据路由定义
 */
import type { FastifyInstance, RouteHandlerMethod } from "fastify";

/** 管理员伪删除数据路由处理器接口 */
export interface AdminDeletedDataRouteHandlers {
  /** 查看伪删除数据列表 */
  readonly listDeletedData: RouteHandlerMethod;
  /** 查看单条伪删除数据详情 */
  readonly getDeletedDataDetail: RouteHandlerMethod;
  /** 恢复伪删除数据 */
  readonly restoreDeletedData: RouteHandlerMethod;
  /** 手动清理伪删除数据 */
  readonly manualCleanup: RouteHandlerMethod;
  /** 查看清理任务状态 */
  readonly getCleanupStatus: RouteHandlerMethod;
  /** 启用/禁用定时清理 */
  readonly toggleCleanupScheduler: RouteHandlerMethod;
}

/**
 * 注册管理员伪删除数据路由
 *
 * 路由列表：
 * - GET  /admin/deleted-data              - 查看伪删除数据列表
 * - GET  /admin/deleted-data/:table/:id   - 查看单条伪删除数据详情
 * - POST /admin/deleted-data/:table/:id/restore - 恢复伪删除数据
 * - POST /admin/deleted-data/cleanup      - 手动清理伪删除数据
 * - GET  /admin/deleted-data/cleanup/status - 查看清理任务状态
 * - POST /admin/deleted-data/cleanup/toggle - 启用/禁用定时清理
 */
export function registerAdminDeletedDataRoutes(
  app: FastifyInstance,
  handlers: AdminDeletedDataRouteHandlers,
): void {
  // 查看伪删除数据列表
  app.get("/admin/deleted-data", handlers.listDeletedData);

  // 查看单条伪删除数据详情
  app.get("/admin/deleted-data/:table/:id", handlers.getDeletedDataDetail);

  // 恢复伪删除数据
  app.post("/admin/deleted-data/:table/:id/restore", handlers.restoreDeletedData);

  // 手动清理伪删除数据
  app.post("/admin/deleted-data/cleanup", handlers.manualCleanup);

  // 查看清理任务状态
  app.get("/admin/deleted-data/cleanup/status", handlers.getCleanupStatus);

  // 启用/禁用定时清理
  app.post("/admin/deleted-data/cleanup/toggle", handlers.toggleCleanupScheduler);
}