/**
 * outfit-analysis-helpers.ts
 *
 * 从 app.ts 提取的穿搭分析系统：分类/引导辅助、卡片富化与归一化、缓存与 LLM 请求。
 * 原始代码位于 buildApp() 闭包内，所有外部依赖通过 import 引入。
 */

import { createHash } from "node:crypto";

import { AppError } from "../core/errors.js";
import { getLogger } from "../core/logger/index.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { type Step1RoleDirectionCard, type Step1OutfitPlan } from "../contracts/step1-joint-reverse-contract.js";
import { OUTFIT_ITEM_TYPES, type OutfitItemType } from "../contracts/outfit-plan.dto.js";
import {
  buildStep1RoleDirectionCardsFromPresetBundle,
} from "./step1-role-preset-adapter.js";
import {
  finalizeStep1OptimizedPrompt,
  type Step1OptimizedPromptGuidance,
} from "./step1-optimized-prompt-builder.js";

const log = getLogger("outfit-analysis-helpers");
import { extractJsonValue } from "../utils/json.js";
import { compactTextLine, formatLlmDebugTrace } from "../utils/text.js";
import { isSupportedLlmImageUrl } from "../services/media/image-utils.js";
import {
  requestLlmPlainTextWithMetadata,
} from "../services/llm/llm-transport.js";
import {
  type LlmPlainTextResult,
  type LlmGroundingSource,
} from "../services/llm/gemini-utils.js";
import type { ResolvedRouteProvider } from "../services/llm/provider-resolver.js";
import type { AppContext } from "../core/app-context.js";
import { skillLoader } from "../services/skills/index.js";

const PROMPT_CODE_OUTFIT_ANALYSIS = "outfit_analysis";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 穿搭方案分析上下文 */
export interface OutfitPlanAnalysisContext {
  index: number;
  planId: string;
  items: Array<{
    category: string;
    name: string;
    imageUrl: string;
  }>;
  focusItems: Array<{
    category: string;
    name: string;
    imageUrl: string;
    source: "user_selected" | "generated_plan";
    description?: string;
  }>;
}

/** 具体互补搭配引导 */
export interface OutfitConcreteGuidance {
  core: string;
  coreCategory: string;
  bottom: string;
  shoes: string;
  accessory: string;
  combinationLine: string;
}

/** 穿搭分析请求结果（简化版） */
export interface OutfitAnalysisCardsResult {
  trendSummary: string;
  plans: Step1OutfitPlan[];
  groundingSources: LlmGroundingSource[];
  requestSummary: string;
  responseSummary: string;
}

interface OutfitAnalysisCacheEntry {
  expiresAt: number;
  result: OutfitAnalysisCardsResult;
}

// ---------------------------------------------------------------------------
// 常量 & 缓存
// ---------------------------------------------------------------------------

const OUTFIT_ANALYSIS_CACHE_TTL_MS = 10 * 60 * 1000;
const OUTFIT_ANALYSIS_CACHE_MAX_ENTRIES = 200;
const outfitAnalysisCardsCache = new Map<string, OutfitAnalysisCacheEntry>();

// ---------------------------------------------------------------------------
// 1. Outfit Category / Guidance Helpers
// ---------------------------------------------------------------------------

export function normalizeOutfitCategoryValue(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (["top", "shirt", "tshirt", "tee", "blouse", "sweater", "hoodie", "outer", "coat", "jacket", "上装"].includes(normalized)) {
    return "top";
  }
  if (["dress", "onepiece", "连衣裙", "裙子"].includes(normalized)) {
    return "dress";
  }
  if (["bottom", "pants", "trousers", "jeans", "skirt", "shorts", "下装", "裤子"].includes(normalized)) {
    return "bottom";
  }
  if (["shoes", "shoe", "sneakers", "boots", "heels", "鞋", "鞋履", "鞋子"].includes(normalized)) {
    return "shoes";
  }
  if (["accessory", "accessories", "bag", "hat", "jewelry", "jewellery", "scarf", "belt", "sunglasses", "配饰", "帽子", "包", "皮带", "墨镜"].includes(normalized)) {
    return "accessory";
  }
  if (["suit", "套装", "套服", "两件套", "三件套", "上下装"].includes(normalized)) {
    return "suit";
  }
  return normalized;
}

export function isLikelyAssetFilename(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (/[\\/]/.test(normalized) && /\.(?:jpe?g|png|webp|bmp|gif|heic|avif)$/i.test(normalized)) {
    return true;
  }
  if (/^[^\\/\s]+\.(?:jpe?g|png|webp|bmp|gif|heic|avif)$/i.test(normalized)) {
    return true;
  }
  if (/^(img|image|photo|pic|file|asset)[-_]?\d*$/i.test(normalized)) {
    return true;
  }
  return false;
}

export function getOutfitCategoryFallbackLabel(category: string): string {
  const normalized = normalizeOutfitCategoryValue(category);
  if (normalized === "top" || normalized === "dress") {
    return "上装";
  }
  if (normalized === "bottom") {
    return "下装";
  }
  if (normalized === "shoes") {
    return "鞋履";
  }
  if (normalized === "accessory") {
    return "配饰";
  }
  if (normalized === "suit") {
    return "套装";
  }
  return "服装单品";
}

export function normalizeOutfitItemDisplayName(
  rawName: string,
  category: string,
  fallback?: string,
): string {
  const source = compactTextLine(rawName.trim().replace(/\s+/g, " "), 60);
  if (!source || isLikelyAssetFilename(source)) {
    return fallback ? compactTextLine(fallback, 40) : getOutfitCategoryFallbackLabel(category);
  }
  return source;
}

export function pickOutfitItemNameByCategory(
  context: OutfitPlanAnalysisContext,
  categories: string[],
  fallback: string,
): string {
  for (const category of categories) {
    const normalizedCategory = normalizeOutfitCategoryValue(category);
    const fromItems = context.items.find(
      (item) =>
        normalizeOutfitCategoryValue(String(item.category ?? "")) === normalizedCategory &&
        typeof item.name === "string" &&
        item.name.trim().length > 0,
    );
    if (fromItems) {
      return normalizeOutfitItemDisplayName(fromItems.name, normalizedCategory, fallback);
    }
    const fromFocus = context.focusItems.find(
      (item) =>
        normalizeOutfitCategoryValue(String(item.category ?? "")) === normalizedCategory &&
        typeof item.name === "string" &&
        item.name.trim().length > 0,
    );
    if (fromFocus) {
      return normalizeOutfitItemDisplayName(fromFocus.name, normalizedCategory, fallback);
    }
  }
  return fallback;
}

export function buildOutfitConcreteGuidance(context: OutfitPlanAnalysisContext): OutfitConcreteGuidance {
  const scoredCandidates = [
    ...context.items.map((item) => ({ ...item, sourceWeight: 10 })),
    ...context.focusItems.map((item) => ({ ...item, sourceWeight: 0 })),
  ]
    .filter((item) => typeof item.name === "string" && item.name.trim().length > 0)
    .map((item) => {
      const normalizedCategory = normalizeOutfitCategoryValue(String(item.category ?? ""));
      const categoryWeight =
        normalizedCategory === "top" || normalizedCategory === "dress" || normalizedCategory === "suit"
          ? 100
          : normalizedCategory === "bottom"
            ? 90
            : normalizedCategory === "shoes"
              ? 60
              : normalizedCategory === "accessory"
                ? 50
                : 40;
      const namePenalty = isLikelyAssetFilename(item.name) ? 60 : 0;
      return {
        ...item,
        normalizedCategory,
        score: categoryWeight + item.sourceWeight - namePenalty,
      };
    })
    .sort((a, b) => b.score - a.score);
  const coreCandidate = scoredCandidates[0] ?? null;
  const coreCategory = coreCandidate?.normalizedCategory ?? "";
  const core = normalizeOutfitItemDisplayName(
    String(coreCandidate?.name ?? ""),
    coreCategory,
    coreCategory === "bottom" ? "下装主体" : "上装主体",
  );

  const buildGuidanceLine = (label: string, value: string): string => `${label}：${compactTextLine(value, 40)}`;

  if (coreCategory === "suit") {
    const shoes = pickOutfitItemNameByCategory(context, ["shoes"], "minimal loafers");
    const accessory = pickOutfitItemNameByCategory(context, ["accessory"], "small shoulder bag");
    return {
      core,
      coreCategory,
      bottom: buildGuidanceLine("鞋履", shoes),
      shoes: buildGuidanceLine("配饰", accessory),
      accessory: "",
      combinationLine: `具体互补搭配：鞋履选${shoes}；配饰选${accessory}。`,
    };
  }

  if (coreCategory === "bottom") {
    const top = pickOutfitItemNameByCategory(context, ["top", "dress"], "fitted knit top");
    const shoes = pickOutfitItemNameByCategory(context, ["shoes"], "minimal loafers");
    const accessory = pickOutfitItemNameByCategory(context, ["accessory"], "small shoulder bag");
    return {
      core,
      coreCategory,
      bottom: buildGuidanceLine("上装", top),
      shoes: buildGuidanceLine("鞋履", shoes),
      accessory: buildGuidanceLine("配饰", accessory),
      combinationLine: `具体互补搭配：上装选${top}；鞋履选${shoes}；配饰选${accessory}。`,
    };
  }

  if (coreCategory === "shoes") {
    const top = pickOutfitItemNameByCategory(context, ["top", "dress"], "clean-cut top with clear silhouette");
    const bottom = pickOutfitItemNameByCategory(context, ["bottom"], "tailored pants");
    const accessory = pickOutfitItemNameByCategory(context, ["accessory"], "small bag");
    return {
      core,
      coreCategory,
      bottom: buildGuidanceLine("上装", top),
      shoes: buildGuidanceLine("下装", bottom),
      accessory: buildGuidanceLine("配饰", accessory),
      combinationLine: `具体互补搭配：上装选${top}；下装选${bottom}；配饰选${accessory}。`,
    };
  }

  if (coreCategory === "accessory") {
    const top = pickOutfitItemNameByCategory(context, ["top", "dress"], "soft-texture top");
    const bottom = pickOutfitItemNameByCategory(context, ["bottom"], "straight pants");
    const shoes = pickOutfitItemNameByCategory(context, ["shoes"], "simple loafers");
    return {
      core,
      coreCategory,
      bottom: buildGuidanceLine("上装", top),
      shoes: buildGuidanceLine("下装", bottom),
      accessory: buildGuidanceLine("鞋履", shoes),
      combinationLine: `具体互补搭配：上装选${top}；下装选${bottom}；鞋履选${shoes}。`,
    };
  }

  const bottom = pickOutfitItemNameByCategory(context, ["bottom"], "tailored bottoms");
  const shoes = pickOutfitItemNameByCategory(context, ["shoes"], "clean loafers");
  const accessory = pickOutfitItemNameByCategory(context, ["accessory"], "small bag");
  return {
    core,
    coreCategory: coreCategory || "top",
    bottom: buildGuidanceLine("下装", bottom),
    shoes: buildGuidanceLine("鞋履", shoes),
    accessory: buildGuidanceLine("配饰", accessory),
    combinationLine: `具体互补搭配：下装选${bottom}；鞋履选${shoes}；配饰选${accessory}。`,
  };
}

export function extractOutfitCategoryValueFromAnalysis(
  analysis: string,
  patterns: RegExp[],
): string | null {
  const source = analysis.trim();
  if (!source) {
    return null;
  }
  for (const pattern of patterns) {
    const match = source.match(pattern);
    const value = match?.[1]?.trim() || "";
    if (value) {
      return compactTextLine(value, 40);
    }
  }
  return null;
}

export function mergeOutfitConcreteGuidanceWithAnalysis(
  guidance: OutfitConcreteGuidance,
  analysis: string,
): OutfitConcreteGuidance {
  const compact = compactTextLine(analysis.trim(), 1800);
  const combinationMatch = compact.match(/具体(?:互补)?搭配[：:]\s*([^。\n]{4,240})/u);
  const parts = (combinationMatch?.[1] || "")
    .split(/[；;，,]/u)
    .map((item) => compactTextLine(item.trim(), 48))
    .filter((item) => item.length > 0);
  const bottom =
    parts[0] ||
    extractOutfitCategoryValueFromAnalysis(analysis, [
      /(?:上装|下装|外套|内搭)(?:选|建议|为|：|:)?\s*[「""]?([^，。；;\n]{2,40})[」""]?/u,
    ]) ||
    guidance.bottom;
  const shoes =
    parts[1] ||
    extractOutfitCategoryValueFromAnalysis(analysis, [
      /(?:鞋子|鞋履|鞋款|下装)(?:选|建议|为|：|:)?\s*[「""]?([^，。；;\n]{2,40})[」""]?/u,
    ]) ||
    guidance.shoes;
  const accessory =
    parts[2] ||
    extractOutfitCategoryValueFromAnalysis(analysis, [
      /(?:配饰|包袋|帽子|首饰|鞋履)(?:选|建议|为|：|:)?\s*[「""]?([^，。；;\n]{2,40})[」""]?/u,
    ]) ||
    guidance.accessory;
  return {
    ...guidance,
    bottom,
    shoes,
    accessory,
    combinationLine: `具体互补搭配：${bottom}；${shoes}；${accessory}。`,
  };
}

export function normalizeConciseSlotDescription(value: string, fallback: string): string {
  const source = compactTextLine(value.trim(), 120) || compactTextLine(fallback, 40);
  const withoutPrefix = source.replace(/^[^:：]{1,10}[：:]\s*/u, "");
  const firstSegment = withoutPrefix.split(/[，。；;\n]/u)[0]?.trim() || withoutPrefix.trim();
  const cleaned = firstSegment
    .split(/\s*\/\s*/u)[0]
    .split(/(?:或者|或)/u)[0]
    .split(/\s+or\s+/iu)[0]
    .replace(/^(建议|可选|可选择|选择|搭配|单品[A-C]\s*)/u, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return compactTextLine(stripGuidanceLabel(fallback), 24);
  }
  return compactTextLine(cleaned, 24);
}

export function ensureAnalysisContainsConcreteCombination(analysis: string, guidance: OutfitConcreteGuidance): string {
  const trimmed = analysis.trim();
  const base =
    trimmed.length > 0
      ? trimmed
      : `该方案围绕「${guidance.core}」构建互补搭配，强调版型层次与日常可穿性。`;
  if (/具体(?:互补)?搭配[：:]/.test(base)) {
    return base.slice(0, 2000);
  }
  return `${base.slice(0, 1800)}\n${guidance.combinationLine}`;
}

export function stripGuidanceLabel(value: string): string {
  return value.replace(/^[^:：]{1,8}[：:]\s*/u, "").trim();
}

// ---------------------------------------------------------------------------
// 2. Trend Summary & Plans Normalization
// ---------------------------------------------------------------------------

/** 从 LLM 返回的 JSON 中解析趋势总结 */
export function normalizeTrendSummaryFromJsonValue(raw: unknown): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return "";
  }
  const record = raw as Record<string, unknown>;
  const trendSummary = pickRecordString(record, ["trendSummary", "trend_summary", "summary"]);
  return trendSummary.slice(0, 100);
}

/**
 * 从 LLM 返回的 JSON 中解析完整的搭配方案（符合 Step1OutfitPlan 契约）
 */
export function normalizeOutfitPlansFromJsonValue(
  raw: unknown,
  expectedCount: number,
): Step1OutfitPlan[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  const record = raw as Record<string, unknown>;
  const rawPlans = Array.isArray(record.plans)
    ? record.plans
    : Array.isArray(record.outfits)
      ? record.outfits
      : [];
  if (rawPlans.length < 1) {
    return [];
  }
  const plans: Step1OutfitPlan[] = [];
  for (const item of rawPlans.slice(0, expectedCount)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const planRecord = item as Record<string, unknown>;
    const rawIndex = Number(planRecord.index);
    const index = Number.isFinite(rawIndex) ? Math.floor(rawIndex) : plans.length + 1;
    const styleName = pickRecordString(planRecord, ["styleName", "style", "trend"]) || `风格${index}`;
    const title = pickRecordString(planRecord, ["title", "name"]) || `搭配方案 ${index}`;
    const reason = pickRecordString(planRecord, ["reason", "description", "desc"]) || "突出版型与层次，适合短视频电商展示。";

    // 解析 items 搭配单品数组
    const items = parseOutfitItems(planRecord.items);

    // 解析 analysis 和 optimizedPrompt（直接从 plan 中获取）
    const analysis = pickRecordString(planRecord, ["analysis", "分析"]) || "";
    const optimizedPrompt = pickRecordString(planRecord, ["optimizedPrompt", "optimized_prompt", "prompt"]) || "";
    const suitableScene = pickRecordString(planRecord, ["suitableScene", "suitable_scene", "适用场景", "场景"]) || "";
    const tags = Array.isArray(planRecord.tags)
      ? planRecord.tags.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 5)
      : [];

    plans.push({
      index,
      styleName: styleName.slice(0, 20),
      title: title.slice(0, 12),
      reason: reason.slice(0, 60),
      items,
      analysis,
      optimizedPrompt,
      suitableScene: suitableScene.slice(0, 80),
      tags,
    });
  }
  return plans.sort((a, b) => a.index - b.index);
}

/**
 * 解析服饰单品数组
 * 支持两种格式：
 * 1. 新格式：[{ type, name, style, description, source }, ...]
 * 2. 旧格式：{ top: "xxx", bottom: "xxx", ... } 转换为新格式
 */
function parseOutfitItems(itemsRaw: unknown): Step1OutfitPlan["items"] {
  // 新格式：数组
  if (Array.isArray(itemsRaw)) {
    const items: Array<{ type: OutfitItemType; name: string; style: string; description: string; source?: "user" | "generated" }> = [];
    for (const item of itemsRaw) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const type = pickRecordString(record, ["type", "category"]);
      if (!type) continue;
      // 验证 type 是否合法，支持中文映射和 bag→accessory
      const typeLower = type.toLowerCase();
      const normalizedType = OUTFIT_ITEM_TYPES.find(t => t === typeLower ||
        (type === "上装" && t === "top") ||
        (type === "下装" && t === "bottom") ||
        (type === "鞋履" && t === "shoes") ||
        (type === "配饰" && t === "accessory") ||
        (type === "套装" && t === "suit") ||
        (type === "连衣裙" && t === "dress") ||
        (type === "外套" && t === "outer")
      ) ?? (["bag", "包"].includes(typeLower) ? "accessory" : undefined);
      if (!normalizedType) continue;
      // 解析 source 字段
      const sourceRaw = pickRecordString(record, ["source"]);
      const source: "user" | "generated" | undefined = sourceRaw === "user" || sourceRaw === "generated" ? sourceRaw : undefined;
      items.push({
        type: normalizedType,
        name: pickRecordString(record, ["name", "名称"]) || `${normalizedType}单品`,
        style: pickRecordString(record, ["style", "风格"]) || "简约",
        description: pickRecordString(record, ["description", "desc", "描述"]) || "",
        source,
      });
    }
    return items;
  }

  // 旧格式：对象 { top: "xxx", bottom: "xxx", ... }
  if (itemsRaw && typeof itemsRaw === "object") {
    const itemsRecord = itemsRaw as Record<string, unknown>;
    const items: Array<{ type: OutfitItemType; name: string; style: string; description: string; source?: "user" | "generated" }> = [];
    // 类型映射（支持中文和各种别名，使用统一常量）
    const typeMap: Record<string, OutfitItemType> = {
      top: "top", upper: "top", 上装: "top",
      bottom: "bottom", lower: "bottom", 下装: "bottom", 裤: "bottom", 裙: "bottom",
      shoes: "shoes", footwear: "shoes", 鞋: "shoes", 鞋履: "shoes",
      bag: "accessory", 包包: "accessory", 包: "accessory",
      accessory: "accessory", acc: "accessory", 配饰: "accessory", 帽子: "accessory",
      suit: "suit", 套装: "suit", 套服: "suit", 两件套: "suit",
      dress: "dress", 连衣裙: "dress", 裙子: "dress",
      outer: "outer", 外套: "outer", coat: "outer", jacket: "outer",
    };
    for (const [key, value] of Object.entries(itemsRecord)) {
      const normalizedType = typeMap[key.toLowerCase()];
      if (!normalizedType || typeof value !== "string") continue;
      items.push({
        type: normalizedType,
        name: value.trim() || `${normalizedType}单品`,
        style: "简约",
        description: value.trim(),
        source: "user", // 旧格式默认为用户输入
      });
    }
    // 确保包含必选类型（top, bottom, shoes）
    const existingTypes = new Set(items.map(i => i.type));
    const requiredDefaults: Array<{ type: OutfitItemType; name: string; style: string; description: string; source: "generated" }> = [
      { type: "top", name: "基础款上装", style: "简约", description: "基础款上装", source: "generated" },
      { type: "bottom", name: "修身下装", style: "简约", description: "修身下装", source: "generated" },
      { type: "shoes", name: "简约鞋履", style: "简约", description: "简约鞋履", source: "generated" },
    ];
    for (const defaultItem of requiredDefaults) {
      if (!existingTypes.has(defaultItem.type)) {
        items.push(defaultItem);
      }
    }
    return items;
  }

  // 默认值（仅必选单品）
  return [
    { type: "top", name: "基础款上装", style: "简约", description: "基础款上装", source: "generated" },
    { type: "bottom", name: "修身下装", style: "简约", description: "修身下装", source: "generated" },
    { type: "shoes", name: "简约鞋履", style: "简约", description: "简约鞋履", source: "generated" },
  ];
}

export function pickRecordString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

export function normalizeRolePresetStyleWords(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value
      .split(/[;,，、/]/u)
      .map((item) => item.trim())
      .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index);
  }
  return [];
}

export function normalizeRolePresetGender(value: unknown): "male" | "female" | "unknown" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["male", "man", "boy", "男", "男性", "男孩", "少年"].includes(normalized)) {
    return "male";
  }
  if (["female", "woman", "girl", "女", "女性", "女孩", "少女"].includes(normalized)) {
    return "female";
  }
  return "unknown";
}

export function normalizeRoleDirectionCardsFromJsonValue(
  raw: unknown,
  expectedCount: number,
  sourceTaskId: string,
): Step1RoleDirectionCard[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  const record = raw as Record<string, unknown>;
  const rawRolePresets = Array.isArray(record.rolePresets)
    ? record.rolePresets
    : Array.isArray(record.role_presets)
      ? record.role_presets
      : [];
  if (rawRolePresets.length < 1) {
    return [];
  }
  try {
    return buildStep1RoleDirectionCardsFromPresetBundle({
      sourceTaskId,
      rolePresets: rawRolePresets.slice(0, expectedCount).flatMap((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return [];
        }
        const presetRecord = item as Record<string, unknown>;
        // 解析年龄：范围格式取末尾数字（婴儿/儿童用上限年龄更合理），单数字直接取
        const ageCandidate = Number(presetRecord.age);
        const ageRangeMatch = String(presetRecord.age).match(/(\d+)\s*[-~–—]\s*(\d+)/);
        const age = ageRangeMatch
          ? Number(ageRangeMatch[2])
          : Number.isFinite(ageCandidate) ? Math.floor(ageCandidate) : null;

        // 禁止静默降级：年龄无效时直接报错
        if (age === null) {
          const presetIdValue = pickRecordString(presetRecord, ["presetId", "preset_id", "id"]) || `${sourceTaskId}-${index + 1}`;
          log.error(
            { presetId: presetIdValue, ageValue: presetRecord.age },
            "[normalizeRoleDirectionCardsFromJsonValue] 年龄字段无效"
          );
          throw new AppError(
            502,
            "LLM_RESPONSE_INVALID",
            "角色预设生成失败，AI返回数据异常，请重试"
          );
        }
        const styleWords = normalizeRolePresetStyleWords(
          presetRecord.styleWords ?? presetRecord.style_words ?? presetRecord.tags,
        );
        return [
          {
            presetId: pickRecordString(presetRecord, ["presetId", "preset_id", "id"]) || `${sourceTaskId}-${index + 1}`,
            ethnicityOrRegion:
              pickRecordString(presetRecord, ["ethnicityOrRegion", "ethnicity_or_region", "region", "race"]) || "Asian",
            gender: normalizeRolePresetGender(presetRecord.gender),
            age,
            styleWords: styleWords.length > 0 ? styleWords : ["清爽", "自然"],
          },
        ];
      }),
    });
  } catch (error) {
    log.error({ error }, "[normalizeRoleDirectionCardsFromJsonValue] validation failed");
    return [];
  }
}

// ---------------------------------------------------------------------------
// 3. Outfit Analysis Cache & LLM Request
// ---------------------------------------------------------------------------

export function buildOutfitAnalysisCacheKey(
  provider: ResolvedRouteProvider,
  contexts: OutfitPlanAnalysisContext[],
  roleContext?: { gender?: string | null; age?: number | null; ethnicityOrRegion?: string | null; styleWords?: string[] | null } | null,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const imageDedup = new Set<string>();
  const focusImages = contexts
    .flatMap((context) => context.focusItems)
    .filter((item) => isSupportedLlmImageUrl(String(item.imageUrl ?? "")))
    .sort((a, b) => {
      if (a.source === b.source) {
        return 0;
      }
      return a.source === "user_selected" ? -1 : 1;
    })
    .filter((item) => {
      const key = String(item.imageUrl ?? "").trim();
      if (!key || imageDedup.has(key)) {
        return false;
      }
      imageDedup.add(key);
      return true;
    })
    .slice(0, 2)
    .map((item) => ({
      category: String(item.category ?? "").trim().toLowerCase(),
      name: String(item.name ?? "").trim(),
      imageUrl: String(item.imageUrl ?? "").trim(),
      source: item.source,
    }));
  const payload = {
    v: 4,
    today,
    providerId: provider.id,
    vendor: provider.vendor,
    model: provider.model,
    targetCardCount: Math.max(1, contexts.length),
    focusImages,
    roleContext: roleContext ? {
      gender: roleContext.gender,
      age: roleContext.age,
      ethnicityOrRegion: roleContext.ethnicityOrRegion,
      styleWords: roleContext.styleWords,
    } : null,
  };
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

export function cloneOutfitAnalysisResult(result: OutfitAnalysisCardsResult): OutfitAnalysisCardsResult {
  return {
    trendSummary: result.trendSummary,
    plans: result.plans.map((plan) => ({
      index: plan.index,
      styleName: plan.styleName,
      title: plan.title,
      reason: plan.reason,
      items: plan.items,
      analysis: plan.analysis,
      optimizedPrompt: plan.optimizedPrompt,
      suitableScene: plan.suitableScene,
    })),
    groundingSources: result.groundingSources,
    requestSummary: result.requestSummary,
    responseSummary: result.responseSummary,
  };
}

export async function requestLlmOutfitAnalysisCards(
  ctx: AppContext,
  provider: ResolvedRouteProvider,
  contexts: OutfitPlanAnalysisContext[],
  userId: string,
  options?: { bypassCache?: boolean; targetCardCount?: number; roleContext?: { gender?: string | null; age?: number | null; ethnicityOrRegion?: string | null; styleWords?: string[] | null } | null },
): Promise<OutfitAnalysisCardsResult> {
  if (contexts.length < 1) {
    return {
      trendSummary: "",
      plans: [],
      groundingSources: [],
      requestSummary: "outfit-analysis contexts=0",
      responseSummary: "outfit-analysis skipped",
    };
  }

  const cacheKey = buildOutfitAnalysisCacheKey(provider, contexts, options?.roleContext);
  const now = Date.now();
  const bypassCache = options?.bypassCache === true;
  if (!bypassCache) {
    const cached = outfitAnalysisCardsCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      const hit = cloneOutfitAnalysisResult(cached.result);
      hit.requestSummary = `${hit.requestSummary}\ncache=hit`;
      hit.responseSummary = `${hit.responseSummary}\ncache=hit`;
      return hit;
    }
  }

  const contextErrors: string[] = [];
  const contextSummaries: Array<{
    context: OutfitPlanAnalysisContext;
    focusItems: Array<{
      category: string;
      name: string;
      imageUrl: string;
      source: "user_selected" | "generated_plan";
      description?: string;
    }>;
    focusUrlSummary: string;
  }> = [];

  for (const context of contexts) {
    const explicitFocusItems = context.focusItems.filter((item) =>
      isSupportedLlmImageUrl(String(item.imageUrl ?? "")),
    );
    const fallbackFocusItems = context.items
      .map((item) => ({
        ...item,
        source: "generated_plan" as const,
      }))
      .filter((item) => isSupportedLlmImageUrl(String(item.imageUrl ?? "")));
    const focusItems = (
      explicitFocusItems.length > 0 ? explicitFocusItems : fallbackFocusItems
    ).slice(0, 2);
    if (focusItems.length < 1) {
      const firstUrlPreview = compactTextLine(
        String(context.focusItems[0]?.imageUrl ?? context.items[0]?.imageUrl ?? "none"),
        240,
      );
      contextErrors.push(`index=${context.index}; error=unsupported image url: ${firstUrlPreview}`);
      continue;
    }
    contextSummaries.push({
      context,
      focusItems,
      focusUrlSummary: compactTextLine(
        focusItems.map((item) => item.imageUrl).join(" | "),
        420,
      ),
    });
  }

  if (contextSummaries.length < 1 && contextErrors.length > 0) {
    throw new AppError(
      502,
      "LLM_RESPONSE_INVALID",
      `outfit analysis generation failed: ${contextErrors.join(" || ")}`,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const imageInputDedup = new Set<string>();
  const imageInputs = contextSummaries
    .flatMap((item) => item.focusItems)
    .sort((a, b) => {
      if (a.source === b.source) {
        return 0;
      }
      return a.source === "user_selected" ? -1 : 1;
    })
    .filter((item) => {
      const key = item.imageUrl.trim();
      if (!key || imageInputDedup.has(key)) {
        return false;
      }
      imageInputDedup.add(key);
      return true;
    })
    .slice(0, 2)
    .map((item, index) => ({
      url: item.imageUrl,
      label: `ctx-${index + 1}:${item.category}:${item.name}:${item.source}`,
    }));
  const targetCardCount = options?.targetCardCount ?? Math.max(1, contextSummaries.length);

  // 收集衣服单品数据（基于 category+name 去重）
  const clothingItemSet = new Set<string>();
  const clothingItems: Array<{ category: string; name: string; description?: string }> = [];
  for (const s of contextSummaries) {
    for (const item of s.focusItems) {
      const key = `${item.category}:${item.name}`;
      if (clothingItemSet.has(key)) continue;
      clothingItemSet.add(key);
      clothingItems.push({
        category: normalizeOutfitCategoryValue(String(item.category ?? "")),
        name: normalizeOutfitItemDisplayName(String(item.name ?? ""), String(item.category ?? ""), ""),
        description: item.description ? compactTextLine(String(item.description ?? ""), 120) : undefined,
      });
    }
  }

  // 角色预设上下文（必填）
  const roleContext = options?.roleContext;
  if (!roleContext) {
    throw new AppError(400, "ROLE_CONTEXT_REQUIRED", "角色预设参数缺失，请先选择角色预设");
  }

  // 构建结构化参数（符合 schema.ts 定义）
  const promptVariables = {
    targetCardCount,
    timeBaseline: today,
    clothingItems,
    roleContext: {
      gender: roleContext.gender ?? undefined,
      age: roleContext.age ?? undefined,
      ethnicityOrRegion: roleContext.ethnicityOrRegion ?? undefined,
      styleWords: roleContext.styleWords ?? undefined,
    },
  };

  const requestSummary = [
    `contexts=${contextSummaries.length}`,
    `focusUrl=${compactTextLine(contextSummaries.map((item) => item.focusUrlSummary).join(" || "), 1200)}`,
    `targetCardCount=${targetCardCount}`,
    `clothingItems=${clothingItems.length}`,
    "cache=miss",
  ].join("; ");

  let firstResult: LlmPlainTextResult;
  try {
    // System Prompt（数据库模板）：角色定义 + JSON 格式 + 字段约束
    // User Prompt（Handlebars 渲染）：结构化变量参数
    const { system, user } = await skillLoader.render(PROMPT_CODE_OUTFIT_ANALYSIS, {
      variables: promptVariables,
    });
    firstResult = await requestLlmPlainTextWithMetadata(
      provider,
      system,
      user,
      0.25,
      {
        ctx,
        userId,
        routeKey: ProviderRouteKeys.STEP1_FASHION_SEARCH,
        businessContext: "Step1 穿搭分析",
        projectId: contexts[0]?.planId, // 传递项目上下文便于调试
        imageInputs,
        forceGeminiGrounding: true,
        forceGeminiTransport: true,
        timeoutMsOverride: 600_000,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorCode = error instanceof AppError ? error.code : "LLM_RESPONSE_INVALID";
    throw new AppError(502, "LLM_RESPONSE_INVALID", `outfit analysis generation failed: ${message}`);
  }

  const firstText = firstResult.text;
  const firstParsed = extractJsonValue(firstText);

  // 解析趋势总结
  const trendSummary = normalizeTrendSummaryFromJsonValue(firstParsed);

  // 解析搭配方案（每个方案已包含 analysis 和 optimizedPrompt）
  const plans = normalizeOutfitPlansFromJsonValue(firstParsed, targetCardCount);

  const responseSummary = [
    `trace=${formatLlmDebugTrace(firstResult.debugTrace)}`,
    `text=${compactTextLine(firstText, 1200)}`,
    `plansCount=${plans.length}`,
    contextErrors.length > 0 ? `precheckErrors=${contextErrors.join(" | ")}` : "precheckErrors=none",
  ].join("; ");

  const result: OutfitAnalysisCardsResult = {
    trendSummary,
    plans,
    groundingSources: firstResult.groundingSources,
    requestSummary,
    responseSummary,
  };

  const entry: OutfitAnalysisCacheEntry = {
    expiresAt: now + OUTFIT_ANALYSIS_CACHE_TTL_MS,
    result: cloneOutfitAnalysisResult(result),
  };
  outfitAnalysisCardsCache.set(cacheKey, entry);
  if (outfitAnalysisCardsCache.size > OUTFIT_ANALYSIS_CACHE_MAX_ENTRIES) {
    const timeNow = Date.now();
    for (const [key, value] of outfitAnalysisCardsCache.entries()) {
      if (value.expiresAt <= timeNow) {
        outfitAnalysisCardsCache.delete(key);
      }
      if (outfitAnalysisCardsCache.size <= OUTFIT_ANALYSIS_CACHE_MAX_ENTRIES) {
        break;
      }
    }
    while (outfitAnalysisCardsCache.size > OUTFIT_ANALYSIS_CACHE_MAX_ENTRIES) {
      const oldestKey = outfitAnalysisCardsCache.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      outfitAnalysisCardsCache.delete(oldestKey);
    }
  }

  return result;
}
