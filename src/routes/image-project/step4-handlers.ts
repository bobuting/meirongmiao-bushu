/**
 * 图片项目 Step4 电商详情页路由处理器
 *
 * 处理 Section 规划、图片生成、版本管理等业务逻辑。
 * 所有接口都需要 requireUser() + requireOwnerProject() 鉴权。
 */

import type { FastifyRequest } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { User, Project, PageSection } from "../../contracts/types.js";
import type { IPageSectionRepository } from "../../contracts/repository-ports/library-repository.js";
import type { IProjectRepository } from "../../contracts/repository-ports/project-repository.js";
import type { IAssetRepository, IOutfitPlanRepository, IProjectOutfitPlanAssocRepository } from "../../contracts/repository-ports/asset-repository.js";
import { AppError } from "../../core/errors.js";
import { requireUser } from "../../services/auth/route-guards.js";
import {
  resolveRouteProvider,
} from "../../services/llm/provider-resolver.js";
import { fetchWanxiangTemplates } from "../../services/media/alicloud-market-provider.js";
import { SkillLoader } from "../../services/skills/skill-loader.js";

import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";
import {
  createAsyncJob,
} from "../../service/async-job-service.js";

// ========== 模块级辅助函数（后台闭包中使用） ==========

/** 获取项目的模特照片（最多10张） */
export async function getModelPhotos(ctx: AppContext, projectId: string) {
  return ctx.repos.modelPhotos.findSelectedByProjectId(projectId);
}

/** 获取 Step 2 定妆参考图，按类别分别返回（数量限制） */
export async function getStep2ReferenceImagesByCategory(ctx: AppContext, projectId: string): Promise<{
  fiveViewImages: string[];
  garmentFlatLayImages: string[];
}> {
  const fiveViewImages: string[] = [];

  // 1. 角色五视图：只取 Step2 选中的角色（最多1张）
  const projectCharacters = await ctx.repos.projectCharacters.findByProjectId(projectId);
  // 找到 Step2 选中的角色（is_selected = true）
  const selectedCharacter = projectCharacters.find(pc => pc.isSelected);
  if (selectedCharacter) {
    const activeView = await ctx.repos.characterFiveViews.findActiveByCharacterId(selectedCharacter.libraryCharacterId);
    if (activeView?.imageUrl && activeView.status === "ready") {
      fiveViewImages.push(activeView.imageUrl);
    }
  }

  // 2. 服饰平铺图：最多2张
  const garmentFlatLayImages: string[] = [];
  const projectGarments = await ctx.repos.projectGarmentAssocs.findByProjectId(projectId);
  if (projectGarments.length > 0) {
    const assetIds = projectGarments.map((pg) => pg.garmentAssetId);
    const garmentAssets = await ctx.repos.garmentAssets.findByIds(assetIds);
    for (const asset of garmentAssets) {
      if (asset.flatLayImageUrl && garmentFlatLayImages.length < 2) {
        garmentFlatLayImages.push(asset.flatLayImageUrl);
      }
    }
  }

  return { fiveViewImages, garmentFlatLayImages };
}

/** 参考图数量限制：五视图(1) + 平铺图(2) + 模特图(10) = 最多13张 */
const MAX_FIVE_VIEW_IMAGES = 1;
const MAX_FLAT_LAY_IMAGES = 2;
const MAX_MODEL_PHOTO_IMAGES = 4;
const MAX_REFERENCE_IMAGES = MAX_FIVE_VIEW_IMAGES + MAX_FLAT_LAY_IMAGES + MAX_MODEL_PHOTO_IMAGES;

/** 构建参考图列表（数量已在获取阶段限制，直接合并）
 * 图片顺序：服饰平铺图 → 角色五视图 → 模特照片
 * 第一张图对构图影响最大，确保服饰细节（logo、图案）优先保持
 */
export function buildBalancedReferenceImages(
  fiveViewImages: string[],
  garmentFlatLayImages: string[],
  modelPhotoImages: string[],
): string[] {
  // 各类图片数量已在获取阶段限制，直接合并
  // 服饰在前（主要参考），角色在后（辅助参考）
  return [...garmentFlatLayImages, ...fiveViewImages, ...modelPhotoImages];
}

// 提示词代码常量

/** 路由依赖 */
export interface Step4RouteDeps {
  ctx: AppContext;
  pageSections: IPageSectionRepository;
  projects: IProjectRepository;
  assets: IAssetRepository;
  outfitPlans: IOutfitPlanRepository;
  projectOutfitPlanAssocs: IProjectOutfitPlanAssocRepository;
}

/** 路由处理器 */
export class Step4RouteHandlers {
  constructor(
    private readonly ctx: AppContext,
    private readonly deps: Step4RouteDeps,
  ) {
  }

  /** 验证项目归属权 */
  private async requireOwnerProject(user: User, projectId: string): Promise<Project> {
    const project = await this.deps.projects.findById(projectId);
    if (!project) {
      throw new AppError(404, "NOT_FOUND", "项目不存在");
    }
    if (project.userId !== user.id) {
      throw new AppError(403, "FORBIDDEN", "仅项目所有者可操作");
    }
    return project;
  }

  /**
   * 获取项目的模特照片（委托模块级函数）
   */
  private async getModelPhotos(projectId: string) {
    return getModelPhotos(this.ctx, projectId);
  }

  /**
   * 获取 Step 2 定妆参考图（委托模块级函数）
   */
  private async getStep2ReferenceImagesByCategory(projectId: string) {
    return getStep2ReferenceImagesByCategory(this.ctx, projectId);
  }

  // ==========================================================================
  // 1. GET /projects/:projectId/sections — 列出所有 Section
  // 2. GET /projects/:projectId/sections — 列出所有 Section
  // ==========================================================================
  async listSections(request: FastifyRequest) {
    const user = await requireUser(this.ctx, request as import("fastify").FastifyRequest);
    const { projectId } = request.params as { projectId: string };
    await this.requireOwnerProject(user, projectId);

    const sections = await this.deps.pageSections.findByProjectId(projectId);
    return { sections };
  }

  // ==========================================================================
  // 3. POST /projects/:projectId/sections — 创建 Section
  // ==========================================================================
  async createSection(request: FastifyRequest) {
    const user = await requireUser(this.ctx, request as import("fastify").FastifyRequest);
    const { projectId } = request.params as { projectId: string };
    await this.requireOwnerProject(user, projectId);

    const body = request.body as Record<string, unknown>;
    const sectionType = (body.sectionType as string) ?? "detail_showcase";

    const now = Date.now();
    const section: PageSection = {
      id: crypto.randomUUID(),
      projectId,
      sectionKey: (body.sectionKey as string) ?? `custom_${now}`,
      sectionType: sectionType as PageSection["sectionType"],
      title: (body.title as string) ?? null,
      goal: (body.goal as string) ?? null,
      copy: (body.copy as string) ?? null,
      visualPrompt: (body.visualPrompt as string) ?? null,
      sortOrder: (body.sortOrder as number) ?? 0,
      status: "idle",
      currentImageAssetId: null,
      editableData: (body.editableData as Record<string, unknown>) ?? null,
      displayConfig: null,
      layoutConfig: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.deps.pageSections.create(section);
    return { section };
  }

  // ==========================================================================
  // 4. PUT /projects/:projectId/sections/:sectionId — 更新 Section
  // ==========================================================================
  async updateSection(request: FastifyRequest) {
    const user = await requireUser(this.ctx, request as import("fastify").FastifyRequest);
    const { projectId, sectionId } = request.params as { projectId: string; sectionId: string };
    const project = await this.requireOwnerProject(user, projectId);

    const section = await this.deps.pageSections.findById(sectionId);
    if (!section) {
      throw new AppError(404, "SECTION_NOT_FOUND", "Section 不存在");
    }
    if (section.projectId !== project.id) {
      throw new AppError(403, "FORBIDDEN", "Section 不属于该项目");
    }

    const body = request.body as Record<string, unknown>;
    if (body.title !== undefined) section.title = body.title as string | null;
    if (body.goal !== undefined) section.goal = body.goal as string | null;
    if (body.copy !== undefined) section.copy = body.copy as string | null;
    if (body.visualPrompt !== undefined) section.visualPrompt = body.visualPrompt as string | null;
    if (body.displayConfig !== undefined) {
      section.displayConfig = body.displayConfig
        ? (body.displayConfig as unknown) as import("../../contracts/types.js").TextDisplayConfig
        : null;
    }
    if (body.layoutConfig !== undefined) {
      section.layoutConfig = body.layoutConfig
        ? (body.layoutConfig as unknown) as import("../../contracts/types.js").LayoutConfig
        : null;
    }
    if (body.editableData !== undefined) section.editableData = body.editableData as Record<string, unknown> | null;
    section.updatedAt = Date.now();

    await this.deps.pageSections.update(section);
    return { section };
  }

  // ==========================================================================
  // 5. DELETE /projects/:projectId/sections/:sectionId — 删除 Section
  // ==========================================================================
  async deleteSection(request: FastifyRequest) {
    const user = await requireUser(this.ctx, request as import("fastify").FastifyRequest);
    const { projectId, sectionId } = request.params as { projectId: string; sectionId: string };
    const project = await this.requireOwnerProject(user, projectId);

    const section = await this.deps.pageSections.findById(sectionId);
    if (!section) {
      throw new AppError(404, "SECTION_NOT_FOUND", "Section 不存在");
    }
    if (section.projectId !== project.id) {
      throw new AppError(403, "FORBIDDEN", "Section 不属于该项目");
    }

    await this.deps.pageSections.delete(sectionId);
    return { success: true };
  }

  // ==========================================================================
  // 7. PUT /projects/:projectId/sections/reorder — 重排序 Section
  // ==========================================================================
  async reorderSections(request: FastifyRequest) {
    const user = await requireUser(this.ctx, request as import("fastify").FastifyRequest);
    const { projectId } = request.params as { projectId: string };
    await this.requireOwnerProject(user, projectId);

    const body = request.body as Record<string, unknown>;
    const order = body.order as Array<{ id: string; sortOrder: number }> | undefined;
    if (!order || !Array.isArray(order)) {
      throw new AppError(400, "INVALID_ORDER", "order 必须为数组，每项包含 id 和 sortOrder");
    }

    for (const item of order) {
      await this.deps.pageSections.updateSortOrder(item.id, item.sortOrder);
    }

    return { success: true };
  }

  // ==========================================================================
  // 9. GET /projects/:projectId/sections/stitch-upload-url — 生成 OSS 预签名上传 URL（支持缓存）
  // ==========================================================================
  async getStitchUploadUrl(request: FastifyRequest) {
    const user = await requireUser(this.ctx, request as import("fastify").FastifyRequest);
    const { projectId } = request.params as { projectId: string };
    await this.requireOwnerProject(user, projectId);

    if (!this.ctx.storage) {
      throw new AppError(500, "STORAGE_NOT_AVAILABLE", "存储服务不可用");
    }

    // 检查缓存：前端传 hash，匹配则直接返回已缓存的 URL
    const { hash } = request.query as { hash?: string };
    if (hash) {
      const cache = await this.ctx.repos.imageProjectExt.getStitchCache(projectId);
      if (cache.hash === hash && cache.imageUrl) {
        // 验证缓存地址是否为 OSS 公共地址（必须是完整 URL）
        const ossPublicBase = process.env.OBJECT_STORAGE_S3_PUBLIC_BASE?.trim();
        if (ossPublicBase && cache.imageUrl.startsWith(ossPublicBase)) {
          return { success: true, cached: true, downloadUrl: cache.imageUrl };
        }
        // 缓存地址无效（非 OSS 地址），删除缓存重新生成
        await this.ctx.repos.imageProjectExt.updateStitchCache(projectId, "", "");
      }
    }

    // 无缓存或 hash 不匹配，生成新上传 URL（WebP 格式，体积更小）
    const objectKey = `ecommerce-pages/${projectId}/stitched_${Date.now()}.webp`;

    const ossPublicBase = process.env.OBJECT_STORAGE_S3_PUBLIC_BASE?.trim();

    const uploadUrl = await this.ctx.storage.getSignedUrl(objectKey, {
      method: "PUT",
      contentType: "image/webp",
      expiresInSec: 3600,
    });

    const downloadUrl = this.ctx.storage.getPublicUrl(objectKey);

    return {
      success: true,
      cached: false,
      uploadUrl,
      downloadUrl,
      objectKey,
    };
  }

  // ==========================================================================
  // 13. POST /projects/:projectId/long-image/generate — 提交万相营造长图生成任务
  // ==========================================================================
  async generateLongImage(request: FastifyRequest) {
    const user = await requireUser(this.ctx, request as import("fastify").FastifyRequest);
    const { projectId } = request.params as { projectId: string };
    await this.requireOwnerProject(user, projectId);

    const body = request.body as { templateId?: string; templateName?: string } | undefined;

    // 创建 Submit 异步任务
    const now = Date.now();
    const jobId = `img-s4-li-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const genResult = await createAsyncJob(this.ctx.repos, {
      id: jobId,
      userId: user.id,
      jobType: "image_step4_long_image_submit",
      projectId,
      input: JSON.stringify({
        projectId,
        templateId: body?.templateId,
        templateName: body?.templateName,
      }),
      now,
      initialStatus: "pending",
    }, this.ctx.globalTaskConcurrencyService);

    if ("error" in genResult) {
      throw new AppError(429, genResult.errorCode, genResult.error);
    }

    return { jobId, status: "pending" };
  }

  // ==========================================================================
  // 14. GET /projects/:projectId/long-image/status — 查询长图生成状态
  // ==========================================================================
  async getLongImageStatus(request: FastifyRequest) {
    const user = await requireUser(this.ctx, request as import("fastify").FastifyRequest);
    const { projectId } = request.params as { projectId: string };
    await this.requireOwnerProject(user, projectId);

    // 查询长图历史记录
    const generations = await this.ctx.repos.longImageGeneration.findByProjectId(projectId);

    // 直接从 image_project_ext 读取已保存的长图结果
    const ext = await this.ctx.repos.imageProjectExt.findByProjectId(projectId);
    if (ext?.longImageUrl) {
      return {
        status: "succeeded" as const,
        imageUrl: ext.longImageUrl,
        sketchUrl: ext.longImageSketchUrl,
        generations: generations.map(g => ({
          id: g.id,
          templateId: g.templateId,
          templateName: g.templateName,
          imageUrl: g.imageUrl,
          isActive: g.isActive,
          createdAt: g.createdAt,
        })),
      };
    }

    // 查找进行中的任务
    const jobResult = await this.ctx.repos.asyncJobs.findLatestByProjectAndType(projectId, "image_step4_long_image_submit");

    if (!jobResult) {
      return {
        status: "idle" as const,
        generations: generations.map(g => ({
          id: g.id,
          templateId: g.templateId,
          templateName: g.templateName,
          imageUrl: g.imageUrl,
          isActive: g.isActive,
          createdAt: g.createdAt,
        })),
      };
    }

    const job = jobResult;
    if (job.status === "completed") {
      return {
        status: "succeeded" as const,
        imageUrl: ext?.longImageUrl ?? null,
        generations: generations.map(g => ({
          id: g.id,
          templateId: g.templateId,
          templateName: g.templateName,
          imageUrl: g.imageUrl,
          isActive: g.isActive,
          createdAt: g.createdAt,
        })),
      };
    }
    if (job.status === "failed") {
      return {
        status: "failed" as const,
        error: (job.error as Record<string, unknown>)?.message ?? "长图生成失败",
        generations: generations.map(g => ({
          id: g.id,
          templateId: g.templateId,
          templateName: g.templateName,
          imageUrl: g.imageUrl,
          isActive: g.isActive,
          createdAt: g.createdAt,
        })),
      };
    }

    return {
      status: "running" as const,
      stage: job.stage ?? null,
      generations: generations.map(g => ({
        id: g.id,
        templateId: g.templateId,
        templateName: g.templateName,
        imageUrl: g.imageUrl,
        isActive: g.isActive,
        createdAt: g.createdAt,
      })),
    };
  }

  // ==========================================================================
  // 15. GET /projects/:projectId/long-image/templates — 获取万相营造模板列表
  // ==========================================================================
  async getLongImageTemplates(_request: FastifyRequest) {
    const templates = await fetchWanxiangTemplates();
    return { templates };
  }

  // ==========================================================================
  // 16. GET /projects/:projectId/long-image/sketch-proxy — 代理下载 Sketch 文件（解决 CORS）
  // ==========================================================================
  async proxySketchFile(request: FastifyRequest) {
    const user = await requireUser(this.ctx, request as import("fastify").FastifyRequest);
    const { projectId } = request.params as { projectId: string };
    await this.requireOwnerProject(user, projectId);

    const { url } = request.query as { url?: string };
    if (!url) {
      throw new AppError(400, "INVALID_PARAMS", "缺少 sketch 文件 URL");
    }

    // 安全校验：只允许 OSS 域名（阿里云万相 Sketch + 我们的 OSS）
    const allowedHosts = [
      "lego2-res.oss-cn-hangzhou-cross.aliyuncs.com",
      "oss-cn-hangzhou-cross.aliyuncs.com",
      "bbt-neirongmiao-v1.oss-cn-hangzhou.aliyuncs.com",
      "oss-cn-hangzhou.aliyuncs.com",
    ];
    const parsedUrl = new URL(url);
    if (!allowedHosts.some((h) => parsedUrl.hostname.endsWith(h))) {
      throw new AppError(403, "FORBIDDEN", "不支持的 sketch 文件域名");
    }

    // 万相 mixo API 返回的 ossUrl 使用 oss-cn-hangzhou-cross（内网），替换为公网域名
    const fetchUrl = url.replace(/\.oss-cn-hangzhou-cross\./i, ".oss-cn-hangzhou.");
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new AppError(502, "UPSTREAM_ERROR", `下载 sketch 文件失败: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      data: buffer.toString("base64"),
      size: buffer.length,
      contentType: response.headers.get("content-type") ?? "application/zip",
    };
  }

  // ==========================================================================
  // 17. PUT /image-projects/:projectId/long-image/activate/:generationId — 激活长图历史记录
  // ==========================================================================
  async activateLongImage(request: FastifyRequest) {
    const user = await requireUser(this.ctx, request as import("fastify").FastifyRequest);
    const { projectId, generationId } = request.params as { projectId: string; generationId: string };
    await this.requireOwnerProject(user, projectId);

    const activated = await this.ctx.repos.longImageGeneration.activate(projectId, generationId);
    if (!activated) {
      throw new AppError(404, "GENERATION_NOT_FOUND", "长图记录不存在或不属于当前项目");
    }
    const gen = await this.ctx.repos.longImageGeneration.findActiveByProjectId(projectId);
    if (!gen) {
      throw new AppError(404, "GENERATION_NOT_FOUND", "激活的长图记录不存在");
    }

    // 同步更新 ext 表（兼容分享页等旧逻辑）
    await this.ctx.repos.imageProjectExt.updateLongImage(projectId, gen.imageUrl, gen.sketchUrl);

    return { imageUrl: gen.imageUrl, sketchUrl: gen.sketchUrl };
  }

  // ==========================================================================
  // 18. POST /projects/:projectId/sections/stitch-cache — 更新合成缓存
  // ==========================================================================
  async updateStitchCache(request: FastifyRequest) {
    const user = await requireUser(this.ctx, request as import("fastify").FastifyRequest);
    const { projectId } = request.params as { projectId: string };
    await this.requireOwnerProject(user, projectId);

    const { hash, downloadUrl } = request.body as { hash: string; downloadUrl: string };
    if (!hash || !downloadUrl) {
      throw new AppError(400, "INVALID_PARAMS", "缺少 hash 或 downloadUrl");
    }

    await this.ctx.repos.imageProjectExt.updateStitchCache(projectId, hash, downloadUrl);

    return { success: true };
  }

  // ==========================================================================
  // 19. GET /image-projects/:projectId/long-image/sketch-upload-url — 获取 sketch 上传预签名 URL
  // ==========================================================================
  async getSketchUploadUrl(request: FastifyRequest) {
    const user = await requireUser(this.ctx, request as import("fastify").FastifyRequest);
    const { projectId } = request.params as { projectId: string };
    await this.requireOwnerProject(user, projectId);

    if (!this.ctx.storage) {
      throw new AppError(500, "STORAGE_NOT_AVAILABLE", "存储服务不可用");
    }

    const objectKey = `media/step4-sketch/${projectId}/edited_${Date.now()}.sketch`;

    const uploadUrl = await this.ctx.storage.getSignedUrl(objectKey, {
      method: "PUT",
      contentType: "application/zip",
      expiresInSec: 3600,
    });

    const downloadUrl = this.ctx.storage.getPublicUrl(objectKey);

    return { success: true, uploadUrl, downloadUrl, objectKey };
  }

  // ==========================================================================
  // 20. GET /image-projects/:projectId/long-image/image-upload-url — 获取长图导出上传预签名 URL
  // ==========================================================================
  async getImageUploadUrl(request: FastifyRequest) {
    const user = await requireUser(this.ctx, request as import("fastify").FastifyRequest);
    const { projectId } = request.params as { projectId: string };
    await this.requireOwnerProject(user, projectId);

    if (!this.ctx.storage) {
      throw new AppError(500, "STORAGE_NOT_AVAILABLE", "存储服务不可用");
    }

    const objectKey = `media/step4-long-image/${projectId}/edited_${Date.now()}.webp`;

    const uploadUrl = await this.ctx.storage.getSignedUrl(objectKey, {
      method: "PUT",
      contentType: "image/webp",
      expiresInSec: 3600,
    });

    const downloadUrl = this.ctx.storage.getPublicUrl(objectKey);

    return { success: true, uploadUrl, downloadUrl, objectKey };
  }

  // ==========================================================================
  // 21. POST /image-projects/:projectId/long-image/sketch-saved — 编辑保存后更新长图 + sketch URL
  // ==========================================================================
  async saveSketchUrl(request: FastifyRequest) {
    const user = await requireUser(this.ctx, request as import("fastify").FastifyRequest);
    const { projectId } = request.params as { projectId: string };
    await this.requireOwnerProject(user, projectId);

    const { imageUrl, sketchUrl } = request.body as { imageUrl?: string; sketchUrl?: string };
    if (!imageUrl && !sketchUrl) {
      throw new AppError(400, "INVALID_PARAMS", "缺少 imageUrl 或 sketchUrl");
    }

    // 保留未更新的字段
    const current = await this.ctx.repos.imageProjectExt.getLongImage(projectId);
    await this.ctx.repos.imageProjectExt.updateLongImage(
      projectId,
      imageUrl ?? current.imageUrl ?? "",
      sketchUrl ?? current.sketchUrl,
    );

    return { success: true, imageUrl: imageUrl ?? current.imageUrl, sketchUrl: sketchUrl ?? current.sketchUrl };
  }

  }

/**
 * 注册图片项目 Step4 电商详情页路由
 */
export function registerImageProjectStep4Routes(app: import("fastify").FastifyInstance, ctx: AppContext): void {
  const deps: Step4RouteDeps = {
    ctx,
    pageSections: ctx.repos.pageSections,
    projects: ctx.repos.projects,
    assets: ctx.repos.assets,
    outfitPlans: ctx.repos.outfitPlans,
    projectOutfitPlanAssocs: ctx.repos.projectOutfitPlanAssocs,
  };
  const handlers = new Step4RouteHandlers(ctx, deps);

  // 1. 列出所有 Section
  app.get<{ Params: { projectId: string } }>(
    "/image-projects/:projectId/sections",
    async (request) => handlers.listSections(request),
  );

  // 2. 创建 Section
  app.post<{ Params: { projectId: string } }>(
    "/image-projects/:projectId/sections",
    async (request) => handlers.createSection(request),
  );

  // 3. 更新 Section
  app.put<{ Params: { projectId: string; sectionId: string } }>(
    "/image-projects/:projectId/sections/:sectionId",
    async (request) => handlers.updateSection(request),
  );

  // 4. 删除 Section
  app.delete<{ Params: { projectId: string; sectionId: string } }>(
    "/image-projects/:projectId/sections/:sectionId",
    async (request) => handlers.deleteSection(request),
  );

  // 5. 重排序 Section
  app.put<{ Params: { projectId: string } }>(
    "/image-projects/:projectId/sections/reorder",
    async (request) => handlers.reorderSections(request),
  );

  // 6. 获取 OSS 预签名上传 URL（前端直接上传合成图片，支持缓存查询）
  app.get<{ Params: { projectId: string } }>(
    "/image-projects/:projectId/sections/stitch-upload-url",
    async (request) => handlers.getStitchUploadUrl(request),
  );

  // 12. 更新合成缓存（合成成功后前端回调）
  app.post<{ Params: { projectId: string } }>(
    "/image-projects/:projectId/sections/stitch-cache",
    async (request) => handlers.updateStitchCache(request),
  );

  // 13. 提交万相营造长图生成任务
  app.post<{ Params: { projectId: string } }>(
    "/image-projects/:projectId/long-image/generate",
    async (request) => handlers.generateLongImage(request),
  );

  // 14. 查询长图生成状态
  app.get<{ Params: { projectId: string } }>(
    "/image-projects/:projectId/long-image/status",
    async (request) => handlers.getLongImageStatus(request),
  );

  // 15. 获取万相营造模板列表
  app.get<{ Params: { projectId: string } }>(
    "/image-projects/:projectId/long-image/templates",
    async (request) => handlers.getLongImageTemplates(request),
  );

  // 16. 代理下载 Sketch 文件（解决前端 CORS 限制）
  app.get<{ Params: { projectId: string } }>(
    "/image-projects/:projectId/long-image/sketch-proxy",
    async (request) => handlers.proxySketchFile(request),
  );

  // 17. 激活长图历史记录
  app.put<{ Params: { projectId: string; generationId: string } }>(
    "/image-projects/:projectId/long-image/activate/:generationId",
    async (request) => handlers.activateLongImage(request),
  );

  // 19. 获取 sketch 上传预签名 URL（前端直传 OSS）
  app.get<{ Params: { projectId: string } }>(
    "/image-projects/:projectId/long-image/sketch-upload-url",
    async (request) => handlers.getSketchUploadUrl(request),
  );

  // 20. 获取长图导出上传预签名 URL（前端直传 OSS，WebP 格式）
  app.get<{ Params: { projectId: string } }>(
    "/image-projects/:projectId/long-image/image-upload-url",
    async (request) => handlers.getImageUploadUrl(request),
  );

  // 21. 编辑保存后更新长图 + sketch URL
  app.post<{ Params: { projectId: string } }>(
    "/image-projects/:projectId/long-image/sketch-saved",
    async (request) => handlers.saveSketchUrl(request),
  );

  }
