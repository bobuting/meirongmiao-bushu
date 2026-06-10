/**
 * admin/credit-audits-route.ts
 * 积分审计日志查询路由
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { AdminRouteDeps } from "./types.js";

import { requireAdmin } from "../../services/auth/route-guards.js";

/**
 * 注册 /admin/credit-audits 路由
 */
export function registerAdminCreditAuditsRoute(app: FastifyInstance, ctx: AppContext, _deps: AdminRouteDeps): void {
  app.get("/admin/credit-audits", async (request) => {
    await requireAdmin(ctx, request);
    const query = (request.query as { limit?: string; offset?: string; userEmail?: string; projectId?: string; activity?: string } | undefined) ?? {};
    const rawLimit = Number(query.limit ?? 50);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.floor(rawLimit))) : 50;
    const rawOffset = Number(query.offset ?? 0);
    const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
    const filterUserEmail = query.userEmail?.trim() || undefined;
    const filterProjectId = query.projectId?.trim() || undefined;
    const filterActivity = query.activity?.trim() || undefined;

    const allLogs = await ctx.auditStore.queryAuditLogs();
    let filtered = allLogs
      .filter((log) => log.action === "credit_spent_by_user" || log.action === "credit_adjusted_by_admin");

    // 按 userEmail 过滤（批量查用户表匹配）
    if (filterUserEmail) {
      const emailLower = filterUserEmail.toLowerCase();
      const uniqueTargetIds = [...new Set(filtered.map((log) => log.targetId))];
      const matchedUserIds = new Set<string>();
      for (const tid of uniqueTargetIds) {
        const user = await ctx.repos.users.findById(tid);
        if (user?.email.toLowerCase().includes(emailLower)) {
          matchedUserIds.add(tid);
        }
      }
      filtered = filtered.filter((log) => matchedUserIds.has(log.targetId));
    }

    // 按 projectId 过滤（meta_json 中存储）
    if (filterProjectId) {
      filtered = filtered.filter((log) => {
        const pid = log.meta?.projectId;
        return typeof pid === "string" && pid === filterProjectId;
      });
    }

    // 按 activity 过滤（routeKey 或 reason）
    if (filterActivity) {
      const actLower = filterActivity.toLowerCase();
      filtered = filtered.filter((log) => {
        const rk = typeof log.meta?.routeKey === "string" ? log.meta.routeKey as string : "";
        const rs = typeof log.meta?.reason === "string" ? log.meta.reason as string : "";
        return rk.toLowerCase().includes(actLower) || rs.toLowerCase().includes(actLower);
      });
    }

    filtered.sort((a, b) => b.createdAt - a.createdAt);
    const total = filtered.length;
    const items = await Promise.all(filtered
      .slice(offset, offset + limit)
      .map(async (log) => {
        const targetUser = await ctx.repos.users.findById(log.targetId);
        const actorUser = await ctx.repos.users.findById(log.actorUserId);
        const amountRaw = Number(log.meta?.amount ?? 0);
        const deltaRaw = Number(log.meta?.delta ?? 0);
        const spentByUser = Number.isFinite(amountRaw) ? Math.max(0, Math.floor(amountRaw)) : 0;
        const adminAdjustedDelta = Number.isFinite(deltaRaw) ? Math.floor(deltaRaw) : 0;
        const chargeAmount =
          log.action === "credit_spent_by_user" ? spentByUser : Math.max(0, -adminAdjustedDelta);
        const routeKey = typeof log.meta?.routeKey === "string" && log.meta.routeKey.trim().length > 0
            ? log.meta.routeKey.trim()
            : null;
        const activity = log.action === "credit_adjusted_by_admin"
          ? (typeof log.meta?.reason === "string" && log.meta.reason.trim().length > 0 ? log.meta.reason.trim() : null)
          : routeKey;
        const label = log.action === "credit_spent_by_user" ? "用户消费" : "管理员调账";
        const projectId = typeof log.meta?.projectId === "string" ? log.meta.projectId : null;
        return {
          id: log.id,
          label,
          userId: log.targetId,
          userEmail: targetUser?.email ?? "unknown",
          actorUserId: log.actorUserId,
          actorEmail: actorUser?.email ?? "unknown",
          createdAt: log.createdAt,
          activity,
          success: true,
          chargeAmount,
          delta: log.action === "credit_adjusted_by_admin" ? adminAdjustedDelta : -chargeAmount,
          projectId,
        };
      }));
    return { items, total };
  });
}
