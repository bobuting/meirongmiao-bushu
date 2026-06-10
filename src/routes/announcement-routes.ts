/**
 * announcement-routes.ts
 * 公告 API 路由
 * - GET /announcements — 所有登录用户可查已发布公告
 * - POST /admin/announcements — 管理员创建
 * - GET /admin/announcements — 管理员列表
 * - PATCH /admin/announcements/:id — 管理员更新
 * - DELETE /admin/announcements/:id — 管理员删除
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { requireUser, requireAdmin } from "../services/auth/route-guards.js";

export function registerAnnouncementRoutes(app: FastifyInstance, ctx: AppContext): void {
  // ===== 用户端：获取已发布公告 =====
  app.get("/announcements", async (request) => {
    await requireUser(ctx, request);
    const announcements = await ctx.repos.announcements.listPublished();
    return { items: announcements };
  });

  // ===== 管理端：创建公告 =====
  app.post("/admin/announcements", async (request) => {
    await requireAdmin(ctx, request);
    const body = request.body as {
      title: string;
      content: string;
      status?: string;
      sortOrder?: number;
    };
    if (!body.title || !body.content) {
      throw { statusCode: 400, message: "标题和内容不能为空" };
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const status = body.status === 'published' ? 'published' : 'draft';

    await ctx.repos.announcements.upsert({
      id,
      title: body.title,
      content: body.content,
      status,
      publishedAt: status === 'published' ? now : null,
      sortOrder: body.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    });

    const created = await ctx.repos.announcements.findById(id);
    return { item: created };
  });

  // ===== 管理端：公告列表 =====
  app.get("/admin/announcements", async (request) => {
    await requireAdmin(ctx, request);
    const items = await ctx.repos.announcements.list();
    return { items: items.sort((a, b) => b.createdAt - a.createdAt) };
  });

  // ===== 管理端：更新公告 =====
  app.patch("/admin/announcements/:id", async (request) => {
    await requireAdmin(ctx, request);
    const { id } = request.params as { id: string };
    const body = request.body as {
      title?: string;
      content?: string;
      status?: string;
      sortOrder?: number;
    };

    const existing = await ctx.repos.announcements.findById(id);
    if (!existing) {
      throw { statusCode: 404, message: "公告不存在" };
    }

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
    if (body.status !== undefined) updates.status = body.status;
    updates.updatedAt = Date.now();

    await ctx.repos.announcements.updateFields(id, updates);

    if (body.status) {
      await ctx.repos.announcements.updateStatus(id, body.status as 'draft' | 'published' | 'archived');
    }

    const updated = await ctx.repos.announcements.findById(id);
    return { item: updated };
  });

  // ===== 管理端：删除公告 =====
  app.delete("/admin/announcements/:id", async (request) => {
    await requireAdmin(ctx, request);
    const { id } = request.params as { id: string };
    const existing = await ctx.repos.announcements.findById(id);
    if (!existing) {
      throw { statusCode: 404, message: "公告不存在" };
    }
    await ctx.repos.announcements.delete(id);
    return { success: true };
  });
}
