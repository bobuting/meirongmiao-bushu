/**
 * 热榜标准化函数
 * 从 app.ts 迁移，包含数据标准化相关函数
 *
 * 迁移源: app.ts 行 7015, 7150-7228, 7230-7247, 8351-8455
 */

import type {
  HotTrendType,
  HotTrendSuitability,
  HotTrendHumanPresence,
  HotTrendHumanExposure,
  HotTrendVideoScreenVerdict,
  HotTrendSceneSetting,
  HotTrendShotBreakdown,
  HotTrendInsight,
  HotTrendVideoMultimodalScreenResult,
  SquareTrendTopic,
} from "../types.js";
import { inferHotTrendHumanPresenceFromText, guessHotTrendLabels, isHotTrendCautiousOrRejectedInsight } from "./infer.js";
import { sanitizeHotTrendNarrativeText, buildHotTrendShotBreakdownsFromScriptText } from "./sanitize.js";
import { extractHotTrendPipelineItems } from "../../hot-trend-llm-pipeline.js";
import { HOT_TREND_STEP3_MAX_DURATION_SEC } from "../constants.js";

// ============================================================================
// 键标准化
// ============================================================================

/**
 * 标准化热榜键
 */
export function normalizeHotTrendKey(type: HotTrendType, label: string): string {
  const normalizedLabel = label.trim().replace(/\s+/g, " ").toLowerCase();
  return `${type}:${normalizedLabel}`;
}

/**
 * 标准化标签值
 */
export function sanitizeTagValue(value: string): string {
  return value.replace(/\s+/g, "_").slice(0, 120);
}

// ============================================================================
// 标签标准化
// ============================================================================

/**
 * 标准化热榜标签数组
 */
export function normalizeHotTrendLabels(raw: unknown): string[] {
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[，,;；|/]/)
      : [];
  const normalized = values
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0)
    .slice(0, 6);
  return [...new Set(normalized)];
}

// ============================================================================
// 真人出镜标准化
// ============================================================================

/**
 * 标准化真人出镜判断
 */
export function normalizeHotTrendHumanPresence(raw: unknown, contextText: string): HotTrendHumanPresence {
  if (typeof raw === "string" && raw.trim().length > 0) {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "yes" || normalized === "human" || normalized === "真人" || normalized === "有人") {
      return "yes";
    }
    if (
      normalized === "no" ||
      normalized === "non_human" ||
      normalized === "无人" ||
      normalized === "无真人" ||
      normalized === "none"
    ) {
      return "no";
    }
    if (normalized === "uncertain" || normalized === "unknown" || normalized === "不确定") {
      return "uncertain";
    }
  }
  return inferHotTrendHumanPresenceFromText(contextText);
}

/**
 * 标准化真人露出程度
 */
export function normalizeHotTrendHumanExposure(raw: unknown, contextText: string): HotTrendHumanExposure {
  if (typeof raw === "string" && raw.trim().length > 0) {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "large" || normalized === "major" || normalized === "full" || normalized === "大篇幅") {
      return "large";
    }
    if (normalized === "partial" || normalized === "part" || normalized === "局部") {
      return "partial";
    }
    if (normalized === "none" || normalized === "no" || normalized === "无") {
      return "none";
    }
    if (normalized === "uncertain" || normalized === "unknown" || normalized === "不确定") {
      return "uncertain";
    }
  }
  const inferredPresence = inferHotTrendHumanPresenceFromText(contextText);
  if (inferredPresence === "no") {
    return "none";
  }
  if (inferredPresence === "yes") {
    return "partial";
  }
  return "uncertain";
}

// ============================================================================
// 视频筛选判决标准化
// ============================================================================

/**
 * 标准化视频筛选判决
 */
export function normalizeHotTrendVideoScreenVerdict(
  raw: unknown,
  fallback: Pick<HotTrendVideoMultimodalScreenResult, "suitability" | "humanPresence" | "humanExposure" | "reason">,
): HotTrendVideoScreenVerdict {
  if (typeof raw === "string" && raw.trim().length > 0) {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "pass" || normalized === "caution" || normalized === "reject") {
      return normalized;
    }
  }
  if (fallback.humanPresence !== "yes" || fallback.humanExposure !== "large") {
    return "reject";
  }
  if (fallback.suitability === "high" && !isHotTrendCautiousOrRejectedInsight({ labels: [], reason: fallback.reason })) {
    return "pass";
  }
  return fallback.suitability === "low" ? "reject" : "caution";
}

// ============================================================================
// 时长标准化
// ============================================================================

/**
 * 限制热榜时长
 */
export function clampHotTrendStep3DurationSec(raw: number | null | undefined, fallback = 20): number {
  const base = Number.isFinite(Number(raw)) ? Number(raw) : fallback;
  return Math.max(12, Math.min(HOT_TREND_STEP3_MAX_DURATION_SEC, Math.round(base)));
}

// ============================================================================
// 分镜标准化
// ============================================================================

/**
 * 标准化分镜片段
 */
export function normalizeHotTrendShotBreakdowns(raw: unknown): HotTrendShotBreakdown[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return null;
        }
        const record = item as Record<string, unknown>;
        const title = String(record.title ?? `镜头 ${index + 1}`).trim() || `镜头 ${index + 1}`;
        const content = sanitizeHotTrendNarrativeText(String(record.content ?? record.narration ?? "").trim());
        if (!content) {
          return null;
        }
        const visualCue = sanitizeHotTrendNarrativeText(
          String(record.visualCue ?? record.visualPrompt ?? "").trim() || `画面：${content.slice(0, 56)}`,
        );
        return {
          title,
          content,
          visualCue,
          visualPrompt: sanitizeHotTrendNarrativeText(String(record.visualPrompt ?? visualCue).trim() || visualCue),
        };
      })
      .filter((item): item is HotTrendShotBreakdown => item !== null)
      .slice(0, 10);
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    return buildHotTrendShotBreakdownsFromScriptText(raw.trim());
  }
  return [];
}

// ============================================================================
// 场景设置标准化
// ============================================================================

/** 场景设置标签类型 */
type HotTrendSceneSettingLabel = "主场景" | "辅助场景" | "时间" | "天气" | "氛围";

/**
 * 标准化场景设置
 * 返回一个对象/映射，用于按标签名查找值
 */
export function normalizeHotTrendSceneSettings(
  raw: unknown,
): Partial<Record<HotTrendSceneSettingLabel, string>> {
  const output: Partial<Record<HotTrendSceneSettingLabel, string>> = {};
  if (!Array.isArray(raw)) {
    return output;
  }
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const labelRaw = String(record.label ?? "").trim();
    const valueRaw = sanitizeHotTrendNarrativeText(String(record.value ?? "").trim());
    if (!labelRaw || !valueRaw) {
      continue;
    }
    // 校验label是否为有效值
    if (
      labelRaw === "主场景" ||
      labelRaw === "辅助场景" ||
      labelRaw === "时间" ||
      labelRaw === "天气" ||
      labelRaw === "氛围"
    ) {
      output[labelRaw] = valueRaw;
    }
  }
  return output;
}

/**
 * 转换场景设置映射为数组形式
 */
export function toHotTrendSceneSettingsArray(
  map: Partial<Record<HotTrendSceneSettingLabel, string>>,
): HotTrendSceneSetting[] {
  const orderedLabels: HotTrendSceneSettingLabel[] = ["主场景", "辅助场景", "时间", "天气", "氛围"];
  return orderedLabels
    .map((label) => {
      const value = map[label]?.trim();
      if (!value) {
        return null;
      }
      return { label, value };
    })
    .filter((item): item is HotTrendSceneSetting => item !== null);
}

// ============================================================================
// 热榜洞察标准化
// ============================================================================

/**
 * 构建启发式热榜洞察
 */
export function buildHeuristicHotTrendInsight(
  topic: SquareTrendTopic,
  type: HotTrendType,
  id = topic.id,
): HotTrendInsight {
  const labels = guessHotTrendLabels(topic.label, type);
  const humanPresence = type === "video"
    ? inferHotTrendHumanPresenceFromText(`${topic.label} ${labels.join(" ")}`)
    : "yes";

  const scriptContent =
    `开场：傍晚路口，主角刷到"${topic.label}"后临时改变出行计划，转身走进熟悉的街区。\n` +
    "发展：她在店门口与橱窗前停下，快速试搭两套造型，对比版型与层次后的镜头状态。\n" +
    "转折：朋友发来消息催她赴约，她边走边整理衣摆，镜头切到细节与步态，情绪逐渐放松。\n" +
    "收束：夜色亮起，主角在街角回头一笑，整个人物状态和场景氛围完成统一。";

  return {
    id,
    title: topic.label,
    suitability: "medium",
    humanPresence,
    reason: "话题热度高，适合改写为短视频剧情。",
    labels,
    scriptTitle: `${topic.label} - ${type === "video" ? "视频" : "实时"}脚本`,
    scriptContent: sanitizeHotTrendNarrativeText(scriptContent),
    durationSec: 20,
    sceneSettings: [],
    storyboardSegments: buildHotTrendShotBreakdownsFromScriptText(scriptContent),
  };
}

/**
 * 构建启发式热榜洞察数组
 */
export function buildHeuristicHotTrendInsights(
  topics: SquareTrendTopic[],
  type: HotTrendType,
): HotTrendInsight[] {
  return topics.map((topic, index) => buildHeuristicHotTrendInsight(topic, type, index + 1));
}

/**
 * 标准化热榜洞察数组
 */
export function normalizeHotTrendInsights(
  raw: unknown,
  topics: SquareTrendTopic[],
  type: HotTrendType,
): HotTrendInsight[] {
  const items = extractHotTrendPipelineItems(raw);
  const insights = new Map<number, HotTrendInsight>();

  for (const [offset, item] of items.entries()) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const rawId = record.id ?? record.index ?? offset + 1;
    const id =
      typeof rawId === "number" && Number.isFinite(rawId)
        ? Math.max(1, Math.min(topics.length, Math.floor(rawId)))
        : Math.max(1, Math.min(topics.length, offset + 1));

    if (insights.has(id)) {
      continue;
    }

    const pick = (keys: string[], fallback: string): string => {
      for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim().length > 0) {
          return value.trim();
        }
      }
      return fallback;
    };

    const suitabilityRaw = pick(["suitability", "level", "scoreLevel"], "medium").toLowerCase();
    const suitability: HotTrendSuitability =
      suitabilityRaw === "high" || suitabilityRaw === "low" ? suitabilityRaw : "medium";

    const topic = topics[id - 1];
    const fallbackTitle = topic ? `${topic.label} - ${type === "video" ? "视频" : "实时"}脚本` : `热榜脚本 ${id}`;
    const labels = normalizeHotTrendLabels(record.labels ?? record.tags ?? record.categoryTags ?? record.categories ?? record.category);
    const humanPresence = normalizeHotTrendHumanPresence(
      record.humanPresence ?? record.human_presence ?? record.presence ?? record.actorPresence,
      `${topic?.label ?? fallbackTitle} ${labels.join(" ")}`,
    );

    insights.set(id, {
      id,
      title: topic?.label ?? fallbackTitle,
      suitability,
      humanPresence,
      reason: sanitizeHotTrendNarrativeText(pick(["reason", "why"], "话题热度高，适合改写为短视频剧情。")),
      labels: labels.length > 0 ? labels : guessHotTrendLabels(topic?.label ?? fallbackTitle, type),
      scriptTitle: sanitizeHotTrendNarrativeText(pick(["scriptTitle", "title"], fallbackTitle)),
      scriptContent: sanitizeHotTrendNarrativeText(
        pick(
          ["scriptContent", "script", "outline", "content"],
          `开场：${topic?.label ?? "热榜话题"}\n主体：围绕人物行动推进情节与信息\n结尾：完成情绪收束并保留互动空间`,
        ),
      ),
      durationSec: clampHotTrendStep3DurationSec(
        Number.isFinite(Number(record.durationSec)) ? Number(record.durationSec) : null,
        20,
      ),
      sceneSettings: toHotTrendSceneSettingsArray(
        normalizeHotTrendSceneSettings(record.sceneSettings ?? record.scene_settings),
      ),
      storyboardSegments: normalizeHotTrendShotBreakdowns(
        record.storyboard ?? record.storyboards ?? record.storyboardSegments,
      ),
    });
  }

  return topics.map((topic, index) => {
    const id = index + 1;
    return insights.get(id) ?? buildHeuristicHotTrendInsight(topic, type, id);
  });
}