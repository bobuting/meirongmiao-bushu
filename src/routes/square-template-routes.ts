/**
 * 创作广场模板路由
 * 提供模板的 CRUD 操作和文件上传功能
 */

import type { FastifyInstance, RouteHandlerMethod } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import type { ReviewStatus } from "../service/square-template-db-service.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { User } from "../contracts/types.js";
import type { AppContext } from "../core/app-context.js";
import { getOssService } from "../service/oss/oss-service.js";
import { SQUARE_TEMPLATE_COVER_PATH, SQUARE_TEMPLATE_VIDEO_PATH } from "../contant-config/square-template-paths.js";
import { SquareTemplateService } from "../service/square-template-db-service.js";
import { getScriptsDataDbService } from "../service/scripts-data-db-service.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("square-template-routes");

/**
 * 获取模板配置
 */
export interface SquareTemplateConfig {
  /** 封面保存目录 */
  coverPath: string;
  /** 封面URL地址 */
  coverUrl: string;
  /** 视频保存目录 */
  videoPath: string;
  /** 视频URL地址 */
  videoUrl: string;
}

const DEFAULT_COVER_PATH = "D:\\Users\\Administrator\\ai\\square-template-covers";
const DEFAULT_COVER_URL = "http://localhost:3021/square-template-covers";
const DEFAULT_VIDEO_PATH = "D:\\Users\\Administrator\\ai\\square-template-videos";
const DEFAULT_VIDEO_URL = "http://localhost:3021/square-template-videos";

export function getSquareTemplateConfig(): SquareTemplateConfig {
  return {
    coverPath: process.env.SQUARE_TEMPLATE_COVER_PATH || DEFAULT_COVER_PATH,
    coverUrl: process.env.SQUARE_TEMPLATE_COVER_URL || DEFAULT_COVER_URL,
    videoPath: process.env.SQUARE_TEMPLATE_VIDEO_PATH || DEFAULT_VIDEO_PATH,
    videoUrl: process.env.SQUARE_TEMPLATE_VIDEO_URL || DEFAULT_VIDEO_URL,
  };
}

/**
 * 创作广场模板路由处理器接口
 */
export interface SquareTemplateRouteHandlers {
  readonly listEnabledTemplates: RouteHandlerMethod;
  readonly listTemplates: RouteHandlerMethod;
  readonly getTemplate: RouteHandlerMethod;
  readonly createTemplate: RouteHandlerMethod;
  readonly updateTemplate: RouteHandlerMethod;
  readonly deleteTemplate: RouteHandlerMethod;
  readonly uploadCover: RouteHandlerMethod;
  readonly uploadVideo: RouteHandlerMethod;
  readonly getTemplateScript: RouteHandlerMethod;    // 获取模板关联脚本
  readonly linkTemplateScript: RouteHandlerMethod;   // 关联脚本到模板
  readonly reviewTemplate: RouteHandlerMethod;       // 审核模板
  readonly batchReviewTemplates: RouteHandlerMethod; // 批量审核模板
}

/**
 * 注册创作广场模板路由
 */
export function registerSquareTemplateRoutes(
  app: FastifyInstance,
  handlers: SquareTemplateRouteHandlers,
): void {
  // 获取启用的模板列表（前端展示用）
  app.get("/square-templates", handlers.listEnabledTemplates);

  // 分页查询模板列表（后台管理用）
  app.get("/admin/square-templates", handlers.listTemplates);

  // 获取单个模板详情
  app.get("/admin/square-templates/:id", handlers.getTemplate);

  // 创建模板
  app.post("/admin/square-templates", handlers.createTemplate);

  // 更新模板
  app.put("/admin/square-templates/:id", handlers.updateTemplate);

  // 删除模板
  app.delete("/admin/square-templates/:id", handlers.deleteTemplate);

  // 审核模板
  app.post("/admin/square-templates/:id/review", handlers.reviewTemplate);

  // 批量审核模板
  app.post("/admin/square-templates/batch-review", handlers.batchReviewTemplates);

  // 上传封面图片
  app.post("/admin/square-templates/upload-cover", handlers.uploadCover);

  // 上传视频
  app.post("/admin/square-templates/upload-video", handlers.uploadVideo);

  // 获取模板关联的脚本详情
  app.get("/square-templates/:id/script", handlers.getTemplateScript);

  // 关联脚本到模板
  app.post("/square-templates/:id/link-script", handlers.linkTemplateScript);
}

/**
 * 注册创作广场模板静态文件服务
 */
export function registerSquareTemplateStaticFiles(app: FastifyInstance): void {
  const config = getSquareTemplateConfig();

  // 封面图片静态服务
  app.get("/square-template-covers/:filename", async (request, reply) => {
    const params = request.params as { filename: string };
    const filePath = join(config.coverPath, params.filename);
    const resolvedPath = resolve(filePath);

    // 安全检查：确保路径在允许的目录内
    if (!resolvedPath.startsWith(resolve(config.coverPath))) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    // 检查文件是否存在
    if (!existsSync(resolvedPath)) {
      return reply.code(404).send({ error: "Not found" });
    }

    try {
      const fileBuffer = await readFile(resolvedPath);
      const ext = extname(params.filename).toLowerCase();

      // 设置正确的 Content-Type
      const contentTypes: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
      };

      const contentType = contentTypes[ext] || "application/octet-stream";
      reply.header("Content-Type", contentType);
      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Cache-Control", "public, max-age=31536000");

      return reply.send(fileBuffer);
    } catch (error) {
      log.error({ err: error }, "模板封面文件读取失败");
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // 视频静态服务
  app.get("/square-template-videos/:filename", async (request, reply) => {
    const params = request.params as { filename: string };
    const filePath = join(config.videoPath, params.filename);
    const resolvedPath = resolve(filePath);

    // 安全检查：确保路径在允许的目录内
    if (!resolvedPath.startsWith(resolve(config.videoPath))) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    // 检查文件是否存在
    if (!existsSync(resolvedPath)) {
      return reply.code(404).send({ error: "Not found" });
    }

    try {
      const fileBuffer = await readFile(resolvedPath);
      const ext = extname(params.filename).toLowerCase();

      // 设置正确的 Content-Type
      const contentTypes: Record<string, string> = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
      };

      const contentType = contentTypes[ext] || "application/octet-stream";
      reply.header("Content-Type", contentType);
      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Accept-Ranges", "bytes");
      reply.header("Cache-Control", "public, max-age=31536000");

      return reply.send(fileBuffer);
    } catch (error) {
      log.error({ err: error }, "模板视频文件读取失败");
      return reply.code(500).send({ error: "Internal server error" });
    }
  });
}

/**
 * 创建创作广场模板路由处理器
 */
export function createSquareTemplateRouteHandlersWithContext(
  ctx: AppContext,
  requireUser: (ctx: AppContext, request: Parameters<RouteHandlerMethod>[0]) => Promise<User>,
): SquareTemplateRouteHandlers {
  // 从 ctx.repos 创建 Service 实例
  const templateService = new SquareTemplateService(ctx.repos.squareTemplates);

  return {
    /**
     * 获取启用的模板列表（前端展示用）
     */
    listEnabledTemplates: async (_request, reply) => {
      try {
        const templates = await templateService.listEnabled();

        return reply.send({
          success: true,
          data: templates,
        });
      } catch (error) {
        log.error({ err: error }, "listEnabledTemplates 查询失败");
        return reply.code(500).send({
          success: false,
          message: '获取模板列表失败',
          data: [],
        });
      }
    },

    /**
     * 分页查询模板列表（后台管理用）
     */
    listTemplates: async (request, reply) => {
      await requireUser(ctx, request);
      const query = request.query as {
        page?: string;
        pageSize?: string;
        search?: string;
        category?: string;
        reviewStatus?: string;
      };

      const page = parseInt(query.page || "1", 10);
      const pageSize = parseInt(query.pageSize || "20", 10);
      const search = query.search?.trim() || "";
      const categoryFilter = query.category?.trim() || "";
      const reviewStatusFilter = (query.reviewStatus || "") as ReviewStatus;

      try {
        const result = await templateService.listPaginated(page, pageSize, search, categoryFilter, reviewStatusFilter || undefined);

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
        log.error({ err: error }, "listTemplates 查询失败");
        return reply.code(500).send({
          success: false,
          message: '获取模板列表失败',
          data: [],
          pagination: { page, pageSize, total: 0, totalPages: 0 },
        });
      }
    },

    /**
     * 获取单个模板详情
     */
    getTemplate: async (request, reply) => {
      await requireUser(ctx, request);
      const params = request.params as { id: string };

      try {
        const template = await templateService.getById(params.id);

        if (!template) {
          return reply.code(404).send({ success: false, message: "Template not found" });
        }

        return reply.send({ success: true, data: template });
      } catch (error) {
        log.error({ err: error }, "getTemplate 查询失败");
        return reply.code(500).send({ success: false, message: "获取模板详情失败" });
      }
    },

    /**
     * 创建模板
     */
    createTemplate: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const body = request.body as {
        title: string;
        category: string;
        author: string;
        coverUrl: string;
        videoUrl?: string;
        views?: number;
        likes?: number;
        sortOrder?: number;
        isEnabled?: boolean;
      };

      // 验证必填字段
      if (!body.title || !body.coverUrl) {
        return reply.code(400).send({
          success: false,
          message: "标题和封面为必填项",
        });
      }

      try {
        const template = await templateService.create({
          title: body.title,
          category: body.category || '女装',
          author: body.author || '',
          coverUrl: body.coverUrl,
          videoUrl: body.videoUrl,
          views: body.views,
          likes: body.likes,
          sortOrder: body.sortOrder,
          isEnabled: body.isEnabled,
          creatorId: user.id,
        });

        // ===== 写入视频脚本关联表 =====
        // 模板创建时记录视频来源，后续用户复刻时再关联脚本
        try {
          await ctx.repos.videoScriptAssocs.insertTemplateVideoAssoc({
            videoId: template.id,
            videoUrl: template.videoUrl ?? null,
            userId: user.id,
          });
        } catch (assocError) {
          // 关联表写入失败不影响模板创建，只记录日志
          log.error({ err: assocError }, "createTemplate 写入关联表失败");
        }

        return reply.send({ success: true, data: template });
      } catch (error) {
        log.error({ err: error }, "创建模板失败");
        return reply.code(500).send({ success: false, message: "创建模板失败" });
      }
    },

    /**
     * 更新模板
     */
    updateTemplate: async (request, reply) => {
      await requireUser(ctx, request);
      const params = request.params as { id: string };
      const body = request.body as {
        title?: string;
        category?: string;
        author?: string;
        coverUrl?: string;
        videoUrl?: string;
        views?: number;
        likes?: number;
        sortOrder?: number;
        isEnabled?: boolean;
      };

      try {
        const template = await templateService.update(params.id, body);

        if (!template) {
          return reply.code(404).send({ success: false, message: "Template not found" });
        }

        return reply.send({ success: true, data: template });
      } catch (error) {
        log.error({ err: error }, "更新模板失败");
        return reply.code(500).send({ success: false, message: "更新模板失败" });
      }
    },

    /**
     * 删除模板
     */
    deleteTemplate: async (request, reply) => {
      await requireUser(ctx, request);
      const params = request.params as { id: string };

      try {
        const deleted = await templateService.delete(params.id);

        if (!deleted) {
          return reply.code(404).send({ success: false, message: "Template not found" });
        }

        return reply.send({ success: true });
      } catch (error) {
        log.error({ err: error }, "删除模板失败");
        return reply.code(500).send({ success: false, message: "删除模板失败" });
      }
    },

    /**
     * 上传封面图片
     * 文件保存到 OSS 存储服务
     */
    uploadCover: async (request, reply) => {
      await requireUser(ctx, request);
      const data = await request.file();

      if (!data) {
        return reply.code(400).send({ success: false, message: "No file uploaded" });
      }

      try {
        const file = data as MultipartFile;
        const ext = file.filename.split('.').pop() || 'jpg';
        const fileName = `${randomUUID()}.${ext}`;
        // 直接拼接 OSS 存储路径
        const key = `${SQUARE_TEMPLATE_COVER_PATH}/${fileName}`;

        // 获取文件 Buffer
        const buffer = await file.toBuffer();

        // 检查存储适配器是否可用
        if (!ctx.storage) {
          return reply.code(500).send({ success: false, message: "存储服务未初始化" });
        }

        // 使用 OSS 服务上传
        const ossService = getOssService(ctx.storage);
        const result = await ossService.upload(key, buffer, 'image/jpeg');

        if (!result.success) {
          return reply.code(500).send({ success: false, message: result.message || "上传失败" });
        }

        return reply.send({
          success: true,
          data: {
            fileName,
            coverUrl: result.url,
          },
        });
      } catch (error) {
        log.error({ err: error }, "上传封面失败");
        return reply.code(500).send({ success: false, message: "上传封面失败" });
      }
    },

    /**
     * 上传视频
     * 文件保存到 OSS 存储服务
     */
    uploadVideo: async (request, reply) => {
      await requireUser(ctx, request);
      const data = await request.file();

      if (!data) {
        return reply.code(400).send({ success: false, message: "No file uploaded" });
      }

      try {
        const file = data as MultipartFile;
        const ext = file.filename.split('.').pop() || 'mp4';
        const fileName = `${randomUUID()}.${ext}`;
        // 直接拼接 OSS 存储路径
        const key = `${SQUARE_TEMPLATE_VIDEO_PATH}/${fileName}`;

        // 获取文件 Buffer
        const buffer = await file.toBuffer();

        // 检查存储适配器是否可用
        if (!ctx.storage) {
          return reply.code(500).send({ success: false, message: "存储服务未初始化" });
        }

        // 使用 OSS 服务上传
        const ossService = getOssService(ctx.storage);
        const result = await ossService.upload(key, buffer, 'video/mp4');

        if (!result.success) {
          return reply.code(500).send({ success: false, message: result.message || "上传失败" });
        }

        return reply.send({
          success: true,
          data: {
            fileName,
            videoUrl: result.url,
          },
        });
      } catch (error) {
        log.error({ err: error }, "上传视频失败");
        return reply.code(500).send({ success: false, message: "上传视频失败" });
      }
    },

    /**
     * 获取模板关联的脚本详情
     */
    getTemplateScript: async (request, reply) => {
      await requireUser(ctx, request);
      const params = request.params as { id: string };

      try {
        // 先获取模板，检查是否有 scriptDataId
        const template = await templateService.getById(params.id);
        if (!template) {
          return reply.code(404).send({
            success: false,
            hasScript: false,
            message: "Template not found"
          });
        }

        if (!template.scriptDataId) {
          return reply.send({
            success: true,
            hasScript: false
          });
        }

        // 查询脚本详情
        const scriptService = getScriptsDataDbService(ctx.repos);
        const script = await scriptService.getById(template.scriptDataId);

        if (!script) {
          // 脚本已被删除
          return reply.send({
            success: true,
            hasScript: false,
            reason: "script_deleted"
          });
        }

        // 查询关联的分镜数据
        let shotBreakdown: import("../repositories/pg/shot-breakdown-pg-repository").ShotBreakdown[] = [];
        try {
          shotBreakdown = await ctx.repos.shotBreakdowns.findByScriptDataId(template.scriptDataId);
        } catch (e) {
          log.warn({ err: e, scriptDataId: template.scriptDataId }, "查询分镜数据失败，返回空列表");
        }

        return reply.send({
          success: true,
          hasScript: true,
          script,
          shotBreakdown
        });
      } catch (error) {
        log.error({ err: error }, "查询模板脚本失败");
        return reply.code(500).send({
          success: false,
          hasScript: false,
          message: "获取脚本详情失败"
        });
      }
    },

    /**
     * 关联脚本到模板
     */
    linkTemplateScript: async (request, reply) => {
      await requireUser(ctx, request);
      const params = request.params as { id: string };
      const body = request.body as { scriptDataId: string };

      if (!body.scriptDataId) {
        return reply.code(400).send({
          success: false,
          message: "scriptDataId is required"
        });
      }

      try {
        // 检查模板是否存在
        const template = await templateService.getById(params.id);
        if (!template) {
          return reply.code(404).send({
            success: false,
            message: "Template not found"
          });
        }

        // 关联脚本
        const linked = await templateService.linkScript(params.id, body.scriptDataId);

        return reply.send({
          success: linked
        });
      } catch (error) {
        log.error({ err: error }, "关联模板脚本失败");
        return reply.code(500).send({
          success: false,
          message: "关联脚本失败"
        });
      }
    },

    /**
     * 审核模板
     */
    reviewTemplate: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const params = request.params as { id: string };
      const body = request.body as {
        action?: 'approve' | 'reject';
        reason?: string;
      };

      if (!body.action || !['approve', 'reject'].includes(body.action)) {
        return reply.code(400).send({
          success: false,
          message: "action 必须为 approve 或 reject"
        });
      }

      if (body.action === 'reject' && (!body.reason || !body.reason.trim())) {
        return reply.code(400).send({
          success: false,
          message: "拒绝时必须填写理由"
        });
      }

      try {
        const result = await templateService.reviewTemplate(
          params.id,
          body.action,
          user.id,
          body.reason?.trim()
        );

        if (!result) {
          return reply.code(404).send({
            success: false,
            message: "Template not found"
          });
        }

        return reply.send({
          success: true,
          data: result,
          message: body.action === 'approve' ? '审核通过' : '已拒绝'
        });
      } catch (error) {
        log.error({ err: error }, "审核模板失败");
        return reply.code(500).send({
          success: false,
          message: "审核失败"
        });
      }
    },

    /**
     * 批量审核模板
     */
    batchReviewTemplates: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const body = request.body as {
        ids: string[];
        action: 'approve' | 'reject';
        reason?: string;
      };

      if (!body.ids || body.ids.length === 0) {
        return reply.code(400).send({
          success: false,
          message: "ids 不能为空"
        });
      }

      if (!body.action || !['approve', 'reject'].includes(body.action)) {
        return reply.code(400).send({
          success: false,
          message: "action 必须为 approve 或 reject"
        });
      }

      if (body.action === 'reject' && (!body.reason || !body.reason.trim())) {
        return reply.code(400).send({
          success: false,
          message: "拒绝时必须填写理由"
        });
      }

      try {
        const results = await Promise.all(
          body.ids.map(id =>
            templateService.reviewTemplate(id, body.action, user.id, body.reason?.trim())
          )
        );

        const succeeded = results.filter(r => r !== null).length;
        const failed = results.filter(r => r === null).length;

        return reply.send({
          success: true,
          data: {
            succeeded,
            failed,
            total: body.ids.length,
          },
          message: `批量审核完成：成功 ${succeeded} 个，失败 ${failed} 个`
        });
      } catch (error) {
        log.error({ err: error }, "批量审核模板失败");
        return reply.code(500).send({
          success: false,
          message: "批量审核失败"
        });
      }
    },
  };
}