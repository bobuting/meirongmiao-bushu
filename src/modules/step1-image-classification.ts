/**
 * Step1 图片分类模块 — 服饰图片分类、视角标注、启发式兜底
 *
 * 从 app.ts 抽取的类型与函数，包含：
 * - 类型定义：Step1ImageClassificationCategory / ViewLabel / Payload / Result / Feedback
 * - 规范化：normalizeCategory / normalizeViewLabel / normalizeConfidence
 * - 启发式：buildStep1ImageClassificationHeuristic
 * - LLM 归一化：normalizeStep1ImageClassificationFromLlm
 * - 请求入口：requestStep1ImageClassification
 */

import { AppError } from "../core/errors.js";
import { extractJsonValue } from "../utils/json.js";
import type { ResolvedRouteProvider } from "../services/llm/provider-resolver.js";
import type { AppContext } from "../core/app-context.js";
import type { ProviderRouteKey } from "../contracts/types.js";
import { requestLlmPlainTextWithMetadata } from "../services/llm/llm-transport.js";
import { skillLoader } from "../services/skills/index.js";
import type { ClothingStyleCategory } from "../contant-config/style-atmosphere-dict.js";
import { isValidClothingStyle, parseClothingStyleFromText } from "../contant-config/style-atmosphere-dict.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export type Step1ImageClassificationCategory =
  | "top"
  | "bottom"
  | "shoes"
  | "accessory"
  | "dress"
  | "outer"
  | "suit"
  | "unknown";

export type Step1ImageClassificationViewLabel = "main" | "front" | "side" | "back" | "detail" | "unknown";

export interface Step1ImageClassificationPayload {
  imageUrl: string;
  fileName?: string;
  target: "main" | "other";
  hasMainImage: boolean;
  existingOtherViewCount: number;
}

export interface Step1ImageClassificationResult {
  mode: "llm" | "heuristic";
  isClothingImage: boolean;
  classification: {
    category: Step1ImageClassificationCategory;
    confidence: number;
    viewLabel: Step1ImageClassificationViewLabel;
    reason: string | null;
  };
  /** 检测到的服饰区域（用于平铺图遮罩预处理） */
  garments: Array<{
    index: number;
    category: Step1ImageClassificationCategory;
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
  clothingTitle: string | null;
  clothingDescription: string | null;
  // 服饰风格标签（统一字典），用于和视频热榜脚本风格匹配
  clothingStyle: ClothingStyleCategory[] | null;
  // 服饰详细属性
  clothingAttributes: {
    mainColor: string | null;
    material: string | null;
    pattern: string | null;
    fit: string | null;
    length: string | null;
    neckline: string | null;
    sleeve: string | null;
    style: string | null;
    occasion: string | null;
  } | null;
  /** 电商卖点（用于详情页规划） */
  sellingPoints: Array<{
    point: string;
    category: string;
    priority: number;
  }>;
}

export interface Step1ImageClassificationFeedback {
  category: Step1ImageClassificationCategory;
  confidence: number;
  viewLabel: Step1ImageClassificationViewLabel;
  reason: string | null;
  mode: "llm" | "heuristic";
}

// ---------------------------------------------------------------------------
// 规范化函数
// ---------------------------------------------------------------------------

export function normalizeStep1ImageClassificationCategory(value: unknown): Step1ImageClassificationCategory {
  if (
    value === "top" ||
    value === "bottom" ||
    value === "shoes" ||
    value === "accessory" ||
    value === "dress" ||
    value === "outer" ||
    value === "suit"
  ) {
    return value;
  }
  return "unknown";
}

export function normalizeStep1ImageClassificationViewLabel(value: unknown): Step1ImageClassificationViewLabel {
  if (value === "main" || value === "front" || value === "side" || value === "back" || value === "detail") {
    return value;
  }
  return "unknown";
}

export function normalizeStep1ImageClassificationConfidence(value: unknown, fallback = 0.6): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < 0) {
    return 0;
  }
  if (parsed > 1) {
    return 1;
  }
  return parsed;
}

/** 归一化服饰可见度 */
function normalizeGarmentVisibility(value: unknown): "full" | "partial" | "cropped" {
  if (value === "full" || value === "partial" || value === "cropped") {
    return value;
  }
  return "full";
}

/** 将数值限制在 0-1 范围 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ---------------------------------------------------------------------------
// 内部辅助：按 target 纠正分类 / 视角
// ---------------------------------------------------------------------------

function normalizeStep1ImageClassificationCategoryForTarget(
  category: Step1ImageClassificationCategory,
  target: Step1ImageClassificationPayload["target"],
): Step1ImageClassificationCategory {
  if (target !== "main") {
    return category;
  }
  return category;
}

function normalizeStep1ImageClassificationViewLabelForTarget(
  viewLabel: Step1ImageClassificationViewLabel,
  target: Step1ImageClassificationPayload["target"],
): Step1ImageClassificationViewLabel {
  if (target === "main" && viewLabel === "unknown") {
    return "main";
  }
  return viewLabel;
}

function resolveStep1ImageClassificationMultiViewWarning(payload: Step1ImageClassificationPayload): string | null {
  if (!payload.hasMainImage && payload.target === "other") {
    return "请先上传主图。";
  }
  const nextOtherViewCount =
    payload.target === "other"
      ? Math.max(0, Math.floor(payload.existingOtherViewCount)) + 1
      : Math.max(0, Math.floor(payload.existingOtherViewCount));
  if (nextOtherViewCount < 1) {
    return "建议补充至少 1 张其他视角图，提升 AI 识别准确性。";
  }
  return null;
}

// ---------------------------------------------------------------------------
// 启发式分类（规则兜底）
// ---------------------------------------------------------------------------

export function buildStep1ImageClassificationHeuristic(
  payload: Step1ImageClassificationPayload,
  reasonHint: string,
): Step1ImageClassificationResult {
  const keywordSource = `${payload.fileName ?? ""} ${payload.imageUrl}`.trim().toLowerCase();
  const inferredCategory = (() => {
    if (/shoe|sneaker|boot|heel|loafer|鞋/.test(keywordSource)) {
      return "shoes" as const;
    }
    if (/set|suit|套装|套服|两件套|三件套|上下装/.test(keywordSource)) {
      return "suit" as const;
    }
    if (/bottom|pants|trouser|skirt|shorts|jeans|下装|裤|裙/.test(keywordSource)) {
      return "bottom" as const;
    }
    if (/dress|gown|连衣裙|礼服/.test(keywordSource)) {
      return "dress" as const;
    }
    if (/outer|coat|jacket|blazer|风衣|外套/.test(keywordSource)) {
      return "outer" as const;
    }
    if (/top|shirt|t-shirt|tee|blouse|上衣|短袖|长袖|衬衫|针织衫/.test(keywordSource)) {
      return "top" as const;
    }
    if (/accessory|acc|bag|hat|belt|necklace|earring|watch|配饰|包|帽/.test(keywordSource)) {
      return "accessory" as const;
    }
    return "unknown" as const;
  })();
  const isClothingImage = inferredCategory !== "unknown";
  const inferredViewLabel = (() => {
    if (payload.target === "main") {
      return "main" as const;
    }
    if (/front|正面|前/.test(keywordSource)) {
      return "front" as const;
    }
    if (/side|left|right|侧面|侧/.test(keywordSource)) {
      return "side" as const;
    }
    if (/back|背面|后/.test(keywordSource)) {
      return "back" as const;
    }
    if (/detail|close|特写|细节/.test(keywordSource)) {
      return "detail" as const;
    }
    return "unknown" as const;
  })();
  const category = normalizeStep1ImageClassificationCategoryForTarget(inferredCategory, payload.target);
  const viewLabel = normalizeStep1ImageClassificationViewLabelForTarget(inferredViewLabel, payload.target);
  return {
    mode: "heuristic",
    isClothingImage,
    classification: {
      category,
      confidence: category === "unknown" ? 0.58 : 0.78,
      viewLabel,
      reason: reasonHint.trim() || "rule-based-fallback",
    },
    // heuristic 模式不检测区域，仅 LLM 模式提供
    garments: [],
    multiViewWarning: resolveStep1ImageClassificationMultiViewWarning(payload),
    clothingTitle: null,
    clothingDescription: null,
    // heuristic 模式不生成风格标签，仅 LLM 模式提供
    clothingStyle: null,
    // heuristic 模式不生成详细属性，仅 LLM 模式提供
    clothingAttributes: null,
    // heuristic 模式不生成卖点，仅 LLM 模式提供
    sellingPoints: [],
  };
}

// ---------------------------------------------------------------------------
// LLM 结果归一化
// ---------------------------------------------------------------------------

export function normalizeStep1ImageClassificationFromLlm(
  raw: unknown,
  fallback: Step1ImageClassificationResult,
  payload: Step1ImageClassificationPayload,
): Step1ImageClassificationResult {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const classificationSource =
    source.classification && typeof source.classification === "object" && !Array.isArray(source.classification)
      ? (source.classification as Record<string, unknown>)
      : source;
  const explicitIsClothingImage =
    typeof (classificationSource.isClothingImage ?? source.isClothingImage) === "boolean"
      ? Boolean(classificationSource.isClothingImage ?? source.isClothingImage)
      : null;
  const rawCategory = normalizeStep1ImageClassificationCategory(
    explicitIsClothingImage === false
      ? "unknown"
      : classificationSource.category ??
          source.category ??
          (fallback.isClothingImage ? fallback.classification.category : "unknown"),
  );
  const category = normalizeStep1ImageClassificationCategoryForTarget(
    rawCategory,
    payload.target,
  );
  const viewLabel = normalizeStep1ImageClassificationViewLabelForTarget(
    normalizeStep1ImageClassificationViewLabel(
      classificationSource.viewLabel ?? source.viewLabel ?? fallback.classification.viewLabel,
    ),
    payload.target,
  );
  const confidence = normalizeStep1ImageClassificationConfidence(
    classificationSource.confidence ?? source.confidence,
    fallback.classification.confidence,
  );
  const reasonCandidate = String(classificationSource.reason ?? source.reason ?? "").trim();
  const warningCandidate = String(source.multiViewWarning ?? "").trim();
  const isClothingImage = explicitIsClothingImage ?? rawCategory !== "unknown";
  // 解析服饰标题和介绍
  const clothingTitleCandidate = String(source.clothingTitle ?? "").trim();
  const clothingDescriptionCandidate = String(source.clothingDescription ?? "").trim();
  // 解析服饰风格标签（统一字典验证）
  const clothingStyleRawCandidate = Array.isArray(source.clothingStyle)
    ? source.clothingStyle.filter((s: unknown) => typeof s === "string" && String(s).trim().length > 0).map((s: unknown) => String(s).trim())
    : null;
  // 验证风格标签是否属于统一字典，尝试解析未严格遵循的输出
  const clothingStyleCandidate = clothingStyleRawCandidate
    ? clothingStyleRawCandidate
        .map(s => {
          // 优先验证是否为有效枚举值
          if (isValidClothingStyle(s)) {
            return s as ClothingStyleCategory;
          }
          // 尝试从自由文本中解析
          const parsed = parseClothingStyleFromText(s);
          return parsed;
        })
        .filter((s): s is ClothingStyleCategory => s !== null)
    : null;
  // 解析服饰详细属性
  const attrsSource = source.clothingAttributes && typeof source.clothingAttributes === "object" && !Array.isArray(source.clothingAttributes)
    ? (source.clothingAttributes as Record<string, unknown>)
    : null;
  const clothingAttributes = attrsSource
    ? {
        mainColor: typeof attrsSource.mainColor === "string" && attrsSource.mainColor.trim() ? attrsSource.mainColor.trim() : null,
        material: typeof attrsSource.material === "string" && attrsSource.material.trim() ? attrsSource.material.trim() : null,
        pattern: typeof attrsSource.pattern === "string" && attrsSource.pattern.trim() ? attrsSource.pattern.trim() : null,
        fit: typeof attrsSource.fit === "string" && attrsSource.fit.trim() ? attrsSource.fit.trim() : null,
        length: typeof attrsSource.length === "string" && attrsSource.length.trim() ? attrsSource.length.trim() : null,
        neckline: typeof attrsSource.neckline === "string" && attrsSource.neckline.trim() ? attrsSource.neckline.trim() : null,
        sleeve: typeof attrsSource.sleeve === "string" && attrsSource.sleeve.trim() ? attrsSource.sleeve.trim() : null,
        style: typeof attrsSource.style === "string" && attrsSource.style.trim() ? attrsSource.style.trim() : null,
        occasion: typeof attrsSource.occasion === "string" && attrsSource.occasion.trim() ? attrsSource.occasion.trim() : null,
      }
    : null;
  // 解析服饰区域检测结果
  const rawGarments = Array.isArray(source.garments) ? source.garments : [];
  const garments: Step1ImageClassificationResult["garments"] = rawGarments
    .filter((g: unknown) => typeof g === "object" && g !== null)
    .map((g: unknown, idx: number) => {
      const item = g as Record<string, unknown>;
      const rawBox = typeof item.boundingBox === "object" && item.boundingBox !== null
        ? (item.boundingBox as Record<string, unknown>)
        : null;
      return {
        index: typeof item.index === "number" ? item.index : idx,
        category: normalizeStep1ImageClassificationCategory(item.category),
        isMainSubject: item.isMainSubject === true,
        visibility: normalizeGarmentVisibility(item.visibility),
        confidence: normalizeStep1ImageClassificationConfidence(item.confidence, 0.6),
        boundingBox: rawBox
          ? {
              x: clamp01(typeof rawBox.x === "number" ? rawBox.x : 0),
              y: clamp01(typeof rawBox.y === "number" ? rawBox.y : 0),
              width: clamp01(typeof rawBox.width === "number" ? rawBox.width : 1),
              height: clamp01(typeof rawBox.height === "number" ? rawBox.height : 1),
            }
          : { x: 0, y: 0, width: 1, height: 1 },
      };
    });
  return {
    mode: "llm",
    isClothingImage,
    classification: {
      category: isClothingImage ? category : "unknown",
      confidence,
      viewLabel,
      reason:
        reasonCandidate.length > 0
          ? reasonCandidate
          : !isClothingImage
            ? "当前图片未识别为服饰主体。"
            : fallback.classification.reason,
    },
    garments,
    multiViewWarning: warningCandidate.length > 0 ? warningCandidate : fallback.multiViewWarning,
    clothingTitle: clothingTitleCandidate.length > 0 ? clothingTitleCandidate : null,
    clothingDescription: clothingDescriptionCandidate.length > 0 ? clothingDescriptionCandidate : null,
    clothingStyle: clothingStyleCandidate && clothingStyleCandidate.length > 0 ? clothingStyleCandidate : null,
    clothingAttributes,
    // 解析电商卖点
    sellingPoints: normalizeSellingPoints(source.sellingPoints),
  };
}

/** 归一化电商卖点 */
function normalizeSellingPoints(raw: unknown): Array<{ point: string; category: string; priority: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
    .map((p) => ({
      point: typeof p.point === "string" ? p.point.trim() : "",
      category: typeof p.category === "string" ? p.category.trim() : "设计",
      priority: typeof p.priority === "number" ? (p.priority === 1 || p.priority === 2 ? p.priority : 2) : 2,
    }))
    .filter((p) => p.point.length > 0);
}

// ---------------------------------------------------------------------------
// LLM 请求入口
// ---------------------------------------------------------------------------

const STEP1_IMAGE_CLASSIFICATION_PROMPT_CODE = "step1_image_classification";

export async function requestStep1ImageClassification(
  ctx: AppContext,
  provider: ResolvedRouteProvider,
  payload: Step1ImageClassificationPayload,
  routeKey: ProviderRouteKey,
  userId: string,
  projectId?: string,
): Promise<Step1ImageClassificationResult> {
  const fallback = buildStep1ImageClassificationHeuristic(payload, "rule-based-fallback");

  // 从提示词管理系统获取提示词
  const { system, user } = await skillLoader.render(STEP1_IMAGE_CLASSIFICATION_PROMPT_CODE, { variables: {
    target: payload.target,
    fileName: payload.fileName?.trim() || "unknown",
    hasMainImage: payload.hasMainImage,
    existingOtherViewCount: payload.existingOtherViewCount,
  }});

  try {
    const result = await requestLlmPlainTextWithMetadata(
      provider,
      system,
      user,
      0.1,
      {
        ctx,
        routeKey,
        businessContext: "Step1 图片分类",
        userId,
        projectId,
        imageInputs: [{ url: payload.imageUrl, label: `step1-${payload.target}` }],
        hasMedia: "image",
        timeoutMsOverride: 600_000,
      },
    );

    const parsed = extractJsonValue(result.text);
    if (!parsed) {
      throw new AppError(502, "LLM_RESPONSE_INVALID", "step1 image classification returned non-json payload");
    }
    return normalizeStep1ImageClassificationFromLlm(parsed, fallback, payload);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error instanceof AppError ? error.code : "LLM_RESPONSE_INVALID";
    throw error;
  }
}
