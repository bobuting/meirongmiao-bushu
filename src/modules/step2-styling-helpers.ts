/**
 * Step2 定妆辅助函数和常量
 *
 * 从 app.ts 提取的 Step2 造型/定妆相关工具函数，
 * 包含搭配上下文构建、图片解析、prompt 生成等。
 */

import type { AppContext } from "../core/app-context.js";
import type { CharacterViewKey } from "../contracts/types.js";
import { resolveGarmentImageUrl } from "../contracts/types.js";
import type { Step1OutfitModuleCategory } from "../contracts/step1-outfit-module-contract.js";
import { AppError } from "../core/errors.js";

// ---------- 常量 ----------

/** 视角参考图日志摘要最多条目数 */
const VIEW_REFERENCE_LIMIT = 12;

/** Step2 东亚审美约束指引 */
export const STEP2_EAST_ASIAN_AESTHETIC_GUIDELINE =
  "East-Asian aesthetic priority: oval/round/heart face with soft jawline; single or inner-double elongated eyes with subtle aegyo-sal; small straight nose with natural tip; thin or M-shaped muted lips; warm-neutral fair matte skin with visible pores; natural black straight or soft-wavy hair; gentle, calm, bookish temperament; slim standard body.";

/** Step2 固定负面提示词 */
export const STEP2_FIXED_NEGATIVE_PROMPT =
  "NSFW, nudity, heavy makeup, thick eyeliner, false eyelashes, colored contacts, beauty retouch skin, perfect smooth skin, mixed-race facial traits, overly westernized face, exaggerated high nose bridge, exaggerated double eyelids, double chin, obese body, messy background, bedroom scene, selfie camera angle, watermark, text, logo, 3D render, cartoon.";

/** 五视角定义（与 app.ts 中的 FIVE_VIEW_DEFINITIONS 保持一致） */
const FIVE_VIEW_DEFINITIONS = [
  { key: "front", label: "正面", promptSuffix: "full body front view" },
  { key: "left", label: "左侧", promptSuffix: "full body left side view" },
  { key: "right", label: "右侧", promptSuffix: "full body right side view" },
  { key: "back", label: "背面", promptSuffix: "full body back view" },
  { key: "closeup", label: "特写", promptSuffix: "upper body close-up portrait view" },
] as const;

export type FiveViewDefinition = (typeof FIVE_VIEW_DEFINITIONS)[number];

// ---------- 函数 ----------

/**
 * 根据项目已选搭配计划，构建搭配摘要文本
 */
export async function buildOutfitContextSummary(ctx: AppContext, projectId: string): Promise<string> {
  const project = await ctx.repos.projects.findById(projectId);
  if (!project || !project.selectedOutfitPlanId) {
    return "未指定搭配";
  }
  const plan = await ctx.repos.outfitPlans.findById(project.selectedOutfitPlanId);
  if (!plan) {
    return "未指定搭配";
  }
  const slotNames: string[] = [];
  for (const assetId of plan.assetIds) {
    const garmentAsset = await ctx.repos.garmentAssets.findById(assetId);
    if (garmentAsset) {
      slotNames.push(`${garmentAsset.category}:${garmentAsset.name}`);
      continue;
    }
    const uploadAsset = await ctx.repos.assets.findById(assetId);
    if (uploadAsset) {
      slotNames.push(`${uploadAsset.category ?? "unknown"}:${uploadAsset.fileName}`);
    }
  }
  if (slotNames.length === 0) {
    return "未指定搭配";
  }
  return slotNames.join(", ");
}

/**
 * 从项目已选搭配计划中解析各分类图片 URL
 * 使用新的分类系统（Step1OutfitModuleCategory）
 */
export async function resolveSelectedOutfitImages(ctx: AppContext, projectId: string): Promise<{
  outfitImageUrls: string[];
  outfitImageUrlsByCategory: Partial<Record<Step1OutfitModuleCategory, string>>;
}> {
  const categoryUrls: Partial<Record<Step1OutfitModuleCategory, string>> = {};
  const project = await ctx.repos.projects.findById(projectId);
  if (project?.selectedOutfitPlanId) {
    const plan = await ctx.repos.outfitPlans.findById(project.selectedOutfitPlanId);
    if (plan) {
      for (const assetId of plan.assetIds) {
        const garmentAsset = await ctx.repos.garmentAssets.findById(assetId);
        const assetUrl = garmentAsset ? resolveGarmentImageUrl(garmentAsset) : "";
        if (!assetUrl) {
          continue;
        }
        const category = garmentAsset?.category as Step1OutfitModuleCategory | undefined;
        if (category) {
          categoryUrls[category] = assetUrl;
        }
      }
    }
  }
  return {
    outfitImageUrls: Array.from(
      new Set(
        Object.values(categoryUrls)
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim()),
      ),
    ),
    outfitImageUrlsByCategory: categoryUrls,
  };
}

/**
 * 构建搭配图片不完整的警告列表
 */
export function buildStep2StylingWarnings(outfitImageUrlsByCategory: Partial<Record<Step1OutfitModuleCategory, string>>): string[] {
  if (outfitImageUrlsByCategory.top && outfitImageUrlsByCategory.bottom) {
    return [];
  }
  // 套装和连衣裙也算完整
  if (outfitImageUrlsByCategory.suit || outfitImageUrlsByCategory.dress) {
    return [];
  }
  return ["PRIMARY_GARMENT_INCOMPLETE"];
}

/**
 * 收集并校验 Step2 定妆所需的全部输入参数
 */
export async function requireStep2StylingInputs(
  ctx: AppContext,
  projectId: string,
): Promise<{
  outfitPrompt: string;
  outfitSummary: string;
  outfitImageUrls: string[];
  outfitImageUrlsByCategory: Partial<Record<Step1OutfitModuleCategory, string>>;
  warnings: string[];
}> {
  const outfitSummary = await buildOutfitContextSummary(ctx, projectId);
  const outfitPrompt = outfitSummary === "未指定搭配" ? "" : outfitSummary;
  const { outfitImageUrls, outfitImageUrlsByCategory } = await resolveSelectedOutfitImages(ctx, projectId);
  const warnings = buildStep2StylingWarnings(outfitImageUrlsByCategory);

  if (!outfitPrompt) {
    throw new AppError(400, "OUTFIT_PROMPT_REQUIRED", "outfit prompt is required");
  }
  if (outfitImageUrls.length < 1) {
    throw new AppError(400, "OUTFIT_IMAGE_REQUIRED", "outfit image is required");
  }
  return {
    outfitPrompt,
    outfitSummary,
    outfitImageUrls,
    outfitImageUrlsByCategory,
    warnings,
  };
}

/**
 * 将参考图片 URL 列表摘要为日志友好的短文本
 */
export function summarizeReferenceImagesForLog(referenceImages: string[]): string {
  return referenceImages
    .map((item) => {
      const normalized = item.trim();
      if (!normalized) {
        return "";
      }
      const parts = normalized.split(/[\\/]/);
      return parts[parts.length - 1] || normalized.slice(0, 48);
    })
    .filter((item) => item.length > 0)
    .slice(0, VIEW_REFERENCE_LIMIT)
    .join(" | ");
}

/**
 * 构建 Step2 定妆 prompt 和参考图片列表
 */
export function buildStep2StylingPromptAndImages(options: {
  mode: "preview" | "regenerate";
  viewDef: FiveViewDefinition;
  primaryImage: string;
  outfitInputs: { outfitPrompt: string; outfitSummary: string; outfitImageUrls: string[] };
  characterName?: string;
}): { prompt: string; images: string[] } {
  const images = Array.from(
    new Set([options.primaryImage, ...options.outfitInputs.outfitImageUrls].map((item) => item.trim()).filter((item) => item.length > 0)),
  );
  const promptPrefix =
    options.mode === "preview"
      ? `Character outfit fitting preview ${options.viewDef.label} (${options.viewDef.promptSuffix}). ` +
      `View key=${options.viewDef.key}. Keep character identity consistent. ` +
      `Character=${options.characterName ?? "unknown"}.`
      : `Regenerate character outfit preview ${options.viewDef.label} (${options.viewDef.promptSuffix}). ` +
      `View key=${options.viewDef.key}. Keep identity and outfit consistency.`;
  return {
    prompt:
      `${promptPrefix} OutfitPrompt=${options.outfitInputs.outfitPrompt}. OutfitSummary=${options.outfitInputs.outfitSummary}. ` +
      `AestheticConstraints=${STEP2_EAST_ASIAN_AESTHETIC_GUIDELINE} ` +
      `FixedNegativePrompt=${STEP2_FIXED_NEGATIVE_PROMPT}`,
    images,
  };
}
