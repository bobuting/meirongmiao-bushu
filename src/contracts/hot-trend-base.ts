/**
 * 热榜共享基础类型
 * 供热榜模块和视频热榜模块共同使用
 *
 * 从 modules/hot-trend/types.ts 提取的共享部分
 */

// ============================================================================
// 热榜话题类型
// ============================================================================

/** 热榜话题方向 */
export type SquareTrendDirection = "up" | "down" | "flat";

/** 热榜话题定义 */
export interface SquareTrendTopic {
  id: number;
  label: string;
  url: string;
  trend: SquareTrendDirection;
  itemId?: string | null;
  /** 封面图 URL */
  coverUrl?: string | null;
  rawPayload?: Record<string, unknown> | null;
}

// ============================================================================
// 热榜核心类型
// ============================================================================

/** 热榜类型 */
export type HotTrendType = "realtime" | "video";

/** 热榜适合度 */
export type HotTrendSuitability = "high" | "medium" | "low";

/** 真人出镜状态 */
export type HotTrendHumanPresence = "yes" | "no" | "uncertain";

/** 真人露出程度 */
export type HotTrendHumanExposure = "large" | "partial" | "none" | "uncertain";

/** 证据类型 */
export type HotTrendEvidenceType = "reverse_verified" | "creative_inference";

/** 视频筛选判决 */
export type HotTrendVideoScreenVerdict = "pass" | "caution" | "reject";

// ============================================================================
// 场景与分镜
// ============================================================================

/** 场景设置 */
export interface HotTrendSceneSetting {
  label: "主场景" | "辅助场景" | "时间" | "天气" | "氛围";
  value: string;
}

/** 分镜片段 */
export interface HotTrendShotBreakdown {
  title: string;
  content: string;
  visualCue: string;
  visualPrompt: string;
}

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
// 同步条目
// ============================================================================

/** 热榜同步条目基础 */
export interface HotTrendSyncEntryBase {
  type: HotTrendType;
  source: string;
  section: string;
  updatedAt: string | null;
  syncedAt: number;
  nextSyncAt: number;
  llmUsed: boolean;
  analysisSource: "llm" | "heuristic" | "none";
  topics: SquareTrendTopic[];
}

// ============================================================================
// 推荐打标
// ============================================================================

/** 热榜推荐打分器 */
export type HotTrendRecommendationScorer = (input: {
  topicLabel: string;
  trendType: HotTrendType;
  labels?: string[];
}) => number;