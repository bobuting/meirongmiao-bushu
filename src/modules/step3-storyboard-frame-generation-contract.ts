import { sanitizeUrlField } from "../contracts/media-url-safety.js";

export interface Step3StoryboardFrameGenerationInput {
  visualPrompt: string;
  /** 角色参考图（五视图），用于锚定角色造型 */
  characterReferenceImages: string[];
  /** 服饰参考图（平铺图），用于锚定服饰细节 */
  garmentReferenceImages: string[];
  /** 服饰锚点标识（如 "outfit 1"），用于 prompt 中引用 */
  clothingAnchor?: string;
  /** 服饰正面特征描述（用于 prompt 中强调） */
  clothingFeatures?: string;
}

export interface Step3StoryboardFrameGenerationRequest {
  prompt: string;
  mode: "text_to_image" | "image_to_image";
  images?: string[];
  /** 负面提示词（用于禁止服饰变化） */
  negativePrompt?: string;
}

function trimText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 服饰一致性强制指令（正面强调） */
const GARMENT_CONSISTENCY_PREFIX = `[服饰一致性要求] 服饰必须与第一张参考图（服饰平铺图）完全一致，包括：logo位置、图案形状、颜色搭配、材质纹理、版型轮廓、细节装饰。禁止添加参考图中不存在的新元素。`;

/** 服饰一致性负面提示词（否定句式，禁止变化） */
const GARMENT_CONSISTENCY_NEGATIVE = "Do not change the clothing design, do not alter logos or brand marks, do not modify patterns or textures, do not change colors or color combinations, do not add elements not present in the reference image, do not alter the garment style, fit, or silhouette, do not generate outfit variations";

export function normalizeStep3StoryboardFrameGenerationInput(input: {
  visualPrompt?: string | null;
  characterReferenceImages?: string[] | null;
  garmentReferenceImages?: string[] | null;
  clothingAnchor?: string | null;
  clothingFeatures?: string | null;
}): Step3StoryboardFrameGenerationInput {
  const visualPrompt = trimText(input.visualPrompt) || "镜头画面提示词";
  const characterReferenceImages = Array.isArray(input.characterReferenceImages)
    ? [...new Set(
        input.characterReferenceImages
          .map((value) => sanitizeUrlField(value))
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      )]
    : [];
  const garmentReferenceImages = Array.isArray(input.garmentReferenceImages)
    ? [...new Set(
        input.garmentReferenceImages
          .map((value) => sanitizeUrlField(value))
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      )]
    : [];
  const clothingAnchor = trimText(input.clothingAnchor) || undefined;
  const clothingFeatures = trimText(input.clothingFeatures) || undefined;
  return {
    visualPrompt,
    characterReferenceImages,
    garmentReferenceImages,
    clothingAnchor,
    clothingFeatures,
  };
}

export function buildStep3StoryboardFrameGenerationRequest(
  input: Step3StoryboardFrameGenerationInput,
  promptOverride?: string | null,
): Step3StoryboardFrameGenerationRequest {
  const basePrompt = trimText(promptOverride) || input.visualPrompt;

  // 图片顺序：服饰参考图（平铺图）→ 角色参考图（五视图）
  // 第一张图对构图影响最大，确保服饰细节优先保持
  const images = [
    ...input.garmentReferenceImages,
    ...input.characterReferenceImages,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  // 构建增强的 prompt：正面强调服饰一致性
  let enhancedPrompt = basePrompt;
  if (images.length > 0 && input.garmentReferenceImages.length > 0) {
    // 有服饰参考图时，添加强制一致性指令
    const anchorHint = input.clothingAnchor ? ` 锚点：${input.clothingAnchor}` : "";
    const featuresHint = input.clothingFeatures ? ` 特征：${input.clothingFeatures}` : "";
    enhancedPrompt = `${GARMENT_CONSISTENCY_PREFIX}${anchorHint}${featuresHint}\n\n${basePrompt}`;
  }

  if (images.length < 1) {
    return {
      prompt: enhancedPrompt,
      mode: "text_to_image",
    };
  }

  return {
    prompt: enhancedPrompt,
    mode: "image_to_image",
    images,
    // 有服饰参考图时，添加负面提示词禁止服饰变化
    negativePrompt: input.garmentReferenceImages.length > 0 ? GARMENT_CONSISTENCY_NEGATIVE : undefined,
  };
}