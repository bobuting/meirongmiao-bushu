/**
 * admin-action-template-routes.ts
 * 动作模板库管理后台 API 路由
 *
 * 端点：
 * - GET    /admin/action-templates          — 查询模板列表（含禁用）
 * - GET    /admin/action-templates/:id      — 查询模板详情
 * - POST   /admin/action-templates          — 新增模板（手动录入 templateId）
 * - POST   /admin/action-templates/generate — 上传视频生成模板（调用阿里云 API）
 * - GET    /admin/action-templates/generate/:taskId — 查询生成任务状态
 * - PUT    /admin/action-templates/:id      — 更新模板信息
 * - DELETE /admin/action-templates/:id      — 删除/禁用模板
 * - GET    /admin/action-templates/stats    — 模板使用统计
 * - POST   /admin/action-templates/upload-thumbnail — 上传缩略图
 * - POST   /admin/action-templates/upload-video     — 上传参考视频（用于生成模板）
 * - POST   /admin/action-templates/upload-preview-video — 上传预览视频
 * - POST   /admin/action-templates/upload-gif       — 上传预览 GIF
 */

import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import type { AppContext } from "../core/app-context.js";
import type { ActionTemplateCategory, ActionTemplateSource } from "../contracts/action-transfer-contract.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { AppError } from "../core/errors.js";
import { requireUser } from "../services/auth/route-guards.js";
import { getLogger } from "../core/logger/index.js";
import { getOssService } from "../service/oss/oss-service.js";
import { resolveRouteProvider } from "../services/llm/provider-resolver.js";
import {
  createAnimateAnyoneTemplateTask,
  queryAnimateAnyoneTemplateTask,
} from "../service/llm/llm-animate-anyone.js";
import {
  queryActionTemplates,
  findActionTemplateById,
  createActionTemplate,
  updateActionTemplate,
  deleteActionTemplate,
  getActionTemplateStats,
} from "../repositories/pg/action-templates-pg-repository.js";

const log = getLogger("admin-action-template-routes");

// OSS 存储路径常量
const ACTION_TEMPLATE_THUMBNAIL_PATH = "action-templates/thumbnails";
const ACTION_TEMPLATE_REFERENCE_VIDEO_PATH = "action-templates/reference-videos";
const ACTION_TEMPLATE_PREVIEW_VIDEO_PATH = "action-templates/preview-videos";
const ACTION_TEMPLATE_GIF_PATH = "action-templates/gifs";

/** 路由依赖 */
export interface AdminActionTemplateRouteDeps {
  ctx: AppContext;
}

/**
 * 注册管理后台模板管理 API 路由
 */
export async function registerAdminActionTemplateRoutes(
  app: FastifyInstance,
  deps: AdminActionTemplateRouteDeps
): Promise<void> {
  const { ctx } = deps;
  const pool = ctx.pool;

  // ===========================================================================
  // GET /admin/action-templates
  // 查询模板列表（管理端，含禁用模板）
  // ===========================================================================
  app.get("/admin/action-templates", async (request, reply) => {
    await requireUser(ctx, request);

    const query = request.query as {
      category?: ActionTemplateCategory;
      source?: ActionTemplateSource;
      isActive?: string;
      sortBy?: "popularity" | "duration_sec" | "created_at";
      sortOrder?: "ASC" | "DESC";
      limit?: number;
      offset?: number;
    };

    const { items, total } = await queryActionTemplates(pool, {
      category: query.category,
      isActive: query.isActive === "true" ? true : query.isActive === "false" ? false : undefined,
      source: query.source,
      sortBy: query.sortBy || "created_at",
      sortOrder: query.sortOrder || "DESC",
      limit: query.limit ? parseInt(String(query.limit), 10) : 100,
      offset: query.offset ? parseInt(String(query.offset), 10) : 0,
    });

    return reply.send({ success: true, data: { items, total } });
  });

  // ===========================================================================
  // GET /admin/action-templates/stats
  // 模板使用统计
  // ===========================================================================
  app.get("/admin/action-templates/stats", async (request, reply) => {
    await requireUser(ctx, request);

    const stats = await getActionTemplateStats(pool);

    return reply.send({
      success: true,
      data: {
        total: stats.total,
        active: stats.active,
        inactive: stats.inactive,
        byCategory: stats.byCategory,
        topTemplates: stats.topTemplates,
      },
    });
  });

  // ===========================================================================
  // GET /admin/action-templates/:id
  // 查询模板详情
  // ===========================================================================
  app.get("/admin/action-templates/:id", async (request, reply) => {
    await requireUser(ctx, request);

    const params = request.params as { id: string };
    const template = await findActionTemplateById(pool, params.id);

    if (!template) {
      throw new AppError(404, "TEMPLATE_NOT_FOUND", "模板不存在");
    }

    return reply.send({ success: true, data: template });
  });

  // ===========================================================================
  // POST /admin/action-templates
  // 新增模板
  // ===========================================================================
  app.post("/admin/action-templates", async (request, reply) => {
    await requireUser(ctx, request);

    const body = request.body as {
      name: string;
      category: ActionTemplateCategory;
      aliTemplateId?: string;
      durationSec: number;
      thumbnailUrl?: string;
      previewVideoUrl?: string;
      previewGifUrl?: string;
      description?: string;
      tags?: string[];
      source?: ActionTemplateSource;
    };

    if (!body.name) {
      throw new AppError(400, "MISSING_NAME", "模板名称不能为空");
    }
    if (!body.category) {
      throw new AppError(400, "MISSING_CATEGORY", "模板分类不能为空");
    }
    if (!body.durationSec || body.durationSec <= 0) {
      throw new AppError(400, "INVALID_DURATION", "模板时长必须大于 0");
    }

    const template = await createActionTemplate(pool, {
      name: body.name,
      category: body.category,
      aliTemplateId: body.aliTemplateId,
      durationSec: body.durationSec,
      thumbnailUrl: body.thumbnailUrl,
      previewVideoUrl: body.previewVideoUrl,
      previewGifUrl: body.previewGifUrl,
      description: body.description,
      tags: body.tags,
      source: body.source || "system",
    }, Date.now());

    log.info({ id: template.id, name: template.name }, "管理员创建模板");

    return reply.send({ success: true, data: template });
  });

  // ===========================================================================
  // POST /admin/action-templates/generate
  // 上传视频生成模板（调用阿里云 animate-anyone-template-gen2 API）
  // ===========================================================================
  app.post("/admin/action-templates/generate", async (request, reply) => {
    await requireUser(ctx, request);

    const body = request.body as {
      videoUrl: string;       // 参考视频 URL（OSS 地址）
      name?: string;          // 模板名称（可选，生成后可补充）
      category?: ActionTemplateCategory;
      description?: string;
      tags?: string[];
    };

    if (!body.videoUrl?.trim()) {
      throw new AppError(400, "MISSING_VIDEO_URL", "参考视频 URL 不能为空");
    }

    try {
      // 解析 Provider 配置（ANIMATE_ANYONE_TEMPLATE）
      const provider = await resolveRouteProvider(
        ctx,
        ProviderRouteKeys.ANIMATE_ANYONE_TEMPLATE
      );

      if (!provider) {
        throw new AppError(500, "PROVIDER_NOT_FOUND", "未找到 ANIMATE_ANYONE_TEMPLATE Provider 配置");
      }

      // 调用阿里云 API 创建模板生成任务
      const taskResult = await createAnimateAnyoneTemplateTask(provider, body.videoUrl);

      log.info({ taskId: taskResult.taskId, videoUrl: body.videoUrl }, "模板生成任务已创建");

      return reply.send({
        success: true,
        data: {
          taskId: taskResult.taskId,
          queryUrl: taskResult.queryUrl,
          status: "pending",
          message: "模板生成任务已创建，请轮询查询状态",
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        // AppError 也要记录日志（阿里云 API 返回的错误）
        log.error({
          err: error,
          statusCode: error.statusCode,
          errorCode: error.code,
          videoUrl: body.videoUrl
        }, "创建模板生成任务失败（AppError）");
        throw error;
      }
      log.error({ err: error, videoUrl: body.videoUrl }, "创建模板生成任务失败");
      return reply.code(500).send({ success: false, message: "创建模板生成任务失败" });
    }
  });

  // ===========================================================================
  // GET /admin/action-templates/generate/:taskId
  // 查询模板生成任务状态
  // ===========================================================================
  app.get("/admin/action-templates/generate/:taskId", async (request, reply) => {
    await requireUser(ctx, request);

    const params = request.params as { taskId: string };
    const query = request.query as {
      name?: string;          // 任务成功后创建模板时使用的名称
      category?: ActionTemplateCategory;
      description?: string;
      tags?: string;          // 逗号分隔
      thumbnailUrl?: string;
      previewVideoUrl?: string;
      previewGifUrl?: string;
    };

    if (!params.taskId?.trim()) {
      throw new AppError(400, "MISSING_TASK_ID", "taskId 不能为空");
    }

    try {
      // 解析 Provider 配置
      const provider = await resolveRouteProvider(
        ctx,
        ProviderRouteKeys.ANIMATE_ANYONE_TEMPLATE
      );

      if (!provider) {
        throw new AppError(500, "PROVIDER_NOT_FOUND", "未找到 ANIMATE_ANYONE_TEMPLATE Provider 配置");
      }

      // 查询任务状态
      const statusResult = await queryAnimateAnyoneTemplateTask(provider, params.taskId);

      // 如果任务成功且返回了 templateId，自动创建数据库记录
      if (statusResult.status === "succeeded" && statusResult.templateId) {
        // 检查是否已存在（防止重复创建）
        const existingTemplate = await findActionTemplateById(pool, statusResult.templateId);
        if (existingTemplate) {
          return reply.send({
            success: true,
            data: {
              status: "succeeded",
              templateId: statusResult.templateId,
              duration: statusResult.duration,
              template: existingTemplate,
            },
          });
        }

        // 创建数据库记录
        const templateName = query.name || `动作模板-${statusResult.templateId.slice(0, 8)}`;
        const template = await createActionTemplate(pool, {
          name: templateName,
          category: query.category || "daily",
          aliTemplateId: statusResult.templateId,
          durationSec: statusResult.duration || 10,
          thumbnailUrl: query.thumbnailUrl,
          previewVideoUrl: query.previewVideoUrl,
          previewGifUrl: query.previewGifUrl,
          description: query.description,
          tags: query.tags ? query.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
          source: "official",
        }, Date.now());

        log.info({ templateId: statusResult.templateId, taskId: params.taskId }, "模板生成成功，数据库记录已创建");

        return reply.send({
          success: true,
          data: {
            status: "succeeded",
            templateId: statusResult.templateId,
            duration: statusResult.duration,
            template,
          },
        });
      }

      // 任务失败
      if (statusResult.status === "failed") {
        return reply.send({
          success: false,
          data: {
            status: "failed",
            error: statusResult.error,
          },
        });
      }

      // 任务仍在进行中
      return reply.send({
        success: true,
        data: {
          status: "pending",
          taskId: params.taskId,
          message: "任务仍在进行中，请稍后查询",
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        // AppError 也要记录日志
        log.error({
          err: error,
          statusCode: error.statusCode,
          errorCode: error.code,
          taskId: params.taskId
        }, "查询模板生成任务失败（AppError）");
        throw error;
      }
      log.error({ err: error, taskId: params.taskId }, "查询模板生成任务失败");
      return reply.code(500).send({ success: false, message: "查询模板生成任务失败" });
    }
  });

  // ===========================================================================
  // PUT /admin/action-templates/:id
  // 更新模板信息
  // ===========================================================================
  app.put("/admin/action-templates/:id", async (request, reply) => {
    await requireUser(ctx, request);

    const params = request.params as { id: string };
    const body = request.body as {
      name?: string;
      category?: ActionTemplateCategory;
      thumbnailUrl?: string;
      previewVideoUrl?: string;
      previewGifUrl?: string;
      description?: string;
      tags?: string[];
      isActive?: boolean;
    };

    const template = await updateActionTemplate(pool, params.id, body, Date.now());

    if (!template) {
      throw new AppError(404, "TEMPLATE_NOT_FOUND", "模板不存在");
    }

    log.info({ id: params.id }, "管理员更新模板");

    return reply.send({ success: true, data: template });
  });

  // ===========================================================================
  // DELETE /admin/action-templates/:id
  // 删除模板（物理删除）
  // ===========================================================================
  app.delete("/admin/action-templates/:id", async (request, reply) => {
    await requireUser(ctx, request);

    const params = request.params as { id: string };
    const deleted = await deleteActionTemplate(pool, params.id);

    if (!deleted) {
      throw new AppError(404, "TEMPLATE_NOT_FOUND", "模板不存在");
    }

    log.info({ id: params.id }, "管理员删除模板");

    return reply.send({ success: true, data: { id: params.id, deleted: true } });
  });

  // ===========================================================================
  // POST /admin/action-templates/upload-thumbnail
  // 上传缩略图
  // ===========================================================================
  app.post("/admin/action-templates/upload-thumbnail", async (request, reply) => {
    await requireUser(ctx, request);

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ success: false, message: "未上传文件" });
    }

    try {
      const file = data as MultipartFile;
      const ext = file.filename.split('.').pop() || 'jpg';
      const fileName = `${randomUUID()}.${ext}`;
      const key = `${ACTION_TEMPLATE_THUMBNAIL_PATH}/${fileName}`;

      const buffer = await file.toBuffer();

      if (!ctx.storage) {
        return reply.code(500).send({ success: false, message: "存储服务未初始化" });
      }

      const ossService = getOssService(ctx.storage);
      const result = await ossService.upload(key, buffer, 'image/jpeg');

      if (!result.success) {
        return reply.code(500).send({ success: false, message: result.message || "上传失败" });
      }

      return reply.send({
        success: true,
        data: { fileName, url: result.url },
      });
    } catch (error) {
      log.error({ err: error }, "上传缩略图失败");
      return reply.code(500).send({ success: false, message: "上传缩略图失败" });
    }
  });

  // ===========================================================================
  // POST /admin/action-templates/upload-video
  // 上传参考视频（用于生成模板）
  // ===========================================================================
  app.post("/admin/action-templates/upload-video", async (request, reply) => {
    await requireUser(ctx, request);

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ success: false, message: "未上传文件" });
    }

    try {
      const file = data as MultipartFile;
      const ext = file.filename.split('.').pop() || 'mp4';
      const fileName = `${randomUUID()}.${ext}`;
      const key = `${ACTION_TEMPLATE_REFERENCE_VIDEO_PATH}/${fileName}`;

      const buffer = await file.toBuffer();

      if (!ctx.storage) {
        return reply.code(500).send({ success: false, message: "存储服务未初始化" });
      }

      const ossService = getOssService(ctx.storage);
      const result = await ossService.upload(key, buffer, 'video/mp4');

      if (!result.success) {
        return reply.code(500).send({ success: false, message: result.message || "上传失败" });
      }

      return reply.send({
        success: true,
        data: { fileName, url: result.url },
      });
    } catch (error) {
      log.error({ err: error }, "上传参考视频失败");
      return reply.code(500).send({ success: false, message: "上传参考视频失败" });
    }
  });

  // ===========================================================================
  // POST /admin/action-templates/upload-preview-video
  // 上传预览视频（展示效果用）
  // ===========================================================================
  app.post("/admin/action-templates/upload-preview-video", async (request, reply) => {
    await requireUser(ctx, request);

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ success: false, message: "未上传文件" });
    }

    try {
      const file = data as MultipartFile;
      const ext = file.filename.split('.').pop() || 'mp4';
      const fileName = `${randomUUID()}.${ext}`;
      const key = `${ACTION_TEMPLATE_PREVIEW_VIDEO_PATH}/${fileName}`;

      const buffer = await file.toBuffer();

      if (!ctx.storage) {
        return reply.code(500).send({ success: false, message: "存储服务未初始化" });
      }

      const ossService = getOssService(ctx.storage);
      const result = await ossService.upload(key, buffer, 'video/mp4');

      if (!result.success) {
        return reply.code(500).send({ success: false, message: result.message || "上传失败" });
      }

      return reply.send({
        success: true,
        data: { fileName, url: result.url },
      });
    } catch (error) {
      log.error({ err: error }, "上传预览视频失败");
      return reply.code(500).send({ success: false, message: "上传预览视频失败" });
    }
  });

  // ===========================================================================
  // POST /admin/action-templates/upload-gif
  // 上传预览 GIF
  // ===========================================================================
  app.post("/admin/action-templates/upload-gif", async (request, reply) => {
    await requireUser(ctx, request);

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ success: false, message: "未上传文件" });
    }

    try {
      const file = data as MultipartFile;
      const ext = file.filename.split('.').pop() || 'gif';
      const fileName = `${randomUUID()}.${ext}`;
      const key = `${ACTION_TEMPLATE_GIF_PATH}/${fileName}`;

      const buffer = await file.toBuffer();

      if (!ctx.storage) {
        return reply.code(500).send({ success: false, message: "存储服务未初始化" });
      }

      const ossService = getOssService(ctx.storage);
      const result = await ossService.upload(key, buffer, 'image/gif');

      if (!result.success) {
        return reply.code(500).send({ success: false, message: result.message || "上传失败" });
      }

      return reply.send({
        success: true,
        data: { fileName, url: result.url },
      });
    } catch (error) {
      log.error({ err: error }, "上传预览 GIF 失败");
      return reply.code(500).send({ success: false, message: "上传预览 GIF 失败" });
    }
  });

  log.info("管理后台模板管理 API 路由已注册");
}