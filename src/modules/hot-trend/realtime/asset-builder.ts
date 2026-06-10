/**
 * 实时热榜资产构建函数
 * 将洞察结果转换为LibraryScript资产
 *
 * 迁移源: app.ts syncHotTrendAssets 函数中的资产构建逻辑
 */

import type { HotTrendInsight, SquareTrendTopic, HotTrendType } from "../types.js";
import type { LibraryScript } from "../../../contracts/types.js";
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
} from "../constants.js";
import {
  buildHotTrendStructuredAsset,
} from "../shared/build.js";
import {
  normalizeHotTrendKey,
  sanitizeTagValue,
} from "../shared/normalize.js";

// ============================================================================
// 标签构建
// ============================================================================

/**
 * 构建热榜资产标签
 */
export function buildHotTrendAssetTags(input: {
  topicKey: string;
  type: HotTrendType;
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
    `${HOT_TREND_TYPE_PREFIX}${input.type}`,
    `${HOT_TREND_REASON_PREFIX}${sanitizeTagValue(input.reason)}`,
    `${HOT_TREND_SUITABILITY_PREFIX}${input.suitability}`,
    `${HOT_TREND_UPDATED_AT_PREFIX}${sanitizeTagValue(input.updatedAt)}`,
    `${HOT_TREND_SYNCED_AT_PREFIX}${input.syncedAt}`,
    `${HOT_TREND_PROMPT_VERSION_PREFIX}${sanitizeTagValue(input.promptVersion)}`,
    `${HOT_TREND_TOPN_PREFIX}${input.topN}`,
    `${HOT_TREND_GENERATION_MODE_PREFIX}${input.generationMode}`,
    `${HOT_TREND_RECOMMENDED_PREFIX}${input.recommended ? "true" : "false"}`,
  ];

  if (input.humanPresence) {
    tags.push(`${HOT_TREND_HUMAN_PRESENCE_PREFIX}${input.humanPresence}`);
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
 * 构建实时热榜LibraryScript资产
 */
export function buildRealtimeHotTrendAsset(input: {
  topic: SquareTrendTopic;
  insight: HotTrendInsight;
  type: HotTrendType;
  syncedAt: number;
  promptVersion: string;
  topN: number;
  analysisSource: "llm" | "heuristic";
  updatedAt: string | null;
  rank: number;
}): Partial<LibraryScript> {
  const topicKey = normalizeHotTrendKey(input.type, input.topic.label);
  const structuredAsset = buildHotTrendStructuredAsset({
    topicLabel: input.topic.label,
    trendType: input.type,
    labels: input.insight.labels,
    scriptContent: input.insight.scriptContent,
    durationSec: input.insight.durationSec,
    sceneSettings: input.insight.sceneSettings,
    storyboardSegments: input.insight.storyboardSegments,
  });

  const tags = buildHotTrendAssetTags({
    topicKey,
    type: input.type,
    reason: input.insight.reason,
    suitability: input.insight.suitability,
    updatedAt: input.updatedAt ?? "unknown",
    syncedAt: input.syncedAt,
    promptVersion: input.promptVersion,
    topN: input.topN,
    generationMode: input.analysisSource === "llm" ? "real" : "degraded",
    recommended: true,
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
  type: HotTrendType;
  syncedAt: number;
  promptVersion: string;
  topN: number;
  analysisSource: "llm" | "heuristic";
  updatedAt: string | null;
}): Partial<LibraryScript>[] {
  return input.topics.map((topic, index) => {
    const insight = input.insights[index];
    if (!insight) {
      return null;
    }
    return buildRealtimeHotTrendAsset({
      topic,
      insight,
      type: input.type,
      syncedAt: input.syncedAt,
      promptVersion: input.promptVersion,
      topN: input.topN,
      analysisSource: input.analysisSource,
      updatedAt: input.updatedAt,
      rank: index + 1,
    });
  }).filter((asset): asset is Partial<LibraryScript> => asset !== null);
}