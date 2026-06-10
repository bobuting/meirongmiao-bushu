import {
  resolveTrendRecommendationGrade,
  type TrendRecommendationConfig,
  type TrendRecommendationGrade,
} from "../contracts/trend-recommendation-config.js";

export interface RealtimeHotTrendSelectorTopic<TTopic> {
  topic: TTopic;
  rank: number;
  sourceIndex: number;
  labels: string[];
  softAdScore: number;
}

export interface RealtimeHotTrendSelectorPick<TTopic> extends RealtimeHotTrendSelectorTopic<TTopic> {
  normalizedScore: number;
  recommendationGrade: TrendRecommendationGrade;
  eligible: boolean;
  selectedByTopN: boolean;
  selectedByRecommendTag: boolean;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function clampTopN(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.min(50, Math.floor(value)));
}

export function normalizeHotTrendSoftAdScoreToUnit(score: number): number {
  return clamp01((score + 10) / 20);
}

export function selectTopNAndRecommendedTopics<TTopic>(input: {
  topics: Array<RealtimeHotTrendSelectorTopic<TTopic>>;
  topN: number;
  recommendationConfig: TrendRecommendationConfig;
  isEligible?: (item: Omit<RealtimeHotTrendSelectorPick<TTopic>, "selectedByTopN" | "selectedByRecommendTag">) => boolean;
  isRecommendedExtra?: (item: Omit<RealtimeHotTrendSelectorPick<TTopic>, "selectedByTopN" | "selectedByRecommendTag">) => boolean;
}): Array<RealtimeHotTrendSelectorPick<TTopic>> {
  const sorted = [...input.topics].sort((a, b) => a.rank - b.rank || a.sourceIndex - b.sourceIndex);
  const topN = clampTopN(input.topN);
  const ranked = sorted.map((item) => {
      const normalizedScore = normalizeHotTrendSoftAdScoreToUnit(item.softAdScore);
      const recommendationGrade = resolveTrendRecommendationGrade({
        score: normalizedScore,
        config: input.recommendationConfig,
      });
      return {
        ...item,
        normalizedScore,
        recommendationGrade,
        eligible: true,
      };
    });
  const withEligibility = ranked.map((item) => {
    const eligible = input.isEligible ? input.isEligible(item) : true;
    return {
      ...item,
      eligible,
    };
  });
  const topNEligibleRanks = new Set(
    withEligibility
      .filter((item) => item.eligible)
      .slice(0, topN)
      .map((item) => item.rank),
  );
  return withEligibility
    .map((item) => {
      const selectedByTopN = item.eligible && topNEligibleRanks.has(item.rank);
      const selectedByRecommendTag =
        item.eligible &&
        !selectedByTopN &&
        (input.isRecommendedExtra ? input.isRecommendedExtra(item) : item.recommendationGrade !== "not_recommended");
      return {
        ...item,
        selectedByTopN,
        selectedByRecommendTag,
      };
    })
    .filter((item) => item.selectedByTopN || item.selectedByRecommendTag);
}

export function selectRealtimeTopNAndRecommendedTopics<TTopic>(input: {
  topics: Array<RealtimeHotTrendSelectorTopic<TTopic>>;
  topN: number;
  recommendationConfig: TrendRecommendationConfig;
}): Array<RealtimeHotTrendSelectorPick<TTopic>> {
  return selectTopNAndRecommendedTopics(input);
}
