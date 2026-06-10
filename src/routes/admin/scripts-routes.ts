/**
 * admin/scripts-routes.ts
 * 脚本库管理路由：CRUD、导入/导出
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { AdminRouteDeps } from "./types.js";

import { AppError } from "../../core/errors.js";
import { requireAdmin } from "../../services/auth/route-guards.js";
import { HOT_TREND_ASSET_TAG } from "../../modules/hot-trend/index.js";

/**
 * 注册 /admin/scripts/* 路由
 */
export function registerAdminScriptsRoutes(app: FastifyInstance, ctx: AppContext, deps: AdminRouteDeps): void {
  const { toAdminScriptItem } = deps;

  app.get("/admin/scripts", async (request) => {
    await requireAdmin(ctx, request);
    const query = request.query as { page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10)));

    // 分页查询，只查需要的字段，排除热榜资产
    const offset = (page - 1) * pageSize;
    const { rows, total } = await ctx.repos.scriptData.findAdminPaged({
      excludeTag: HOT_TREND_ASSET_TAG,
      limit: pageSize,
      offset,
    });

    const scripts = rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      title: row.title,
      tags: row.tags ?? [],
      content: "", // 列表不需要 content
      ownerId: row.user_id,
      ownerEmail: row.owner_email ?? "unknown",
      date: Number(row.updated_at),
      status: "generated",
    }));

    return {
      scripts,
      pagination: {
        page,
        pageSize,
        total,
      },
    };
  });

  app.post("/admin/scripts", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const body = request.body as {
      title: string;
      content: string;
      tags?: string[];
      ownerEmail?: string;
    };
    const owner =
      (body.ownerEmail ? await ctx.repos.users.findById(body.ownerEmail.trim().toLowerCase()) : null) ?? admin;
    if (!owner) {
      throw new AppError(404, "OWNER_NOT_FOUND", "Owner user not found");
    }
    const created = await ctx.scriptLibraryService.create(owner.id, {
      title: body.title,
      content: body.content,
      type: 0, // 默认类型
      tags: body.tags ?? [],
    });
    return {
      id: created.id,
      title: created.title,
      tags: created.tags,
      content: created.content,
      ownerId: created.userId,
      ownerEmail: owner.email,
      date: created.updatedAt,
      status: "draft",
    };
  });

  app.patch("/admin/scripts/:scriptId", async (request) => {
    await requireAdmin(ctx, request);
    const params = request.params as { scriptId: string };
    const body = request.body as Partial<{
      title: string;
      content: string;
      tags: string[];
    }>;
    const existing = await ctx.scriptLibraryService.findById(params.scriptId);
    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "Script not found");
    }
    const owner = await ctx.repos.users.findById(existing.userId);
    if (!owner) {
      throw new AppError(404, "OWNER_NOT_FOUND", "Owner user not found");
    }
    const updated = await ctx.scriptLibraryService.update(owner.id, existing.id, body);
    return {
      id: updated.id,
      title: updated.title,
      tags: updated.tags,
      content: updated.content,
      ownerId: updated.userId,
      ownerEmail: owner.email,
      date: updated.updatedAt,
      status: "draft",
    };
  });

  app.delete("/admin/scripts/:scriptId", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { scriptId: string };
    await ctx.scriptLibraryService.remove(admin.id, params.scriptId);
    return { ok: true };
  });

  app.post("/admin/scripts/import", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const body = request.body as {
      items?: Array<{ title: string; content: string; tags?: string[]; ownerEmail?: string }>;
    };
    const items = body.items ?? [];
    const created: Array<{ id: string; title: string; ownerEmail: string }> = [];
    const failed: Array<{ title: string; reason: string }> = [];
    for (const item of items) {
      try {
        const owner =
          (item.ownerEmail ? await ctx.repos.users.findById(item.ownerEmail.trim().toLowerCase()) : null) ?? admin;
        if (!owner) {
          failed.push({ title: item.title, reason: "Owner not found" });
          continue;
        }
        const script = await ctx.scriptLibraryService.create(owner.id, {
          title: item.title,
          content: item.content,
          type: 0, // 默认类型
          tags: item.tags ?? [],
        });
        created.push({
          id: script.id,
          title: script.title,
          ownerEmail: owner.email,
        });
      } catch (error) {
        failed.push({
          title: item.title,
          reason: error instanceof Error ? error.message : "Import failed",
        });
      }
    }
    return {
      created,
      failed,
      total: items.length,
    };
  });

  app.get("/admin/scripts/export", async (request) => {
    await requireAdmin(ctx, request);
    const scripts = await Promise.all((await ctx.scriptLibraryService.list())
      .filter((item) => !item.tags.includes(HOT_TREND_ASSET_TAG))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(async (item) => {
        const owner = await ctx.repos.users.findById(item.userId);
        return {
          id: item.id,
          title: item.title,
          tags: item.tags,
          content: item.content,
          ownerId: item.userId,
          ownerEmail: owner?.email ?? "unknown",
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        };
      }));
    return {
      scripts,
      exportedAt: ctx.clock.now(),
    };
  });
}
