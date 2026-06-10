/**
 * 广场发布路由
 * 用户作品发布申请 API
 *
 * 流程：用户点击"发布作品" → 直接创建 square_templates 记录（review_status='pending'）
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { requireUser } from "../services/auth/route-guards.js";
import { AppError } from "../core/errors.js";
import { SquareTemplateService } from "../service/square-template-db-service.js";
import { PgAssetRepository } from "../repositories/pg/asset-pg-repository.js";
import type { SquarePublishCategory } from "../contracts/square-publish-category.js";
import { isSquarePublishCategory } from "../contracts/square-publish-category.js";
import { getLogger } from "../core/logger/index.js";
const log = getLogger("square-publish-routes");

// ============================================================================
// 类型定义
// ============================================================================

/** nrm_projects 表简化投影（仅发布所需字段） */
interface ProjectSummary {
  id: string;
  userId: string;
  name: string;
  coverImageUrl: string | null;
  exportUrl: string | null;
  activeScriptId: string | null;  // 当前锁定的脚本ID
}

// ============================================================================
// 类型定义
// ============================================================================

/** 发布请求体 */
interface PublishRequestBody {
  projectId: string;
  /** 服装分类：男装/女装/男童装/女童装 */
  squarePublishCategory?: string | null;
}

/** 发布请求响应 */
interface PublishResponse {
  success: boolean;
  message: string;
  requestId: string | null;
}

/** 发布状态记录 */
interface PublishStatusRecord {
  id: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  rejectReason: string | null;
  createdAt: number;
  reviewedAt: number | null;
}

/** 发布状态查询响应 */
interface PublishStatusResponse {
  success: boolean;
  message: string;
  records: PublishStatusRecord[];
}

// ============================================================================
// 路由注册
// ============================================================================

/**
 * 注册广场发布路由
 */
export function registerSquarePublishRoutes(app: FastifyInstance, ctx: AppContext): void {
  // 创建服务实例
  const templateService = new SquareTemplateService(ctx.repos.squareTemplates);
  const assetRepo = new PgAssetRepository(ctx.pool);

  // ============================================================================
  // POST /square/publish - 创建发布请求
  // ============================================================================

  app.post<{ Body: PublishRequestBody; Reply: PublishResponse }>(
    "/square/publish",
    async (request, reply) => {
      // 验证用户登录
      const user = await requireUser(ctx, request);
      const body = request.body;

      // 参数校验
      if (!body.projectId) {
        return reply.code(400).send({
          success: false,
          message: "缺少项目ID",
          requestId: null,
        });
      }

      try {
        // 1. 检查项目是否存在（直接查 nrm_projects，包含锁定的脚本ID）
        const project = await ctx.repos.projects.findPublishSummaryById(body.projectId);

        if (!project) {
          return reply.code(404).send({
            success: false,
            message: "项目不存在",
            requestId: null,
          });
        }

        // 2. 检查项目归属
        if (project.userId !== user.id) {
          return reply.code(403).send({
            success: false,
            message: "无权发布此项目",
            requestId: null,
          });
        }

        // 3. 检查是否已有导出视频
        if (!project.exportUrl) {
          return reply.code(400).send({
            success: false,
            message: "项目尚未完成视频生成，无法发布",
            requestId: null,
          });
        }

        // 4. 检查是否已有未处理的发布记录（pending 或 approved 都不可重复发布）
        const existingRecords = await ctx.repos.squareTemplates.findActiveByProject(body.projectId);
        if (existingRecords.length > 0) {
          const status = existingRecords[0].reviewStatus;
          const message = status === 'pending'
            ? "该项目已有待处理的发布请求，请等待审核"
            : "该项目已发布上线，不可重复发布";
          return reply.code(400).send({
            success: false,
            message,
            requestId: null,
          });
        }

        // 5. 获取服装分类（优先使用前端传递的分类，其次回退到项目资产）
        let category: SquarePublishCategory = "女装"; // 默认分类

        // 优先使用前端传递的分类
        if (body.squarePublishCategory && isSquarePublishCategory(body.squarePublishCategory)) {
          category = body.squarePublishCategory;
        } else {
          // 回退：从项目资产获取分类（兼容旧版本）
          const assets = await assetRepo.findByProjectId(body.projectId);
          for (const asset of assets) {
            if (asset.apparelCategory) {
              category = asset.apparelCategory;
              break;
            }
          }
        }

        // 6. 获取脚本信息（优先使用项目锁定的脚本ID）
        let scriptId: string | null = null;
        let scriptTitle = "";

        if (project.activeScriptId) {
          // 直接查询锁定的脚本
          const scriptRow = await ctx.repos.scriptData.findIdAndTitleById(project.activeScriptId);
          if (scriptRow) {
            scriptId = scriptRow.id;
            scriptTitle = scriptRow.title?.trim() ?? "";
          }
        } else {
          // 回退：查询已确认的脚本（兼容旧数据）
          const scriptRow = await ctx.repos.scriptData.findConfirmedIdAndTitleByProject(body.projectId);
          if (scriptRow) {
            scriptId = scriptRow.id;
            scriptTitle = scriptRow.title?.trim() ?? "";
          }
        }

        // 7. 创建待审核模板
        const template = await templateService.createFromPublish({
          title: scriptTitle || project.name,
          category,
          author: project.name || '未知',
          coverUrl: project.coverImageUrl || '',
          videoUrl: project.exportUrl,
          projectId: body.projectId,
          creatorId: user.id,
          scriptDataId: scriptId,  // 关联锁定的脚本ID
        });

        return reply.send({
          success: true,
          message: "已提交发布申请，等待审核",
          requestId: template.id,
        });
      } catch (error) {
        log.error({ err: error }, "square/publish 创建发布请求失败");
        if (error instanceof AppError) {
          return reply.code(error.statusCode).send({
            success: false,
            message: error.message,
            requestId: null,
          });
        }
        return reply.code(500).send({
          success: false,
          message: "服务器内部错误",
          requestId: null,
        });
      }
    }
  );

  // ============================================================================
  // GET /square/publish-status - 查询项目的发布状态
  // ============================================================================

  app.get<{ Querystring: { projectId: string }; Reply: PublishStatusResponse }>(
    "/square/publish-status",
    async (request, reply) => {
      const user = await requireUser(ctx, request);
      const { projectId } = request.query;

      if (!projectId) {
        return reply.code(400).send({
          success: false,
          message: "缺少项目ID",
          records: [],
        });
      }

      try {
        // 查询该项目在 square_templates 中的所有记录
        const statusRows = await ctx.repos.squareTemplates.findPublishStatusByProject(projectId, user.id);

        const records: PublishStatusRecord[] = statusRows.map((row) => ({
          id: row.id,
          reviewStatus: row.reviewStatus as 'pending' | 'approved' | 'rejected',
          rejectReason: row.rejectReason,
          createdAt: row.createdAt,
          reviewedAt: row.reviewedAt,
        }));

        return reply.send({
          success: true,
          message: records.length > 0
            ? "该项目已有发布记录"
            : "该项目尚未发布",
          records,
        });
      } catch (error) {
        log.error({ err: error }, "square/publish-status 查询发布状态失败");
        return reply.code(500).send({
          success: false,
          message: "查询发布状态失败",
          records: [],
        });
      }
    },
  );
}
