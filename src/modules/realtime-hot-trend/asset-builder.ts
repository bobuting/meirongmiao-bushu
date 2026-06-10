/**
 * 实时热榜资产构建函数
 * 将洞察结果转换为 LibraryScript 资产
 */

import type {
  HotTrendType,
  HotTrendInsight,
  SquareTrendTopic,
} from "../../contracts/hot-trend-base.js";
import type { LibraryScript } from "../../contracts/types.js";
import {
  HOT_TREND_ASSET_TAG,
  HOT_TREND_KEY_PREFIX,
  HOT_TREND_TYPE_PREFIX,
  HOT_TREND_REASON_PREFIX,
  HOT_TREND_SUITABILITY_PREFIX,
  HOT_TREND_UPDATED_AT_PREFIX,
  HOT_TREND_SYNCED_AT_PREFIX,
  HOT_TREND_PROMPT_VERSION_PREFIX,
  HOT_TREND_TOPN_PREFIX,
  HOT_TREND_GENERATION_MODE_PREFIX,
  HOT_TREND_RECOMMENDED_PREFIX,
  HOT_TREND_HUMAN_PRESENCE_PREFIX,
  HOT_TREND_LABEL_PREFIX,
  HOT_TREND_EVIDENCE_PREFIX,
} from "../../contracts/hot-trend-constants.js";
import {
  normalizeHotTrendKey,
  sanitizeTagValue,
  sanitizeNarrativeText,
} from "./utils.js";

// ============================================================================
// 结构化资产构建
// ============================================================================

/**
 * 构建热榜结构化资产内容
 */
export function buildHotTrendStructuredAsset(input: {
  topicLabel: string;
  trendType: HotTrendType;
  labels: string[];
  scriptContent: string;
  durationSec: number;
  sceneSettings?: import("../../contracts/hot-trend-base.js").HotTrendSceneSetting[];
  storyboardSegments?: import("../../contracts/hot-trend-base.js").HotTrendShotBreakdown[];
}): { contentBody: string } {
  const sections: string[] = [];

  // 标题
  sections.push(`# ${input.topicLabel}`);
  sections.push("");

  // 标签
  if (input.labels.length > 0) {
    sections.push(`标签：${input.labels.join("、")}`);
    sections.push("");
  }

  // 时长
  sections.push(`时长：${input.durationSec}秒`);
  sections.push("");

  // 场景设置
  if (input.sceneSettings && input.sceneSettings.length > 0) {
    sections.push("## 场景设置");
    for (const setting of input.sceneSettings) {
      sections.push(`- ${setting.label}：${setting.value}`);
    }
    sections.push("");
  }

  // 脚本内容
  sections.push("## 脚本");
  sections.push(input.scriptContent);
  sections.push("");

  // 分镜
  if (input.storyboardSegments && input.storyboardSegments.length > 0) {
    sections.push("## 分镜");
    for (let i = 0; i < input.storyboardSegments.length; i++) {
      const segment = input.storyboardSegments[i];
      sections.push(`### ${segment.title}`);
      sections.push(`内容：${segment.content}`);
      sections.push(`画面：${segment.visualCue}`);
      if (segment.visualPrompt && segment.visualPrompt !== segment.visualCue) {
        sections.push(`提示词：${segment.visualPrompt}`);
      }
      sections.push("");
    }
  }

  return {
    contentBody: sections.join("\n").trim(),
  };
}

// ============================================================================
// 标签构建
// ============================================================================

/**
 * 构建实时热榜资产标签
 */
export function buildRealtimeHotTrendAssetTags(input: {
  topicKey: string;
  reason: string;
  suitability: string;
  updatedAt: string;
  syncedAt: number;
  promptVersion: string;
  topN: number;
  generationMode: string;
  recommended: boolean;
  humanPresence?: string;
  labels: string[];
}): string[] {
  const tags: string[] = [
    HOT_TREND_ASSET_TAG,
    `${HOT_TREND_KEY_PREFIX}${sanitizeTagValue(input.topicKey)}`,
    `${HOT_TREND_TYPE_PREFIX}realtime`,
    `${HOT_TREND_REASON_PREFIX}${sanitizeTagValue(input.reason)}`,
    `${HOT_TREND_SUITABILITY_PREFIX}${input.suitability}`,
    `${HOT_TREND_UPDATED_AT_PREFIX}${sanitizeTagValue(input.updatedAt)}`,
    `${HOT_TREND_SYNCED_AT_PREFIX}${input.syncedAt}`,
    `${HOT_TREND_PROMPT_VERSION_PREFIX}${sanitizeTagValue(input.promptVersion)}`,
    `${HOT_TREND_TOPN_PREFIX}${input.topN}`,
    `${HOT_TREND_GENERATION_MODE_PREFIX}${input.generationMode}`,
    `${HOT_TREND_RECOMMENDED_PREFIX}${input.recommended ? "true" : "false"}`,
    `${HOT_TREND_EVIDENCE_PREFIX}creative_inference`,
    "#创作推断",
  ];

  if (input.humanPresence) {
    tags.push(`${HOT_TREND_HUMAN_PRESENCE_PREFIX}${input.humanPresence}`);
  }

  if (input.recommended) {
    tags.push("#推荐入选");
  } else {
    tags.push("#仅资产入库");
  }

  // 添加标签
  for (const label of input.labels.slice(0, 6)) {
    tags.push(`${HOT_TREND_LABEL_PREFIX}${sanitizeTagValue(label)}`);
  }

  return tags;
}

// ============================================================================
// 资产构建
// ============================================================================

/**
 * 构建实时热榜 LibraryScript 资产
 */
export function buildRealtimeHotTrendAsset(input: {
  topic: SquareTrendTopic;
  insight: HotTrendInsight;
  syncedAt: number;
  promptVersion: string;
  topN: number;
  analysisSource: "llm" | "heuristic";
  updatedAt: string | null;
  rank: number;
  isGenerationTopic: boolean;
}): Partial<LibraryScript> {
  const topicKey = normalizeHotTrendKey("realtime", input.topic.label);

  const structuredAsset = buildHotTrendStructuredAsset({
    topicLabel: input.topic.label,
    trendType: "realtime",
    labels: input.insight.labels,
    scriptContent: input.insight.scriptContent,
    durationSec: input.insight.durationSec,
    sceneSettings: input.insight.sceneSettings,
    storyboardSegments: input.insight.storyboardSegments,
  });

  const tags = buildRealtimeHotTrendAssetTags({
    topicKey,
    reason: input.insight.reason,
    suitability: input.insight.suitability,
    updatedAt: input.updatedAt ?? "unknown",
    syncedAt: input.syncedAt,
    promptVersion: input.promptVersion,
    topN: input.topN,
    generationMode: input.analysisSource === "llm" ? "real" : "degraded",
    recommended: input.isGenerationTopic,
    humanPresence: input.insight.humanPresence,
    labels: input.insight.labels,
  });

  return {
    title: input.insight.scriptTitle,
    content: structuredAsset.contentBody,
    tags,
  };
}

/**
 * 批量构建实时热榜资产
 */
export function buildRealtimeHotTrendAssets(input: {
  topics: SquareTrendTopic[];
  insights: HotTrendInsight[];
  syncedAt: number;
  promptVersion: string;
  topN: number;
  analysisSource: "llm" | "heuristic";
  updatedAt: string | null;
  generationTopicKeySet: Set<string>;
}): Partial<LibraryScript>[] {
  return input.topics
    .map((topic, index) => {
      const insight = input.insights[index];
      if (!insight) {
        return null;
      }

      const topicKey = normalizeHotTrendKey("realtime", topic.label);
      const isGenerationTopic = input.generationTopicKeySet.has(topicKey);

      return buildRealtimeHotTrendAsset({
        topic,
        insight,
        syncedAt: input.syncedAt,
        promptVersion: input.promptVersion,
        topN: input.topN,
        analysisSource: input.analysisSource,
        updatedAt: input.updatedAt,
        rank: index + 1,
        isGenerationTopic,
      });
    })
    .filter((asset): asset is Partial<LibraryScript> => asset !== null);
}