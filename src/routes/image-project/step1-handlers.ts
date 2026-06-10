/**
 * 图片项目 Step 1 路由 handler
 * 服装上传、AI 搭配分析、图片分类、背景去除、角色方向生成
 *
 * 路由前缀: /image-projects/:projectId/step1/...
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";

import { AppError } from "../../core/errors.js";
import { requireUser } from "../../services/auth/route-guards.js";
import type { ResolvedRouteProvider } from "../../services/llm/provider-resolver.js";
import { resolveRouteProvider } from "../../services/llm/provider-resolver.js";
import {
  requestStep1ImageClassification,
  type Step1ImageClassificationPayload,
} from "../../modules/step1-image-classification.js";
import { isSupportedLlmImageUrl } from "../../services/media/image-utils.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";
import {
  generateStep1RoleDirectionCardsFromGarments,
  type Step1RoleDirectionUserContext,
} from "../../modules/step1-role-direction-task.js";

/**
 * 注册图片项目 Step 1 路由
 */
export function registerImageProjectStep1Routes(app: FastifyInstance, ctx: AppContext): void {

  // =========================================================================
  // 上传资产
  // =========================================================================

  app.post("/image-projects/:projectId/uploads", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as {
      files: Array<{ garmentAssetId: string; fileName: string; sizeMb: number }>;
    };
    const assets = await ctx.uploadService.upload(user, params.projectId, body.files);

    // 上传服饰后，更新项目封面和缩略图（取第一张主图）
    if (assets.length > 0) {
      const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
      const firstAsset = assets[0];
      if (firstAsset.garmentAssetId) {
        const garmentAsset = await ctx.repos.garmentAssets.findById(firstAsset.garmentAssetId);
        const mainImageUrl = garmentAsset?.mainImageUrl?.trim();
        if (mainImageUrl) {
          project.coverImageUrl = mainImageUrl;
          project.garmentImageUrl = mainImageUrl;
          project.thumbnailUrl = mainImageUrl;
          await ctx.projectService.saveProject(project);
        }
      }
    }

    return { assets };
  });

  // =========================================================================
  // POST /image-projects/:projectId/step1/outfits/recommend
  // =========================================================================

  app.post("/image-projects/:projectId/step1/outfits/recommend", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };

    // 如果项目已有搭配方案，说明是重新生成，跳过缓存
    const existingPlans = await ctx.repos.outfitPlans.findByProjectId(params.projectId);
    const bypassCache = existingPlans.length > 0;

    // 同步调用 OutfitService.recommend，等待 LLM 完成后返回 3 套完整方案
    const rawPlans = await ctx.outfitService.recommend(user, params.projectId, ctx, { bypassCache });
    const plans = rawPlans;

    // 从 plans 转换 analysisCards 格式
    const analysisCards = plans.map((plan) => ({
      index: plan.index,
      planId: plan.id,
      title: plan.title ?? "",
      styleName: plan.styleName ?? "",
      analysis: plan.analysis ?? "",
      optimizedPrompt: plan.optimizedPrompt ?? "",
      suitableScene: plan.suitableScene ?? "",
      tags: plan.tags ?? [],
      groundingSources: plan.groundingSources ?? [],
      status: "ready" as const,
      items: plan.items?.map((item) => ({
        type: item.type,
        name: item.name,
        description: item.description,
      })) ?? [],
    }));

    return {
      plans: plans.map((plan) => ({
        id: plan.id,
        index: plan.index,
        title: plan.title,
        reason: plan.reason,
        styleName: plan.styleName,
        assetIds: plan.assetIds,
        items: plan.items,
        analysis: plan.analysis,
        optimizedPrompt: plan.optimizedPrompt,
        trendSummary: plan.trendSummary,
        suitableScene: plan.suitableScene,
        tags: plan.tags,
        groundingSources: plan.groundingSources,
      })),
      analysisCards,
      taskStatus: "completed" as const,
      analysisStatus: "ready" as const,
    };
  });

  // =========================================================================
  // POST /image-projects/:projectId/step1/outfits/select
  // =========================================================================

  app.post("/image-projects/:projectId/step1/outfits/select", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as { planId: string };
    return await ctx.outfitService.select(user, params.projectId, body.planId);
  });

  // =========================================================================
  // POST /image-projects/:projectId/step1/outfits/unselect
  // =========================================================================

  app.post("/image-projects/:projectId/step1/outfits/unselect", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
    project.selectedOutfitPlanId = null;
    if (project.status === "IMAGE_OUTFIT_SELECTED" || project.status === "IMAGE_ROLE_DIRECTION_CONFIRMED") {
      project.status = "IMAGE_GARMENT_UPLOADED";
    }
    await ctx.projectService.saveProject(project);
    return { ok: true };
  });

  // =========================================================================
  // POST /image-projects/:projectId/step1/analyze-garment
  // 图片项目专属：LLM 看图分析单品，返回分类 + 属性 + 卖点 + 检测区域
  // =========================================================================

  app.post("/image-projects/:projectId/step1/analyze-garment", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    await ctx.projectService.requireOwnerProject(user, params.projectId);

    const body = request.body as { imageUrl?: string; fileName?: string } | undefined;
    const imageUrl = String(body?.imageUrl ?? "").trim();
    if (!imageUrl) {
      throw new AppError(400, "GARMENT_ANALYSIS_IMAGE_URL_REQUIRED", "imageUrl is required");
    }

    // 获取 provider
    let provider: ResolvedRouteProvider | null = null;
    try {
      provider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP1_FASHION_ANALYSIS);
    } catch {
      provider = null;
    }

    if (!provider) {
      throw new AppError(500, "GARMENT_ANALYSIS_PROVIDER_UNAVAILABLE", "图片分析服务未配置");
    }

    if (!isSupportedLlmImageUrl(imageUrl)) {
      throw new AppError(400, "GARMENT_ANALYSIS_IMAGE_UNSUPPORTED", "当前图片格式不支持智能识别");
    }

    const payload: Step1ImageClassificationPayload = {
      imageUrl,
      fileName: typeof body?.fileName === "string" ? body.fileName.trim() : undefined,
      target: "main",
      hasMainImage: false,
      existingOtherViewCount: 0,
    };

    return await requestStep1ImageClassification(ctx, provider, payload, ProviderRouteKeys.STEP1_FASHION_ANALYSIS, user.id, params.projectId);
  });

  // =========================================================================
  // POST /image-projects/:projectId/step1/role-direction-from-garments
  // 新流程：基于服饰信息+性别年龄生成角色预设（不依赖穿搭方案）
  // =========================================================================

  app.post("/image-projects/:projectId/step1/role-direction-from-garments", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as {
      gender: "male" | "female";
      ageRange: string;
    };

    // 验证项目归属
    await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 验证必填参数
    if (!body.gender || (body.gender !== "male" && body.gender !== "female")) {
      throw new AppError(400, "GENDER_REQUIRED", "性别参数必填，值为 male 或 female");
    }
    if (!body.ageRange || typeof body.ageRange !== "string" || body.ageRange.trim().length === 0) {
      throw new AppError(400, "AGE_RANGE_REQUIRED", "年龄段参数必填");
    }

    // 获取项目的服饰信息
    const garments = await ctx.repos.assets.findByProjectId(params.projectId);
    if (garments.length < 1) {
      throw new AppError(400, "GARMENTS_NOT_FOUND", "项目暂无服饰信息，请先上传服饰");
    }

    // 获取服饰资产详情（包含品类和描述）
    const garmentAssetIds = garments.filter((g) => g.garmentAssetId).map((g) => g.garmentAssetId!);
    const garmentAssets = await ctx.repos.garmentAssets.findByIds(garmentAssetIds);
    if (garmentAssets.length < 1) {
      throw new AppError(400, "GARMENT_ASSETS_NOT_FOUND", "项目暂无服饰资产详情，请先上传服饰");
    }

    const roleDirectionCount = 5;

    // 从年龄段解析年龄代表值
    // 范围格式 "0-1岁"、"2-6岁" 取末尾数字（婴儿/儿童用上限年龄代表更合理）
    // 单数字格式 "18岁" 直接取该数字
    const rangeMatch = body.ageRange.match(/(\d+)\s*[-~至–—]\s*(\d+)/);
    const age = rangeMatch
      ? parseInt(rangeMatch[2], 10)
      : parseInt(body.ageRange.match(/(\d+)/)?.[1] ?? "20", 10);

    // 构建用户方向提示
    const userDirectionHint: Step1RoleDirectionUserContext = {
      gender: body.gender,
      age,
      ageRange: body.ageRange,
      styleWords: null,
    };

    const result = await generateStep1RoleDirectionCardsFromGarments(
      ctx,
      app,
      params.projectId,
      user.id,
      garmentAssets,
      roleDirectionCount,
      userDirectionHint,
    );

    // 先查询数据库中的历史卡片
    const existingRecord = await ctx.repos.roleDirectionCards.findByProjectId(params.projectId);
    const existingCards: Array<{ directionId?: string }> = (existingRecord?.cardsJson ?? []) as Array<{ directionId?: string }>;

    // 生成新卡片，分配唯一 directionId 避免与历史冲突
    const newCards = result.roleDirectionCards.map((card, index) => ({
      ...card,
      directionId: `rd-${ctx.clock.generateId()}-${index}`,
    }));

    // 新卡片在前，历史卡片在后（按 directionId 去重）
    const newCardIds = new Set(newCards.map((c) => c.directionId));
    const historicalCards = existingCards.filter((c) => {
      const id = c?.directionId;
      return typeof id === "string" && !newCardIds.has(id);
    });
    const mergedCards = [...newCards, ...historicalCards];


    // 保存合并后的卡片到数据库
    await ctx.repos.roleDirectionCards.saveCards(params.projectId, mergedCards);

    return {
      status: "completed" as const,
      roleDirectionCards: mergedCards,
    };
  });

  // =========================================================================
  // PUT /image-projects/:projectId/role-direction
  // 更新图片项目的选中角色方向（Step1 角色预设）
  // =========================================================================

  app.put("/image-projects/:projectId/role-direction", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as { roleDirection: Record<string, unknown> | null };
    const { projectId } = params;
    const { roleDirection } = body;

    // 验证项目所有权
    const project = await ctx.projectService.requireOwnerProject(user, projectId);

    // 更新 selected_role_direction 字段
    await ctx.repos.projects.updateSelectedRoleDirection(projectId, roleDirection);

    // 同步 portraitUrl 到角色预设卡片表
    if (roleDirection) {
      const portraitUrl = roleDirection.portraitUrl;
      const directionId = roleDirection.directionId;
      if (typeof portraitUrl === "string" && typeof directionId === "string") {
        await ctx.repos.roleDirectionCards.updateCardPortraitUrl(projectId, directionId, portraitUrl);
      }

      // 更新项目状态为"角色方向已确认"
      if (project.status === "IMAGE_GARMENT_UPLOADED" || project.status === "IMAGE_DRAFT") {
        await ctx.repos.projects.updateStatus(projectId, "IMAGE_ROLE_DIRECTION_CONFIRMED");
      }
    }

    return { success: true };
  });

  // =========================================================================
  // POST /image-projects/:projectId/outfits/confirm
  // 确认穿搭方案，进入定妆阶段（Step2）
  // =========================================================================

  app.post("/image-projects/:projectId/outfits/confirm", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 验证已选择穿搭方案
    if (!project.selectedOutfitPlanId) {
      throw new AppError(400, "NO_OUTFIT_SELECTED", "请先选择穿搭方案");
    }

    // 更新状态为 IMAGE_OUTFIT_CONFIRMED
    project.status = "IMAGE_OUTFIT_CONFIRMED";
    await ctx.projectService.saveProject(project);
    return { ok: true, status: "IMAGE_OUTFIT_CONFIRMED" };
  });
}
