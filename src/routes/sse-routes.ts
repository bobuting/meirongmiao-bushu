/**
 * SSE 路由
 *
 * 提供：
 * 1. GET /async-jobs/sse - SSE 连接端点
 * 2. GET /async-jobs/sse/stats - Admin 统计接口
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { requireAdmin, requireUser } from "../services/auth/route-guards.js";
import { sseManager } from "../modules/sse-manager.js";
import { getUserAsyncJobs } from "../service/async-job-service.js";

/**
 * 注册 SSE 路由
 */
export function registerSSERoutes(app: FastifyInstance, ctx: AppContext): void {
  // ============================================================================
  // GET /async-jobs/sse — SSE 连接端点
  // ============================================================================
  app.get("/async-jobs/sse", async (request, reply) => {
    // 支持两种认证方式：
    // 1. Authorization header（优先）
    // 2. query parameter: ?token=xxx（用于 EventSource，无法设置 header）
    const authHeader = request.headers.authorization;
    const queryToken = (request.query as { token?: string }).token;
    const token = authHeader?.replace(/^Bearer\s+/i, "") || queryToken;

    if (!token) {
      reply.code(401).send({ error: "Unauthorized", message: "缺少认证信息" });
      return;
    }

    try {
      const user = await ctx.authService.requireUser(token);

      // 设置 SSE 响应头
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // 注册连接
      sseManager.register(user.id, reply);

      // 发送初始任务列表
      try {
        const jobs = await getUserAsyncJobs(ctx.repos, user.id, 50);
        const initialData = `event: initial\ndata: ${JSON.stringify({ jobs })}\n\n`;
        reply.raw.write(initialData);
      } catch (err) {
        app.log.error({ err, userId: user.id }, "发送初始任务列表失败");
      }

      // 保持连接打开（不调用 reply.send()）
      return reply;
    } catch (err) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }
  });

  // ============================================================================
  // GET /async-jobs/sse/stats — SSE 连接统计（Admin 用）
  // ============================================================================
  app.get("/async-jobs/sse/stats", async (request) => {
    await requireAdmin(ctx, request);
    return sseManager.getStats();
  });
}
