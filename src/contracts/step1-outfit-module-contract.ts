export const STEP1_OUTFIT_MODULE_CONTRACT_VERSION = "AT48-01.v1";

// ============================================================================
// 类型定义（引用 shared_dict.ts 基础类型）
// ============================================================================

import type { GarmentCategory } from "../contant-config/shared_dict.js";
import {
  GARMENT_CATEGORY_LABELS,
  GARMENT_CATEGORY_KEYWORDS,
  GARMENT_CATEGORY_ICON,
} from "../contant-config/shared_dict.js";

// Step1 使用系统统一的服饰分类类型
export type Step1LibraryCategory = GarmentCategory;

export const STEP1_OUTFIT_SUBJECT_TYPE_OPTIONS = ["上装", "下装", "鞋履", "配饰", "套装", "连衣裙", "外套"] as const;
export type Step1OutfitSubjectType = (typeof STEP1_OUTFIT_SUBJECT_TYPE_OPTIONS)[number];
export type Step1OutfitSubjectTypeValue = Step1OutfitSubjectType | "";

// Step1 扩展分类（包含 unknown 用于 AI 未识别场景）
export type Step1OutfitModuleCategory = Step1LibraryCategory | "unknown";

export type Step1OutfitViewLabel = "main" | "front" | "side" | "back" | "detail" | "unknown";

// ============================================================================
// 从 shared_dict 导入的字典（重新导出便于使用）
// ============================================================================

export {
  GARMENT_CATEGORY_LABELS,
  GARMENT_CATEGORY_KEYWORDS,
  GARMENT_CATEGORY_ICON,
};

/** Step1 扩展分类标签（包含 unknown） */
export const STEP1_MODULE_CATEGORY_LABELS: Record<Step1OutfitModuleCategory, string> = {
  ...GARMENT_CATEGORY_LABELS,
  unknown: "未识别",
};

/** Step1 扩展分类图标（包含 unknown） */
export const STEP1_MODULE_CATEGORY_ICON: Record<Step1OutfitModuleCategory, string> = {
  ...GARMENT_CATEGORY_ICON,
  unknown: "help",
};

export interface Step1OutfitModuleImageClassification {
  category: Step1OutfitModuleCategory;
  confidence: number;
  viewLabel: Step1OutfitViewLabel;
  reason: string | null;
  feedbackCategory?: Step1OutfitModuleCategory | null;
  feedbackConfidence?: number | null;
  feedbackViewLabel?: Step1OutfitViewLabel | null;
  feedbackReason?: string | null;
  feedbackMode?: "llm" | "heuristic" | "none";
  clothingTitle?: string | null;       // 服饰标题
  clothingDescription?: string | null;  // 服饰介绍
  // 服饰风格标签，用于和视频热榜脚本风格匹配
  clothingStyle?: string[] | null;
}

export interface Step1OutfitModuleImage {
  imageId: string;
  imageUrl: string;
  libraryAssetId: string | null;
  fileName: string | null;
  classification: Step1OutfitModuleImageClassification;
  removedBgImageUrl: string | null;
  activeImageUrl: string;
  removeBgStatus: "idle" | "processing" | "succeeded" | "failed";
  removeBgError: string | null;
  // LLM 生成的服装标题和描述（从 classification 提取，便于直接访问）
  clothingTitle?: string | null;
  clothingDescription?: string | null;
  // 服饰风格标签（从 classification 提取，便于直接访问）
  clothingStyle?: string[] | null;
  // AI 生成的平铺图（从服饰资产传递，用于显示查看平铺图按钮）
  flatLayImageUrl?: string | null;
  // 变体信息（从服饰资产传递，用于同款不同色关联显示）
  variantGroupId?: string | null;
  variantColor?: string | null;
  mainColor?: string | null;
  isPrimaryVariant?: boolean;
}


export interface Step1OutfitModule {
  moduleId: string;
  subjectName: string;
  subjectType: Step1OutfitSubjectTypeValue;
  subjectDescription: string;
  mainImage: Step1OutfitModuleImage | null;
  otherViews: Step1OutfitModuleImage[];
  multiViewWarning: string | null;
}

function normalizeConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  if (parsed < 0) {
    return 0;
  }
  if (parsed > 1) {
    return 1;
  }
  return parsed;
}

function normalizeCategory(value: unknown): Step1OutfitModuleCategory {
  if (
    value === "top" ||
    value === "bottom" ||
    value === "shoes" ||
    value === "accessory" ||
    value === "suit" ||
    value === "dress" ||
    value === "outer"
  ) {
    return value;
  }
  return "unknown";
}

function normalizeViewLabel(value: unknown): Step1OutfitViewLabel {
  if (value === "main" || value === "front" || value === "side" || value === "back" || value === "detail") {
    return value;
  }
  return "unknown";
}

function normalizeFeedbackMode(value: unknown): "llm" | "heuristic" | "none" {
  if (value === "llm" || value === "heuristic") {
    return value;
  }
  return "none";
}

function toTrimmedString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function toNullableString(value: unknown): string | null {
  const normalized = toTrimmedString(value);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeStep1OutfitSubjectType(
  value: unknown,
  options?: {
    allowEmpty?: boolean;
    fallback?: Step1OutfitSubjectTypeValue;
  },
): Step1OutfitSubjectTypeValue {
  const allowEmpty = options?.allowEmpty ?? false;
  const fallback = options?.fallback ?? (allowEmpty ? "" : "上装");
  const normalizedRaw = toTrimmedString(value);
  if (normalizedRaw.length < 1) {
    return fallback;
  }
  const normalized = normalizedRaw.toLowerCase();
  if (normalized === "上装" || normalized === "top") {
    return "上装";
  }
  if (normalized === "下装" || normalized === "bottom") {
    return "下装";
  }
  if (normalized === "鞋履" || normalized === "shoes") {
    return "鞋履";
  }
  if (
    normalized === "配饰" ||
    normalized === "饰品" ||
    normalized === "accessory"
  ) {
    return "配饰";
  }
  if (normalized === "套装" || normalized === "服饰" || normalized === "suit") {
    return "套装";
  }
  if (normalized === "连衣裙" || normalized === "dress") {
    return "连衣裙";
  }
  if (normalized === "外套" || normalized === "outer") {
    return "外套";
  }
  return fallback;
}

function normalizeClassification(value: unknown): Step1OutfitModuleImageClassification {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const feedbackCategory =
    source.feedbackCategory === null || source.feedbackCategory === undefined
      ? null
      : normalizeCategory(source.feedbackCategory);
  const feedbackViewLabel =
    source.feedbackViewLabel === null || source.feedbackViewLabel === undefined
      ? null
      : normalizeViewLabel(source.feedbackViewLabel);
  const feedbackConfidenceRaw = source.feedbackConfidence;
  const feedbackConfidence =
    feedbackConfidenceRaw === null || feedbackConfidenceRaw === undefined
      ? null
      : normalizeConfidence(feedbackConfidenceRaw);
  // 解析风格标签数组
  const clothingStyleRaw = source.clothingStyle;
  const clothingStyle = Array.isArray(clothingStyleRaw)
    ? clothingStyleRaw.filter((s: unknown) => typeof s === "string" && String(s).trim().length > 0).map((s: unknown) => String(s).trim())
    : null;
  return {
    category: normalizeCategory(source.category),
    confidence: normalizeConfidence(source.confidence),
    viewLabel: normalizeViewLabel(source.viewLabel),
    reason: toNullableString(source.reason),
    feedbackCategory,
    feedbackConfidence,
    feedbackViewLabel,
    feedbackReason: toNullableString(source.feedbackReason),
    feedbackMode: normalizeFeedbackMode(source.feedbackMode),
    clothingTitle: toNullableString(source.clothingTitle),
    clothingDescription: toNullableString(source.clothingDescription),
    clothingStyle: clothingStyle && clothingStyle.length > 0 ? clothingStyle : null,
  };
}

export function normalizeModuleImage(value: unknown): Step1OutfitModuleImage | null {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!source) {
    return null;
  }
  const imageUrl = toTrimmedString(source.imageUrl);
  if (imageUrl.length < 1) {
    return null;
  }
  const imageId = toTrimmedString(source.imageId) || `step1-image-${Math.random().toString(36).slice(2, 8)}`;
  const removedBgImageUrl = toNullableString(source.removedBgImageUrl);
  const removeBgStatus =
    source.removeBgStatus === "processing" ||
    source.removeBgStatus === "succeeded" ||
    source.removeBgStatus === "failed"
      ? source.removeBgStatus
      : "idle";
  const activeImageUrl = toTrimmedString(source.activeImageUrl) || removedBgImageUrl || imageUrl;
  const classification = normalizeClassification(source.classification);
  return {
    imageId,
    imageUrl,
    libraryAssetId: toNullableString(source.libraryAssetId),
    fileName: toNullableString(source.fileName),
    classification,
    removedBgImageUrl,
    activeImageUrl,
    removeBgStatus,
    removeBgError: toNullableString(source.removeBgError),
    // 从 classification 提取标题和描述到顶层，便于直接访问
    clothingTitle: classification.clothingTitle,
    clothingDescription: classification.clothingDescription,
    // 从 classification 提取风格标签到顶层，便于直接访问
    clothingStyle: classification.clothingStyle,
    // 从服饰资产传递的平铺图 URL
    flatLayImageUrl: toNullableString(source.flatLayImageUrl),
    // 变体信息（从服饰资产传递，用于同款不同色关联显示）
    variantGroupId: toNullableString(source.variantGroupId),
    variantColor: toNullableString(source.variantColor),
    mainColor: toNullableString(source.mainColor),
    isPrimaryVariant: source.isPrimaryVariant === true,
  };
}

function resolveMultiViewWarning(module: Step1OutfitModule): string | null {
  if (!module.mainImage) {
    return "请先上传主图。";
  }
  if (module.otherViews.length < 1) {
    return "建议补充至少 1 张其他视角图，提升 AI 识别准确性。";
  }
  return null;
}

export function createEmptyStep1OutfitModule(index = 1): Step1OutfitModule {
  return {
    moduleId: `step1-module-${Date.now().toString(36)}-${index}`,
    subjectName: "",
    subjectType: "",
    subjectDescription: "",
    mainImage: null,
    otherViews: [],
    multiViewWarning: "请先上传主图。",
  };
}

export function normalizeStep1OutfitModules(
  value: unknown,
  options?: {
    minModules?: number;
    maxModules?: number;
  },
): Step1OutfitModule[] {
  const minModules = Math.max(1, Math.floor(options?.minModules ?? 1));
  const maxModules = Math.max(minModules, Math.floor(options?.maxModules ?? 2));
  const source = Array.isArray(value) ? value : [];
  const normalized = source
    .map((item, index) => {
      const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
      if (!record) {
        return null;
      }
      const mainImage = normalizeModuleImage(record.mainImage);
      const otherViews = Array.isArray(record.otherViews)
        ? record.otherViews
            .map((entry) => normalizeModuleImage(entry))
            .filter((entry): entry is Step1OutfitModuleImage => Boolean(entry))
            .slice(0, 3)
        : [];
      const moduleBase: Step1OutfitModule = {
        moduleId: toTrimmedString(record.moduleId) || `step1-module-${Date.now().toString(36)}-${index + 1}`,
        subjectName: toTrimmedString(record.subjectName).slice(0, 20),
        subjectType: normalizeStep1OutfitSubjectType(record.subjectType, { allowEmpty: true, fallback: "" }),
        subjectDescription: toTrimmedString(record.subjectDescription).slice(0, 200),
        mainImage,
        otherViews,
        multiViewWarning: null,
      };
      return {
        ...moduleBase,
        multiViewWarning: resolveMultiViewWarning(moduleBase),
      };
    })
    .filter((item): item is Step1OutfitModule => Boolean(item))
    .slice(0, maxModules);

  while (normalized.length < minModules) {
    normalized.push(createEmptyStep1OutfitModule(normalized.length + 1));
  }
  return normalized.slice(0, maxModules);
}
