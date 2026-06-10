/**
 * 实时热榜Pipeline函数
 * 包含打标、评分、选择、扩展等核心流程
 *
 * 迁移源: app.ts syncHotTrendAssets 函数中的realtime分支
 */

import type { HotTrendInsight, SquareTrendTopic, HotTrendType } from "../types.js";
import type { RealtimeHotTrendConfig, RealtimeSelectionResult } from "./types.js";
import {
  buildHeuristicHotTrendInsight,
  normalizeHotTrendKey,
} from "../shared/normalize.js";
import {
  scoreHotTrendFashionSoftAdAffinity,
  guessHotTrendLabels,
} from "../shared/infer.js";

// ============================================================================
// 评分函数
// ============================================================================

/**
 * 为实时热榜话题评分
 */
export function scoreRealtimeTopics(input: {
  topics: SquareTrendTopic[];
  insights: HotTrendInsight[];
  type: HotTrendType;
}): Array<{
  topic: SquareTrendTopic;
  sourceIndex: number;
  rank: number;
  labels: string[];
  softAdScore: number;
}> {
  return input.topics.map((topic, index) => {
    const insight = input.insights[index] ?? buildHeuristicHotTrendInsight(topic, input.type, index + 1);
    const labels = insight.labels.length > 0 ? insight.labels : guessHotTrendLabels(topic.label, input.type);
    const softAdScore = scoreHotTrendFashionSoftAdAffinity({
      topicLabel: topic.label,
      trendType: input.type,
      labels,
    });
    return {
      topic,
      sourceIndex: index,
      rank: index + 1,
      labels,
      softAdScore,
    };
  });
}

// ============================================================================
// 选择函数
// ============================================================================

/**
 * 选择实时热榜TopN话题
 * 简化版选择逻辑，完整逻辑在 realtime-hot-trend-selector.ts
 */
export function selectRealtimeTopN(
  scoredTopics: Array<{
    topic: SquareTrendTopic;
    rank: number;
    labels: string[];
    softAdScore: number;
  }>,
  topN: number,
): Array<{
  topic: SquareTrendTopic;
  rank: number;
  labels: string[];
  softAdScore: number;
}> {
  // 按rank排序，取topN
  return scoredTopics
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, topN);
}

/**
 * 选择实时热榜TopN和推荐话题
 * 包装 realtime-hot-trend-selector 模块的函数
 */
export function selectRealtimeTopNAndRecommended(input: {
  topics: Array<{
    topic: SquareTrendTopic;
    sourceIndex: number;
    rank: number;
    labels: string[];
    softAdScore: number;
  }>;
  topN: number;
  recommendationConfig: TrendRecommendationConfig;
}): Array<{
  topic: SquareTrendTopic;
  sourceIndex: number;
  rank: number;
  labels: string[];
  softAdScore: number;
  recommendationGrade: "recommended" | "try";
}> {
  // 简化实现：按rank排序，前topN为try，其中softAdScore高的为recommended
  const sorted = input.topics.slice().sort((a, b) => a.rank - b.rank);
  return sorted.slice(0, input.topN).map((item) => ({
    ...item,
    recommendationGrade: item.softAdScore >= 6 ? "recommended" : "try",
  }));
}

// Note: 完整的选择逻辑在 src/realtime-hot-trend-selector.ts
// 这里只提供类型安全的包装函数

// 类型导入用于TrendRecommendationConfig
import type { TrendRecommendationConfig } from "../../../contracts/trend-recommendation-config.js";