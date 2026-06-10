// src/routes/garment-asset-routes.ts
/**
 * 服饰资产 API 路由
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { User, GarmentAssetCategory, GarmentAsset, AssetClassificationResult } from "../contracts/types.js";
import type { Step1OutfitModuleCategory, Step1OutfitViewLabel } from "../contracts/step1-outfit-module-contract.js";
import { AppError } from "../core/errors.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { skillLoader } from "../services/skills/index.js";
import { resolveRouteProviderWithFallback } from "../services/llm/provider-resolver.js";
import { requestLlmImageGenerationUrl } from "../services/media/image-generation-providers.js";
import { persistImageSourceToStorage } from "../services/media/storage-persist.js";
import { maskNonMainGarments } from "../services/garment-mask-service.js";

/** 服饰资产路由依赖 */
export interface GarmentAssetRouteDeps {
  requireUser: (ctx: AppContext, request: FastifyRequest) => Promise<User>;
}

/** 创建/更新时允许的 category 类型（复用系统统一定义） */
type GarmentAssetCreateCategory = GarmentAssetCategory;

/** 校验并解析 category 值 */
function parseCategory(value: unknown): GarmentAssetCreateCategory | undefined {
  if (typeof value !== "string") return undefined;
  // 服饰分类 + video 类型
  const validCategories: GarmentAssetCreateCategory[] = [
    "top", "bottom", "shoes", "accessory", "suit", "dress", "outer", "video"
  ];
  return validCategories.includes(value as GarmentAssetCreateCategory)
    ? (value as GarmentAssetCreateCategory)
    : undefined;
}

interface CreateGarmentAssetBody {
  name?: unknown;
  type?: unknown;
  category?: unknown;
  mainImageUrl?: unknown;
  subImageUrl1?: unknown;
  subImageUrl2?: unknown;
  subImageUrl3?: unknown;
  flatLayImageUrl?: unknown;
  sizeMb?: unknown;
  // 服饰扩展属性
  description?: unknown;
  mainColor?: unknown;
  material?: unknown;
  pattern?: unknown;
  fit?: unknown;
  length?: unknown;
  neckline?: unknown;
  sleeve?: unknown;
  style?: unknown;
  occasion?: unknown;
  // AI 分类结果（含 garmentRegions）
  classification?: unknown;
  // 电商卖点（从图片分析提取）
  sellingPoints?: unknown;
}

interface UpdateGarmentAssetBody {
  name?: unknown;
  category?: unknown;
  mainImageUrl?: unknown;
  subImageUrl1?: unknown;
  subImageUrl2?: unknown;
  subImageUrl3?: unknown;
  flatLayImageUrl?: unknown;
  sizeMb?: unknown;
  // 服饰扩展属性
  description?: unknown;
  mainColor?: unknown;
  material?: unknown;
  pattern?: unknown;
  fit?: unknown;
  length?: unknown;
  neckline?: unknown;
  sleeve?: unknown;
  style?: unknown;
  occasion?: unknown;
  /** 电商卖点 */
  sellingPoints?: unknown;
}

/** 创建服饰资产路由处理器 */
export function createGarmentAssetHandlers(
  app: FastifyInstance,
  ctx: AppContext,
  deps: GarmentAssetRouteDeps,
) {
  const { requireUser } = deps;

  const listAssets = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const query = request.query as {
      page?: string;
      pageSize?: string;
      category?: string;
      keyword?: string;
    };
    return ctx.assetLibraryService.listPaged(user, {
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: Math.min(query.pageSize ? parseInt(query.pageSize, 10) : 20, 100),
      category: query.category,
      keyword: query.keyword,
    });
  };

  const getAsset = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { assetId: string };
    const asset = await ctx.repos.garmentAssets.findById(params.assetId);
    if (!asset) {
      throw new AppError(404, "ASSET_NOT_FOUND", "Asset not found");
    }
    // 只能查看自己的资产或公共资产
    if (asset.userId !== user.id && asset.userId !== "system") {
      throw new AppError(403, "FORBIDDEN", "Forbidden");
    }
    return asset;
  };

  const createAsset = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const body = (request.body as CreateGarmentAssetBody) ?? {};

    // 解析 classification 参数（含 garmentRegions）
    let classification: AssetClassificationResult | undefined = undefined;
    if (body.classification && typeof body.classification === "object") {
      const cls = body.classification as Record<string, unknown>;
      // 校验 category 为有效的 Step1OutfitModuleCategory
      const validCategories: Step1OutfitModuleCategory[] = ["top", "bottom", "shoes", "accessory", "suit", "dress", "outer", "unknown"];
      const categoryRaw = typeof cls.category === "string" ? cls.category : "unknown";
      const category = validCategories.includes(categoryRaw as Step1OutfitModuleCategory)
        ? (categoryRaw as Step1OutfitModuleCategory)
        : "unknown";
      // 校验 viewLabel 为有效的 Step1OutfitViewLabel
      const validViewLabels: Step1OutfitViewLabel[] = ["main", "front", "side", "back", "detail", "unknown"];
      const viewLabelRaw = typeof cls.viewLabel === "string" ? cls.viewLabel : "main";
      const viewLabel = validViewLabels.includes(viewLabelRaw as Step1OutfitViewLabel)
        ? (viewLabelRaw as Step1OutfitViewLabel)
        : "unknown";

      classification = {
        category,
        viewLabel,
        confidence: typeof cls.confidence === "number" ? cls.confidence : 0.6,
        reason: typeof cls.reason === "string" ? cls.reason : "",
        garmentRegions: Array.isArray(cls.garmentRegions) ? cls.garmentRegions as GarmentAsset["garmentRegions"] : undefined,
      };
    }

    const created = await ctx.assetLibraryService.create(user, {
      name: typeof body.name === "string" ? body.name : "",
      type: typeof body.type === "string" && (body.type === "image" || body.type === "video") ? body.type : "image",
      category: parseCategory(body.category) ?? "top",
      mainImageUrl: typeof body.mainImageUrl === "string" ? body.mainImageUrl : "",
      subImageUrl1: typeof body.subImageUrl1 === "string" ? body.subImageUrl1 : null,
      subImageUrl2: typeof body.subImageUrl2 === "string" ? body.subImageUrl2 : null,
      subImageUrl3: typeof body.subImageUrl3 === "string" ? body.subImageUrl3 : null,
      flatLayImageUrl: typeof body.flatLayImageUrl === "string" ? body.flatLayImageUrl : null,
      sizeMb: typeof body.sizeMb === "number" ? body.sizeMb : 0,
      // 服饰扩展属性
      description: typeof body.description === "string" ? body.description : null,
      mainColor: typeof body.mainColor === "string" ? body.mainColor : null,
      material: typeof body.material === "string" ? body.material : null,
      pattern: typeof body.pattern === "string" ? body.pattern : null,
      fit: typeof body.fit === "string" ? body.fit : null,
      length: typeof body.length === "string" ? body.length : null,
      neckline: typeof body.neckline === "string" ? body.neckline : null,
      sleeve: typeof body.sleeve === "string" ? body.sleeve : null,
      style: typeof body.style === "string" ? body.style : null,
      occasion: typeof body.occasion === "string" ? body.occasion : null,
      // AI 分类结果
      classification,
      // 电商卖点
      sellingPoints: Array.isArray(body.sellingPoints) ? body.sellingPoints as Array<{ point: string; category: string; priority: number }> : undefined,
    });
    return created;
  };

  const updateAsset = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { assetId: string };
    const body = (request.body as UpdateGarmentAssetBody) ?? {};
    const updated = await ctx.assetLibraryService.update(user, params.assetId, {
      name: typeof body.name === "string" ? body.name : undefined,
      category: parseCategory(body.category),
      mainImageUrl: typeof body.mainImageUrl === "string" ? body.mainImageUrl : undefined,
      subImageUrl1: typeof body.subImageUrl1 === "string" ? body.subImageUrl1 : undefined,
      subImageUrl2: typeof body.subImageUrl2 === "string" ? body.subImageUrl2 : undefined,
      subImageUrl3: typeof body.subImageUrl3 === "string" ? body.subImageUrl3 : undefined,
      flatLayImageUrl: typeof body.flatLayImageUrl === "string" ? body.flatLayImageUrl : undefined,
      sizeMb: typeof body.sizeMb === "number" ? body.sizeMb : undefined,
      // 服饰扩展属性
      description: typeof body.description === "string" ? body.description : undefined,
      mainColor: typeof body.mainColor === "string" ? body.mainColor : undefined,
      material: typeof body.material === "string" ? body.material : undefined,
      pattern: typeof body.pattern === "string" ? body.pattern : undefined,
      fit: typeof body.fit === "string" ? body.fit : undefined,
      length: typeof body.length === "string" ? body.length : undefined,
      neckline: typeof body.neckline === "string" ? body.neckline : undefined,
      sleeve: typeof body.sleeve === "string" ? body.sleeve : undefined,
      style: typeof body.style === "string" ? body.style : undefined,
      occasion: typeof body.occasion === "string" ? body.occasion : undefined,
      sellingPoints: Array.isArray(body.sellingPoints) ? body.sellingPoints as Array<{ point: string; category: string; priority: number }> : undefined,
    });
    return updated;
  };

  /** 检查资产是否被项目引用 */
  const checkAssetReferenced = async (request: FastifyRequest) => {
    const params = request.params as { assetId: string };
    const assocs = await ctx.repos.projectGarmentAssocs.findByGarmentAssetId(params.assetId);
    return { referenced: assocs.length > 0, count: assocs.length };
  };

  /** 拦截被项目引用的资产操作 */
  const requireAssetNotReferenced = async (assetId: string): Promise<void> => {
    const assocs = await ctx.repos.projectGarmentAssocs.findByGarmentAssetId(assetId);
    if (assocs.length > 0) {
      throw new AppError(409, "ASSET_REFERENCED", `该服饰已被 ${assocs.length} 个项目引用，不允许修改或删除`);
    }
  };

  const deleteAsset = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { assetId: string };
    await requireAssetNotReferenced(params.assetId);
    await ctx.assetLibraryService.remove(user, params.assetId);
    return { ok: true };
  };

  // 生成服饰平铺图（正反面上下布局）
  const generateFlatLay = async (request: FastifyRequest) => {
    const user = await requireUser(ctx, request);
    const body = request.body as {
      assetId?: unknown;
      imageUrl?: unknown;
      imageUrls?: unknown;
      projectId?: unknown;
    } | undefined;

    // 解析 projectId（可选，从项目流程调用时传递）
    const projectId = typeof body?.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : undefined;

    // 优先使用 assetId（支持遮罩预处理）
    let assetId: string | null = null;
    if (typeof body?.assetId === "string" && body.assetId.trim()) {
      assetId = body.assetId.trim();
    }

    // 兼容旧字段 imageUrl 和新字段 imageUrls
    let imageUrls: string[] = [];
    if (Array.isArray(body?.imageUrls)) {
      imageUrls = (body.imageUrls as unknown[]).filter((u): u is string => typeof u === "string" && u.trim().length > 0);
    }
    if (imageUrls.length === 0 && typeof body?.imageUrl === "string" && body.imageUrl.trim()) {
      imageUrls = [body.imageUrl.trim()];
    }

    // 如果有 assetId，从数据库读取服饰资产获取图片和检测区域
    let garmentRegions: GarmentAsset["garmentRegions"] = undefined;
    let asset: GarmentAsset | null = null;
    if (assetId) {
      asset = await ctx.repos.garmentAssets.findById(assetId);
      if (!asset) {
        throw new AppError(404, "ASSET_NOT_FOUND", `服饰资产不存在: ${assetId}`);
      }
      // 只能操作自己的资产或公共资产
      if (asset.userId !== user.id && asset.userId !== "system") {
        throw new AppError(403, "FORBIDDEN", `无权限访问该服饰资产: ${assetId}`);
      }
      // 被项目引用的资产不允许重新生成平铺图
      await requireAssetNotReferenced(assetId);
      // 使用资产的主图 + 其他视角图
      imageUrls = [
        asset.mainImageUrl,
        asset.subImageUrl1,
        asset.subImageUrl2,
        asset.subImageUrl3,
      ].filter((url): url is string => typeof url === "string" && url.trim().length > 0);
      // 获取检测区域用于遮罩
      garmentRegions = asset.garmentRegions;
      app.log.info(
        {
          assetId,
          mainImageUrl: asset.mainImageUrl,
          garmentRegionsCount: garmentRegions?.length ?? 0,
          garmentRegions,
        },
        "生成平铺图：从资产读取检测区域",
      );
    }

    if (imageUrls.length === 0) {
      throw new AppError(400, "MISSING_IMAGE_URL", "请提供服饰图片地址或资产ID");
    }

    // 遮罩预处理：只对主图做遮罩（garmentRegions 基于主图坐标检测，副图角度不同不能复用）
    const mainImageUrl = imageUrls[0];
    const otherImageUrls = imageUrls.slice(1);
    app.log.info(
      {
        imageUrlsCount: imageUrls.length,
        garmentRegionsCount: garmentRegions?.length ?? 0,
        willMask: garmentRegions && garmentRegions.length > 0,
      },
      "生成平铺图：准备遮罩预处理（仅主图）",
    );
    const maskedMainUrl = garmentRegions && garmentRegions.length > 0
      ? await maskNonMainGarments(mainImageUrl, garmentRegions, ctx)
      : mainImageUrl;
    const maskedUrls = [maskedMainUrl, ...otherImageUrls];
    app.log.info({ maskedUrls }, "生成平铺图：遮罩预处理完成");

    // 保存遮罩URL到数据库（如果有assetId）
    if (assetId && maskedUrls[0] && maskedUrls[0] !== imageUrls[0]) {
      await ctx.assetLibraryService.update(user, assetId, {
        maskedImageUrl: maskedUrls[0],
      });
      app.log.info({ assetId, maskedImageUrl: maskedUrls[0] }, "遮罩URL已保存到数据库");
    }

    // 1. 获取提示词（传入服饰信息）
    const PROMPT_CODE = "garment_flat_lay_generation";
    const garmentInfo = asset ? {
      garmentName: asset.name,
      garmentDescription: asset.description ?? undefined,
      mainColor: asset.mainColor ?? undefined,
      material: asset.material ?? undefined,
      pattern: asset.pattern ?? undefined,
      fit: asset.fit ?? undefined,
      neckline: asset.neckline ?? undefined,
      sleeve: asset.sleeve ?? undefined,
      style: asset.style ?? undefined,
      occasion: asset.occasion ?? undefined,
    } : {};
    const { system: systemPrompt, user: userPrompt } = await skillLoader.render(PROMPT_CODE, {
      imageCount: maskedUrls.length,
      ...garmentInfo,
    });

    // 2. 解析图片生成 Provider
    const routeResult = await resolveRouteProviderWithFallback(ctx, [ProviderRouteKeys.GARMENT_FLAT_LAY_GENERATION]);
    if (!routeResult) {
      throw new AppError(503, "PROVIDER_NOT_FOUND", "图片生成服务未配置");
    }

    // 3. 调用图生图 API（传入遮罩后的图片）
    const prompt = systemPrompt + (userPrompt ? "\n\n" + userPrompt : "");
    const generatedResult = await requestLlmImageGenerationUrl(routeResult.provider, prompt, {
      mode: "image_to_image",
      images: maskedUrls,
      ratio: "9:16",
      negativePrompt: "no partial clothing, no cropped garment, no incomplete item, no edge fragment, no hidden portion, no blurry logo, no distorted pattern, no changed text, no removed brand mark, no simplified embroidery, no missing print details",
      debugOptions: {
        ctx,
        routeKey: ProviderRouteKeys.GARMENT_FLAT_LAY_GENERATION,
        businessContext: "服饰平铺图生成",
        userId: user.id,
        projectId,
        messages: [
          { role: "prompt", content: prompt },
          { role: "images", content: JSON.stringify(maskedUrls) },
          { role: "negativePrompt", content: "no partial clothing, no cropped garment, no incomplete item, no edge fragment, no hidden portion, no blurry logo, no distorted pattern, no changed text, no removed brand mark, no simplified embroidery, no missing print details" },
        ],
      },
    });

    // 4. 持久化到对象存储（ Seedream 返回火山引擎 TOS URL，需下载到本地 OSS 避免前端 CORS 问题）
    const generatedImageUrl = await persistImageSourceToStorage(ctx, generatedResult.url, "flat-lay", {
      persistRemote: true,
      optimize: true,
    });

    return { generatedImageUrl };
  };

  return { listAssets, getAsset, createAsset, updateAsset, deleteAsset, generateFlatLay, checkAssetReferenced };
}

/** 注册服饰资产路由 */
export function registerGarmentAssetRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: GarmentAssetRouteDeps,
) {
  const handlers = createGarmentAssetHandlers(app, ctx, deps);

  app.get("/garment-assets", handlers.listAssets);
  app.get("/garment-assets/:assetId", handlers.getAsset);
  app.post("/garment-assets", handlers.createAsset);
  app.post("/garment-assets/generate-flat-lay", handlers.generateFlatLay);
  app.put("/garment-assets/:assetId", handlers.updateAsset);
  app.get("/garment-assets/:assetId/referenced", handlers.checkAssetReferenced);
  app.delete("/garment-assets/:assetId", handlers.deleteAsset);

  // ============ 变体关联接口 ============

  // 切换主色
  app.put("/garment-assets/:assetId/set-primary-variant", async (request) => {
    const user = await deps.requireUser(ctx, request);
    const { assetId } = request.params as { assetId: string };
    const asset = await ctx.repos.garmentAssets.findById(assetId);
    if (!asset || asset.userId !== user.id) {
      throw new AppError(404, "ASSET_NOT_FOUND", "资产不存在");
    }
    if (!asset.variantGroupId) {
      throw new AppError(400, "NOT_IN_VARIANT_GROUP", "该资产不属于任何变体组");
    }
    // 同组所有资产设为非主色
    const allAssets = await ctx.repos.garmentAssets.findByUserId(user.id);
    const groupMembers = allAssets.filter(a => a.variantGroupId === asset.variantGroupId);
    for (const member of groupMembers) {
      await ctx.repos.garmentAssets.updateVariantFields(member.id, {
        variantGroupId: member.variantGroupId!,
        variantColor: member.variantColor ?? member.mainColor ?? null,
        isPrimaryVariant: member.id === assetId,
      });
    }
    return { success: true };
  });

  // 查询同款不同色的候选（导入时提示用）
  app.get("/garment-assets/:assetId/variant-candidates", async (request) => {
    const user = await deps.requireUser(ctx, request);
    const { assetId } = request.params as { assetId: string };
    const asset = await ctx.repos.garmentAssets.findById(assetId);
    if (!asset || asset.userId !== user.id) {
      throw new AppError(404, "ASSET_NOT_FOUND", "资产不存在");
    }

    // 如果已在变体组中，返回同组其他成员
    if (asset.variantGroupId) {
      const allAssets = await ctx.repos.garmentAssets.findByUserId(user.id);
      const siblings = allAssets.filter(a =>
        a.variantGroupId === asset.variantGroupId && a.id !== assetId,
      );
      return {
        candidates: siblings.map(s => ({
          assetId: s.id,
          name: s.name,
          color: s.variantColor ?? s.mainColor ?? "",
          imageUrl: s.flatLayImageUrl ?? s.mainImageUrl,
          isPrimaryVariant: s.isPrimaryVariant,
        })),
      };
    }

    // 未在变体组中，按属性匹配查找同款不同色
    const allAssets = await ctx.repos.garmentAssets.findByUserId(user.id);
    const candidates = allAssets.filter(c =>
      c.id !== assetId
      && c.category === asset.category
      && c.mainColor
      && c.mainColor !== asset.mainColor
      && (!c.material || !asset.material || c.material === asset.material)
      && (!c.fit || !asset.fit || c.fit === asset.fit)
      && (!c.neckline || !asset.neckline || c.neckline === asset.neckline)
      && (!c.sleeve || !asset.sleeve || c.sleeve === asset.sleeve),
    );
    return {
      candidates: candidates.map(c => ({
        assetId: c.id,
        name: c.name,
        color: c.mainColor ?? "",
        imageUrl: c.flatLayImageUrl ?? c.mainImageUrl,
        isPrimaryVariant: false,
      })),
    };
  });

  // 取消变体关联
  app.delete("/garment-assets/variant-group/:groupId", async (request) => {
    const user = await deps.requireUser(ctx, request);
    const { groupId } = request.params as { groupId: string };
    const allAssets = await ctx.repos.garmentAssets.findByUserId(user.id);
    const groupMembers = allAssets.filter(a => a.variantGroupId === groupId && a.userId === user.id);
    if (groupMembers.length === 0) {
      throw new AppError(404, "GROUP_NOT_FOUND", "变体组不存在");
    }
    for (const member of groupMembers) {
      await ctx.repos.garmentAssets.updateVariantFields(member.id, {
        variantGroupId: null,
        variantColor: null,
        isPrimaryVariant: false,
      });
    }
    return { success: true };
  });
}