/**
 * 视频热榜同步服务合约
 * 统一类型定义，供 app.ts 和 hot-trend 模块共同使用
 */

import type { User, ScriptData, ProviderCallMode } from "./types.js";
import type { TrendEntry } from "./types.js";
import type { SmartStoryboardLibraryItem } from "./smart-storyboard-library-api.js";
import type { ProviderRouteKey } from "./provider-route-policy-contract.js";
import type { HotTrendType, SquareTrendTopic, HotTrendSyncEntryBase } from "./hot-trend-base.js";

// ============================================================================
// Provider 相关类型
// ============================================================================

/**
 * 解析后的路由 Provider
 */
export interface VideoHotTrendResolvedProvider {
  id: string;
  vendor: string;
  baseUrl: string;
  model: string;
  callMode: ProviderCallMode;
  options?: Record<string, unknown>;
  timeoutMs: number;
  secret: string;
}

/**
 * LLM 纯文本结果
 */
export interface VideoHotTrendLlmPlainTextResult {
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

/**
 * 视频热榜批量反推结果
 */
export interface VideoHotTrendBatchReverseWithRetryResult {
  status: "success" | "failed";
  attempts: number;
  retried: boolean;
  output: {
    multimodalResult: { result: string };
    storyboardPanel: { report: unknown };
    resolvedVideoUrl: string;
  } | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptAudits: Array<{
    attempt: number;
    status: "success" | "error";
    errorCode: string | null;
    errorMessage: string | null;
    retryable: boolean;
  }>;
}

// ============================================================================
// 视频热榜获取保护状态
// ============================================================================

export interface VideoHotTrendFetchGuardState {
  expectedTopicCount: number;
  minimumPassTopicCount: number;
  initialTopicCount: number;
  finalTopicCount: number;
  fallbackApplied: boolean;
  fallbackStrategy: "none" | "expanded_fetch_then_cache";
  fallbackStep: "none" | "expanded_fetch" | "expanded_fetch_plus_cache";
  fallbackTopicDelta: number;
  passed: boolean;
  errorCode: string | null;
  errorMessage: string | null;
}

// ============================================================================
// 适配器接口
// ============================================================================

/**
 * TikHub 视频适配器
 */
export interface VideoHotTrendTikHubAdapter {
  fetchVideoHotTrends: (limit: number, dateWindow: "24h" | "7d" | "30d") => Promise<{
    topics: SquareTrendTopic[];
    source: string;
    updatedAt: string | null;
  }>;
}

/**
 * Douhot 适配器
 */
export interface VideoHotTrendDouhotAdapter {
  fetchVideoHotTrends: (limit: number, dateWindow: "24h" | "7d" | "30d") => Promise<{
    topics: SquareTrendTopic[];
    source: string;
    updatedAt: string | null;
  }>;
}

// ============================================================================
// 同步输入/输出接口
// ============================================================================

/**
 * 视频热榜同步条目
 */
export interface VideoHotTrendSyncEntry extends HotTrendSyncEntryBase {
  type: "video";
  videoFetchGuard: VideoHotTrendFetchGuardState | null;
}

/**
 * 视频热榜同步输入
 */
export interface VideoHotTrendSyncInput {
  force: boolean;
  tokenOverride: string | null;
  hotTrendCache: Map<HotTrendType, HotTrendSyncEntryBase>;
  hotTrendInFlight: Map<HotTrendType, Promise<HotTrendSyncEntryBase>>;
}

/**
 * 视频热榜同步统计
 */
export interface VideoHotTrendSyncStats {
  topicCount: number;
  generatedCount: number;
  videoBatchReverseSelected: number;
  videoBatchReverseSucceeded: number;
  videoBatchReverseFailed: number;
  videoPromptAAnalyzed: number;
  videoPromptAFailed: number;
  videoPromptBAnalyzed: number;
  videoPromptBFailed: number;
  videoPromptBUpdatedAssets: number;
  created: number;
  updated: number;
  prunedSmartStoryboardCount: number;
  analysisSource: "llm" | "heuristic" | "none";
}

/**
 * 视频热榜同步结果
 */
export interface VideoHotTrendSyncResult {
  entry: VideoHotTrendSyncEntry | HotTrendSyncEntryBase;
  stats: VideoHotTrendSyncStats;
}

// ============================================================================
// 资产服务接口（简化版，供依赖注入使用）
// ============================================================================

/**
 * 脚本服务接口（视频热榜所需方法）
 */
export interface VideoHotTrendScriptServicePort {
  create: (owner: User, script: Partial<ScriptData>) => Promise<ScriptData>;
  update: (owner: User, scriptId: string, script: Partial<ScriptData>) => Promise<ScriptData>;
  findById: (owner: User, scriptId: string) => Promise<ScriptData | null>;
  findByTag: (owner: User, tag: string) => Promise<ScriptData[]>;
}

/**
 * 智能故事板服务接口（视频热榜所需方法）
 */
export interface VideoHotTrendSmartStoryboardServicePort {
  create: (owner: User, asset: Partial<SmartStoryboardLibraryItem>) => Promise<SmartStoryboardLibraryItem>;
  update: (owner: User, id: string, asset: Partial<SmartStoryboardLibraryItem>) => Promise<SmartStoryboardLibraryItem>;
  remove: (owner: User, id: string) => Promise<void>;
  listForAdmin: (
    owner: User,
    filter: { ownerUserId: string; trendType: HotTrendType }
  ) => Promise<SmartStoryboardLibraryItem[]>;
  findById: (owner: User, id: string) => Promise<SmartStoryboardLibraryItem | null>;
}

// ============================================================================
// 核心依赖接口
// ============================================================================

/**
 * 视频热榜同步服务的外部依赖
 */
export interface VideoHotTrendSyncDeps {
  // Provider 解析
  resolveRouteProviderWithFallback: (
    routeKeys: ProviderRouteKey[]
  ) => Promise<{ provider: VideoHotTrendResolvedProvider; routeKey: ProviderRouteKey } | null>;
  resolveRouteRetryCount: (routeKey: ProviderRouteKey) => Promise<number>;

  // LLM 请求函数
  requestLlmPlainTextWithMetadata: (
    provider: VideoHotTrendResolvedProvider,
    systemPrompt: string,
    userPrompt: string,
    temperature?: number,
    requestOptions?: { timeoutMsOverride?: number }
  ) => Promise<VideoHotTrendLlmPlainTextResult>;
  requestGeminiPlainTextWithVideoPart: (
    provider: VideoHotTrendResolvedProvider,
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    videoPart: Record<string, unknown>,
    requestOptions?: { timeoutMsOverride?: number }
  ) => Promise<VideoHotTrendLlmPlainTextResult>;
  buildGeminiRemoteVideoPart: (videoUrl: string, mimeType: string) => Record<string, unknown>;
  buildGeminiInlineVideoPart: (videoBase64: string, mimeType: string) => Record<string, unknown>;

  // 视频反推
  runSharedVideoUrlReversePipelineForUser: (
    videoUrl: string,
    opts: { userId: string; projectId: string | null }
  ) => Promise<{
    multimodalResult: { result: string };
    storyboardPanel: { report: unknown };
    resolvedVideoUrl: string;
  }>;
  runVideoHotTrendBatchReverseWithRetry: <TOutput>(input: {
    maxAttempts: number;
    execute: (attempt: number) => Promise<TOutput>;
  }) => Promise<VideoHotTrendBatchReverseWithRetryResult>;

  /** 解析视频 URL（通过 TikHub API 将抖音网页链接转换为视频直链） */
  resolveVideoUrl: (inputUrl: string) => Promise<string>;

  // 数据获取
  buildTikHubVideoAdapter: (tokenOverride: string | null) => VideoHotTrendTikHubAdapter | Promise<VideoHotTrendTikHubAdapter>;
  buildDouhotAdapter: () => VideoHotTrendDouhotAdapter;
  buildStoredHotTrendFallback: (
    type: HotTrendType,
    limit: number
  ) => Promise<{ topics: SquareTrendTopic[]; updatedAt: string | null } | null>;

  // 趋势条目操作
  upsertTrendEntry: (
    type: HotTrendType,
    source: string,
    dateWindow: string,
    topic: SquareTrendTopic,
    syncedAt: number
  ) => Promise<TrendEntry>;
  mergeTrendTopicsByIdentity: (
    topicGroups: SquareTrendTopic[][],
    limit: number
  ) => SquareTrendTopic[];

  // 资产服务
  scriptService: VideoHotTrendScriptServicePort;
  smartStoryboardLibraryService: VideoHotTrendSmartStoryboardServicePort;

  // ========== 热榜资产表操作（nrm_hot_trend_assets）==========

  /** 插入热榜原始数据到 nrm_hot_trend_assets */
  insertHotTrendAsset: (input: {
    id: string;
    topic: string;
    url: string | null;
    rank: number | null;
    hotValue: string | null;
    section: string | null;
    source: string;
    trendType: 'video' | 'realtime';
    sourceOssUrl?: string | null;
    /** 封面图 URL */
    coverUrl?: string | null;
    // 视频元数据（从 libraryScripts.reverseContext.sourceMeta 迁移）
    videoTitle?: string | null;
    videoUrl?: string | null;
    audioUrl?: string | null;
    createTime?: number | null;
    playCount?: number | null;
    commentCount?: number | null;
    diggCount?: number | null;
    shareCount?: number | null;
    collectCount?: number | null;
    recommendCount?: number | null;
    nickname?: string | null;
    duration?: number | null;
    scriptText?: string | null;
  }) => Promise<void>;

  /** 按话题查找已有资产 */
  findHotTrendAssetByTopic: (topic: string, trendType: 'video' | 'realtime') => Promise<{
    id: string;
    topic: string;
    scriptId: string | null;
    sourceOssUrl: string | null;
    videoTitle: string | null;
    videoUrl: string | null;
    audioUrl: string | null;
    createTime: number | null;
    playCount: number | null;
    commentCount: number | null;
    diggCount: number | null;
    shareCount: number | null;
    collectCount: number | null;
    recommendCount: number | null;
    nickname: string | null;
    duration: number | null;
    scriptText: string | null;
  } | null>;

  /** 更新资产的 script_id（LLM 反推成功后调用）*/
  updateHotTrendAssetScriptId: (assetId: string, scriptId: string) => Promise<void>;

  /** 更新资产的 source_oss_url（OSS 上传成功后调用）*/
  updateHotTrendAssetSourceOssUrl: (assetId: string, sourceOssUrl: string) => Promise<void>;

  // ========== 脚本数据表操作（nrm_script_data）==========

  /** 插入 LLM 反推结果到 nrm_script_data（结构化字段）*/
  insertScriptData: (input: {
    id: string;
    type: number;
    title: string;
    durationSeconds?: number;
    source?: string;
    theme?: string;
    summary?: string;
    primaryEmotion?: string;
    videoType?: string;
    videoStyle?: string;
    fashionSuitable?: boolean;
    fashionReason?: string;
    emotionDetail?: Record<string, unknown>;
    onScreenPresence?: Record<string, unknown>;
    fashionStyles?: Record<string, unknown>[];
    editingAnalysis?: Record<string, unknown>;
    sourceOssUrl?: string | null;
    timeOfDay?: string;
    weather?: string;
    payloadJson?: Record<string, unknown>;
  }) => Promise<string>;  // 返回插入的 script_data_id

  /** 批量插入分镜数据到 nrm_shot_breakdown */
  insertShotBreakdown: (scriptId: string, shots: Record<string, unknown>[]) => Promise<number>;

  // ========== 情感原型库操作（nrm_emotion_archetype_library）==========

  /** 插入 LLM 提取的情感原型到 nrm_emotion_archetype_library */
  insertEmotionArchetype: (input: {
    category: string;
    emotionCore: string;
    moment: string;
    conflict: string;
    clothingRole: string;
    source: string;
    sourceMetadata?: Record<string, unknown>;
  }) => Promise<string | null>;  // 返回插入的 archetype_id，无效数据返回 null

  // 关闭共享 DB 连接池（批量操作结束后调用）
  closeSharedDbPool: () => Promise<void>;

  // 视频下载到内存（供多模态 LLM 使用 base64 内联传输）
  downloadVideoForLlm: (sourceUrl: string) => Promise<{
    base64: string;
    mimeType: string;
  } | null>;

  // 异步上传视频到 OSS（与 LLM 调用并行执行）
  uploadVideoToOss: (
    videoBase64: string,
    mimeType: string,
    keyPrefix: string
  ) => Promise<string | null>;

  // 用户获取
  getOwner: () => Promise<User>;

  // 审计记录（旧函数，保持向后兼容）
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

  // 调试记录（新函数，用于 LLM 调试气泡）
  /** 创建 LLM 调试记录（调用前） */
  createLlmDebugRecord: (input: {
    routeKey: ProviderRouteKey;
    businessContext: string;
    projectId?: string;
    userId?: string;
    messages: Array<{ role: string; content: string }>;
    provider: VideoHotTrendResolvedProvider;
    hasMedia?: "image" | "video";
    /** 实际调用的 API 地址（预构建） */
    actualEndpoint?: string;
    /** 请求头 JSON（预构建） */
    requestHeadersJson?: string;
    /** 请求体摘要 JSON（预构建） */
    requestBodyJson?: string;
  }) => { auditId: string; startedAt: number };

  /** 完成 LLM 调试记录（成功） */
  finalizeLlmDebugRecordSuccess: (input: {
    auditId: string;
    startedAt: number;
    actualModel: string;
    responseText: string;
    /** 实际调用的 API 地址 */
    actualEndpoint?: string | null;
    /** 请求头 JSON */
    requestHeadersJson?: string | null;
    /** 请求体摘要 JSON */
    requestBodyJson?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    ttftMs?: number;
  }) => void;

  /** 完成 LLM 调试记录（失败） */
  finalizeLlmDebugRecordError: (input: {
    auditId: string;
    startedAt: number;
    errorCode: string;
    errorMessage: string;
    actualEndpoint?: string | null;
    requestHeadersJson?: string | null;
    requestBodyJson?: string | null;
  }) => void;

  // 工具函数
  compactTextLine: (text: string, maxLength?: number) => string;
  extractJsonValue: (text: string) => unknown | null;
  now: () => number;

  // 配置
  config: {
    hotTrendPromptVersion: string;
    douyinHotHubRealtimeUrl: string;
    /** 统一控制：数据拉取条数 & LLM 反推条数 */
    hotTrendVideoReverseTopN: number;
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

export const VIDEO_HOT_TREND_SYNC_CONTRACT_VERSION = "AT50-01.v1";

export const VIDEO_HOT_TREND_SYNC_CONTRACT_INVARIANTS = [
  "VideoHotTrendSyncDeps must use types from contracts/types.ts for consistency.",
  "All ID fields are strings, not numbers.",
  "User, LibraryScript, TrendEntry, SmartStoryboardLibraryItem types are imported from contracts.",
  "The sync service must be created with all required dependencies injected.",
] as const;