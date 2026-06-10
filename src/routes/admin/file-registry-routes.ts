/**
 * 文件注册管理后台路由
 * 仅管理员可访问
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { FileRegistryFilters } from "../../contracts/file-registry-contract.js";
import { requireAdmin } from "../../services/auth/route-guards.js";

/** 注册文件注册管理路由 */
export function registerAdminFileRegistryRoutes(
  app: FastifyInstance,
  ctx: AppContext
): void {
  const { repos, fileService } = ctx;

  // 查询文件列表（分页）
  app.get("/admin/files", async (request: FastifyRequest<{ Querystring: FileRegistryFilters }>, reply) => {
    await requireAdmin(ctx, request);
    const filters = request.query;
    const result = await repos.fileRegistry.findByFilters(filters);

    reply.send({
      items: result.items,
      total: result.total,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 50,
    });
  });

  // 获取文件详情
  app.get("/admin/files/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    await requireAdmin(ctx, request);
    const { id } = request.params;
    const record = await repos.fileRegistry.findById(id);

    if (!record) {
      reply.code(404).send({ error: "File not found" });
      return;
    }

    reply.send(record);
  });

  // 获取存储统计
  app.get("/admin/files/stats", async (request, reply) => {
    await requireAdmin(ctx, request);
    const stats = await repos.fileRegistry.getStorageStats();
    reply.send(stats);
  });

  // 删除零引用文件
  app.delete("/admin/files/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    await requireAdmin(ctx, request);
    const { id } = request.params;

    try {
      const deleted = await fileService.deleteFile(id);
      reply.send({ success: deleted });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      reply.code(400).send({ error: message });
    }
  });

  // 查询零引用文件列表
  app.get("/admin/files/zero-ref", async (request: FastifyRequest<{ Querystring: { olderThanDays?: number; businessDomain?: string; limit?: number } }>, reply) => {
    await requireAdmin(ctx, request);
    const { olderThanDays, businessDomain, limit } = request.query;

    const files = await fileService.findZeroRefFiles({
      olderThanDays,
      businessDomain,
      limit,
    });

    reply.send({ items: files });
  });

  // 获取清理状态
  app.get("/admin/files/cleanup/status", async (request, reply) => {
    await requireAdmin(ctx, request);

    const status = {
      enabled: process.env.FILE_CLEANUP_ENABLED === "true",
      lastRunAt: null,
      nextRunAt: null,
      retentionDays: parseInt(process.env.FILE_CLEANUP_THRESHOLD_DAYS ?? "30", 10),
      totalCleaned: 0,
    };

    reply.send(status);
  });
}