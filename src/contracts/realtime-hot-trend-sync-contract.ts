/**
 * 实时热榜同步服务契约
 * 统一类型定义，供 app.ts 和 realtime-hot-trend 模块共同使用
 */

import type { User, LibraryScript, TrendEntry } from "./types.js";
import type {
  HotTrendType,
  // HotTrendSuitability,  // UNUSED REMOVED
  // HotTrendHumanPresence,  // UNUSED REMOVED
  SquareTrendTopic,
  // HotTrendInsight,  // UNUSED REMOVED
  // HotTrendSceneSetting,  // UNUSED REMOVED
  // HotTrendShotBreakdown,  // UNUSED REMOVED
} from "./hot-trend-base.js";
import type { ProviderRouteKey } from "./provider-route-policy-contract.js";

// ============================================================================
// 同步输入/输出接口
// ============================================================================

/**
 * 实时热榜同步输入
 */
export interface RealtimeHotTrendSyncInput {
  force: boolean;
  tokenOverride: string | null;
  realtimeHotTrendCache: Map<HotTrendType, RealtimeHotTrendSyncEntry>;
  realtimeHotTrendInFlight: Map<HotTrendType, Promise<RealtimeHotTrendSyncEntry>>;
}

/**
 * 实时热榜同步统计
 */
export interface RealtimeHotTrendSyncStats {
  topicCount: number;
  generatedCount: number;
  llmAnalyzed: number;
  llmFailed: number;
  created: number;
  updated: number;
  prunedSmartStoryboardCount: number;
  analysisSource: "llm" | "heuristic" | "none";
}

/**
 * 实时热榜同步结果
 */
export interface RealtimeHotTrendSyncResult {
  entry: RealtimeHotTrendSyncEntry;
  stats: RealtimeHotTrendSyncStats;
}

/**
 * 实时热榜同步条目
 */
export interface RealtimeHotTrendSyncEntry {
  type: "realtime";
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
// Provider 相关类型
// ============================================================================

/**
 * 解析后的路由 Provider
 */
export interface RealtimeHotTrendResolvedProvider {
  id: string;
  vendor: string;
  baseUrl: string;
  model: string;
  options?: Record<string, unknown>;
  timeoutMs: number;
  secret: string;
}

/**
 * LLM 纯文本结果
 */
export interface RealtimeHotTrendLlmPlainTextResult {
  text: string;
  groundingSources: Array<{ title: string; url: string }>;
  debugTrace?: {
    endpoint: string;
    model: string;
    requestHeaders: Record<string, string>;
    requestBody: string;
    response: string;
  };
}

// ============================================================================
// 评分与选择
// ============================================================================

/**
 * 评分后的话题
 */
export interface ScoredRealtimeTopic {
  topic: SquareTrendTopic;
  sourceIndex: number;
  rank: number;
  labels: string[];
  softAdScore: number;
  recommendationGrade: "recommended" | "try";
}

/**
 * 推荐配置
 */
export interface RealtimeTrendRecommendationConfig {
  functionVersion: string;
  safeFallbackVersion: string;
  topN: number;
  thresholds: {
    tryMinScore: number;
    recommendedMinScore: number;
  };
}

// ============================================================================
// 资产服务接口
// ============================================================================

/**
 * 脚本服务接口（实时热榜所需方法）
 */
export interface RealtimeHotTrendScriptServicePort {
  create: (owner: User, script: Partial<LibraryScript>) => LibraryScript;
  update: (owner: User, scriptId: string, script: Partial<LibraryScript>) => LibraryScript;
  findById: (owner: User, scriptId: string) => LibraryScript | null;
  findByTag: (owner: User, tag: string) => LibraryScript[];
}

/**
 * 智能故事板服务接口（实时热榜所需方法）
 */
export interface RealtimeHotTrendSmartStoryboardServicePort {
  create: (owner: User, asset: Partial<import("./smart-storyboard-library-api.js").SmartStoryboardLibraryItem>) => import("./smart-storyboard-library-api.js").SmartStoryboardLibraryItem;
  update: (owner: User, id: string, asset: Partial<import("./smart-storyboard-library-api.js").SmartStoryboardLibraryItem>) => import("./smart-storyboard-library-api.js").SmartStoryboardLibraryItem;
  remove: (owner: User, id: string) => void;
  listForAdmin: (
    owner: User,
    filter: { ownerUserId: string; trendType: HotTrendType }
  ) => import("./smart-storyboard-library-api.js").SmartStoryboardLibraryItem[];
  findById: (owner: User, id: string) => import("./smart-storyboard-library-api.js").SmartStoryboardLibraryItem | null;
}

// ============================================================================
// 核心依赖接口
// ============================================================================

/**
 * 实时热榜同步服务的外部依赖
 */
export interface RealtimeHotTrendSyncDeps {
  // Provider 解析
  resolveRouteProviderWithFallback: (
    routeKeys: ProviderRouteKey[]
  ) => { provider: RealtimeHotTrendResolvedProvider; routeKey: ProviderRouteKey } | null;

  // LLM 请求函数
  requestLlmPlainTextWithMetadata: (
    provider: RealtimeHotTrendResolvedProvider,
    systemPrompt: string,
    userPrompt: string,
    temperature?: number,
    requestOptions?: { timeoutMsOverride?: number }
  ) => Promise<RealtimeHotTrendLlmPlainTextResult>;

  // 数据获取
  fetchDouyinHotHubTrends: (
    type: HotTrendType,
    limit: number,
    realtimeUrl: string,
    envOverrides?: Record<string, string | undefined>,
    errorFactories?: {
      makeFetchFailedError: (message: string) => Error;
      makeParseFailedError: (message: string) => Error;
    }
  ) => Promise<{ topics: SquareTrendTopic[]; source: string; updatedAt: string | null }>;
  buildTikHubRealtimeAdapter: (tokenOverride: string | null) => {
    fetchVideoHotTrends: (
      limit: number,
      dateWindow: "24h" | "7d" | "30d"
    ) => Promise<{ topics: SquareTrendTopic[]; source: string; updatedAt: string | null }>;
  };

  // 趋势条目操作
  upsertTrendEntry: (
    type: HotTrendType,
    source: string,
    dateWindow: string,
    topic: SquareTrendTopic,
    syncedAt: number
  ) => TrendEntry;

  // 资产服务
  scriptService: RealtimeHotTrendScriptServicePort;
  smartStoryboardLibraryService: RealtimeHotTrendSmartStoryboardServicePort;

  // 审计记录
  recordRouteAudit: (
    routeKey: ProviderRouteKey,
    startedAt: number,
    status: "success" | "error" | "timeout",
    cost: number,
    errorCode: string | null,
    errorMessage: string | null,
    requestSummary: string | null,
    responseSummary: string | null
  ) => void;

  // 工具函数
  compactTextLine: (text: string, maxLength?: number) => string;
  extractJsonValue: (text: string) => unknown | null;
  now: () => number;

  // 配置
  config: {
    hotTrendPromptVersion: string;
    douyinHotHubRealtimeUrl: string;
    hotTrendRealtimeTopN: number;
  };

  // 日志
  log: {
    info: (obj: Record<string, unknown>, msg: string) => void;
    warn: (obj: Record<string, unknown>, msg: string) => void;
    error: (obj: Record<string, unknown>, msg: string) => void;
  };
}

// ============================================================================
// 契约版本
// ============================================================================

export const REALTIME_HOT_TREND_SYNC_CONTRACT_VERSION = "AT50-02.v1";

export const REALTIME_HOT_TREND_SYNC_CONTRACT_INVARIANTS = [
  "RealtimeHotTrendSyncDeps must use types from contracts/types.ts for consistency.",
  "All ID fields are strings, not numbers.",
  "User, LibraryScript, TrendEntry types are imported from contracts.",
  "The sync service must be created with all required dependencies injected.",
] as const;