import type { ClothingStyleCategory } from "../contant-config/style-atmosphere-dict.js";
import type { Step1OutfitModuleCategory, Step1OutfitViewLabel } from "../contracts/step1-outfit-module-contract.js";
import { GARMENT_CATEGORY, type GarmentCategory } from "../contant-config/shared_dict.js";

export interface Step1ImageClassificationSnapshot {
  mode: "llm" | "heuristic";
  isClothingImage?: boolean;
  classification: {
    category: Step1OutfitModuleCategory;
    confidence: number;
    viewLabel: Step1OutfitViewLabel;
    reason: string | null;
  };
  /** 检测到的服饰区域（用于平铺图遮罩预处理） */
  garments?: Array<{
    index: number;
    category: Step1OutfitModuleCategory;
    isMainSubject: boolean;
    visibility: "full" | "partial" | "cropped";
    confidence: number;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
  multiViewWarning: string | null;
  clothingTitle?: string | null;
  clothingDescription?: string | null;
  // 服饰风格标签（统一字典），用于和视频热榜脚本风格匹配
  clothingStyle?: ClothingStyleCategory[] | null;
  // 服饰详细属性
  clothingAttributes?: {
    mainColor?: string | null;
    material?: string | null;
    pattern?: string | null;
    fit?: string | null;
    length?: string | null;
    neckline?: string | null;
    sleeve?: string | null;
    style?: string | null;
    occasion?: string | null;
  } | null;
  /** 电商卖点（用于 Step4 详情页规划） */
  sellingPoints?: Array<{
    point: string;
    category: string;
    priority: number;
  }>;
}

export interface Step1ImageClassificationFeedbackSnapshot {
  category: Step1OutfitModuleCategory;
  confidence: number;
  viewLabel: "main" | "front" | "side" | "back" | "detail" | "unknown";
  reason: string | null;
  mode: "llm" | "heuristic";
}

export function isStep1ClothingClassificationCategory(category: string): boolean {
  return Object.values(GARMENT_CATEGORY).includes(category as GarmentCategory);
}

export function buildStep1ImageClothingGuardResponse(
  result: Step1ImageClassificationSnapshot,
  classificationFeedback: Step1ImageClassificationFeedbackSnapshot | null,
): Step1ImageClassificationSnapshot & {
  classificationFeedback: Step1ImageClassificationFeedbackSnapshot | null;
  isClothingImage: boolean;
  clothingImageReason: string | null;
} {
  const isClothingImage =
    typeof result.isClothingImage === "boolean"
      ? result.isClothingImage
      : isStep1ClothingClassificationCategory(result.classification.category);
  const clothingImageReason = isClothingImage
    ? null
    : result.classification.reason?.trim() || classificationFeedback?.reason?.trim() || "当前图片未识别为服饰主体。";
  return {
    ...result,
    classificationFeedback,
    isClothingImage,
    clothingImageReason,
  };
}
