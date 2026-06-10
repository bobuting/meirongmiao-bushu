/**
 * 实时热榜类型定义
 */

import type {
  HotTrendType,
  HotTrendSuitability,
  HotTrendHumanPresence,
  SquareTrendTopic,
  HotTrendInsight,
} from "../../contracts/hot-trend-base.js";
import type { LibraryScript } from "../../contracts/types.js";
import type { TrendRecommendationConfig } from "../../contracts/trend-recommendation-config.js";

// ============================================================================
// 同步配置
// ============================================================================

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

// ============================================================================
// 同步输入/输出
// ============================================================================

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
  assets: Partial<LibraryScript>[];
}

/**
 * 实时热榜选择结果
 */
export interface RealtimeSelectionResult {
  selected: SquareTrendTopic[];
  recommended: SquareTrendTopic[];
}

// ============================================================================
// 评分与选择
// ============================================================================

/**
 * 排名后的话题
 */
export interface RankedRealtimeTopic {
  topic: SquareTrendTopic;
  sourceIndex: number;
  rank: number;
}

/**
 * 评分后的话题
 */
export interface ScoredRealtimeTopic extends RankedRealtimeTopic {
  labels: string[];
  softAdScore: number;
}

/**
 * 推荐话题
 */
export interface RecommendedRealtimeTopic extends ScoredRealtimeTopic {
  recommendationGrade: "recommended" | "try";
}

// ============================================================================
// LLM 相关
// ============================================================================

/**
 * LLM Prompt 上下文
 */
export interface RealtimeLlmPromptContext {
  prompt: string;
  requestSummary: string;
}

/**
 * LLM 请求依赖
 */
export interface RealtimeLlmRequestDeps {
  requestLlmPlainTextWithMetadata: (
    provider: import("../../contracts/realtime-hot-trend-sync-contract.js").RealtimeHotTrendResolvedProvider,
    systemPrompt: string,
    userPrompt: string,
    temperature?: number,
    requestOptions?: { timeoutMsOverride?: number }
  ) => Promise<import("../../contracts/realtime-hot-trend-sync-contract.js").RealtimeHotTrendLlmPlainTextResult>;
}

// ============================================================================
// 扩展阶段
// ============================================================================

/**
 * 扩展阶段候选
 */
export interface ExpansionCandidate {
  topic: SquareTrendTopic;
  rank: number;
  label: string;
  sourceIndex: number;
  topicKey: string;
  baseInsight: HotTrendInsight;
}

/**
 * 扩展阶段输入
 */
export interface ExpansionStageInput {
  provider: import("../../contracts/realtime-hot-trend-sync-contract.js").RealtimeHotTrendResolvedProvider | null;
  type: HotTrendType;
  topN: number;
  promptVersion: string;
  providerRoute: string;
  expandTemplate: string;
  candidates: ExpansionCandidate[];
  topicMap: Map<string, HotTrendInsight>;
}

/**
 * 扩展阶段依赖
 */
export interface ExpansionStageDeps {
  sanitizeNarrativeText: (text: string) => string;
  compactTextLine: (text: string, max?: number) => string;
  defaultLabelingCriteria: string;
  defaultLabelingTemplate: string;
  defaultExpandTemplate: string;
  requestPlainTextWithMetadata: RealtimeLlmRequestDeps["requestLlmPlainTextWithMetadata"];
  extractJsonValue: (text: string) => unknown | null;
  normalizeInsights: (
    raw: unknown,
    topics: SquareTrendTopic[],
    type: HotTrendType
  ) => HotTrendInsight[];
  formatLlmDebugTrace: (trace: unknown) => string;
  makeInvalidResponseError: (message: string) => Error;
  onAuditSuccess: (requestSummary: string, responseSummary: string) => void;
  onAuditError: (requestSummary: string, code: string, message: string) => void;
  onWarn: (error: Error) => void;
  maxDurationSec: number;
  maxStoryboardSegments: number;
}