/**
 * 错误日志管理后台路由
 * 仅管理员可访问
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { ErrorLogFilters, ErrorSeverity } from "../../contracts/error-log-contract.js";
import { requireAdmin } from "../../services/auth/route-guards.js";

/** 注册错误日志管理路由 */
export async function registerErrorLogRoutes(
  app: FastifyInstance,
  ctx: AppContext
): Promise<void> {
  // 查询错误日志列表（分页）
  app.get("/admin/error-logs", async (request: FastifyRequest<{ Querystring: ErrorLogFilters }>, reply) => {
    await requireAdmin(ctx, request);
    const filters = request.query;
    const items = await ctx.repos.errorLogs.findByFilters(filters);

    reply.send({
      items,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 20,
    });
  });

  // 统计错误数量（按错误码分组）
  app.get("/admin/error-logs/stats/by-code", async (request: FastifyRequest<{ Querystring: { startDate: number; endDate: number; severity?: ErrorSeverity } }>, reply) => {
    await requireAdmin(ctx, request);
    const { startDate, endDate, severity } = request.query;
    const result = await ctx.repos.errorLogs.countByErrorCode(startDate, endDate, severity);
    reply.send(result);
  });

  // 统计错误趋势（按日期分组）
  app.get("/admin/error-logs/stats/by-date", async (request: FastifyRequest<{ Querystring: { startDate: number; endDate: number; severity?: ErrorSeverity } }>, reply) => {
    await requireAdmin(ctx, request);
    const { startDate, endDate, severity } = request.query;
    const result = await ctx.repos.errorLogs.countByDate(startDate, endDate, severity);
    reply.send(result);
  });
}