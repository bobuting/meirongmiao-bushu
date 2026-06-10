/**
 * 实时热榜类型定义
 */

import type {
  HotTrendType,
  HotTrendInsight,
  SquareTrendTopic,
} from "../types.js";
import type { TrendRecommendationConfig } from "../../../contracts/trend-recommendation-config.js";
import type { LibraryScript } from "../../../contracts/types.js";

/**
 * 实时热榜同步配置
 */
export interface RealtimeHotTrendConfig {
  topN: number;
  promptVersion: string;
  labelingCriteria: string;
  labelingTemplate: string;
  expandTemplate: string;
  recommendationConfig: TrendRecommendationConfig;
  maxDurationSec: number;
  maxStoryboardSegments: number;
}

/**
 * 实时热榜同步输入
 */
export interface RealtimeSyncInput {
  topics: SquareTrendTopic[];
  type: HotTrendType;
  source: string;
  section: string;
}

/**
 * 实时热榜同步结果
 */
export interface RealtimeSyncResult {
  syncedAt: number;
  topicCount: number;
  generatedCount: number;
  analysisSource: "llm" | "heuristic";
  assets: LibraryScript[];
}

/**
 * 实时热榜选择结果
 */
export interface RealtimeSelectionResult {
  selected: SquareTrendTopic[];
  recommended: SquareTrendTopic[];
}