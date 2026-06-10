/**
 * 实时热榜 Pipeline 函数
 * 包含评分、选择、推荐等核心逻辑
 */

import type {
  HotTrendType,
  SquareTrendTopic,
  HotTrendInsight,
} from "../../contracts/hot-trend-base.js";
import type {
  RealtimeHotTrendConfig,
  RankedRealtimeTopic,
  ScoredRealtimeTopic,
  RecommendedRealtimeTopic,
} from "./types.js";
import type { TrendRecommendationConfig } from "../../contracts/trend-recommendation-config.js";
import {
  buildHeuristicHotTrendInsight,
  guessHotTrendLabels,
  scoreHotTrendFashionSoftAdAffinity,
  normalizeHotTrendKey,
} from "./utils.js";

// ============================================================================
// 排名函数
// ============================================================================

/**
 * 为话题排名
 */
export function rankRealtimeTopics(
  topics: SquareTrendTopic[]
): RankedRealtimeTopic[] {
  return topics
    .map((topic, sourceIndex) => {
      const rank =
        Number.isFinite(Number(topic.id)) && Number(topic.id) > 0
          ? Math.floor(Number(topic.id))
          : sourceIndex + 1;
      return {
        topic,
        sourceIndex,
        rank,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.sourceIndex - b.sourceIndex);
}

// ============================================================================
// 评分函数
// ============================================================================

/**
 * 为实时热榜话题评分
 */
export function scoreRealtimeTopics(input: {
  rankedTopics: RankedRealtimeTopic[];
  insights: HotTrendInsight[];
  type: HotTrendType;
}): ScoredRealtimeTopic[] {
  return input.rankedTopics.map((rankedTopic) => {
    const insight = input.insights[rankedTopic.sourceIndex] ??
      buildHeuristicHotTrendInsight(rankedTopic.topic, input.type, rankedTopic.rank);
    const labels = insight.labels.length > 0 ? insight.labels : guessHotTrendLabels(rankedTopic.topic.label, input.type);
    const softAdScore = scoreHotTrendFashionSoftAdAffinity({
      topicLabel: rankedTopic.topic.label,
      trendType: input.type,
      labels,
    });
    return {
      ...rankedTopic,
      labels,
      softAdScore,
    };
  });
}

// ============================================================================
// 选择函数
// ============================================================================

/**
 * 选择实时热榜 TopN 话题
 */
export function selectRealtimeTopN(
  scoredTopics: ScoredRealtimeTopic[],
  topN: number,
): ScoredRealtimeTopic[] {
  return scoredTopics
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, topN);
}

/**
 * 选择实时热榜 TopN 和推荐话题
 */
export function selectRealtimeTopNAndRecommended(input: {
  scoredTopics: ScoredRealtimeTopic[];
  topN: number;
  recommendationConfig: TrendRecommendationConfig;
}): RecommendedRealtimeTopic[] {
  const sorted = input.scoredTopics.slice().sort((a, b) => a.rank - b.rank);
  const recommendedMinScore = input.recommendationConfig.thresholds.recommendedMinScore;

  return sorted.slice(0, input.topN).map((item) => ({
    ...item,
    recommendationGrade: item.softAdScore >= recommendedMinScore ? "recommended" : "try",
  }));
}

// ============================================================================
// 洞察映射
// ============================================================================

/**
 * 构建话题键到洞察的映射
 */
export function buildInsightByTopicKey(
  rankedTopics: RankedRealtimeTopic[],
  insights: HotTrendInsight[],
  type: HotTrendType,
): Map<string, HotTrendInsight> {
  const map = new Map<string, HotTrendInsight>();
  for (const rankedTopic of rankedTopics) {
    const topicKey = normalizeHotTrendKey(type, rankedTopic.topic.label);
    const fallbackInsight = buildHeuristicHotTrendInsight(rankedTopic.topic, type, rankedTopic.rank);
    const insight = insights[rankedTopic.sourceIndex] ?? fallbackInsight;
    map.set(topicKey, insight);
  }
  return map;
}

// ============================================================================
// 生成话题选择
// ============================================================================

/**
 * 选择生成话题
 */
export function selectGenerationTopics(
  recommendedTopics: RecommendedRealtimeTopic[],
  type: HotTrendType,
): {
  generationTopics: Array<{
    topic: SquareTrendTopic;
    sourceIndex: number;
    rank: number;
    softAdScore: number;
  }>;
  generationTopicKeySet: Set<string>;
  generationTopicKeyTagSet: Set<string>;
} {
  const generationTopics = recommendedTopics.map((item) => ({
    topic: item.topic,
    sourceIndex: item.sourceIndex,
    rank: item.rank,
    softAdScore: item.softAdScore,
  }));

  const generationTopicKeySet = new Set(
    generationTopics.map((item) => normalizeHotTrendKey(type, item.topic.label))
  );

  const generationTopicKeyTagSet = new Set(
    generationTopics.map(
      (item) => `hottrend-key:${normalizeHotTrendKey(type, item.topic.label)}`
    )
  );

  return {
    generationTopics,
    generationTopicKeySet,
    generationTopicKeyTagSet,
  };
}