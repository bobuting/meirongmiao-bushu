/**
 * 热榜类型定义
 * 从 app.ts 迁移，供热榜模块共享使用
 *
 * 迁移源:
 * - SquareTrendDirection, SquareTrendTopic: app.ts 行 6695-6703
 * - HotTrendType 等: app.ts 行 6839-6946
 */

import type {
  HotTrendType,
  HotTrendSuitability,
  HotTrendHumanPresence,
  HotTrendHumanExposure,
  HotTrendSceneSetting,
  HotTrendShotBreakdown,
} from "../../contracts/hot-trend-base.js";

// 重新导出 contracts 中的类型，供模块内部使用
export type {
  HotTrendType,
  HotTrendSuitability,
  HotTrendHumanPresence,
  HotTrendHumanExposure,
  HotTrendSceneSetting,
  HotTrendShotBreakdown,
};

/** 热榜话题方向 */
export type SquareTrendDirection = "up" | "down" | "flat";

/** 热榜话题定义 */
export interface SquareTrendTopic {
  id: number;
  label: string;
  url: string;
  trend: SquareTrendDirection;
  itemId?: string | null;
  rawPayload?: Record<string, unknown> | null;
}

// ============================================================================
// 热榜核心类型（从 contracts 导入并重新导出）
// ============================================================================

/** 证据类型 */
export type HotTrendEvidenceType = "reverse_verified" | "creative_inference";

/** 视频筛选判决 */
export type HotTrendVideoScreenVerdict = "pass" | "caution" | "reject";

/** 智能故事板类型 */
export type HotTrendSmartStoryboardClass = "realtime" | "video_copy" | "video_shot";

// ============================================================================
// 热榜洞察
// ============================================================================

/** 热榜洞察结果 */
export interface HotTrendInsight {
  id: number;
  title: string;
  suitability: HotTrendSuitability;
  humanPresence: HotTrendHumanPresence;
  reason: string;
  labels: string[];
  scriptTitle: string;
  scriptContent: string;
  durationSec: number;
  sceneSettings?: HotTrendSceneSetting[];
  storyboardSegments?: HotTrendShotBreakdown[];
}

// ============================================================================
// 视频多模态筛选
// ============================================================================

/** 视频多模态筛选结果 */
export interface HotTrendVideoMultimodalScreenResult {
  suitability: HotTrendSuitability;
  verdict: HotTrendVideoScreenVerdict;
  reason: string;
  humanPresence: HotTrendHumanPresence;
  humanExposure: HotTrendHumanExposure;
}

// ============================================================================
// 热榜同步
// ============================================================================

/** 热榜同步条目 */
export interface HotTrendSyncEntry {
  type: HotTrendType;
  source: string;
  section: string;
  updatedAt: string | null;
  syncedAt: number;
  nextSyncAt: number;
  llmUsed: boolean;
  analysisSource: "llm" | "heuristic" | "none";
  topics: SquareTrendTopic[];
  videoFetchGuard?: VideoHotTrendFetchGuardState | null;
}

/** 视频热榜回退策略 */
export type VideoHotTrendFallbackStrategy = "none" | "expanded_fetch_then_cache";

/** 视频热榜获取保护状态 */
export interface VideoHotTrendFetchGuardState {
  expectedTopicCount: number;
  minimumPassTopicCount: number;
  initialTopicCount: number;
  finalTopicCount: number;
  fallbackApplied: boolean;
  fallbackStrategy: VideoHotTrendFallbackStrategy;
  fallbackStep: "none" | "expanded_fetch" | "expanded_fetch_plus_cache";
  fallbackTopicDelta: number;
  passed: boolean;
  errorCode: string | null;
  errorMessage: string | null;
}

// ============================================================================
// 热榜推荐打标 (从 app.ts 行 7335 附近)
// ============================================================================

/** 热榜推荐打分器 */
export type HotTrendRecommendationScorer = (input: {
  topicLabel: string;
  trendType: HotTrendType;
  labels?: string[];
}) => number;