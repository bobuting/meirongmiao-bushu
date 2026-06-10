/**
 * Step1 Outfit 路由注册
 * 搭配推荐、图片分类、背景去除、角色方向生成
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { User, GarmentAsset } from "../../contracts/types.js";
import type { ProjectRouteDeps } from "../project-route-shared.js";

import { AppError } from "../../core/errors.js";
import { requireUser } from "../../services/auth/route-guards.js";
import type { ResolvedRouteProvider } from "../../services/llm/provider-resolver.js";
import { resolveRouteProvider, recordRouteAudit } from "../../services/llm/provider-resolver.js";
import { persistImageSourceToStorage } from "../../services/media/storage-persist.js";
import { compactTextLine } from "../../utils/text.js";
import type { OutfitPlanDto } from "../../contracts/outfit-plan.dto.js";
import { validateOutfitPlanDto } from "../../contracts/outfit-plan.dto.js";
import { normalizeStep1OutfitAnalysisCard, type Step1OutfitAnalysisCard } from "../../contracts/step1-outfit-analysis-card-contract.js";
import { buildStep1ImageClothingGuardResponse } from "../../modules/step1-image-clothing-guard.js";
import { generateStep1RoleDirectionCardsFromGarments, type Step1RoleDirectionUserContext } from "../../modules/step1-role-direction-task.js";
import type { Step1OptimizedPromptGuidance } from "../../modules/step1-optimized-prompt-builder.js";
import { skillLoader } from "../../services/skills/index.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";

const STEP1_OUTFIT_OPTIMIZATION_CODE = "step1_outfit_optimization";
import type {
  Step1ImageClassificationPayload,
  Step1ImageClassificationResult,
  Step1ImageClassificationFeedback,
} from "../../app.js";

// ============ 变体检测辅助类型与函数 ============

/** 变体检测结果 */
interface VariantDetectionResult {
  variantGroupId: string | null;
  variantColor: string | null;
  siblings: GarmentAsset[];
}

/**
 * 检测项目内是否存在同款不同色的变体，自动关联
 * 规则：项目内同类目 + 材质/版型/领型/袖型一致 + 颜色不同 → 同一变体组
 * 第一件上传的为主色，后续为非主色
 */
async function detectAndLinkVariant(
  ctx: AppContext,
  projectId: string,
  newAsset: GarmentAsset,
): Promise<VariantDetectionResult> {
  const empty: VariantDetectionResult = { variantGroupId: null, variantColor: null, siblings: [] };

  // 新资产必须有 mainColor 才能参与匹配
  if (!newAsset.mainColor) return empty;

  // 获取项目内已关联的服饰资产
  const projectAssocs = await ctx.repos.projectGarmentAssocs.findByProjectId(projectId);
  const existingAssetIds = projectAssocs
    .map(a => a.garmentAssetId)
    .filter((id): id is string => Boolean(id) && id !== newAsset.id);
  if (existingAssetIds.length === 0) return empty;

  const existingAssets = await ctx.repos.garmentAssets.findByIds(existingAssetIds);

  // 匹配同款不同色：同类目 + 不同颜色 + 没有明显款式差异
  // 主要看 style（款式），其他属性辅助；material 准确率不高不匹配
  const hasObviousDiff = (a: string | null, b: string | null) =>
    a && b && a !== b;

  const match = existingAssets.find(c =>
    c.category === newAsset.category
    && c.mainColor
    && c.mainColor !== newAsset.mainColor
    && !hasObviousDiff(c.style, newAsset.style)       // 主要看款式
    && !hasObviousDiff(c.fit, newAsset.fit)           // 版型辅助
    && !hasObviousDiff(c.neckline, newAsset.neckline) // 领型辅助
    && !hasObviousDiff(c.sleeve, newAsset.sleeve),    // 袖型辅助
  );

  if (!match) return empty;

  // 关联到同一变体组
  const isNewGroup = !match.variantGroupId;
  const groupId = match.variantGroupId ?? `vg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (isNewGroup) {
    // 已有资产成为主色
    await ctx.repos.garmentAssets.updateVariantFields(match.id, {
      variantGroupId: groupId,
      variantColor: match.mainColor,
      isPrimaryVariant: true,
    });
  }

  // 新资产作为非主色
  await ctx.repos.garmentAssets.updateVariantFields(newAsset.id, {
    variantGroupId: groupId,
    variantColor: newAsset.mainColor,
    isPrimaryVariant: false,
  });

  // 获取组内所有成员（含新资产）
  const allAssetIds = [...existingAssetIds, newAsset.id];
  const allAssets = await ctx.repos.garmentAssets.findByIds(allAssetIds);
  const siblings = allAssets.filter(a => a.variantGroupId === groupId);

  return { variantGroupId: groupId, variantColor: newAsset.mainColor, siblings };
}

/**
 * 注册 Step1 Outfit 相关路由
 *
 * 路由列表:
 * - POST /projects/:projectId/outfits/recommend（同步返回 3 套搭配方案）
 * - POST /projects/:projectId/outfits/select
 * - POST /projects/:projectId/outfits/unselect
 * - POST /projects/:projectId/outfits/confirm（确认穿搭，进入定妆阶段）
 * - POST /projects/:projectId/outfits/analysis/optimize
 * - POST /projects/:projectId/step1/classify-image
 * - POST /step1/classify-image
 * - POST /projects/:projectId/step1/remove-bg
 * - POST /projects/:projectId/step1/role-direction-from-garments（基于服饰生成角色预设）
 */
export function registerStep1OutfitRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ProjectRouteDeps,
): void {
  const {
    requestLlmOptimizeOutfitPrompt,
    requestStep1ImageClassification,
    isSupportedLlmImageUrl,
    buildStep1ImageClassificationHeuristic,
    ROUTE_KEY_STEP1_FASHION_SEARCH,
  } = deps;

  // =========================================================================
  // 搭配推荐（同步调用 LLM，等待完成后返回）
  // =========================================================================

  app.post("/projects/:projectId/outfits/recommend", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };

    // 如果项目已有搭配方案，说明是重新生成，跳过缓存
    const existingPlans = await ctx.repos.outfitPlans.findByProjectId(params.projectId);
    const bypassCache = existingPlans.length > 0;

    // 同步调用 OutfitService.recommend，等待 LLM 完成后返回 3 套完整方案
    const rawPlans = await ctx.outfitService.recommend(user, params.projectId, ctx, { bypassCache });

    // 验证并转换为 OutfitPlanDto（必填字段为空直接报错）
    const outfitPlans: OutfitPlanDto[] = rawPlans.map((plan, idx) =>
      validateOutfitPlanDto(plan, idx)
    );

    // 使用 normalize 函数生成 analysisCards
    const analysisCards: Step1OutfitAnalysisCard[] = outfitPlans.map((plan) =>
      normalizeStep1OutfitAnalysisCard(plan, "ready")
    );

    // 返回完整的搭配方案（包含 LLM 生成的文字建议）
    analysisCards.forEach((card, i) => {
    });
    return {
      plans: outfitPlans,
      analysisCards,
      taskStatus: "completed" as const,
      analysisStatus: "ready" as const,
    };
  });

  app.post("/projects/:projectId/outfits/select", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as { planId: string };
    return await ctx.outfitService.select(user, params.projectId, body.planId);
  });

  app.post("/projects/:projectId/outfits/unselect", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
    project.selectedOutfitPlanId = null;
    if (project.status === "OUTFIT_SELECTED" || project.status === "OUTFIT_CONFIRMED") {
      project.status = "GARMENT_UPLOADED";
    }
    await ctx.projectService.saveProject(project);
    return { ok: true };
  });

  // =========================================================================
  // POST /projects/:projectId/outfits/confirm
  // 确认穿搭方案，进入定妆阶段（Step2）
  // =========================================================================
  app.post("/projects/:projectId/outfits/confirm", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 验证已选择穿搭方案
    if (!project.selectedOutfitPlanId) {
      throw new AppError(400, "NO_OUTFIT_SELECTED", "请先选择穿搭方案");
    }

    // 更新状态为 OUTFIT_CONFIRMED
    project.status = "OUTFIT_CONFIRMED";
    await ctx.projectService.saveProject(project);
    return { ok: true, status: "OUTFIT_CONFIRMED" };
  });

  app.post("/projects/:projectId/outfits/analysis/optimize", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    await ctx.projectService.requireOwnerProject(user, params.projectId);
    const body = request.body as {
      analysis: string;
      currentPrompt?: string;
      guidance?: {
        core?: string;
        bottom?: string;
        shoes?: string;
        accessory?: string;
      };
    };
    const analysis = typeof body.analysis === "string" ? body.analysis.trim() : "";
    if (!analysis) {
      throw new AppError(400, "ANALYSIS_REQUIRED", "analysis is required");
    }
    const llmProvider = await resolveRouteProvider(ctx, ROUTE_KEY_STEP1_FASHION_SEARCH);
    if (!llmProvider) {
      throw new AppError(
        503,
        "PROVIDER_POLICY_MISSING",
        "step1_fashion_search provider is not configured",
      );
    }

    const guidanceRaw = body.guidance && typeof body.guidance === "object" ? body.guidance : null;
    const guidance: Partial<Step1OptimizedPromptGuidance> | null = guidanceRaw
      ? {
          core: typeof guidanceRaw.core === "string" ? compactTextLine(guidanceRaw.core.trim(), 80) : undefined,
          bottom: typeof guidanceRaw.bottom === "string" ? compactTextLine(guidanceRaw.bottom.trim(), 80) : undefined,
          shoes: typeof guidanceRaw.shoes === "string" ? compactTextLine(guidanceRaw.shoes.trim(), 80) : undefined,
          accessory:
            typeof guidanceRaw.accessory === "string"
              ? compactTextLine(guidanceRaw.accessory.trim(), 80)
              : undefined,
        }
      : null;

// 底层 LLM 函数自动处理调试记录
    const optimized = await requestLlmOptimizeOutfitPrompt(
      llmProvider,
      analysis,
      guidance,
      {
        ctx,
        routeKey: ROUTE_KEY_STEP1_FASHION_SEARCH,
        businessContext: "Step1 提示词优化",
        projectId: params.projectId,
        userId: user.id,
      },
    );
    return {
      prompt: optimized.prompt || body.currentPrompt?.trim() || analysis,
      groundingSources: optimized.groundingSources,
    };
  });

  // =========================================================================
  // 图片分类
  // =========================================================================

  // 共享的 classify-image 核心逻辑，供有/无 projectId 两种路由复用
  // 当传入 sizeMb + user 时，分类成功后自动创建服饰资产（数据直接存库）
  async function handleClassifyImage(bodyRaw: unknown, auditTag: string, userId: string, projectId: string | undefined, user?: User) {
    const body = (bodyRaw as {
      imageUrl?: string;
      fileName?: string;
      target?: "main" | "other";
      hasMainImage?: boolean;
      existingOtherViewCount?: number;
      includeFeedback?: boolean;
      // 传入 sizeMb 表示需要自动创建服饰资产（图片项目上传场景）
      sizeMb?: number;
      source?: string;
    } | undefined) ?? {};
    const imageUrl = String(body.imageUrl ?? "").trim();
    if (!imageUrl) {
      throw new AppError(400, "STEP1_IMAGE_URL_REQUIRED", "imageUrl is required");
    }

    // 日志：记录传入参数（排查资产创建问题）
    app.log.info(
      {
        auditTag,
        userId,
        projectId,
        hasUser: Boolean(user),
        target: body.target,
        sizeMb: body.sizeMb,
      },
      "[classify-image] 函数调用参数",
    );

    const payload: Step1ImageClassificationPayload = {
      imageUrl,
      fileName: typeof body.fileName === "string" ? body.fileName.trim().slice(0, 120) : undefined,
      target: body.target === "other" ? "other" : "main",
      hasMainImage: body.hasMainImage === true,
      existingOtherViewCount: Math.max(
        0,
        Math.min(3, Math.floor(Number(body.existingOtherViewCount ?? 0) || 0)),
      ),
    };
    const fallbackResult = buildStep1ImageClassificationHeuristic(payload, auditTag);
    const includeFeedback = body.includeFeedback === true;
    let result: Step1ImageClassificationResult = fallbackResult;
    let classificationFeedback: Step1ImageClassificationFeedback | null = null;
    if (includeFeedback) {
      let provider: ResolvedRouteProvider | null = null;
      try {
        provider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP1_FASHION_ANALYSIS);
      } catch {
        provider = null;
      }
      if (provider && isSupportedLlmImageUrl(imageUrl)) {
        try {
          const llmResult = await requestStep1ImageClassification(ctx, provider, payload, ProviderRouteKeys.STEP1_FASHION_ANALYSIS, userId, projectId);
          result = llmResult;
          classificationFeedback = {
            category: llmResult.classification.category,
            confidence: llmResult.classification.confidence,
            viewLabel: llmResult.classification.viewLabel,
            reason: llmResult.classification.reason,
            mode: llmResult.mode,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          app.log.warn(
            { err: error, auditTag, target: payload.target, fileName: payload.fileName },
            "step1 image classification LLM call failed",
          );
          throw new AppError(502, "STEP1_LLM_CLASSIFY_FAILED", `图片分类识别失败：${errorMessage.slice(0, 200)}`);
        }
      } else if (includeFeedback && !provider) {
        throw new AppError(500, "STEP1_LLM_PROVIDER_MISSING", "图片识别服务未配置，请联系管理员。");
      } else if (includeFeedback && !isSupportedLlmImageUrl(imageUrl)) {
        throw new AppError(400, "STEP1_LLM_IMAGE_UNSUPPORTED", "当前图片格式不支持智能识别，请尝试其他图片。");
      }
    }

    // 分类成功后自动创建服饰资产（库上传场景：target=main 且是服饰图片）
    let createdAssetId: string | null = null;
    const isClothingImage = typeof result.isClothingImage === "boolean"
      ? result.isClothingImage
      : result.classification.category !== "unknown";

    // 日志：记录资产创建条件判断
    app.log.info(
      {
        auditTag,
        isClothingImage,
        payloadTarget: payload.target,
        hasUser: Boolean(user),
        willCreateAsset: isClothingImage && payload.target === "main" && Boolean(user),
      },
      "[classify-image] 资产创建条件判断",
    );

    // 库上传场景：自动创建资产，无需前端传递 sizeMb
    if (isClothingImage && payload.target === "main" && user) {
      app.log.info({ auditTag, category: result.classification.category }, "[classify-image] 开始创建服饰资产");

      const validCategories = ["top", "bottom", "shoes", "accessory", "suit", "dress", "outer"];
      const rawCat = result.classification.category;
      const category = validCategories.includes(rawCat) ? rawCat : "top";

      const created = await ctx.assetLibraryService.create(user, {
        name: result.clothingTitle || payload.fileName || `garment-${Date.now()}.png`,
        type: "image",
        category: category as "top" | "bottom" | "shoes" | "accessory" | "suit" | "dress" | "outer",
        mainImageUrl: imageUrl,
        sizeMb: body.sizeMb ?? 0, // 默认 0，前端不传也没关系
        source: body.source || "library-upload",
        description: result.clothingDescription,
        sellingPoints: result.sellingPoints?.length ? result.sellingPoints : undefined,
        classification: {
          category: result.classification.category,
          viewLabel: result.classification.viewLabel,
          confidence: result.classification.confidence,
          reason: result.classification.reason || "",
          garmentRegions: result.garments?.length ? result.garments : undefined,
        },
        ...(result.clothingAttributes ? {
          mainColor: result.clothingAttributes.mainColor,
          material: result.clothingAttributes.material,
          pattern: result.clothingAttributes.pattern,
          fit: result.clothingAttributes.fit,
          length: result.clothingAttributes.length,
          neckline: result.clothingAttributes.neckline,
          sleeve: result.clothingAttributes.sleeve,
          style: result.clothingAttributes.style,
          occasion: result.clothingAttributes.occasion,
        } : {}),
      });
      createdAssetId = created.id;
      app.log.info({ auditTag, assetId: createdAssetId }, "[classify-image] 服饰资产创建成功");

      // 变体检测：项目内上传时，检查是否与项目内已有资产同款不同色
      let variantInfo: VariantDetectionResult | null = null;
      if (projectId) {
        variantInfo = await detectAndLinkVariant(ctx, projectId, created);
        if (variantInfo.variantGroupId) {
          app.log.info(
            { auditTag, assetId: createdAssetId, variantGroupId: variantInfo.variantGroupId, siblingCount: variantInfo.siblings.length - 1 },
            "[classify-image] 检测到同款变体，已自动关联",
          );
        }
      }

      return {
        ...buildStep1ImageClothingGuardResponse(result, classificationFeedback),
        assetId: createdAssetId,
        variantGroupId: variantInfo?.variantGroupId ?? null,
        variantColor: variantInfo?.variantColor ?? null,
        variantSiblings: variantInfo?.siblings
          ?.filter(s => s.id !== createdAssetId)
          .map(s => ({ assetId: s.id, color: s.variantColor ?? s.mainColor ?? "", imageUrl: s.flatLayImageUrl ?? s.mainImageUrl }))
          ?? null,
      };
    } else {
      app.log.warn(
        { auditTag, isClothingImage, payloadTarget: payload.target, hasUser: Boolean(user) },
        "[classify-image] 跳过资产创建（条件不满足）",
      );
    }

    return {
      ...buildStep1ImageClothingGuardResponse(result, classificationFeedback),
      assetId: createdAssetId,
    };
  }

  // 需要 projectId 归属校验的路由（step1 项目内使用）
  // 传入 sizeMb 时自动创建服饰资产（图片项目场景）；不传则只分类（视频项目场景）
  app.post("/projects/:projectId/step1/classify-image", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    await ctx.projectService.requireOwnerProject(user, params.projectId);
    return handleClassifyImage(request.body, "step1-classify-feedback", user.id, params.projectId, user);
  });

  // 库上传场景：自动创建资产（需要传入 user 对象）
  app.post("/step1/classify-image", async (request) => {
    const user = await requireUser(ctx, request);
    return handleClassifyImage(request.body, "library-asset-classify", user.id, undefined, user);
  });

  // =========================================================================
  // 角色方向生成（新流程：基于服饰信息+性别年龄，不依赖穿搭方案）
  // =========================================================================

  /**
   * 新流程：用户先选择性别年龄，再生成角色预设
   * 不依赖穿搭方案，仅使用服饰信息和用户选择的性别年龄
   */
  app.post("/projects/:projectId/step1/role-direction-from-garments", async (request) => {
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
}
