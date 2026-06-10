/**
 * 广场审核管理路由
 * 管理员审核发布请求 API
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { requireAdmin } from "../services/auth/route-guards.js";
import { PublishService } from "../service/publish-service.js";
import { AppError } from "../core/errors.js";
import type { PublishRequestStatus } from "../repositories/pg/square-publish-request-pg-repository.js";
import { getLogger } from "../core/logger/index.js";
const log = getLogger("square-admin-routes");

// ============================================================================
// 类型定义
// ============================================================================

/** 待审核列表查询参数 */
interface GetPublishRequestsQuery {
  status?: PublishRequestStatus;
  page?: number;
  pageSize?: number;
}

/** 待审核列表响应 */
interface GetPublishRequestsResponse {
  success: boolean;
  data: Array<{
    id: string;
    userId: string;
    projectId: string;
    status: PublishRequestStatus;
    rejectReason: string | null;
    reviewerId: string | null;
    reviewedAt: number | null;
    createdAt: number;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/** 审核通过响应 */
interface ApproveResponse {
  success: boolean;
  workId: string | null;
}

/** 审核拒绝请求体 */
interface RejectRequestBody {
  reason?: string;
}

/** 审核拒绝响应 */
interface RejectResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// 路由注册
// ============================================================================

/**
 * 注册广场审核管理路由
 */
export function registerSquareAdminRoutes(app: FastifyInstance, ctx: AppContext): void {
  // 创建服务实例
  const publishService = new PublishService(ctx.pool);

  // ============================================================================
  // GET /admin/square/publish-requests - 获取待审核列表
  // ============================================================================

  app.get<{ Querystring: GetPublishRequestsQuery; Reply: GetPublishRequestsResponse }>(
    "/admin/square/publish-requests",
    async (request, reply) => {
      // 验证管理员权限
      await requireAdmin(ctx, request);

      // 解析查询参数
      const query = request.query;
      const status = query.status || "pending";
      const page = Math.max(1, query.page || 1);
      const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));

      // 获取待审核列表
      try {
        const result = await publishService.getPendingRequests({
          status,
          page,
          pageSize,
        });

        return reply.send({
          success: true,
          data: result.data,
          pagination: {
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
            totalPages: result.totalPages,
          },
        });
      } catch (error) {
        log.error({ err: error }, "admin/square/publish-requests 获取列表失败");
        return reply.code(500).send({
          success: false,
          data: [],
          pagination: { page, pageSize, total: 0, totalPages: 0 },
        });
      }
    }
  );

  // ============================================================================
  // POST /admin/square/publish-requests/:id/approve - 审核通过
  // ============================================================================

  app.post<{ Params: { id: string }; Reply: ApproveResponse }>(
    "/admin/square/publish-requests/:id/approve",
    async (request, reply) => {
      // 验证管理员权限
      const admin = await requireAdmin(ctx, request);
      const requestId = request.params.id;

      // 参数校验
      if (!requestId) {
        return reply.code(400).send({
          success: false,
          workId: null,
        });
      }

      // 审核通过
      try {
        const result = await publishService.approvePublishRequest(requestId, admin.id);
        return reply.send(result);
      } catch (error) {
        log.error({ err: error }, "admin/square/publish-requests/approve 审核失败");
        if (error instanceof AppError) {
          return reply.code(error.statusCode).send({
            success: false,
            workId: null,
          });
        }
        if (error instanceof Error && error.name === "PublishServiceError") {
          return reply.code(400).send({
            success: false,
            workId: null,
          });
        }
        return reply.code(500).send({
          success: false,
          workId: null,
        });
      }
    }
  );

  // ============================================================================
  // POST /admin/square/publish-requests/:id/reject - 审核拒绝
  // ============================================================================

  app.post<{ Params: { id: string }; Body: RejectRequestBody; Reply: RejectResponse }>(
    "/admin/square/publish-requests/:id/reject",
    async (request, reply) => {
      // 验证管理员权限
      const admin = await requireAdmin(ctx, request);
      const requestId = request.params.id;
      const reason = request.body?.reason?.trim() || undefined;

      // 参数校验
      if (!requestId) {
        return reply.code(400).send({
          success: false,
          message: "缺少请求ID",
        });
      }

      // 审核拒绝
      try {
        await publishService.rejectPublishRequest({
          requestId,
          reviewerId: admin.id,
          reason,
        });

        return reply.send({
          success: true,
          message: "已拒绝发布请求",
        });
      } catch (error) {
        log.error({ err: error }, "admin/square/publish-requests/reject 审核失败");
        if (error instanceof AppError) {
          return reply.code(error.statusCode).send({
            success: false,
            message: error.message,
          });
        }
        if (error instanceof Error && error.name === "PublishServiceError") {
          return reply.code(400).send({
            success: false,
            message: error.message,
          });
        }
        return reply.code(500).send({
          success: false,
          message: "服务器内部错误",
        });
      }
    }
  );
}
