/**
 * admin/users-routes.ts
 * 用户管理路由：CRUD、锁定/解锁、积分调整、导入/导出
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { AdminRouteDeps } from "./types.js";

import { AppError } from "../../core/errors.js";
import { requireAdmin } from "../../services/auth/route-guards.js";
import { hashPassword } from "../../core/security.js";

/**
 * 注册 /admin/users/* 路由
 */
export function registerAdminUsersRoutes(app: FastifyInstance, ctx: AppContext, _deps: AdminRouteDeps): void {
  app.get("/admin/users", async (request) => {
    const admin = await requireAdmin(ctx, request);
    return { users: await ctx.userAdminService.listUsers(admin) };
  });

  app.post("/admin/users", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const body = request.body as {
      email: string;
      password: string;
      role?: "admin" | "user";
      companyName?: string;
      initialCredits?: number;
    };
    const role = body.role ?? "user";
    const created = await ctx.authService.register(body.email, body.password, role);

    // 更新公司名称
    if (body.companyName) {
      created.companyName = body.companyName;
      await ctx.repos.users.upsert(created);
    }

    ctx.auditStore.insertAuditLog({
      id: ctx.clock.generateId(),
      actorUserId: admin.id,
      action: "admin_user_create",
      targetId: created.id,
      meta: {
        role: created.role,
      },
      createdAt: ctx.clock.now(),
    });

    // 创建积分账户，支持自定义初始积分
    const credit = await ctx.creditService.ensureAccount(created.id, body.initialCredits);
    return {
      id: created.id,
      email: created.email,
      role: created.role,
      createdAt: created.createdAt,
      failedAttempts: created.failedAttempts,
      lockUntil: created.lockUntil,
      creditBalance: credit.balance,
      creditExpiresAt: credit.expiresAt,
      companyName: created.companyName,
    };
  });

  app.patch("/admin/users/:userId", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { userId: string };
    const body = request.body as Partial<{
      email: string;
      role: "admin" | "user";
      password: string;
      companyName: string;
    }>;
    const user = await ctx.repos.users.findById(params.userId);
    if (!user) {
      throw new AppError(404, "NOT_FOUND", "User not found");
    }
    if (body.email !== undefined) {
      const normalized = body.email.trim().toLowerCase();
      if (normalized.length < 4) {
        throw new AppError(400, "USERNAME_INVALID", "用户名至少4个字符");
      }
      const existed = await ctx.repos.users.findById(normalized);
      if (existed && existed.id !== user.id) {
        throw new AppError(409, "USERNAME_EXISTS", "用户名已存在");
      }
      await ctx.repos.users.delete(user.email);
      user.email = normalized;
      await ctx.repos.users.upsert(user);
    }
    if (body.role !== undefined) {
      if (body.role !== "admin" && body.role !== "user") {
        throw new AppError(400, "ROLE_INVALID", "Role invalid");
      }
      if (body.role === "admin" && user.role !== "admin") {
        const hasAnotherAdmin = [...await ctx.repos.users.list()].some(
          (item) => item.id !== user.id && item.role === "admin",
        );
        if (hasAnotherAdmin) {
          throw new AppError(409, "ADMIN_EXISTS", "Admin already exists");
        }
      }
      user.role = body.role;
    }
    if (body.password !== undefined) {
      const nextPassword = body.password.trim();
      if (nextPassword.length < 6) {
        throw new AppError(400, "PASSWORD_WEAK", "Password too short");
      }
      user.passwordHash = hashPassword(nextPassword);
    }
    if (body.companyName !== undefined) {
      user.companyName = body.companyName.trim() || undefined;
    }
    // 保存更新
    await ctx.repos.users.upsert(user);
    ctx.auditStore.insertAuditLog({
      id: ctx.clock.generateId(),
      actorUserId: admin.id,
      action: "admin_user_update",
      targetId: user.id,
      createdAt: ctx.clock.now(),
    });
    const credit = await ctx.creditService.ensureAccount(user.id);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      failedAttempts: user.failedAttempts,
      lockUntil: user.lockUntil,
      creditBalance: credit.balance,
      creditExpiresAt: credit.expiresAt,
      companyName: user.companyName,
    };
  });

  // 用户删除 — 级联清理所有关联数据
  app.delete("/admin/users/:userId", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { userId: string };
    const user = await ctx.repos.users.findById(params.userId);
    if (!user) {
      throw new AppError(404, "NOT_FOUND", "User not found");
    }
    if (user.id === admin.id) {
      throw new AppError(400, "SELF_DELETE_FORBIDDEN", "Cannot delete current admin");
    }
    if (user.role === "admin") {
      throw new AppError(400, "ADMIN_DELETE_FORBIDDEN", "Cannot delete admin account");
    }
    await ctx.repos.users.delete(user.id);
    await ctx.repos.users.delete(user.email);
    await ctx.repos.credits.delete(user.id);
    for (const session of await ctx.repos.sessions.findByUserId(user.id)) {
      await ctx.repos.sessions.delete(session.token);
    }
    for (const item of await ctx.repos.projects.list()) {
      if (item.userId === user.id) {
        await ctx.repos.projects.delete(item.id);
      }
    }
    for (const item of await ctx.repos.assets.list()) {
      if (item.userId === user.id) {
        await ctx.repos.assets.delete(item.id);
      }
    }
    for (const item of await ctx.repos.outfitPlans.list()) {
      if (item.userId === user.id) {
        await ctx.repos.outfitPlans.delete(item.id);
      }
    }
    await ctx.repos.scriptData.deleteByUserId(user.id);
    await ctx.repos.asyncJobs.deleteByUserIdAndType(user.id, 'step4_video');
    for (const item of await ctx.repos.reverseTasks.list()) {
      if (item.userId === user.id) {
        await ctx.repos.reverseTasks.delete(item.id);
      }
    }
    for (const item of await ctx.repos.reviewRequests.list()) {
      if (item.userId === user.id) {
        await ctx.repos.reviewRequests.delete(item.id);
      }
    }
    for (const item of await ctx.repos.publicResources.list()) {
      if (item.ownerUserId === user.id) {
        await ctx.repos.publicResources.delete(item.id);
      }
    }
    for (const item of await ctx.repos.garmentAssets.findByUserId(user.id)) {
      await ctx.repos.garmentAssets.hardDelete(item.id);
    }
    for (const item of await ctx.repos.libraryCharacters.list()) {
      if (item.userId === user.id) {
        await ctx.repos.libraryCharacters.delete(item.id);
      }
    }
    // 删除用户的脚本数据（nrm_script_data）— 已通过上方 deleteByUserId 完成

    ctx.auditStore.insertAuditLog({
      id: ctx.clock.generateId(),
      actorUserId: admin.id,
      action: "admin_user_delete",
      targetId: user.id,
      createdAt: ctx.clock.now(),
    });
    return { ok: true };
  });

  app.post("/admin/users/import", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const body = request.body as {
      items?: Array<{ email: string; password: string; role?: "admin" | "user" }>;
    };
    const items = body.items ?? [];
    const created: Array<{ email: string; id: string }> = [];
    const failed: Array<{ email: string; reason: string }> = [];
    for (const item of items) {
      try {
        const user = await ctx.authService.register(item.email, item.password, item.role ?? "user");
        created.push({ email: user.email, id: user.id });
      } catch (error) {
        failed.push({
          email: item.email,
          reason: error instanceof Error ? error.message : "Import failed",
        });
      }
    }
    ctx.auditStore.insertAuditLog({
      id: ctx.clock.generateId(),
      actorUserId: admin.id,
      action: "admin_user_import",
      targetId: String(created.length),
      meta: {
        created: created.length,
        failed: failed.length,
      },
      createdAt: ctx.clock.now(),
    });
    return {
      created,
      failed,
      total: items.length,
    };
  });

  app.get("/admin/users/export", async (request) => {
    const admin = await requireAdmin(ctx, request);
    return {
      users: await ctx.userAdminService.listUsers(admin),
      exportedAt: ctx.clock.now(),
    };
  });

  app.post("/admin/users/:userId/lock", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { userId: string };
    const body = request.body as { locked: boolean };
    return await ctx.userAdminService.setUserLock(admin, params.userId, body.locked);
  });

  app.post("/admin/users/:userId/unlock", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { userId: string };
    return await ctx.userAdminService.setUserLock(admin, params.userId, false);
  });

  app.post("/admin/users/:userId/credits/adjust", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { userId: string };
    const body = request.body as { delta: number; reason?: string };
    return await ctx.userAdminService.adjustCredits(admin, params.userId, body.delta, body.reason ?? "manual_adjust");
  });
}
