/**
 * 创作广场达人管理与运行记录后台路由
 * 达人 CRUD + 发现视频列表
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { requireAdmin } from "../services/auth/route-guards.js";
import { SquareCreatorTargetService } from "../service/square-creator-target-db-service.js";
import { SquareDiscoveredVideoService } from "../service/square-discovered-video-db-service.js";
import { SquareExecutionLogService, type ExecutionType } from "../service/square-execution-log-db-service.js";
import { CreatorDiscoveryScheduler } from "../scheduler/creator-discovery-scheduler.js";
import { SquareTemplateAutoPublishScheduler } from "../scheduler/square-template-auto-publish-scheduler.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("square-creator-admin-routes");

export function registerSquareCreatorAdminRoutes(app: FastifyInstance, ctx: AppContext): void {
  // ========== 达人管理 ==========

  // 分页列表
  app.get("/admin/square-creators", async (request, reply) => {
    await requireAdmin(ctx, request);
    const { page = "1", pageSize = "20", contentType, enabled, source } = request.query as Record<string, string>;

    const service = new SquareCreatorTargetService(ctx.repos.squareCreatorTargets);
    const pageNum = Math.max(1, Number(page));
    const size = Math.min(100, Math.max(1, Number(pageSize)));

    const { data, total } = await service.listPaginated({
      page: pageNum,
      pageSize: size,
      contentType: contentType || undefined,
      enabled: enabled !== undefined && enabled !== "" ? enabled === "true" : undefined,
      source: source || undefined,
    });

    return reply.send({ success: true, data, total, page: pageNum, pageSize: size });
  });

  // 手动添加达人
  app.post("/admin/square-creators", async (request, reply) => {
    await requireAdmin(ctx, request);
    const body = request.body as { secUid?: string; nickname?: string; contentType?: string };

    if (!body.secUid || !body.contentType) {
      return reply.code(400).send({ success: false, message: "缺少 secUid 或 contentType" });
    }

    const service = new SquareCreatorTargetService(ctx.repos.squareCreatorTargets);
    const result = await service.upsert({
      secUid: body.secUid,
      nickname: body.nickname || body.secUid,
      contentType: body.contentType as "aesthetic" | "fashion_film" | "scene",
      source: "manual",
      confidenceScore: 1.0,
    });

    return reply.send({ success: true, data: result });
  });

  // 更新达人
  app.put("/admin/square-creators/:id", async (request, reply) => {
    await requireAdmin(ctx, request);
    const { id } = request.params as { id: string };
    const body = request.body as { nickname?: string; contentType?: string; enabled?: boolean };

    const updated = await ctx.repos.squareCreatorTargets.updateFieldsById(id, {
      nickname: body.nickname,
      contentType: body.contentType,
      enabled: body.enabled,
    }, Date.now());

    if (!updated) {
      return reply.code(404).send({ success: false, message: "达人不存在" });
    }

    return reply.send({ success: true, data: updated });
  });

  // 启用/禁用切换
  app.post("/admin/square-creators/:id/toggle", async (request, reply) => {
    await requireAdmin(ctx, request);
    const { id } = request.params as { id: string };

    const updated = await ctx.repos.squareCreatorTargets.toggleEnabled(id, Date.now());

    if (!updated) {
      return reply.code(404).send({ success: false, message: "达人不存在" });
    }

    return reply.send({ success: true, data: updated });
  });

  // 删除达人
  app.delete("/admin/square-creators/:id", async (request, reply) => {
    await requireAdmin(ctx, request);
    const { id } = request.params as { id: string };

    await ctx.repos.squareCreatorTargets.delete(id);
    return reply.send({ success: true });
  });

  // ========== 运行记录 ==========

  // 分页列表
  app.get("/admin/square-discovered-videos", async (request, reply) => {
    await requireAdmin(ctx, request);
    const { page = "1", pageSize = "20", status } = request.query as Record<string, string>;

    const service = new SquareDiscoveredVideoService(ctx.repos.squareDiscoveredVideos);
    const pageNum = Math.max(1, Number(page));
    const size = Math.min(100, Math.max(1, Number(pageSize)));

    const { data, total } = await service.listPaginated({
      page: pageNum,
      pageSize: size,
      status: status || undefined,
    });

    return reply.send({ success: true, data, total, page: pageNum, pageSize: size });
  });

  // 删除记录
  app.delete("/admin/square-discovered-videos/:id", async (request, reply) => {
    await requireAdmin(ctx, request);
    const { id } = request.params as { id: string };

    await ctx.repos.squareDiscoveredVideos.delete(id);
    return reply.send({ success: true });
  });

  // ========== 执行日志 ==========

  app.get("/admin/square-execution-logs", async (request, reply) => {
    await requireAdmin(ctx, request);
    const { page = "1", pageSize = "20", type } = request.query as Record<string, string>;

    const service = new SquareExecutionLogService(ctx.repos.squareExecutionLogs);
    const pageNum = Math.max(1, Number(page));
    const size = Math.min(100, Math.max(1, Number(pageSize)));

    const { data, total } = await service.list({
      page: pageNum,
      pageSize: size,
      type: (type as ExecutionType) || undefined,
    });

    return reply.send({ success: true, data, total, page: pageNum, pageSize: size });
  });

  // ========== 手动触发 ==========

  // 手动触发达人发现
  app.post("/admin/square-trigger/discovery", async (request, reply) => {
    await requireAdmin(ctx, request);
    const scheduler = CreatorDiscoveryScheduler.getExistingInstance();
    if (!scheduler) {
      return reply.code(503).send({ success: false, message: "达人发现调度器未初始化，请先启用并重启后端" });
    }
    try {
      const result = await scheduler.triggerManualDiscovery();
      return reply.send({ success: true, data: result });
    } catch (error) {
      log.error({ error }, "手动触发达人发现失败");
      return reply.code(500).send({ success: false, message: error instanceof Error ? error.message : "执行失败" });
    }
  });

  // 手动触发模板自动发布
  app.post("/admin/square-trigger/auto-publish", async (request, reply) => {
    await requireAdmin(ctx, request);
    const scheduler = SquareTemplateAutoPublishScheduler.getExistingInstance();
    if (!scheduler) {
      return reply.code(503).send({ success: false, message: "模板自动发布调度器未初始化，请先启用并重启后端" });
    }
    try {
      const result = await scheduler.triggerManualPublish();
      return reply.send({ success: true, data: result });
    } catch (error) {
      log.error({ error }, "手动触发模板自动发布失败");
      return reply.code(500).send({ success: false, message: error instanceof Error ? error.message : "执行失败" });
    }
  });
}
