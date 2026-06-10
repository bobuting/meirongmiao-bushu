/**
 * hot-trend-sync.ts
 * 热榜同步引擎 —— 从 app.ts buildApp 闭包中提取
 *
 * 负责：视频热榜同步、实时热榜同步、统一调度入口、定时调度器管理
 * 工厂函数接收全部外部依赖，返回 syncHotTrendAssets / buildStoredHotTrendFallback / startSchedulerHooks
 */

import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { User, TrendEntry, TrendSyncJob } from "../contracts/types.js";
import { AppError } from "../core/errors.js";
// import { hashJsonString } from "../persistence/hash-util.js";  // UNUSED
import { mergeTrendTopicsByIdentity } from "./reverse-fetch-adapters.js";
import type { VideoHotTrendFallbackStrategy, HotTrendType, HotTrendSyncEntry, SquareTrendTopic, VideoHotTrendFetchGuardState } from "./hot-trend/index.js";
import { fetchDouyinHotHubTrends, HOT_TREND_VIDEO_UNDERFLOW_ERROR_CODE, HOT_TREND_VIDEO_FALLBACK_EXTRA_FETCH_COUNT } from "./hot-trend/index.js";
import { VIDEO_HOT_TREND_FETCH_CONTRACT } from "../contracts/hot-trend-fetch-config.js";
// import type { ProviderRouteKey } from "../contracts/provider-route-policy-contract.js";  // UNUSED
import type { VideoHotTrendSyncDeps } from "./video-hot-trend/index.js";

// ─── 同步日志类型 ──────────────────────────────────────────────────

export type HotTrendSyncTriggerType = "scheduled" | "manual";
export type HotTrendSyncLogStatus = "running" | "success" | "failed";

export interface HotTrendSyncLog {
  id: string;
  triggerType: HotTrendSyncTriggerType;
  trendType: string;
  status: HotTrendSyncLogStatus;
  source: string | null;
  topicCount: number;
  durationMs: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

export interface HotTrendSyncLogListResult {
  items: HotTrendSyncLog[];
  total: number;
  page: number;
  limit: number;
}

// ─── 工厂依赖接口 ──────────────────────────────────────────────────

export interface HotTrendSyncDeps {
  app: FastifyInstance;
  ctx: AppContext;

  // 配置辅助函数
  resolveHotTrendSyncIntervalMs: (type: HotTrendType) => number;
  resolveNextHotTrendRunAt: (type: HotTrendType, nowMs?: number) => number;

  // 适配器构造
  buildTikHubVideoAdapter: (tokenOverride?: string | null) => { fetchVideoHotTrends: (limit: number, dateWindow: "24h" | "7d" | "30d") => Promise<{ topics: SquareTrendTopic[]; source: string; section: string; updatedAt: string | null }> } | Promise<{ fetchVideoHotTrends: (limit: number, dateWindow: "24h" | "7d" | "30d") => Promise<{ topics: SquareTrendTopic[]; source: string; section: string; updatedAt: string | null }> }>;
  buildTikHubRealtimeAdapter: (tokenOverride?: string | null) => { fetchVideoHotTrends: (limit: number, dateWindow: "24h" | "7d" | "30d") => Promise<{ topics: SquareTrendTopic[]; source: string; section: string; updatedAt: string | null }> } | Promise<{ fetchVideoHotTrends: (limit: number, dateWindow: "24h" | "7d" | "30d") => Promise<{ topics: SquareTrendTopic[]; source: string; section: string; updatedAt: string | null }> }>;

  // 视频热榜模块化同步服务所需依赖（完整透传）
  videoSyncDeps: () => VideoHotTrendSyncDeps;

  // 外部已创建的共享缓存 Map
  hotTrendCache: Map<HotTrendType, HotTrendSyncEntry>;
  hotTrendInFlight: Map<HotTrendType, Promise<HotTrendSyncEntry>>;

  // 启动时自动分析标记
  hotTrendAutoAnalyzeOnStartup: boolean;
}

export interface HotTrendSyncEngine {
  syncHotTrendAssets: (type: HotTrendType, force?: boolean, tokenOverride?: string | null, triggerType?: HotTrendSyncTriggerType) => Promise<HotTrendSyncEntry>;
  buildStoredHotTrendFallback: (type: HotTrendType, limit: number) => Promise<HotTrendSyncEntry | null>;
  /** 注册 onReady / onClose 调度钩子 */
  startSchedulerHooks: () => void;
  /** 查询同步运行记录（分页） */
  listSyncLogs: (params: { page: number; limit: number; triggerType?: HotTrendSyncTriggerType; trendType?: HotTrendType; status?: HotTrendSyncLogStatus }) => Promise<HotTrendSyncLogListResult>;
}

// ─── 工厂函数 ──────────────────────────────────────────────────────

export function createHotTrendSyncEngine(deps: HotTrendSyncDeps): HotTrendSyncEngine {
  const {
    app,
    ctx,
    resolveHotTrendSyncIntervalMs,
    resolveNextHotTrendRunAt,
    buildTikHubVideoAdapter,
    buildTikHubRealtimeAdapter,
    hotTrendCache,
    hotTrendInFlight,
    hotTrendAutoAnalyzeOnStartup,
  } = deps;

  // ─── 调度器定时器 ──────────────────────────────────────────────

  const hotTrendSchedulerTimers = new Map<
    HotTrendType,
    {
      kickoffTimer: NodeJS.Timeout | null;
      intervalTimer: NodeJS.Timeout | null;
    }
  >();

  // ─── 热榜资产数据库操作 ────────────────────────────────────────

  /** 插入或更新热榜资产（按 topic+trend_type 去重） */
  async function upsertHotTrendAsset(input: {
    id: string;
    topic: string;
    url: string | null;
    rank: number;
    source: string;
    trendType: "realtime" | "video";
    dateWindow: "24h" | "7d" | "30d";
    section: string | null;
    hotValue?: string | null;
    itemId?: string | null;
    normalizedKey?: string | null;
    hash?: string | null;
    rawPayload?: Record<string, unknown> | null;
  }): Promise<void> {
    await ctx.repos.hotTrendAssets.upsertForSync({
      id: input.id,
      topic: input.topic,
      url: input.url,
      rank: input.rank,
      source: input.source,
      trendType: input.trendType,
      dateWindow: input.dateWindow,
      section: input.section,
      hotValue: input.hotValue,
      itemId: input.itemId,
      normalizedKey: input.normalizedKey,
      hash: input.hash,
      rawPayload: input.rawPayload,
      createdAt: ctx.clock.now(),
    });
  }

  /** 从 nrm_hot_trend_assets 查询最新热榜资产 */
  async function queryHotTrendAssets(
    trendType: "realtime" | "video",
    limit: number,
  ): Promise<Array<{
    id: string;
    topic: string;
    url: string | null;
    rank: number | null;
    source: string;
    itemId: string | null;
    rawPayload: Record<string, unknown> | null;
    updatedAt: number;
  }>> {
    return ctx.repos.hotTrendAssets.queryByTrendType(trendType, limit);
  }

  // ─── 趋势条目辅助函数（保留用于兼容）────────────────────────────

  async function upsertTrendEntry(
    trendType: HotTrendType,
    source: string,
    dateWindow: "24h" | "7d" | "30d",
    topic: SquareTrendTopic,
    syncedAt: number,
  ): Promise<TrendEntry> {
    const normalizedLabel = topic.label.trim().replace(/\s+/g, " ").toLowerCase();
    const normalizedKey = `${trendType}:${normalizedLabel}:${dateWindow}`;
    const hash = createHash("sha256")
      .update(`${source}|${trendType}|${normalizedKey}|${topic.url}|${topic.itemId ?? ""}`)
      .digest("hex");
    const existing = [...await ctx.repos.trendEntries.list()].find(
      (item) => item.source === source && item.trendType === trendType && item.normalizedKey === normalizedKey,
    );
    const entry: TrendEntry = {
      id: existing?.id ?? ctx.clock.generateId(),
      source,
      trendType,
      dateWindow,
      normalizedKey,
      title: topic.label,
      url: topic.url,
      itemId: topic.itemId ?? null,
      trend: topic.trend,
      rank: topic.id,
      hash,
      syncedAt,
      rawPayload: topic.rawPayload ?? null,
    };
    await ctx.repos.trendEntries.upsert(entry);
    return entry;
  }

  async function createTrendSyncJob(
    trendType: HotTrendType,
    source: string,
    dateWindow: "24h" | "7d" | "30d",
  ): Promise<TrendSyncJob> {
    const job: TrendSyncJob = {
      id: ctx.clock.generateId(),
      trendType,
      source,
      dateWindow,
      status: "running",
      startedAt: ctx.clock.now(),
      finishedAt: null,
      elapsedMs: null,
      topicCount: 0,
      errorCode: null,
      errorMessage: null,
    };
    await ctx.repos.trendSyncJobs.upsert(job);
    return job;
  }

  async function finishTrendSyncJob(
    job: TrendSyncJob,
    patch: {
      status: "success" | "failed";
      topicCount?: number;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  ): Promise<void> {
    const finishedAt = ctx.clock.now();
    const next: TrendSyncJob = {
      ...job,
      status: patch.status,
      topicCount: patch.topicCount ?? job.topicCount,
      errorCode: patch.errorCode ?? null,
      errorMessage: patch.errorMessage ?? null,
      finishedAt,
      elapsedMs: Math.max(1, finishedAt - job.startedAt),
    };
    await ctx.repos.trendSyncJobs.upsert(next);
  }

  // ─── 同步运行日志数据库操作 ──────────────────────────────────────

  /** 插入一条 running 状态的同步运行日志 */
  async function insertSyncLog(params: {
    triggerType: HotTrendSyncTriggerType;
    trendType: HotTrendType;
  }): Promise<string> {
    return ctx.repos.hotTrendSyncLogs.insertRunningLog({
      triggerType: params.triggerType,
      trendType: params.trendType,
    });
  }

  /** 更新同步运行日志为完成状态 */
  async function finishSyncLog(
    logId: string | null,
    status: "success" | "failed",
    data: {
      source?: string | null;
      topicCount: number;
      durationMs: number;
      errorMessage?: string | null;
    },
  ): Promise<void> {
    if (!logId) return;
    await ctx.repos.hotTrendSyncLogs.finishLog(logId, status, data);
  }

  /** 查询同步运行日志列表（分页） */
  async function listSyncLogs(params: {
    page: number;
    limit: number;
    triggerType?: HotTrendSyncTriggerType;
    trendType?: HotTrendType;
    status?: HotTrendSyncLogStatus;
  }): Promise<HotTrendSyncLogListResult> {
    const result = await ctx.repos.hotTrendSyncLogs.listPaginated({
      page: params.page,
      limit: params.limit,
      triggerType: params.triggerType,
      trendType: params.trendType,
      status: params.status,
    });
    // 转换字段名以匹配接口定义（repo 返回 camelCase）
    return {
      items: result.items.map((item) => ({
        id: item.id,
        triggerType: item.triggerType,
        trendType: item.trendType,
        status: item.status,
        source: item.source,
        topicCount: item.topicCount ?? 0,
        durationMs: item.durationMs ?? 0,
        errorMessage: item.errorMessage,
        startedAt: item.startedAt,
        finishedAt: item.finishedAt,
        createdAt: item.createdAt,
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  // ─── 视频热榜 fallback 策略 ────────────────────────────────────

  function resolveVideoHotTrendFallbackStrategy(): VideoHotTrendFallbackStrategy {
    const raw = String(process.env.HOT_TREND_VIDEO_FETCH_UNDERFLOW_STRATEGY ?? "")
      .trim()
      .toLowerCase();
    if (raw === "none") {
      return "none";
    }
    return "expanded_fetch_then_cache";
  }

  // ─── 视频热榜 Topic Floor 守卫 ─────────────────────────────────

  async function enforceVideoHotTrendTopicFloor(
    topics: SquareTrendTopic[],
    dateWindow: "24h" | "7d" | "30d",
    tokenOverride: string | null,
  ): Promise<{ topics: SquareTrendTopic[]; guard: VideoHotTrendFetchGuardState }> {
    const expectedTopicCount = VIDEO_HOT_TREND_FETCH_CONTRACT.expectedTopicCount;
    const minimumPassTopicCount = VIDEO_HOT_TREND_FETCH_CONTRACT.minimumPassTopicCount;
    const normalizedInitialTopics = mergeTrendTopicsByIdentity([topics], Math.max(expectedTopicCount, topics.length));
    const initialTopicCount = normalizedInitialTopics.length;
    const fallbackStrategy = resolveVideoHotTrendFallbackStrategy();
    let mergedTopics = mergeTrendTopicsByIdentity([normalizedInitialTopics], expectedTopicCount);
    let fallbackApplied = false;
    let fallbackStep: VideoHotTrendFetchGuardState["fallbackStep"] = "none";

    if (mergedTopics.length < expectedTopicCount && fallbackStrategy === "expanded_fetch_then_cache") {
      fallbackApplied = true;
      try {
        const expandedLimit = expectedTopicCount + HOT_TREND_VIDEO_FALLBACK_EXTRA_FETCH_COUNT;
        const expandedFetch = await (await buildTikHubVideoAdapter(tokenOverride)).fetchVideoHotTrends(expandedLimit, dateWindow);
        mergedTopics = mergeTrendTopicsByIdentity([mergedTopics, expandedFetch.topics], expectedTopicCount);
        fallbackStep = "expanded_fetch";
      } catch (error) {
        app.log.warn(
          {
            err: error,
            expectedTopicCount,
            initialTopicCount,
            strategy: fallbackStrategy,
          },
          "video hot trend expanded-fetch fallback failed",
        );
      }
      if (mergedTopics.length < expectedTopicCount) {
        const cacheFallback = await buildStoredHotTrendFallback("video", expectedTopicCount);
        if (cacheFallback?.topics?.length) {
          mergedTopics = mergeTrendTopicsByIdentity([mergedTopics, cacheFallback.topics], expectedTopicCount);
          fallbackStep = "expanded_fetch_plus_cache";
        }
      }
    }

    const finalTopicCount = mergedTopics.length;
    const passed = finalTopicCount >= minimumPassTopicCount;
    const errorMessage = passed
      ? null
      : `video hot trend effective topics under expected minimum: expected>${minimumPassTopicCount - 1}, actual=${finalTopicCount}, initial=${initialTopicCount}, strategy=${fallbackStrategy}`;

    return {
      topics: mergedTopics,
      guard: {
        expectedTopicCount,
        minimumPassTopicCount,
        initialTopicCount,
        finalTopicCount,
        fallbackApplied,
        fallbackStrategy,
        fallbackStep,
        fallbackTopicDelta: Math.max(0, finalTopicCount - initialTopicCount),
        passed,
        errorCode: passed ? null : HOT_TREND_VIDEO_UNDERFLOW_ERROR_CODE,
        errorMessage,
      },
    };
  }

  // ─── 热榜资产 Owner 解析 ───────────────────────────────────────

  async function resolveHotTrendOwner(): Promise<User> {
    const preferredEmail = process.env.HOT_TREND_ASSET_OWNER_EMAIL?.trim().toLowerCase();
    if (preferredEmail) {
      const byEmail = await ctx.repos.users.findById(preferredEmail);
      if (byEmail) {
        return byEmail;
      }
    }
    const firstAdmin = [...await ctx.repos.users.list()].find((item) => item.role === "admin");
    if (firstAdmin) {
      return firstAdmin;
    }
    const email = preferredEmail || "hottrend-bot@local";
    const password = process.env.HOT_TREND_ASSET_OWNER_PASSWORD?.trim() || "hottrend-bot-123456";
    try {
      return ctx.authService.register(email, password, "admin");
    } catch {
      const fallback = await ctx.repos.users.findById(email);
      if (fallback) {
        return fallback;
      }
      throw new AppError(500, "HOT_TREND_OWNER_MISSING", "Hot trend asset owner unavailable");
    }
  }

  // ─── 同步视频热榜资产 ──────────────────────────────────────────

  // Suppress TS6133 for unused but preserved functions
  void upsertTrendEntry;
  void enforceVideoHotTrendTopicFloor;
  void resolveHotTrendOwner;

  async function syncVideoHotTrendAssets(
    force = false,
    tokenOverride: string | null = null,
    triggerType: HotTrendSyncTriggerType = "scheduled",
  ): Promise<HotTrendSyncEntry> {
    const type: HotTrendType = "video";
    const now = ctx.clock.now();

    // 检查缓存
    const cached = hotTrendCache.get(type);
    if (!force && cached && now < cached.nextSyncAt) {
      return cached;
    }

    // 检查进行中的任务
    const currentJob = hotTrendInFlight.get(type);
    if (currentJob) {
      return currentJob;
    }

    // 插入运行日志（失败不阻止同步流程）
    let syncLogId: string | null = null;
    try {
      syncLogId = await insertSyncLog({ triggerType, trendType: type });
    } catch { /* 日志写入失败不阻止同步 */ }
    const startTime = Date.now();

    // 获取模块化同步服务依赖
    const videoSyncDeps = deps.videoSyncDeps();

    const job = (async (): Promise<HotTrendSyncEntry> => {
      const { createVideoHotTrendSyncService } = await import("./video-hot-trend/index.js");
      const videoSyncService = createVideoHotTrendSyncService(videoSyncDeps);
      const result = await videoSyncService.sync({
        force,
        tokenOverride,
        hotTrendCache,
        hotTrendInFlight,
      });

      // 批量操作结束后关闭共享 DB 连接池
      await videoSyncDeps.closeSharedDbPool?.();

      app.log.info(
        {
          trendType: "video",
          topicCount: result.stats.topicCount,
          generatedCount: result.stats.generatedCount,
          videoBatchReverseSelected: result.stats.videoBatchReverseSelected,
          videoBatchReverseSucceeded: result.stats.videoBatchReverseSucceeded,
          videoBatchReverseFailed: result.stats.videoBatchReverseFailed,
          videoPromptAAnalyzed: result.stats.videoPromptAAnalyzed,
          videoPromptBAnalyzed: result.stats.videoPromptBAnalyzed,
          analysisSource: result.stats.analysisSource,
        },
        "video hot trend synced via modular service",
      );

      return result.entry as HotTrendSyncEntry;
    })();

    hotTrendInFlight.set(type, job);
    try {
      const entry = await job;
      hotTrendCache.set(type, entry);
      // 更新运行日志为成功
      try {
        await finishSyncLog(syncLogId, "success", {
          source: entry.source,
          topicCount: entry.topics.length,
          durationMs: Date.now() - startTime,
        });
      } catch { /* 日志写入失败不影响主流程 */ }
      return entry;
    } catch (error) {
      // 更新运行日志为失败
      try {
        await finishSyncLog(syncLogId, "failed", {
          topicCount: 0,
          durationMs: Date.now() - startTime,
          errorMessage: String(error),
        });
      } catch { /* 日志写入失败不影响主流程 */ }
      throw error;
    } finally {
      hotTrendInFlight.delete(type);
    }
  }

  // ─── 同步实时热榜资产 ──────────────────────────────────────────

  async function syncRealtimeHotTrendAssets(
    force = false,
    tokenOverride: string | null = null,
    triggerType: HotTrendSyncTriggerType = "scheduled",
  ): Promise<HotTrendSyncEntry> {
    const type: HotTrendType = "realtime";
    const now = ctx.clock.now();

    // 检查缓存
    const cached = hotTrendCache.get(type);
    if (!force && cached && now < cached.nextSyncAt) {
      return cached;
    }

    // 检查进行中的任务
    const currentJob = hotTrendInFlight.get(type);
    if (currentJob) {
      return currentJob;
    }

    // 插入运行日志（失败不阻止同步流程）
    let syncLogId: string | null = null;
    try {
      syncLogId = await insertSyncLog({ triggerType, trendType: type });
    } catch { /* 日志写入失败不阻止同步 */ }
    const startTime = Date.now();

    const executeRealtimeSync = async (): Promise<HotTrendSyncEntry> => {
      const dateWindow: "24h" | "7d" | "30d" = "24h";
      const syncJob = await createTrendSyncJob(type, "douyin-hot-hub", dateWindow);
      try {
        const fetched = await (async () => {
          try {
            return await fetchDouyinHotHubTrends(
              "realtime",
              50,
              ctx.configService.get().douyinHotHubRealtimeUrl,
              {
                DOUYIN_HOT_HUB_README_URL: process.env.DOUYIN_HOT_HUB_README_URL,
                DOUYIN_HOT_HUB_TIMEOUT_MS: process.env.DOUYIN_HOT_HUB_TIMEOUT_MS,
              },
              {
                makeFetchFailedError: (message) => new AppError(502, "HOT_HUB_FETCH_FAILED", message),
                makeParseFailedError: (message) => new AppError(502, "HOT_HUB_PARSE_FAILED", message),
              },
            );
          } catch (error) {
            app.log.warn({ err: error }, "douyin-hot-hub failed, fallback to tikhub realtime");
            return (await buildTikHubRealtimeAdapter(tokenOverride)).fetchVideoHotTrends(50, dateWindow);
          }
        })();
        syncJob.source = fetched.source;
        const effectiveTopics = fetched.topics;

        // 写入 nrm_hot_trend_assets 表（统一存储）
        for (const topic of effectiveTopics) {
          const normalizedLabel = topic.label.trim().replace(/\s+/g, " ").toLowerCase();
          const normalizedKey = `${type}:${normalizedLabel}:${dateWindow}`;
          const hash = createHash("sha256")
            .update(`${fetched.source}|${type}|${normalizedKey}|${topic.url}|${topic.itemId ?? ""}`)
            .digest("hex");
          await upsertHotTrendAsset({
            id: ctx.clock.generateId(),
            topic: topic.label,
            url: topic.url,
            rank: topic.id,
            source: fetched.source,
            trendType: type,
            dateWindow,
            section: fetched.section,
            itemId: topic.itemId ?? null,
            normalizedKey,
            hash,
            rawPayload: topic.rawPayload ?? null,
          });
        }

        // realtime 热榜简化：只获取数据，不调 LLM，不生成分镜资产
        const entry: HotTrendSyncEntry = {
          type,
          source: fetched.source,
          section: fetched.section,
          updatedAt: fetched.updatedAt,
          syncedAt: now,
          nextSyncAt: now + resolveHotTrendSyncIntervalMs(type),
          llmUsed: false,
          analysisSource: "none",
          topics: effectiveTopics,
          videoFetchGuard: null,
        };
        hotTrendCache.set(type, entry);
        await finishTrendSyncJob(syncJob, {
          status: "success",
          topicCount: effectiveTopics.length,
        });
        // 更新运行日志为成功
        try {
          await finishSyncLog(syncLogId, "success", {
            source: fetched.source,
            topicCount: effectiveTopics.length,
            durationMs: Date.now() - startTime,
          });
        } catch { /* 日志写入失败不影响主流程 */ }
          return entry;
      } catch (error) {
        const code = error instanceof AppError ? error.code : "UNKNOWN";
        await finishTrendSyncJob(syncJob, {
          status: "failed",
          errorCode: code,
          errorMessage: String(error),
        });
        // 更新运行日志为失败
        try {
          await finishSyncLog(syncLogId, "failed", {
            topicCount: 0,
            durationMs: Date.now() - startTime,
            errorMessage: String(error),
          });
        } catch { /* 日志写入失败不影响主流程 */ }
          throw error;
      }
    };

    const job = executeRealtimeSync().finally(() => {
      hotTrendInFlight.delete(type);
    });

    hotTrendInFlight.set(type, job);
    return job;
  }

  // ─── 统一热榜同步入口 ──────────────────────────────────────────

  async function syncHotTrendAssets(
    type: HotTrendType,
    force = false,
    tokenOverride: string | null = null,
    triggerType: HotTrendSyncTriggerType = "scheduled",
  ): Promise<HotTrendSyncEntry> {
    if (type === "video") {
      return syncVideoHotTrendAssets(force, tokenOverride, triggerType);
    }
    return syncRealtimeHotTrendAssets(force, tokenOverride, triggerType);
  }

  // ─── 存储 fallback ─────────────────────────────────────────────

  async function buildStoredHotTrendFallback(type: HotTrendType, limit: number): Promise<HotTrendSyncEntry | null> {
    const cached = hotTrendCache.get(type);
    if (cached && cached.topics.length > 0) {
      return {
        ...cached,
        topics: cached.topics.slice(0, limit),
        videoFetchGuard: null,
      };
    }

    // 从 nrm_hot_trend_assets 表读取
    const stored = await queryHotTrendAssets(type, limit);
    if (stored.length < 1) {
      return null;
    }

    const fallbackTopics = stored.map((item, index) => ({
      id: item.rank ?? index + 1,
      label: item.topic,
      url: item.url ?? "",
      itemId: item.itemId ?? null,
      trend: "up" as const,
      rawPayload: item.rawPayload ?? null,
    }));

    const latestSyncedAt = stored.length > 0 ? stored[0].updatedAt : Date.now();

    return {
      type,
      source: stored[0]?.source ?? "douyin-hot-hub",
      section: "抖音热榜",
      updatedAt: null,
      syncedAt: latestSyncedAt,
      nextSyncAt: latestSyncedAt + resolveHotTrendSyncIntervalMs(type),
      llmUsed: false,
      analysisSource: "none",
      topics: fallbackTopics,
      videoFetchGuard: null,
    };
  }

  // ─── 调度器 ────────────────────────────────────────────────────

  function startSchedulerHooks(): void {
    if (!hotTrendAutoAnalyzeOnStartup) {
      return;
    }

    app.addHook("onReady", async () => {
      const startScheduler = (type: HotTrendType) => {
        const intervalMs = resolveHotTrendSyncIntervalMs(type);
        const nowMs = ctx.clock.now();
        const nextRunAt = resolveNextHotTrendRunAt(type, nowMs);
        const initialDelayMs = Math.max(1_000, nextRunAt - nowMs);
        const runSync = async () => {
          const startedAt = ctx.clock.now();
          try {
            const entry = await syncHotTrendAssets(type, false);
            app.log.info(
              {
                trendType: type,
                syncedAt: entry.syncedAt,
                nextSyncAt: entry.nextSyncAt,
                topicCount: entry.topics.length,
                source: entry.source,
                intervalMs,
                elapsedMs: Math.max(1, ctx.clock.now() - startedAt),
              },
              "hot trend scheduler sync succeeded",
            );
          } catch (error) {
            app.log.warn(
              {
                err: error,
                trendType: type,
                intervalMs,
              },
              "hot trend scheduler sync failed",
            );
          }
        };

        const kickoffTimer = setTimeout(() => {
          void runSync();
          const intervalTimer = setInterval(() => {
            void runSync();
          }, intervalMs);
          intervalTimer.unref?.();
          hotTrendSchedulerTimers.set(type, {
            kickoffTimer: null,
            intervalTimer,
          });
        }, initialDelayMs);
        kickoffTimer.unref?.();

        hotTrendSchedulerTimers.set(type, {
          kickoffTimer,
          intervalTimer: null,
        });
        app.log.info(
          { trendType: type, intervalMs, nextRunAt, initialDelayMs },
          "hot trend scheduler started at boundary",
        );
      };

      startScheduler("realtime");
      startScheduler("video");
    });

    app.addHook("onClose", async () => {
      for (const timer of hotTrendSchedulerTimers.values()) {
        if (timer.kickoffTimer) {
          clearTimeout(timer.kickoffTimer);
        }
        if (timer.intervalTimer) {
          clearInterval(timer.intervalTimer);
        }
      }
      hotTrendSchedulerTimers.clear();
    });
  }

  // ─── 返回公共 API ──────────────────────────────────────────────

  return {
    syncHotTrendAssets,
    buildStoredHotTrendFallback,
    startSchedulerHooks,
    listSyncLogs,
  };
}
