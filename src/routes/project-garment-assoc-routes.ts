// src/routes/project-garment-assoc-routes.ts
/**
 * 项目服饰关联 API 路由
 *
 * 使用新的 ProjectGarment 模型（nrm_project_garment_assoc 表）
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { User, ProjectGarment, GarmentAsset, VideoProjectStatus, ImageProjectStatus } from "../contracts/types.js";
import { AppError } from "../core/errors.js";
import { resolveGarmentImageUrl, VIDEO_PROJECT_STATUS_ORDER, IMAGE_PROJECT_STATUS_ORDER } from "../contracts/types.js";

/** 项目服饰关联路由依赖 */
export interface ProjectGarmentAssocRouteDeps {
  requireUser: (ctx: AppContext, request: FastifyRequest) => Promise<User>;
}

interface ListAssocsQuery {
  projectId?: unknown;
}

interface AddAssocBody {
  projectId?: unknown;
  garmentAssetId?: unknown;
}

/** 关联详情（包含服饰资产信息） */
interface AssocWithAsset {
  id: string;
  projectId: string;
  category: string | null;
  garmentAssetId: string | null;
  fileName: string | null;
  sizeMb: number | null;
  imageUrl: string | null;
  createdAt: number;
  updatedAt: number;
  asset?: GarmentAsset;
}

/** 创建项目服饰关联路由处理器 */
export function createProjectGarmentAssocHandlers(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ProjectGarmentAssocRouteDeps,
) {
  const { requireUser } = deps;

  /**
   * 获取项目的服饰资产关联
   * GET /api/project-garment-assoc?projectId=xxx
   */
  const listAssocs = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const query = request.query as ListAssocsQuery;

    if (typeof query.projectId !== "string" || !query.projectId) {
      throw new AppError(400, "MISSING_PROJECT_ID", "projectId is required");
    }

    // 验证项目所有权
    const project = await ctx.repos.projects.findById(query.projectId);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }
    if (project.userId !== user.id) {
      throw new AppError(403, "FORBIDDEN", "Forbidden");
    }

    // 获取项目服饰列表
    const garments = await ctx.repos.assets.findByProjectId(query.projectId);

    // 获取关联的服饰资产详情
    const assetIds = garments.filter((g) => g.garmentAssetId).map((g) => g.garmentAssetId as string);
    const assets = assetIds.length > 0 ? await ctx.repos.garmentAssets.findByIds(assetIds) : [];
    const assetMap = new Map(assets.map((a) => [a.id, a]));

    // 组装返回数据
    const result: AssocWithAsset[] = garments.map((garment) => ({
      id: garment.id,
      projectId: garment.projectId,
      category: garment.category,
      garmentAssetId: garment.garmentAssetId,
      fileName: garment.fileName,
      sizeMb: garment.sizeMb,
      imageUrl: garment.imageUrl,
      createdAt: garment.createdAt,
      updatedAt: garment.updatedAt,
      asset: garment.garmentAssetId ? assetMap.get(garment.garmentAssetId) : undefined,
    }));

    return { items: result };
  };

  /**
   * 添加项目服饰关联
   * POST /api/project-garment-assoc
   */
  const addAssoc = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const body = (request.body as AddAssocBody) ?? {};

    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const garmentAssetId = typeof body.garmentAssetId === "string" ? body.garmentAssetId : "";

    if (!projectId || !garmentAssetId) {
      throw new AppError(400, "MISSING_PARAMS", "projectId and garmentAssetId are required");
    }

    // 验证项目所有权
    const project = await ctx.repos.projects.findById(projectId);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }
    if (project.userId !== user.id) {
      throw new AppError(403, "FORBIDDEN", "Forbidden: not project owner");
    }

    // 验证服饰资产权限（用户自己的资产或公共资产）
    const asset = await ctx.repos.garmentAssets.findById(garmentAssetId);
    if (!asset) {
      throw new AppError(404, "ASSET_NOT_FOUND", "Garment asset not found");
    }
    if (asset.userId !== user.id && asset.userId !== "system") {
      throw new AppError(403, "FORBIDDEN", "Forbidden: no access to garment asset");
    }

    // 创建或更新项目服饰记录
    const now = ctx.clock.now();
    const garment: ProjectGarment = {
      id: ctx.clock.generateId(),
      projectId,
      userId: user.id,
      category: asset.category,
      garmentAssetId,
      fileName: asset.name,
      sizeMb: asset.sizeMb,
      imageUrl: resolveGarmentImageUrl(asset),
      createdAt: now,
      updatedAt: now,
    };

    await ctx.repos.assets.upsertByProjectAndGarmentAsset(garment);

    // 第一次绑定服饰时，更新项目状态（从 DRAFT → GARMENT_UPLOADED）
    const currentStatus = project.status as string;
    const projectKind = project.projectKind;
    // 判断是否需要更新状态：当前处于初始 DRAFT 状态
    const needsStatusUpdate = projectKind === "image"
      ? currentStatus === "IMAGE_DRAFT" || currentStatus === "DRAFT"
      : currentStatus === "DRAFT";

    if (needsStatusUpdate) {
      // 根据项目类型确定目标状态
      const targetStatus: VideoProjectStatus | ImageProjectStatus = projectKind === "image"
        ? "IMAGE_GARMENT_UPLOADED"
        : "GARMENT_UPLOADED";
      project.status = targetStatus;
      project.updatedAt = now;
      await ctx.repos.projects.upsert(project);
      app.log.info(`[POST /project-garment-assoc] 项目 ${projectId} 状态从 ${currentStatus} 更新为 ${targetStatus}`);
    }

    // 第一次上传服饰时，更新项目封面、缩略图和服饰主图（与 project-flow-route-handlers.ts 保持一致）
    const garmentImageUrl = garment.imageUrl?.trim();
    if (garmentImageUrl) {
      // 封面：第一次上传时设置（coverImageUrl 为空）
      const shouldUpdateCover = !project.coverImageUrl;
      // 缩略图：默认占位图时更新
      const isDefaultThumbnail = project.thumbnailUrl?.includes("placehold.co");
      // 服饰主图：第一次上传时设置
      const shouldUpdateGarmentImage = !project.garmentImageUrl;

      if (shouldUpdateCover || isDefaultThumbnail || shouldUpdateGarmentImage) {
        if (shouldUpdateCover) {
          project.coverImageUrl = garmentImageUrl;
        }
        if (isDefaultThumbnail) {
          project.thumbnailUrl = garmentImageUrl;
        }
        if (shouldUpdateGarmentImage) {
          project.garmentImageUrl = garmentImageUrl;
        }
        project.updatedAt = now;
        await ctx.repos.projects.upsert(project);
      }
    }

    return {
      id: garment.id,
      projectId: garment.projectId,
      category: garment.category,
      garmentAssetId: garment.garmentAssetId,
      createdAt: garment.createdAt,
      updatedAt: garment.updatedAt,
      asset,
    };
  };

  /**
   * 移除项目服饰关联
   * DELETE /api/project-garment-assoc/:assocId
   */
  const removeAssoc = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { assocId: string };

    // 查找服饰记录
    const garment = await ctx.repos.assets.findById(params.assocId);
    if (!garment) {
      throw new AppError(404, "ASSOC_NOT_FOUND", "Association not found");
    }

    // 验证项目所有权
    const project = await ctx.repos.projects.findById(garment.projectId);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }
    if (project.userId !== user.id) {
      throw new AppError(403, "FORBIDDEN", "Forbidden");
    }

    // 删除记录
    await ctx.repos.assets.delete(params.assocId);

    return { ok: true };
  };

  return { listAssocs, addAssoc, removeAssoc };
}

/** 注册项目服饰关联路由 */
export function registerProjectGarmentAssocRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ProjectGarmentAssocRouteDeps,
) {
  const handlers = createProjectGarmentAssocHandlers(app, ctx, deps);

  app.get("/project-garment-assoc", handlers.listAssocs);
  app.post("/project-garment-assoc", handlers.addAssoc);
  app.delete("/project-garment-assoc/:assocId", handlers.removeAssoc);
}
