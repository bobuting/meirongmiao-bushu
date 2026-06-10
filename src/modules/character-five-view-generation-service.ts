/**
 * 角色五视图生成服务
 * 负责调用即梦 API 生成五视图图板并上传到 OSS
 */

import { randomUUID } from "node:crypto";
import type { AppContext } from "../core/app-context.js";
import type { LibraryCharacter, CharacterFiveView, GarmentAsset, OutfitPlan } from "../contracts/types.js";
import { AppError } from "../core/errors.js";
import { ProviderRouteKeys, selectRouteKeyByAge } from "../contracts/provider-route-keys.js";
import { skillLoader } from "../services/skills/index.js";
import { resolveRouteProviderWithFallback } from "../services/llm/provider-resolver.js";
import { requestLlmImageGenerationUrl } from "../services/media/image-generation-providers.js";
import { persistImageSourceToStorage } from "../services/media/storage-persist.js";
import { AestheticLibraryService, type AestheticFeaturesResult } from "../services/aesthetic-library-service.js";
import { getCurrentQuarter } from "../utils/date-utils.js";
import { PromptOptimizer } from "../services/llm/prompt-optimizer.js";
import {
  getEthnicityBaseline,
  ETHNICITY_DICTIONARY,
} from "../contracts/ethnicity-dictionary.js";
import { getAgeGroupByAge } from "../constants/age-groups.js";

// ============================================================================
// 儿童专属提示词代码
// ============================================================================

const CHILD_PROMPT_CODE = "character_five_view_generation_child";

// ============================================================================
// 混血强度类型定义
// ============================================================================

type MixedIntensity = "strong" | "light";

interface EthnicityConfig {
  isMixed: boolean;
  primaryEthnicity: string | null;
  secondaryEthnicity: string | null;
  mixedType: string | null;
  mixedIntensity: MixedIntensity | null;
}

// ============================================================================
// 智能混血判断逻辑
// ============================================================================

/**
 * 智能混血判断逻辑
 * 根据 ethnicityOrRegion 自动判断是否混血，包含 30% 概率混血优化
 */
function parseEthnicityConfig(ethnicityOrRegion: string | null): EthnicityConfig {
  if (!ethnicityOrRegion) {
    // 默认：Asian + 30%概率轻微混血
    const randomMixed = Math.random() < 0.3;
    if (randomMixed) {
      return {
        isMixed: true,
        primaryEthnicity: "Asian",
        secondaryEthnicity: "Caucasian",
        mixedType: "Asian+Caucasian",
        mixedIntensity: "light",
      };
    }
    return {
      isMixed: false,
      primaryEthnicity: "Asian",
      secondaryEthnicity: null,
      mixedType: null,
      mixedIntensity: null,
    };
  }

  const normalized = ethnicityOrRegion.toLowerCase().trim();

  // 1. 显式混血标记 → 强混血
  if (normalized.includes("mixed") || normalized.includes("混血")) {
    const parts = normalized
      .replace(/mixed|混血/g, "")
      .split(/[+\-,\/]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      return {
        isMixed: true,
        primaryEthnicity: parts[0],
        secondaryEthnicity: parts[1],
        mixedType: `${parts[0]}+${parts[1]}`,
        mixedIntensity: "strong",
      };
    }
    return {
      isMixed: true,
      primaryEthnicity: "Asian",
      secondaryEthnicity: "Caucasian",
      mixedType: "Asian+Caucasian",
      mixedIntensity: "strong",
    };
  }

  // 2. 区域自动混血规则 → 强混血
  const regionMixedRules: Record<string, { primary: string; secondary: string; type: string }> = {
    "hong kong": { primary: "Asian", secondary: "Caucasian", type: "Asian+Caucasian" },
    macau: { primary: "Asian", secondary: "Caucasian", type: "Asian+Caucasian" },
    singapore: { primary: "Asian", secondary: "Caucasian", type: "Asian+Caucasian" },
    california: { primary: "Asian", secondary: "Caucasian", type: "Asian+Caucasian" },
    canada: { primary: "Asian", secondary: "Caucasian", type: "Asian+Caucasian" },
    brazil: { primary: "Latino", secondary: "Asian", type: "Latino+Asian" },
    paris: { primary: "Caucasian", secondary: "Asian", type: "Caucasian+Asian" },
  };

  for (const [region, config] of Object.entries(regionMixedRules)) {
    if (normalized.includes(region)) {
      return {
        isMixed: true,
        primaryEthnicity: config.primary,
        secondaryEthnicity: config.secondary,
        mixedType: config.type,
        mixedIntensity: "strong",
      };
    }
  }

  // 3. 单一种族 → 30%概率轻微混血（核心优化）
  const randomMixed = Math.random() < 0.3;

  if (randomMixed) {
    const lightMixedCombinations: Record<string, { secondary: string; type: string }> = {
      asian: { secondary: "Caucasian", type: "Asian+Caucasian" },
      caucasian: { secondary: "Asian", type: "Caucasian+Asian" },
      african: { secondary: "Caucasian", type: "African+Caucasian" },
      latino: { secondary: "Asian", type: "Latino+Asian" },
      "middle eastern": { secondary: "Caucasian", type: "MiddleEastern+Caucasian" },
    };

    const primaryEthnicity = normalized;
    const combo = lightMixedCombinations[primaryEthnicity] || {
      secondary: "Caucasian",
      type: `${primaryEthnicity}+Caucasian`,
    };

    return {
      isMixed: true,
      primaryEthnicity,
      secondaryEthnicity: combo.secondary,
      mixedType: combo.type,
      mixedIntensity: "light",
    };
  }

  // 4. 单一种族 → 不混血
  return {
    isMixed: false,
    primaryEthnicity: normalized,
    secondaryEthnicity: null,
    mixedType: null,
    mixedIntensity: null,
  };
}

// ============================================================================
// 提示词模板选择逻辑
// ============================================================================

/**
 * 根据 age 和场景选择提示词模板
 *
 * 优先级：儿童 > 场景专用 > 成人默认
 */
function selectPromptCode(options: {
  age?: string | null;
  defaultCode: string;
}): string {
  // 儿童角色（age <= 12）— 混血特征通过变量注入，复用同一模板
  if (options.age && Number(options.age) <= 12) {
    return CHILD_PROMPT_CODE;
  }

  // 成人角色：使用调用方指定的场景专用模板
  return options.defaultCode;
}

// ============================================================================
// 从项目 ID 解析提示词数据
// ============================================================================

/** 从角色方向预设构建角色预设文本（不使用 styleSummary，它是过渡提示，不是风格描述） */
function buildCharacterPresetFromRoleDirection(roleDirection: unknown): string | null {
  if (!roleDirection || typeof roleDirection !== "object") return null;
  const rd = roleDirection as Record<string, unknown>;
  const parts: string[] = [];
  // 只使用 title，不使用 styleSummary（它是 Step1→Step2 的过渡提示）
  if (typeof rd.title === "string" && rd.title.trim()) parts.push(rd.title.trim());
  if (typeof rd.gender === "string" && rd.gender.trim()) parts.push(`Gender: ${rd.gender}`);
  if (typeof rd.age === "number") parts.push(`Age: ${rd.age}`);
  // 使用 styleWords 作为风格关键词
  if (Array.isArray(rd.styleWords) && rd.styleWords.length > 0) {
    parts.push(`Style: ${(rd.styleWords as string[]).filter(Boolean).join(", ")}`);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

/** 从服饰列表构建服饰描述文本 */
function buildOutfitInfoFromGarments(garments: GarmentAsset[]): string | null {
  if (garments.length === 0) return null;
  const categoryOrder: Record<string, number> = { top: 1, bottom: 2, shoes: 3, accessory: 4 };
  const categoryLabels: Record<string, string> = { top: "上装", bottom: "下装", shoes: "鞋子", accessory: "配饰" };
  const sorted = [...garments].sort((a, b) => (categoryOrder[a.category] ?? 99) - (categoryOrder[b.category] ?? 99));
  const descriptions = sorted.map((g) => {
    const parts = [
      g.name,
      g.description,
      g.mainColor ? `${g.mainColor} color` : null,
      g.material ? `${g.material} material` : null,
      g.style ? `${g.style} style` : null,
    ].filter(Boolean);
    const label = categoryLabels[g.category] ?? g.category;
    return `${label}: ${parts.join(", ")}`;
  });
  return descriptions.join("\n");
}

/** 从搭配方案构建已选搭配文本 */
function buildOutfitMatchingFromPlan(plan: OutfitPlan | null): string | null {
  if (!plan) return null;
  const parts: string[] = [];
  if (plan.title?.trim()) parts.push(`Title: ${plan.title.trim()}`);
  if (plan.styleName?.trim()) parts.push(`Style: ${plan.styleName.trim()}`);
  if (plan.reason?.trim()) parts.push(`Reason: ${plan.reason.trim()}`);
  if (Array.isArray(plan.items) && plan.items.length > 0) {
    const itemsText = plan.items
      .map((item) => `${item.type}: ${item.name}${item.description ? ` - ${item.description}` : ""}`)
      .join("; ");
    parts.push(`Items: ${itemsText}`);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * 从项目 ID 解析所有提示词数据（角色预设、服饰描述、已选搭配、平铺图）
 * 当用户未显式传入时，后端自动从数据库获取
 */
async function resolvePromptDataFromProject(
  ctx: AppContext,
  projectId: string,
): Promise<{
  characterPreset: string | null;
  outfitInfo: string | null;
  outfitMatching: string | null;
  flatLayImageUrls: string[];
  // 角色特征字段（用于五视图生成）
  ethnicity: string | null;
  gender: string | null;
  age: string | null;
}> {
  // 1. 查询项目获取 selectedRoleDirection 和 selectedOutfitPlanId
  const project = await ctx.repos.projects.findById(projectId);
  if (!project) {
    throw new AppError(400, "PROJECT_NOT_FOUND", "项目不存在");
  }

  // 2. 角色预设：从 selectedRoleDirection 提取
  const characterPreset = buildCharacterPresetFromRoleDirection(project.selectedRoleDirection);

  // 2.1 提取角色特征字段
  const rd = project.selectedRoleDirection;
  const ethnicity = rd?.ethnicityOrRegion ?? null;
  const gender = rd?.gender ?? null;
  const age = rd?.age != null ? String(rd.age) : null;

  // 3. 已选搭配：从 selectedOutfitPlanId 查询 OutfitPlan
  let outfitMatching: string | null = null;
  if (project.selectedOutfitPlanId) {
    const outfitPlan = await ctx.repos.outfitPlans.findById(project.selectedOutfitPlanId);
    outfitMatching = buildOutfitMatchingFromPlan(outfitPlan);
  }

  // 4. 服饰描述 + 平铺图：从关联的 garmentAssets 提取
  const assocs = await ctx.repos.projectGarmentAssocs.findByProjectId(projectId);
  if (assocs.length === 0) {
    throw new AppError(400, "NO_PROJECT_GARMENTS", "项目未关联任何服饰资产");
  }
  const garmentIds = assocs.map((a) => a.garmentAssetId);
  const garmentAssets = await ctx.repos.garmentAssets.findByIds(garmentIds);
  const outfitInfo = buildOutfitInfoFromGarments(garmentAssets);
  const flatLayImageUrls = garmentAssets
    .map((g) => g.flatLayImageUrl?.trim())
    .filter(Boolean) as string[];
  if (flatLayImageUrls.length === 0) {
    throw new AppError(400, "NO_FLATLAY_IMAGES", "项目关联的服饰均未生成平铺图");
  }

  return { characterPreset, outfitInfo, outfitMatching, flatLayImageUrls, ethnicity, gender, age };
}

// ============================================================================
// 服饰搭配五视图（项目内）
// ============================================================================

const PROMPT_CODE = "character_five_view_generation";
const OUTFIT_PORTRAIT_PROMPT_CODE = "character_five_view_generation_outfit_portrait";

export interface FiveViewGenerationOptions {
  characterId?: string;
  /** 项目 ID（用于查询关联的服饰平铺图） */
  projectId?: string;
  /** 提示词模板代码（默认使用 character_five_view_generation） */
  promptCode?: string;
  /** 已选角色预设信息 */
  characterPreset?: string;
  /** 服饰信息 */
  outfitInfo?: string;
  /** 已选搭配信息 */
  outfitMatching?: string;
  /** 服饰平铺图 URL（显式传入时跳过数据库查询） */
  flatLayImageUrls?: string[];
  /** 已存在的五视图记录 ID（传入时只更新该记录，不创建新记录） */
  existingViewId?: string;
}

/**
 * 生成服饰搭配五视图（项目内）
 * 根据项目 ID 查询关联的服饰平铺图作为参考，生成角色穿这套衣服的五视图
 *
 * 优先级：options 显式传入 > 从 projectId 数据库查询
 *
 * 新增功能：
 * - 智能混血判断（30%概率混血）
 * - 审美特征库动态注入
 * - 儿童专属提示词模板选择
 */
export async function generateCharacterFiveView(
  ctx: AppContext,
  character: LibraryCharacter,
  options?: FiveViewGenerationOptions,
): Promise<CharacterFiveView> {
  const characterId = options?.characterId ?? character.id;
  const now = ctx.clock.now();
  // 使用传入的已存在记录 ID，或生成新 ID
  const viewId = options?.existingViewId ?? randomUUID();
  const isPreviewOnly = !characterId;
  const isUpdateMode = Boolean(options?.existingViewId);

  try {
    // 1. 解析服饰平铺图和提示词数据
    // 优先级：options 显式传入 > 从 projectId 数据库查询
    let flatLayImageUrls = options?.flatLayImageUrls ?? [];
    let characterPreset = options?.characterPreset;
    let outfitInfo = options?.outfitInfo;
    let outfitMatching = options?.outfitMatching;
    // 角色特征字段
    let ethnicity: string | null | undefined;
    let gender: string | null | undefined;
    let age: string | null | undefined;

    if (options?.projectId) {
      const projectData = await resolvePromptDataFromProject(ctx, options.projectId);
      // 仅当 options 未显式传入时才使用数据库值
      if (flatLayImageUrls.length === 0) flatLayImageUrls = projectData.flatLayImageUrls;
      if (!characterPreset) characterPreset = projectData.characterPreset ?? undefined;
      if (!outfitInfo) outfitInfo = projectData.outfitInfo ?? undefined;
      if (!outfitMatching) outfitMatching = projectData.outfitMatching ?? undefined;
      // 角色特征字段
      ethnicity = projectData.ethnicity;
      gender = projectData.gender;
      age = projectData.age;
    }

    // 2. 校验必需参数（此函数仅处理项目内服饰搭配五视图）
    if (flatLayImageUrls.length === 0) {
      throw new AppError(400, "BAD_REQUEST", "缺少服饰平铺图 URL，请提供 projectId 或显式传入 flatLayImageUrls");
    }
    if (!characterPreset) {
      throw new AppError(400, "BAD_REQUEST", "缺少角色预设信息，请先在 Step1 选择角色预设");
    }

    // ========== 新增：智能混血判断 + 审美特征库集成 ==========

    // 3. 智能混血判断（核心优化：30%概率混血）
    const ethnicityConfig = parseEthnicityConfig(ethnicity ?? null);

    // 4. 审美特征库提取（动态注入主流审美特征）
    const aestheticLibraryService = new AestheticLibraryService(ctx.repos.aestheticLibrary);
    const aestheticFeatures = await aestheticLibraryService.extractAestheticFeatures(
      ethnicityConfig.primaryEthnicity,
      age ? Number(age) : null,
      "current",
    );

    // 5. 选择提示词模板（儿童优先，否则成人默认）
    const promptCode = selectPromptCode({
      age,
      defaultCode: PROMPT_CODE,
    });

    // 6. 构建提示词变量（新增混血配置 + 细化审美特征）
    const promptVariables: Record<string, string | null | undefined | boolean | AestheticFeaturesResult> = {
      characterPreset,
      outfitInfo,
      outfitMatching,
      outfitImageUrl: flatLayImageUrls.join(","),
      // 原有角色特征字段
      ethnicity,
      gender,
      age: age ?? undefined,
      ageRange: age ? getAgeGroupByAge(Number(age)) : undefined,
      // 混血特征字段（null → undefined，避免 Zod 验证失败）
      mixedEthnicity: ethnicityConfig.isMixed,
      primaryEthnicity: ethnicityConfig.primaryEthnicity ?? undefined,
      secondaryEthnicity: ethnicityConfig.secondaryEthnicity ?? undefined,
      mixedIntensity: ethnicityConfig.mixedIntensity ?? undefined,
      // 新增：种族特征描述（只注入匹配的那一条，null → undefined）
      ethnicityBaseline: getEthnicityBaseline(ethnicityConfig.primaryEthnicity) ?? undefined,
      // 新增：细化审美特征库注入（动态）
      aestheticFeatures,
      trendPeriod: getCurrentQuarter(),
    };

    // 7. 构建提示词并调用图片生成
    const { system, user } = await skillLoader.render(promptCode, { variables: promptVariables });

    // 根据角色年龄选择对应的 RouteKey
    const routeKey = selectRouteKeyByAge(
      age ? Number(age) : null,
      ProviderRouteKeys.STEP2_FIVE_VIEW_GENERATION_CHILD,
      ProviderRouteKeys.STEP2_FIVE_VIEW_GENERATION_ADULT,
    );
    const routeResult = await resolveRouteProviderWithFallback(ctx, [routeKey]);
    if (!routeResult) {
      throw new AppError(503, "PROVIDER_NOT_FOUND", "图片生成服务未配置");
    }
    const provider = routeResult.provider;

    // 使用 PromptOptimizer 根据模型类型优化提示词
    const userPrompt = PromptOptimizer.optimize(provider.model, system, user);

    const generatedResult = await requestLlmImageGenerationUrl(provider, userPrompt, {
      mode: "image_to_image",
      images: flatLayImageUrls.slice(0, 3),
      ratio: "16:9",
      resolution: process.env.FIVE_VIEW_RESOLUTION ?? "4k", // 从环境变量读取五视图分辨率
      temperature: 0.3, // 降低 temperature（原默认 0.7），提高忠实度，减少创意化
      debugOptions: {
        ctx,
        routeKey,
        businessContext: "Step2 五视图生成（服饰搭配）",
        projectId: options?.projectId,
        userId: character.userId,
        messages: [
          { role: "images", content: JSON.stringify(flatLayImageUrls) },
          { role: "prompt", content: userPrompt },
        ],
      },
    });

    const ossKeyPrefix = characterId ? `five-views/${characterId}` : `five-views/preview/${viewId}`;
    const ossUrl = await persistImageSourceToStorage(ctx, generatedResult.url, ossKeyPrefix, {
      persistRemote: true,
      optimize: true,
    });

    // 预览模式：返回生成结果，不写数据库
    if (isPreviewOnly) {
      return {
        id: viewId,
        characterId: "",
        imageUrl: ossUrl,
        status: "ready" as const,
        isActive: false,
        prompt: userPrompt,
        model: provider.model,
        generationParams: null,
        errorMessage: null,
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      };
    }

    // 更新模式：只更新已有记录，不创建新记录
    if (isUpdateMode) {
      const view: CharacterFiveView = {
        id: viewId,
        characterId,
        imageUrl: ossUrl,
        status: "ready",
        isActive: false,
        prompt: userPrompt,
        model: provider.model,
        generationParams: null,
        errorMessage: null,
        retryCount: 0,
        createdAt: now, // 保持原创建时间，这里用 now 是因为没有传入原值
        updatedAt: ctx.clock.now(),
      };

      await ctx.repos.characterFiveViews.update(view);
      await ctx.repos.characterFiveViews.setActive(characterId, viewId);

      // 更新角色：图片 + 状态（processing → ready）
      character.fiveViewOssImageUrl = ossUrl;
      character.status = "ready";
      character.updatedAt = ctx.clock.now();
      await ctx.repos.libraryCharacters.upsert(character);

      return view;
    }

    // 非预览、非更新模式：不应发生，抛出错误
    throw new AppError(400, "BAD_REQUEST", "generateCharacterFiveView 需要 characterId 或 existingViewId");
  } catch (error) {
    throw error;
  }
}

// ============================================================================
// 服饰+真人结合五视图（项目内 + 角色头像）
// ============================================================================

export interface OutfitPortraitFiveViewOptions {
  characterId?: string;
  /** 项目 ID（用于查询关联的服饰平铺图） */
  projectId?: string;
  /** 角色头像 URL（OSS 链接，image_to_image 参考图） */
  portraitImageUrl: string;
  /** 服饰信息 */
  outfitInfo?: string;
  /** 已选搭配信息 */
  outfitMatching?: string;
}

/**
 * 生成服饰+真人结合五视图（项目内 + 角色头像同时传入）
 * 参考图同时包含服饰平铺图和角色头像
 *
 * 仅以真人照片为身份参考，服饰信息从项目数据获取，不传角色文字信息
 */
export async function generateOutfitPortraitFiveView(
  ctx: AppContext,
  character: LibraryCharacter,
  options: OutfitPortraitFiveViewOptions,
): Promise<CharacterFiveView> {
  const characterId = options?.characterId ?? character.id;
  const now = ctx.clock.now();
  const viewId = randomUUID();
  const isPreviewOnly = !characterId;

  try {
    // 1. 解析服饰平铺图和服饰描述
    let flatLayImageUrls: string[] = [];
    let outfitInfo = options?.outfitInfo;
    let outfitMatching = options?.outfitMatching;

    if (options?.projectId) {
      const projectData = await resolvePromptDataFromProject(ctx, options.projectId);
      flatLayImageUrls = projectData.flatLayImageUrls;
      if (!outfitInfo) outfitInfo = projectData.outfitInfo ?? undefined;
      if (!outfitMatching) outfitMatching = projectData.outfitMatching ?? undefined;
    }

    // 2. 构建参考图数组：平铺图 + 角色头像
    const referenceImages = [...flatLayImageUrls, options.portraitImageUrl];

    // 3. 真人+服饰五视图：照片为唯一身份参考，不传角色文字信息（避免与照片矛盾）
    const promptCode = OUTFIT_PORTRAIT_PROMPT_CODE;

    const promptVariables: Record<string, string | null | undefined> = {
      characterImageUrl: options.portraitImageUrl,
      outfitImageUrl: flatLayImageUrls.length > 0 ? flatLayImageUrls.join(",") : undefined,
      outfitInfo,
      outfitMatching,
    };

    const { system, user } = await skillLoader.render(promptCode, { variables: promptVariables });

    // 7. 调用图片生成
    // 根据角色年龄选择对应的 RouteKey
    const routeKey = selectRouteKeyByAge(
      character.age ? Number(character.age) : null,
      ProviderRouteKeys.STEP2_FIVE_VIEW_GENERATION_CHILD,
      ProviderRouteKeys.STEP2_FIVE_VIEW_GENERATION_ADULT,
    );
    const routeResult = await resolveRouteProviderWithFallback(ctx, [routeKey]);
    if (!routeResult) {
      throw new AppError(503, "PROVIDER_NOT_FOUND", "图片生成服务未配置");
    }
    const provider = routeResult.provider;

    // 使用 PromptOptimizer 根据模型类型优化提示词
    const userPrompt = PromptOptimizer.optimize(provider.model, system, user);

    const generatedResult = await requestLlmImageGenerationUrl(provider, userPrompt, {
      mode: "image_to_image",
      images: referenceImages.slice(0, 4),
      ratio: "16:9",
      resolution: process.env.FIVE_VIEW_RESOLUTION ?? "4k", // 从环境变量读取五视图分辨率
      temperature: 0.3, // 降低 temperature（原默认 0.7），提高忠实度，减少创意化
      debugOptions: {
        ctx,
        routeKey,
        businessContext: "五视图生成（服饰+真人结合）",
        projectId: options?.projectId,
        userId: character.userId,
        messages: [
          { role: "images", content: JSON.stringify(referenceImages) },
          { role: "prompt", content: userPrompt },
        ],
      },
    });

    const ossKeyPrefix = characterId ? `five-views/${characterId}` : `five-views/preview/${viewId}`;
    const ossUrl = await persistImageSourceToStorage(ctx, generatedResult.url, ossKeyPrefix, {
      persistRemote: true,
      optimize: true,
    });

    // 预览模式：跳过所有 DB 操作
    if (isPreviewOnly) {
      return {
        id: viewId,
        characterId: "",
        imageUrl: ossUrl,
        status: "ready" as const,
        isActive: false,
        prompt: userPrompt,
        model: provider.model,
        generationParams: null,
        errorMessage: null,
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      };
    }

    // 生成成功：创建记录 + 激活 + 同步到角色表
    const view: CharacterFiveView = {
      id: viewId,
      characterId,
      imageUrl: ossUrl,
      status: "ready",
      isActive: false,
      prompt: userPrompt,
      model: provider.model,
      generationParams: null,
      errorMessage: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: ctx.clock.now(),
    };

    await ctx.repos.characterFiveViews.create(view);
    await ctx.repos.characterFiveViews.setActive(characterId, viewId);

    character.fiveViewOssImageUrl = ossUrl;
    character.updatedAt = ctx.clock.now();
    await ctx.repos.libraryCharacters.upsert(character);

    return view;
  } catch (error) {
    throw error;
  }
}

// ============================================================================
// 真人五视图（角色管理页）
// ============================================================================

const REAL_PORTRAIT_PROMPT_CODE = "character_five_view_generation_real_portrait";

export interface RealPortraitFiveViewOptions {
  characterId?: string;
  /** 角色头像 URL（OSS 链接，image_to_image 参考图） */
  portraitImageUrl?: string;
}

/**
 * 生成真人五视图（角色管理页）
 * 使用用户上传的头像作为参考图，通过 image_to_image 模式生成五视图
 *
 * 仅以照片为唯一身份参考，不传角色文字信息
 */
export async function generateRealPortraitFiveView(
  ctx: AppContext,
  character: LibraryCharacter,
  options?: RealPortraitFiveViewOptions,
): Promise<CharacterFiveView> {
  const characterId = options?.characterId ?? character.id;
  const now = ctx.clock.now();
  const viewId = randomUUID();
  const isPreviewOnly = !characterId;

  // 预览模式：不创建 processing 记录，直接生成
  if (isPreviewOnly) {
    return await generateRealPortraitFiveViewPreviewOnly(ctx, character, viewId, now, options);
  }

  // 持久化模式：先创建 processing 状态记录，再生成
  const processingView: CharacterFiveView = {
    id: viewId,
    characterId,
    imageUrl: null,
    status: "processing",
    isActive: false,
    prompt: null,
    model: null,
    generationParams: null,
    errorMessage: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await ctx.repos.characterFiveViews.create(processingView);

  try {
    const result = await executeRealPortraitGeneration(ctx, character, viewId, options);

    // 生成成功：更新为 ready 状态
    const readyView: CharacterFiveView = {
      ...processingView,
      imageUrl: result.imageUrl,
      status: "ready",
      prompt: result.prompt,
      model: result.model,
      updatedAt: ctx.clock.now(),
    };

    await ctx.repos.characterFiveViews.update(readyView);
    await ctx.repos.characterFiveViews.setActive(characterId, viewId);

    // 同步到角色表
    character.fiveViewOssImageUrl = result.imageUrl;
    character.updatedAt = ctx.clock.now();
    await ctx.repos.libraryCharacters.upsert(character);

    return readyView;
  } catch (error) {
    // 生成失败：更新为 failed 状态
    const failedView: CharacterFiveView = {
      ...processingView,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      updatedAt: ctx.clock.now(),
    };

    await ctx.repos.characterFiveViews.update(failedView);
    throw error;
  }
}

/** 执行真人五视图生成（核心逻辑） */
async function executeRealPortraitGeneration(
  ctx: AppContext,
  character: LibraryCharacter,
  viewId: string,
  options?: RealPortraitFiveViewOptions,
): Promise<{ imageUrl: string; prompt: string; model: string }> {
  // 1. 获取角色头像 URL（优先使用传入的，否则用角色的）
  const portraitUrl = options?.portraitImageUrl || character.thumbnailUrl;
  if (!portraitUrl) {
    throw new AppError(400, "BAD_REQUEST", "缺少角色头像 URL，无法生成真人五视图");
  }

  // 真人五视图：仅以照片为唯一身份参考，不传角色文字信息（避免文字描述与照片矛盾）
  const promptCode = REAL_PORTRAIT_PROMPT_CODE;

  const promptVariables: Record<string, string | null | undefined> = {
    characterImageUrl: portraitUrl,
  };

  const { system, user } = await skillLoader.render(promptCode, { variables: promptVariables });

  // 6. 调用图片生成（image_to_image 模式，使用角色头像作为参考）
  // 根据角色年龄选择对应的 RouteKey
  const routeKey = selectRouteKeyByAge(
    character.age ? Number(character.age) : null,
    ProviderRouteKeys.STEP2_FIVE_VIEW_GENERATION_CHILD,
    ProviderRouteKeys.STEP2_FIVE_VIEW_GENERATION_ADULT,
  );
  const routeResult = await resolveRouteProviderWithFallback(ctx, [routeKey]);
  if (!routeResult) {
    throw new AppError(503, "PROVIDER_NOT_FOUND", "图片生成服务未配置");
  }
  const provider = routeResult.provider;

  // 使用 PromptOptimizer 根据模型类型优化提示词
  const userPrompt = PromptOptimizer.optimize(provider.model, system, user);

  const generatedResult = await requestLlmImageGenerationUrl(provider, userPrompt, {
    mode: "image_to_image",
    images: [portraitUrl],
    ratio: "16:9",
    resolution: process.env.FIVE_VIEW_RESOLUTION ?? "4k", // 从环境变量读取五视图分辨率
    temperature: 0.3, // 降低 temperature（原默认 0.7），提高忠实度，减少创意化
    debugOptions: {
      ctx,
      routeKey,
      businessContext: "真人五视图生成（角色管理页）",
      userId: character.userId,
      messages: [
        { role: "images", content: JSON.stringify([portraitUrl]) },
        { role: "prompt", content: userPrompt },
      ],
    },
  });

  const ossKeyPrefix = `five-views/${viewId}`;
  const ossUrl = await persistImageSourceToStorage(ctx, generatedResult.url, ossKeyPrefix, {
    persistRemote: true,
    optimize: true,
  });

  return { imageUrl: ossUrl, prompt: userPrompt, model: provider.model };
}

/** 预览模式：不创建 processing 记录，直接生成返回 */
async function generateRealPortraitFiveViewPreviewOnly(
  ctx: AppContext,
  character: LibraryCharacter,
  viewId: string,
  now: number,
  options?: RealPortraitFiveViewOptions,
): Promise<CharacterFiveView> {
  const result = await executeRealPortraitGeneration(ctx, character, viewId, options);

  return {
    id: viewId,
    characterId: "",
    imageUrl: result.imageUrl,
    status: "ready" as const,
    isActive: false,
    prompt: result.prompt,
    model: result.model,
    generationParams: null,
    errorMessage: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}
