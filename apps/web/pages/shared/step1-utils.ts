// apps/web/pages/shared/step1-utils.ts
/**
 * Step1 服装上传公共工具函数
 * 被 Assets.tsx 和 ImageAssets.tsx 共享
 */

import type { OutfitAnalysisCardData } from "../project-flow/step1JointReverseService";
import {
  normalizeStep1OutfitSubjectType,
  type Step1OutfitModuleCategory,
  type Step1LibraryCategory,
  type Step1OutfitSubjectType,
  type Step1OutfitModule,
  // 从 contract 导入字典（源头在 shared_dict.ts）
  GARMENT_CATEGORY_LABELS,
  GARMENT_CATEGORY_KEYWORDS,
  GARMENT_CATEGORY_ICON,
  STEP1_MODULE_CATEGORY_LABELS,
  STEP1_MODULE_CATEGORY_ICON,
} from "../../../../src/contracts/step1-outfit-module-contract";

// ============================================================================
// 类型定义
// ============================================================================

/** Step1 模块图片槽位目标 */
export interface Step1ModuleImageSlotTarget {
  moduleId: string;
  target: "main" | "other";
  viewIndex?: number;
}

// ============================================================================
// 常量（从 contract 重新导出，便于前端使用）
// ============================================================================

// 重新导出字典，保持前端导入路径不变
export {
  GARMENT_CATEGORY_LABELS,
  GARMENT_CATEGORY_KEYWORDS,
  GARMENT_CATEGORY_ICON,
  STEP1_MODULE_CATEGORY_LABELS,
  STEP1_MODULE_CATEGORY_ICON,
};

/** 主体类型关键词（适配 shared_dict.ts 字典格式） */
export const STEP1_SUBJECT_ANALYSIS_KEYWORDS: Record<Step1OutfitSubjectType, string[]> = {
  上装: GARMENT_CATEGORY_KEYWORDS.top,
  下装: GARMENT_CATEGORY_KEYWORDS.bottom,
  鞋履: GARMENT_CATEGORY_KEYWORDS.shoes,
  配饰: GARMENT_CATEGORY_KEYWORDS.accessory,
  套装: GARMENT_CATEGORY_KEYWORDS.suit,
  连衣裙: GARMENT_CATEGORY_KEYWORDS.dress,
  外套: GARMENT_CATEGORY_KEYWORDS.outer,
};

export const STEP1_MAX_OUTFIT_MODULES = 2;
export const STEP1_MAX_OTHER_VIEWS = 3;
export const STEP1_UPLOAD_FEEDBACK_CLASSIFYING = "图片已添加，后台正在归类。";
export const STEP1_UPLOAD_FEEDBACK_SYNCING = "图片已显示，后台正在归类与入库...";

export const STEP1_SUBJECT_TYPE_TO_CLASSIFICATION_CATEGORY: Record<Step1OutfitSubjectType, Step1LibraryCategory> = {
  上装: "top",
  下装: "bottom",
  鞋履: "shoes",
  配饰: "accessory",
  套装: "suit",
  连衣裙: "dress",
  外套: "outer",
};

// ============================================================================
// 类型转换函数
// ============================================================================

export function resolveStep1SubjectTypeFromClassificationCategory(
  category: Step1OutfitModuleCategory,
): Step1OutfitSubjectType | "" {
  if (category === "top") {
    return "上装";
  }
  if (category === "bottom") {
    return "下装";
  }
  if (category === "shoes") {
    return "鞋履";
  }
  if (category === "accessory") {
    return "配饰";
  }
  if (category === "suit") {
    return "套装";
  }
  if (category === "dress") {
    return "连衣裙";
  }
  if (category === "outer") {
    return "外套";
  }
  return "";
}

/** 将后端分类统一为 Step1LibraryCategory */
export function normalizeToLibraryCategory(category: string): Step1LibraryCategory {
  if (category === "top" || category === "bottom" || category === "shoes" ||
      category === "accessory" || category === "suit" || category === "dress" || category === "outer") {
    return category as Step1LibraryCategory;
  }
  // 后端 "outfit" 映射到 "suit"
  if (category === "outfit") {
    return "suit";
  }
  return "top";
}

// ============================================================================
// 数组处理函数
// ============================================================================

export function uniqTrimmed(values: string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))];
}

// ============================================================================
// 文本处理函数
// ============================================================================

export function normalizeStep1AnalysisText(value: string): string {
  return value.replace(/\r/g, "").trim();
}

export function extractStep1SubjectNameFromAnalysis(analysis: string): string {
  const text = normalizeStep1AnalysisText(analysis);
  if (!text) {
    return "";
  }
  const withoutCombination = text.split(/具体(?:互补)?搭配[：:]/u)[0]?.trim() || text;
  const compact = withoutCombination.replace(/\s+/g, " ");
  const firstSentence =
    compact
      .split(/[。！？；;\n]/u)
      .map((item) => item.trim())
      .find((item) => item.length > 0) || compact;
  const shouldSkipImperativeCandidate = (value: string): boolean =>
    /^(选择|搭配|建议|可选|可以|可搭|配上|再配|使用|尝试|推荐)/u.test(value);
  const patterns = [
    /^这[款件双套条]\s*([^，。；;\n]{1,24}?)(?:采用|设计|以|是|为|自带|拥有|作为|兼具|呈现)/u,
    /(?:核心单品|主体|主角|单品)(?:是|为|：|:)\s*[「""]?([^，。；;\n」""]{1,20})/u,
    /^([^\s，。；;\n]{1,24}?(?:T恤|衬衫|上衣|夹克|外套|连衣裙|半裙|长裙|短裙|牛仔裤|工装裤|长裤|短裤|球鞋|运动鞋|德训鞋|乐福鞋|高跟鞋|靴|包|项链|耳环|配饰|套装))/u,
    /([^\s，。；;\n]{1,24}?(?:T恤|衬衫|上衣|夹克|外套|连衣裙|半裙|长裙|短裙|牛仔裤|工装裤|长裤|短裤|球鞋|运动鞋|德训鞋|乐福鞋|高跟鞋|靴|包|项链|耳环|配饰|套装))/u,
  ];
  for (const pattern of patterns) {
    const match = firstSentence.match(pattern) ?? compact.match(pattern);
    const candidate = match?.[1]?.trim() || "";
    if (candidate && !shouldSkipImperativeCandidate(candidate)) {
      return candidate.slice(0, 20);
    }
  }
  const fallback = firstSentence.replace(/^(选择|搭配|建议|可选|可以|可搭|配上|再配|使用|尝试|推荐)\s*/u, "");
  return fallback.slice(0, 20);
}

export function extractStep1SubjectDescriptionFromAnalysis(analysis: string): string {
  const text = normalizeStep1AnalysisText(analysis);
  if (!text) {
    return "";
  }
  const withoutCombination = text.split(/具体(?:互补)?搭配[：:]/u)[0]?.trim() || text;
  const compact = withoutCombination
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("");
  if (!compact) {
    return "";
  }
  const sentences = compact.split(/(?<=[。！？])/u).map((item) => item.trim()).filter(Boolean);
  const description = (sentences.slice(0, 2).join("") || compact).trim();
  return description.slice(0, 200);
}

// ============================================================================
// 分析卡片匹配函数
// ============================================================================

export function findStep1AnalysisCardForModule(
  module: Step1OutfitModule,
  analysisCards: OutfitAnalysisCardData[],
): OutfitAnalysisCardData | null {
  if (analysisCards.length < 1) {
    return null;
  }
  // 从 contract 导入 normalizeStep1OutfitSubjectType
  const normalizedSubjectType = normalizeStep1OutfitSubjectType(module.subjectType, { allowEmpty: true, fallback: "" });
  if (!normalizedSubjectType) {
    return analysisCards[0] ?? null;
  }
  const keywords = STEP1_SUBJECT_ANALYSIS_KEYWORDS[normalizedSubjectType];
  if (!keywords || keywords.length < 1) {
    return analysisCards[0] ?? null;
  }
  return (
    analysisCards.find((card) => {
      const analysis = normalizeStep1AnalysisText(card.analysis);
      return keywords.some((keyword) => analysis.includes(keyword));
    }) ?? analysisCards[0] ?? null
  );
}

// 从 contract 重新导出
export { normalizeStep1OutfitSubjectType } from "../../../../src/contracts/step1-outfit-module-contract";

// 从 step1JointReverseService 重新导出共享类型
export type { OutfitAnalysisCardData } from "../project-flow/step1JointReverseService";

// ============================================================================
// 文件处理函数
// ============================================================================

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

export function estimateImageSizeMbFromSourceUrl(url: string): number {
  const normalized = url.trim();
  if (!normalized) {
    return 0.01;
  }
  if (!normalized.startsWith("data:")) {
    return 0.2;
  }
  const commaIndex = normalized.indexOf(",");
  if (commaIndex < 0) {
    return 0.2;
  }
  const base64 = normalized.slice(commaIndex + 1);
  const padding = (4 - (base64.length % 4)) % 4;
  const sizeBytes = (base64.length + padding) * 0.75;
  const sizeMb = sizeBytes / (1024 * 1024);
  return Math.max(0.01, Math.min(10, sizeMb));
}