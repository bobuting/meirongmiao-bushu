/**
 * 视频热榜同步依赖构建模块
 *
 * 从 app.ts 提取的视频热榜同步相关的大对象和辅助函数：
 * - videoSyncDeps 依赖注入构建
 * - PG 共享连接池工厂
 * - DB 直接操作（insertLibraryScriptDirect 等）
 * - 视频下载/上传辅助
 * - syncHotTrendAssets / syncRealtimeHotTrendAssets 同步入口
 * - enforceVideoHotTrendTopicFloor 主题数量下限保护
 * - buildStoredHotTrendFallback 缓存回退
 * - resolveVideoHotTrendFallbackStrategy 策略解析
 */

import type { FastifyInstance } from "fastify";
import type { ProviderRouteKey } from "../contracts/provider-route-policy-contract.js";
import type {
  // User,  // UNUSED REMOVED
  // LibraryScript,  // UNUSED REMOVED
  TrendEntry,
} from "../contracts/types.js";
import type { AppContext } from "../core/app-context.js";
import type { RuntimeReverseConfig } from "../core/runtime-config.js";
import { AppError } from "../core/errors.js";
import { getLogger } from "../core/logger/index.js";
import { hashJsonString } from "../persistence/hash-util.js";
import { compactTextLine } from "../utils/text.js";
import { extractJsonValue } from "../utils/json.js";
import {
  VIDEO_HOT_TREND_FETCH_CONTRACT,
  type HotTrendType,
} from "../contracts/hot-trend-fetch-config.js";

const log = getLogger("video-hot-trend-sync-deps");
import type { HotTrendSyncEntry, VideoHotTrendFallbackStrategy, VideoHotTrendFetchGuardState } from "./hot-trend/types.js";
import type { VideoHotTrendSyncDeps } from "../contracts/video-hot-trend-sync-contract.js";
import {
  mergeTrendTopicsByIdentity,
} from "./douyin-integration-service.js";
import {
  createVideoHotTrendSyncService,
} from "./video-hot-trend/index.js";
import {
  resolveRouteProviderWithFallback,
  resolveRouteRetryCount,
  recordRouteAudit,
} from "../services/llm/provider-resolver.js";
import {
  createLlmDebugRecord,
  finalizeLlmDebugRecordSuccess,
  finalizeLlmDebugRecordError,
} from "../services/llm/llm-debug-recorder.js";
import {
  requestLlmPlainTextWithMetadata,
  requestGeminiPlainTextWithVideoPart,
} from "../services/llm/llm-transport.js";
import {
  buildGeminiRemoteVideoPart,
  buildGeminiInlineVideoPart,
} from "../services/llm/gemini-utils.js";
import {
  runVideoHotTrendBatchReverseWithRetry,
} from "./video-hot-trend-batch-reverse.js";
import {
  buildDouhotAdapter,
  buildTikHubVideoAdapter,
  buildTikHubRealtimeAdapter,
  resolveHotTrendSyncIntervalMs,
  resolveHotTrendVideoTopN,
  // resolveTikHubTokenForUser,  // UNUSED
  // resolveTikHubTokenForHotTrends,  // UNUSED
  resolveHotTrendOwner,
  upsertTrendEntry,
  createTrendSyncJob,
  finishTrendSyncJob,
  // resolveTikHubTokenForUser,  // UNUSED REMOVED
  // resolveTikHubTokenForHotTrends,  // UNUSED REMOVED
  type HotTrendSyncConfigEnv,
  type HotTrendSyncIntervalState,
} from "./hot-trend-sync-config.js";
import { fetchDouyinHotHubTrends } from "./hot-trend/shared/fetch.js";
import { normalizeHotTrendKey } from "./hot-trend/shared/normalize.js";
import type { SourceCredentialService } from "./douyin-integration-service.js";
import type { SquareTrendTopic } from "../contracts/hot-trend-base.js";

// ============================================================================
// 策略解析
// ============================================================================

/** 解析视频热榜获取不足时的回退策略 */
export function resolveVideoHotTrendFallbackStrategy(
  env: { hotTrendVideoFetchUnderflowStrategy?: string },
): VideoHotTrendFallbackStrategy {
  const raw = String(env.hotTrendVideoFetchUnderflowStrategy ?? "")
    .trim()
    .toLowerCase();
  if (raw === "none") {
    return "none";
  }
  return "expanded_fetch_then_cache";
}

// ============================================================================
// 视频热榜主题数量下限保护
// ============================================================================

/** 视频热榜依赖注入所需的运行时引用 */
export interface VideoHotTrendEnforceFloorDeps {
  ctx: AppContext;
  credentialService: SourceCredentialService;
  reverseConfig: RuntimeReverseConfig;
  configEnv: HotTrendSyncConfigEnv;
  intervalState: HotTrendSyncIntervalState;
  hotTrendCache: Map<HotTrendType, HotTrendSyncEntry>;
  app: FastifyInstance;
}

/**
 * 强制视频热榜主题数量达到下限
 * 当初始获取的主题不足时，尝试扩展获取 + 缓存回退
 */
export async function enforceVideoHotTrendTopicFloor(
  deps: VideoHotTrendEnforceFloorDeps,
  topics: SquareTrendTopic[],
  dateWindow: "24h" | "7d" | "30d",
  tokenOverride: string | null,
): Promise<{ topics: SquareTrendTopic[]; guard: VideoHotTrendFetchGuardState }> {
  const { ctx, credentialService, reverseConfig, configEnv, intervalState, hotTrendCache, app } = deps;
  const expectedTopicCount = VIDEO_HOT_TREND_FETCH_CONTRACT.expectedTopicCount;
  const minimumPassTopicCount = VIDEO_HOT_TREND_FETCH_CONTRACT.minimumPassTopicCount;
  const normalizedInitialTopics = mergeTrendTopicsByIdentity([topics], Math.max(expectedTopicCount, topics.length));
  const initialTopicCount = normalizedInitialTopics.length;
  const fallbackStrategy = resolveVideoHotTrendFallbackStrategy(configEnv);
  let mergedTopics = mergeTrendTopicsByIdentity([normalizedInitialTopics], expectedTopicCount);
  let fallbackApplied = false;
  let fallbackStep: VideoHotTrendFetchGuardState["fallbackStep"] = "none";

  if (mergedTopics.length < expectedTopicCount && fallbackStrategy === "expanded_fetch_then_cache") {
    fallbackApplied = true;
    try {
      const expandedLimit = expectedTopicCount + 20; // HOT_TREND_VIDEO_FALLBACK_EXTRA_FETCH_COUNT
      const expandedFetch = await (await buildTikHubVideoAdapter(ctx, credentialService, reverseConfig, tokenOverride))
        .fetchVideoHotTrends(expandedLimit, dateWindow);
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
      const cacheFallback = await buildStoredHotTrendFallback(hotTrendCache, ctx, intervalState, "video", expectedTopicCount);
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
      errorCode: passed ? null : "VIDEO_HOT_TREND_UNDERFLOW", // HOT_TREND_VIDEO_UNDERFLOW_ERROR_CODE
      errorMessage,
    },
  };
}

// ============================================================================
// 缓存回退构建
// ============================================================================

/** 从缓存或持久化条目构建回退 HotTrendSyncEntry */
export async function buildStoredHotTrendFallback(
  hotTrendCache: Map<HotTrendType, HotTrendSyncEntry>,
  ctx: AppContext,
  intervalState: HotTrendSyncIntervalState,
  type: HotTrendType,
  limit: number,
): Promise<HotTrendSyncEntry | null> {
  const cached = hotTrendCache.get(type);
  if (cached && cached.topics.length > 0) {
    return {
      ...cached,
      topics: cached.topics.slice(0, limit),
      videoFetchGuard: null,
    };
  }

  const stored = [...await ctx.repos.trendEntries.list()].filter((item) => item.trendType === type);
  if (stored.length < 1) {
    return null;
  }

  const latestSyncedAt = stored.reduce((max, item) => Math.max(max, item.syncedAt), 0);
  const latest = stored
    .filter((item) => item.syncedAt === latestSyncedAt)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
  if (latest.length < 1) {
    return null;
  }

  const fallbackTopics = latest.map((item) => ({
    id: item.rank,
    label: item.title,
    url: item.url,
    itemId: item.itemId ?? null,
    trend: item.trend,
    rawPayload: item.rawPayload ?? null,
  }));

  return {
    type,
    source: latest[0]?.source ?? "douyin-hot-hub",
    section: "抖音热榜",
    updatedAt: null,
    syncedAt: latestSyncedAt,
    nextSyncAt: latestSyncedAt + resolveHotTrendSyncIntervalMs(type, ctx.configService.get(), intervalState),
    llmUsed: false,
    analysisSource: "none",
    topics: fallbackTopics,
    videoFetchGuard: null,
  };
}

// ============================================================================
// videoSyncDeps 构建所需的运行时依赖
// ============================================================================

/** 构建 videoSyncDeps 所需的外部依赖 */
export interface VideoHotTrendSyncDepsInput {
  ctx: AppContext;
  app: FastifyInstance;
  credentialService: SourceCredentialService;
  reverseConfig: RuntimeReverseConfig;
  configEnv: HotTrendSyncConfigEnv;
  intervalState: HotTrendSyncIntervalState;
  hotTrendCache: Map<HotTrendType, HotTrendSyncEntry>;
  hotTrendInFlight: Map<HotTrendType, Promise<HotTrendSyncEntry>>;
  runSharedVideoUrlReversePipelineForUser: (
    videoUrl: string,
    opts: { userId: string; projectId: string | null },
  ) => Promise<{
    multimodalResult: { result: string };
    storyboardPanel: { report: unknown };
    resolvedVideoUrl: string;
  }>;
  /** 解析视频 URL（通过 TikHub API 将抖音网页链接转换为视频直链）*/
  resolveVideoUrl: (inputUrl: string) => Promise<string>;
}

// ============================================================================
// 构建 videoSyncDeps 对象（PG 连接池 + 资产服务适配器 + 配置映射）
// ============================================================================

export function buildVideoSyncDeps(input: VideoHotTrendSyncDepsInput): VideoHotTrendSyncDeps {
  const {
    ctx,
    app,
    credentialService,
    reverseConfig,
    configEnv,
    intervalState,
    hotTrendCache,
    runSharedVideoUrlReversePipelineForUser,
    resolveVideoUrl,
  } = input;

  const videoSyncDeps: VideoHotTrendSyncDeps = {
    // Provider 解析
    resolveRouteProviderWithFallback: async (routeKeys) =>
      await resolveRouteProviderWithFallback(ctx, routeKeys as ProviderRouteKey[]),
    resolveRouteRetryCount: async (routeKey) =>
      await resolveRouteRetryCount(ctx, routeKey as ProviderRouteKey),

    // LLM 请求函数
    requestLlmPlainTextWithMetadata,
    requestGeminiPlainTextWithVideoPart,
    buildGeminiRemoteVideoPart,
    buildGeminiInlineVideoPart,

    // 视频 URL 解析
    resolveVideoUrl,

    // 视频反推
    runSharedVideoUrlReversePipelineForUser: async (videoUrl, opts) => {
      const result = await runSharedVideoUrlReversePipelineForUser(videoUrl, {
        userId: String(opts.userId),
        projectId: opts.projectId ? String(opts.projectId) : null,
      });
      return {
        multimodalResult: result.multimodalResult,
        storyboardPanel: result.storyboardPanel,
        resolvedVideoUrl: result.resolvedVideoUrl,
      };
    },
    runVideoHotTrendBatchReverseWithRetry: runVideoHotTrendBatchReverseWithRetry as VideoHotTrendSyncDeps["runVideoHotTrendBatchReverseWithRetry"],

    // 数据获取
    buildTikHubVideoAdapter: async (tokenOverride) => {
      const adapter = await buildTikHubVideoAdapter(ctx, credentialService, reverseConfig, tokenOverride);
      return {
        fetchVideoHotTrends: (limit, dateWindow) =>
          adapter.fetchVideoHotTrends(limit, dateWindow),
      };
    },
    buildDouhotAdapter: () => ({
      fetchVideoHotTrends: (limit, dateWindow) =>
        buildDouhotAdapter(credentialService, ctx).fetchVideoHotTrends(limit, dateWindow),
    }),
    buildStoredHotTrendFallback: async (type, limit) => {
      const fallback = await buildStoredHotTrendFallback(hotTrendCache, ctx, intervalState, type, limit);
      return fallback ? { topics: fallback.topics, updatedAt: fallback.updatedAt } : null;
    },

    // 趋势条目操作
    upsertTrendEntry: async (type, source, dateWindow, topic, syncedAt) =>
      await upsertTrendEntry(ctx, type, source, dateWindow as "24h" | "7d" | "30d", topic, syncedAt),
    mergeTrendTopicsByIdentity: (topicGroups, limit) =>
      mergeTrendTopicsByIdentity(topicGroups, limit),

    // 资产服务 — 使用统一脚本服务
    scriptService: {
      create: async (owner, script) => {
        // 使用统一脚本服务创建脚本
        const created = await ctx.scriptLibraryService.create(owner.id, {
          title: script.title ?? "",
          content: script.content ?? "",
          type: script.type ?? 1, // 默认类型 REVERSE
          tags: script.tags ?? [],
          sourceScriptId: script.sourceScriptId ?? undefined,
        });
        return created;
      },
      update: async (owner, scriptId, script) => {
        const updated = await ctx.scriptLibraryService.update(owner.id, scriptId, {
          title: script.title,
          content: script.content,
          tags: script.tags,
        });
        return updated;
      },
      findById: async (owner, scriptId) => {
        const script = await ctx.scriptLibraryService.findById(scriptId);
        return script && script.userId === owner.id ? script : null;
      },
      findByTag: async (owner, tag) =>
        (await ctx.scriptLibraryService.listByUserId(owner.id)).filter(
          (item) => item.tags.includes(tag),
        ),
    },
    smartStoryboardLibraryService: {
      create: async (owner, asset) => await ctx.smartStoryboardLibraryService.create(owner, {
        ownerUserId: owner.id,
        title: asset.title ?? "",
        summary: asset.summary ?? "",
        tags: asset.tags ?? [],
        category: asset.category ?? "video_hot_trend_copy",
        sourceRef: asset.sourceRef!,
        relationRef: asset.relationRef,
        reverseSourceScriptText: asset.reverseSourceScriptText,
        report: asset.report!,
        content: asset.content ?? "",
      }),
      update: async (owner, id, asset) => await ctx.smartStoryboardLibraryService.update(owner, id, {
        title: asset.title,
        summary: asset.summary,
        tags: asset.tags,
        sourceRef: asset.sourceRef,
        relationRef: asset.relationRef,
        reverseSourceScriptText: asset.reverseSourceScriptText,
        report: asset.report,
        content: asset.content,
      }),
      remove: async (owner, id) => { await ctx.smartStoryboardLibraryService.remove(owner, id); },
      listForAdmin: async (owner, filter) =>
        await ctx.smartStoryboardLibraryService.listForAdmin(owner, {
          ownerUserId: filter.ownerUserId,
          trendType: filter.trendType,
        }),
      findById: async (owner, id) => {
        const item = [...await ctx.repos.smartStoryboardLibrary.list()].find(
          (item) => item.id === id && item.ownerUserId === owner.id,
        );
        return item ?? null;
      },
    },

    // 共享 DB 连接池的热榜资产操作（避免每次 new Pool）
    ...(() => {
      type PgPool = InstanceType<typeof import("pg").Pool>;
      let pool: PgPool | null = null;
      const getPool = async (): Promise<PgPool | null> => {
        if (pool) return pool;
        const connStr = process.env.DATABASE_URL?.trim();
        if (!connStr) return null;
        const { Pool: PgPool } = await import("pg");
        pool = new PgPool({ connectionString: connStr });
        // 处理连接池错误事件，防止未处理的错误导致进程崩溃
        pool.on("error", (err) => {
          log.error({ err }, "[App.ts Pool] Pool error (连接池错误，不会崩溃)");
        });
        return pool;
      };
      return {
        // ========== 热榜资产表操作（nrm_hot_trend_assets）==========

        /** 插入热榜原始数据到 nrm_hot_trend_assets */
        insertHotTrendAsset: async (input: {
          id: string;
          topic: string;
          url: string | null;
          rank: number | null;
          hotValue: string | null;
          section: string | null;
          source: string;
          trendType: 'video' | 'realtime';
          sourceOssUrl?: string | null;
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
        }) => {
          const p = await getPool();
          if (!p) throw new AppError(500, "DB_NOT_CONFIGURED", "DATABASE_URL not set");
          const now = Date.now();
          await p.query(
            `INSERT INTO nrm_hot_trend_assets (
              id, topic, url, rank, hot_value, section, source, trend_type, source_oss_url,
              video_title, video_url, audio_url, create_time,
              play_count, comment_count, digg_count, share_count, collect_count, recommend_count,
              nickname, duration, script_text,
              created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9,
              $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
              $23, $23
            )
            ON CONFLICT (topic, trend_type)
            DO UPDATE SET
              topic = EXCLUDED.topic, url = EXCLUDED.url, rank = EXCLUDED.rank,
              hot_value = EXCLUDED.hot_value, section = EXCLUDED.section, source = EXCLUDED.source,
              source_oss_url = COALESCE(EXCLUDED.source_oss_url, nrm_hot_trend_assets.source_oss_url),
              video_title = COALESCE(EXCLUDED.video_title, nrm_hot_trend_assets.video_title),
              video_url = COALESCE(EXCLUDED.video_url, nrm_hot_trend_assets.video_url),
              audio_url = COALESCE(EXCLUDED.audio_url, nrm_hot_trend_assets.audio_url),
              create_time = COALESCE(EXCLUDED.create_time, nrm_hot_trend_assets.create_time),
              play_count = COALESCE(EXCLUDED.play_count, nrm_hot_trend_assets.play_count),
              comment_count = COALESCE(EXCLUDED.comment_count, nrm_hot_trend_assets.comment_count),
              digg_count = COALESCE(EXCLUDED.digg_count, nrm_hot_trend_assets.digg_count),
              share_count = COALESCE(EXCLUDED.share_count, nrm_hot_trend_assets.share_count),
              collect_count = COALESCE(EXCLUDED.collect_count, nrm_hot_trend_assets.collect_count),
              recommend_count = COALESCE(EXCLUDED.recommend_count, nrm_hot_trend_assets.recommend_count),
              nickname = COALESCE(EXCLUDED.nickname, nrm_hot_trend_assets.nickname),
              duration = COALESCE(EXCLUDED.duration, nrm_hot_trend_assets.duration),
              script_text = COALESCE(EXCLUDED.script_text, nrm_hot_trend_assets.script_text),
              updated_at = EXCLUDED.updated_at`,
            [
              input.id, input.topic, input.url, input.rank, input.hotValue, input.section, input.source, input.trendType, input.sourceOssUrl ?? null,
              input.videoTitle ?? null, input.videoUrl ?? null, input.audioUrl ?? null, input.createTime ?? null,
              input.playCount ?? null, input.commentCount ?? null, input.diggCount ?? null, input.shareCount ?? null, input.collectCount ?? null, input.recommendCount ?? null,
              input.nickname ?? null, input.duration ?? null, input.scriptText ?? null,
              now,
            ],
          );
        },

        /** 按话题查找已有资产 */
        findHotTrendAssetByTopic: async (topic: string, trendType: 'video' | 'realtime') => {
          const p = await getPool();
          if (!p) return null;
          const result = await p.query<{
            id: string;
            topic: string;
            script_id: string | null;
            source_oss_url: string | null;
            video_title: string | null;
            video_url: string | null;
            audio_url: string | null;
            create_time: number | null;
            play_count: number | null;
            comment_count: number | null;
            digg_count: number | null;
            share_count: number | null;
            collect_count: number | null;
            recommend_count: number | null;
            nickname: string | null;
            duration: number | null;
            script_text: string | null;
          }>(
            `SELECT id, topic, script_id, source_oss_url,
              video_title, video_url, audio_url, create_time,
              play_count, comment_count, digg_count, share_count, collect_count, recommend_count,
              nickname, duration, script_text
             FROM nrm_hot_trend_assets WHERE topic = $1 AND trend_type = $2 LIMIT 1`,
            [topic, trendType],
          );
          if (result.rows.length < 1) return null;
          const row = result.rows[0];
          return {
            id: row.id,
            topic: row.topic,
            scriptId: row.script_id,
            sourceOssUrl: row.source_oss_url,
            videoTitle: row.video_title,
            videoUrl: row.video_url,
            audioUrl: row.audio_url,
            createTime: row.create_time,
            playCount: row.play_count,
            commentCount: row.comment_count,
            diggCount: row.digg_count,
            shareCount: row.share_count,
            collectCount: row.collect_count,
            recommendCount: row.recommend_count,
            nickname: row.nickname,
            duration: row.duration,
            scriptText: row.script_text,
          };
        },

        /** 更新资产的 script_id（LLM 反推成功后调用）*/
        updateHotTrendAssetScriptId: async (assetId: string, scriptId: string) => {
          const p = await getPool();
          if (!p) throw new AppError(500, "DB_NOT_CONFIGURED", "DATABASE_URL not set");
          await p.query(
            `UPDATE nrm_hot_trend_assets SET script_id = $1, updated_at = $2 WHERE id = $3`,
            [scriptId, Date.now(), assetId],
          );
        },

        /** 更新资产的 source_oss_url（OSS 上传成功后调用）*/
        updateHotTrendAssetSourceOssUrl: async (assetId: string, sourceOssUrl: string) => {
          const p = await getPool();
          if (!p) throw new AppError(500, "DB_NOT_CONFIGURED", "DATABASE_URL not set");
          await p.query(
            `UPDATE nrm_hot_trend_assets SET source_oss_url = $1, updated_at = $2 WHERE id = $3`,
            [sourceOssUrl, Date.now(), assetId],
          );
        },

        // ========== 脚本数据表操作（nrm_script_data）==========

        /** 插入 LLM 反推结果到 nrm_script_data（结构化字段）*/
        insertScriptData: async (input: {
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
        }): Promise<string> => {
          const p = await getPool();
          if (!p) throw new AppError(500, "DB_NOT_CONFIGURED", "DATABASE_URL not set");
          const now = Date.now();

          await p.query(
            `INSERT INTO nrm_script_data (
              id, type, title, duration_seconds, source,
              theme, summary, primary_emotion, video_type, video_style,
              fashion_suitable, fashion_reason,
              emotion_detail, on_screen_presence, fashion_styles, editing_analysis,
              source_oss_url, time_of_day, weather, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5,
              $6, $7, $8, $9, $10,
              $11, $12,
              $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb,
              $17, $18, $19, $20, $20
            )
            ON CONFLICT (id)
            DO UPDATE SET
              title = EXCLUDED.title, duration_seconds = EXCLUDED.duration_seconds,
              theme = EXCLUDED.theme, summary = EXCLUDED.summary,
              primary_emotion = EXCLUDED.primary_emotion, video_type = EXCLUDED.video_type,
              video_style = EXCLUDED.video_style, fashion_suitable = EXCLUDED.fashion_suitable,
              fashion_reason = EXCLUDED.fashion_reason,
              emotion_detail = EXCLUDED.emotion_detail, on_screen_presence = EXCLUDED.on_screen_presence,
              fashion_styles = EXCLUDED.fashion_styles, editing_analysis = EXCLUDED.editing_analysis,
              source_oss_url = EXCLUDED.source_oss_url, time_of_day = EXCLUDED.time_of_day,
              weather = EXCLUDED.weather, updated_at = EXCLUDED.updated_at`,
            [
              input.id, input.type, input.title, input.durationSeconds ?? null, input.source ?? "hot_trend_video",
              input.theme ?? null, input.summary ?? null, input.primaryEmotion ?? null,
              input.videoType ?? null, input.videoStyle ?? null,
              input.fashionSuitable ?? null, input.fashionReason ?? null,
              JSON.stringify(input.emotionDetail ?? {}),
              JSON.stringify(input.onScreenPresence ?? {}),
              JSON.stringify(input.fashionStyles ?? []),
              JSON.stringify(input.editingAnalysis ?? {}),
              input.sourceOssUrl ?? null, input.timeOfDay ?? null, input.weather ?? null, now,
            ],
          );

          return input.id;
        },

        /** 批量插入分镜数据到 nrm_shot_breakdown */
        insertShotBreakdown: async (scriptId: string, shots: Record<string, unknown>[]): Promise<number> => {
          if (shots.length === 0) return 0;
          const p = await getPool();
          if (!p) throw new AppError(500, "DB_NOT_CONFIGURED", "DATABASE_URL not set");
          const now = Date.now();

          const values: unknown[] = [];
          const placeholders: string[] = [];
          let paramIndex = 1;

          for (const shot of shots) {
            const shotId = typeof shot.shot_id === "number" ? shot.shot_id : placeholders.length;
            const timecode = (shot.timecode ?? {}) as Record<string, unknown>;
            const id = `${scriptId}-shot-${shotId}`;
            const transitionJson = shot.transition_in || shot.transition_out
              ? JSON.stringify({ in: shot.transition_in, out: shot.transition_out })
              : null;

            // 数据类型归一化：确保存储正确的类型
            // 1. duration_seconds 必须为数字类型
            let normalizedDurationSeconds: number | null = null;
            if (timecode.duration_seconds != null) {
              const rawDuration = timecode.duration_seconds;
              if (typeof rawDuration === 'number') {
                normalizedDurationSeconds = rawDuration;
              } else if (typeof rawDuration === 'string') {
                const parsed = parseFloat(rawDuration as string);
                normalizedDurationSeconds = Number.isFinite(parsed) ? parsed : null;
              }
            }

            // 2. audio JSON 中 sound_effects 必须为数组
            const shotAudio = (shot.audio ?? {}) as Record<string, unknown>;
            const normalizedAudio = {
              ...shotAudio,
              sound_effects: (shotAudio.sound_effects as unknown[] | null | undefined) ?? [],
            };

            placeholders.push(
              `($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, $${paramIndex+8}, $${paramIndex+9}::jsonb, $${paramIndex+10}::jsonb, $${paramIndex+11}::jsonb, $${paramIndex+12}::jsonb, $${paramIndex+13}::jsonb, $${paramIndex+14}::jsonb, $${paramIndex+15}::jsonb, $${paramIndex+16}, $${paramIndex+17})`
            );
            values.push(
              id, scriptId, shotId,
              shot.shot_type ?? null, shot.camera_movement ?? null, shot.shot_description ?? null,
              timecode.start ?? null, timecode.end ?? null, normalizedDurationSeconds,
              transitionJson,
              shot.camera_details ? JSON.stringify(shot.camera_details) : null,
              shot.visual ? JSON.stringify(shot.visual) : null,
              shot.subjects ? JSON.stringify(shot.subjects) : null,
              JSON.stringify(normalizedAudio),
              shot.text_elements ? JSON.stringify(shot.text_elements) : null,
              shot.speed_effects ? JSON.stringify(shot.speed_effects) : null,
              now, now,
            );
            paramIndex += 18;
          }

          const query = `
            INSERT INTO nrm_shot_breakdown (
              id, script_data_id, shot_index, shot_type, camera_movement, shot_description,
              timecode_start, timecode_end, duration_seconds,
              transition_json, camera_details_json, visual_json, subjects_json, audio_json,
              text_elements_json, speed_effects_json, created_at, updated_at
            ) VALUES ${placeholders.join(", ")}
            ON CONFLICT (id) DO NOTHING
          `;
          const result = await p.query(query, values);
          return result.rowCount ?? 0;
        },

        closeSharedDbPool: async () => {
          if (pool) { await pool.end(); pool = null; }
        },

        // ========== 情感原型库操作（nrm_emotion_archetype_library）==========

        /** 插入 LLM 提取的情感原型到 nrm_emotion_archetype_library */
        insertEmotionArchetype: async (input: {
          category: string;
          emotionCore: string;
          moment: string;
          conflict: string;
          clothingRole: string;
          source: string;
          sourceMetadata?: Record<string, unknown>;
        }): Promise<string | null> => {
          // 验证必填字段
          if (!input.category || !input.emotionCore || !input.moment || !input.conflict || !input.clothingRole) {
            app.log.warn({ input }, "insertEmotionArchetype: missing required fields, skipping");
            return null;
          }

          const p = await getPool();
          if (!p) throw new AppError(500, "DB_NOT_CONFIGURED", "DATABASE_URL not set");
          const now = Date.now();

          // 生成唯一 ID：基于 emotion_core 的哈希 + 时间戳
          const emotionCoreHash = hashJsonString(input.emotionCore);
          const archetypeId = `EA-LLM-${emotionCoreHash.slice(0, 8)}-${now}`;

          await p.query(
            `INSERT INTO nrm_emotion_archetype_library (
              id, name, category, emotion_core, moment, conflict, clothing_role,
              visual_cues, duration, shot_count, sync_mode,
              suitable_styles, suitable_age, suitable_gender,
              popularity_score, use_count, is_active, source, source_metadata,
              created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8::jsonb, $9, $10, $11,
              $12::jsonb, $13::jsonb, $14::jsonb,
              $15, $16, $17, $18, $19::jsonb,
              $20, $20
            )
            ON CONFLICT (emotion_core)
            DO UPDATE SET
              use_count = nrm_emotion_archetype_library.use_count + 1,
              last_used_at = $20,
              updated_at = $20`,
            [
              archetypeId,
              input.moment.slice(0, 50), // name 用 moment 简化
              input.category,
              input.emotionCore,
              input.moment,
              input.conflict,
              input.clothingRole,
              JSON.stringify([]), // visual_cues 默认空数组
              "12-18秒", // duration 默认
              3, // shot_count 默认
              "情绪同步", // sync_mode 默认
              JSON.stringify(["所有风格"]),
              JSON.stringify(["18-45"]),
              JSON.stringify(["male", "female"]),
              0.6, // popularity_score 初始值
              0, // use_count 初始
              true, // is_active
              input.source,
              JSON.stringify(input.sourceMetadata ?? {}),
              now,
            ],
          );

          app.log.info({ archetypeId, category: input.category, emotionCore: input.emotionCore }, "insertEmotionArchetype: archetype inserted");
          return archetypeId;
        },

        downloadVideoForLlm: async (
          sourceUrl: string
        ): Promise<{ base64: string; mimeType: string } | null> => {
          try {
            app.log.info({ sourceUrl }, "video hot trend: downloading video for llm base64");
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), ctx.configService.get().videoDownloadTimeoutMs);
            const response = await fetch(sourceUrl, { signal: controller.signal });
            clearTimeout(timer);
            if (!response.ok) {
              app.log.warn({ sourceUrl, status: response.status }, "video hot trend: download failed");
              return null;
            }
            const rawMimeType = response.headers.get("content-type") || "";
            // 验证 mime type：必须是 video/* 或 audio/* 格式
            // 避免下载 HTML 页面或其他非视频内容被当作视频传给 LLM
            if (!rawMimeType.startsWith("video/") && !rawMimeType.startsWith("audio/")) {
              app.log.warn({ sourceUrl, rawMimeType }, "video hot trend: invalid mime type, rejecting download");
              return null;
            }
            const mimeType = rawMimeType;
            const arrayBuffer = await response.arrayBuffer();
            const bytes = Buffer.from(arrayBuffer);
            if (bytes.length < 1024) {
              app.log.warn({ sourceUrl, byteLength: bytes.length }, "video hot trend: downloaded file too small");
              return null;
            }
            const base64 = bytes.toString("base64");
            app.log.info({ sourceUrl, byteLength: bytes.length, mimeType }, "video hot trend: video downloaded to base64");
            return { base64, mimeType };
          } catch (error) {
            app.log.warn({ err: error, sourceUrl }, "video hot trend: download video for llm failed");
            return null;
          }
        },
        uploadVideoToOss: async (
          videoBase64: string,
          mimeType: string,
          keyPrefix: string
        ): Promise<string | null> => {
          const storage = ctx.storage;
          if (!storage) {
            app.log.warn("video hot trend: storage not available, skip oss upload");
            return null;
          }
          try {
            const ext = mimeType.includes("mp4") ? "mp4" : "mp4";
            const key = `${keyPrefix}/video.${ext}`;
            const bytes = Buffer.from(videoBase64, "base64");
            await storage.putObject(key, new Uint8Array(bytes), mimeType);
            const publicUrl = await storage.getSignedUrl(key);
            app.log.info({ key, byteLength: bytes.length, publicUrl }, "video hot trend: video uploaded to oss");
            return publicUrl;
          } catch (error) {
            app.log.warn({ err: error, keyPrefix }, "video hot trend: upload video to oss failed");
            return null;
          }
        },
      };
    })(),

    // 用户获取
    getOwner: async () => await resolveHotTrendOwner(ctx, configEnv),

    // 审计记录（旧函数，保持向后兼容）
    recordRouteAudit: (routeKey, startedAt, status, cost, errorCode, errorMessage, requestSummary, responseSummary) =>
      recordRouteAudit(ctx, routeKey as ProviderRouteKey, startedAt, status, cost, errorCode, errorMessage, requestSummary, responseSummary),

    // 调试记录（新函数，用于 LLM 调试气泡）
    createLlmDebugRecord: (input) => {
      // DEBUG: 记录 hasMedia 传递到 wrapper
      return createLlmDebugRecord(ctx, {
        routeKey: input.routeKey as ProviderRouteKey,
        businessContext: input.businessContext,
        projectId: input.projectId,
        userId: input.userId,
        messages: input.messages,
        provider: input.provider,
        hasMedia: input.hasMedia,
        actualEndpoint: input.actualEndpoint,
        requestHeadersJson: input.requestHeadersJson,
        requestBodyJson: input.requestBodyJson,
      });
    },
    finalizeLlmDebugRecordSuccess: (input) =>
      finalizeLlmDebugRecordSuccess(ctx, input),
    finalizeLlmDebugRecordError: (input) =>
      finalizeLlmDebugRecordError(ctx, input),

    // 工具函数
    compactTextLine,
    extractJsonValue,
    now: () => ctx.clock.now(),

    // 配置
    config: {
      hotTrendPromptVersion: ctx.configService.get().hotTrendPromptVersion,
      douyinHotHubRealtimeUrl: ctx.configService.get().douyinHotHubRealtimeUrl,
      hotTrendVideoReverseTopN: resolveHotTrendVideoTopN(ctx.configService.get()),
    },

    // 日志
    log: {
      info: (obj, msg) => app.log.info(obj, msg),
      warn: (obj, msg) => app.log.warn(obj, msg),
      error: (obj, msg) => app.log.error(obj, msg),
    },
  };

  return videoSyncDeps;
}

// ============================================================================
// 同步入口函数
// ============================================================================

/** 同步视频热榜资产 */
export async function syncVideoHotTrendAssets(
  input: VideoHotTrendSyncDepsInput,
  force = false,
  tokenOverride: string | null = null,
): Promise<HotTrendSyncEntry> {
  const { ctx, hotTrendCache, hotTrendInFlight } = input;
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

  const videoSyncDeps = buildVideoSyncDeps(input);
  const videoSyncService = createVideoHotTrendSyncService(videoSyncDeps);

  const job = (async (): Promise<HotTrendSyncEntry> => {
    const result = await videoSyncService.sync({
      force,
      tokenOverride,
      hotTrendCache,
      hotTrendInFlight,
    });

    // 批量操作结束后关闭共享 DB 连接池
    await videoSyncDeps.closeSharedDbPool?.();

    input.app.log.info(
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
    return entry;
  } finally {
    hotTrendInFlight.delete(type);
  }
}

/** 同步实时热榜资产 */
export async function syncRealtimeHotTrendAssets(
  input: VideoHotTrendSyncDepsInput,
  force = false,
  tokenOverride: string | null = null,
): Promise<HotTrendSyncEntry> {
  const { ctx, app, credentialService, reverseConfig, intervalState, hotTrendCache, hotTrendInFlight } = input;
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

  const executeRealtimeSync = async (): Promise<HotTrendSyncEntry> => {
    const dateWindow: "24h" | "7d" | "30d" = "24h";
    const syncJob = await createTrendSyncJob(ctx, type, "douyin-hot-hub", dateWindow);
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
          return (await buildTikHubRealtimeAdapter(ctx, credentialService, reverseConfig, tokenOverride)).fetchVideoHotTrends(50, dateWindow);
        }
      })();
      syncJob.source = fetched.source;
      const effectiveTopics = fetched.topics;

      const trendEntryByHotTrendKey = new Map<string, TrendEntry>();
      for (const topic of effectiveTopics) {
        const trendEntry = await upsertTrendEntry(ctx, type, fetched.source, dateWindow, topic, now);
        trendEntryByHotTrendKey.set(normalizeHotTrendKey(type, topic.label), trendEntry);
      }

      // ========== 新增：存储原始数据到 nrm_hot_trend_assets ==========
      const videoSyncDeps = buildVideoSyncDeps(input);
      for (let i = 0; i < effectiveTopics.length; i++) {
        const topic = effectiveTopics[i];
        const rank = i + 1;
        const assetId = `hottrend-realtime-${now}-${rank}`;

        // 检查是否已存在
        const existing = await videoSyncDeps.findHotTrendAssetByTopic(topic.label, 'realtime');
        if (!existing) {
          await videoSyncDeps.insertHotTrendAsset({
            id: assetId,
            topic: topic.label,
            url: topic.url ?? null,
            rank,
            hotValue: null,  // TODO: 从原始数据提取
            section: fetched.section ?? null,
            source: fetched.source,
            trendType: 'realtime',
          });
        }
      }
      await videoSyncDeps.closeSharedDbPool?.();
      // ========== 存储结束 ==========

      // realtime 热榜简化：只获取数据存入 nrm_hot_trend_assets，不调 LLM
      const entry: HotTrendSyncEntry = {
        type,
        source: fetched.source,
        section: fetched.section,
        updatedAt: fetched.updatedAt,
        syncedAt: now,
        nextSyncAt: now + resolveHotTrendSyncIntervalMs(type, ctx.configService.get(), intervalState),
        llmUsed: false,
        analysisSource: "none",
        topics: effectiveTopics,
        videoFetchGuard: null,
      };
      hotTrendCache.set(type, entry);
      await finishTrendSyncJob(ctx, syncJob, {
        status: "success",
        topicCount: effectiveTopics.length,
      });
      return entry;
    } catch (error) {
      const code = error instanceof AppError ? error.code : "UNKNOWN";
      await finishTrendSyncJob(ctx, syncJob, {
        status: "failed",
        errorCode: code,
        errorMessage: String(error),
      });
      throw error;
    }
  };

  const job = executeRealtimeSync().finally(() => {
    hotTrendInFlight.delete(type);
  });

  hotTrendInFlight.set(type, job);
  return job;
}

/** 统一热榜同步入口：根据 type 路由到对应的同步函数 */
export async function syncHotTrendAssets(
  input: VideoHotTrendSyncDepsInput,
  type: HotTrendType,
  force = false,
  tokenOverride: string | null = null,
): Promise<HotTrendSyncEntry> {
  if (type === "video") {
    return syncVideoHotTrendAssets(input, force, tokenOverride);
  }
  return syncRealtimeHotTrendAssets(input, force, tokenOverride);
}
