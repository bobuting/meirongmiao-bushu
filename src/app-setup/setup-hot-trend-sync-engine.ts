/**
 * Hot Trend Sync Engine 初始化模块
 *
 * 负责构建 hotTrendSyncEngine 及其依赖。
 * 简化设计：直接接收 app.ts 中的对象，避免中间类型定义。
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { HotTrendType, HotTrendSyncEntry } from "../modules/hot-trend/index.js";
import type { ProviderRouteKey } from "../contracts/provider-route-policy-contract.js";
import type { VideoHotTrendSyncDeps } from "../modules/video-hot-trend/index.js";
import type { AdapterFactory } from "../modules/adapter-factory.js";
import type { HotTrendSyncEngine } from "../modules/hot-trend-sync.js";
import type { VideoHotTrendBatchReverseResult } from "../modules/video-hot-trend-batch-reverse.js";
import { createHotTrendSyncEngine } from "../modules/hot-trend-sync.js";
import { createHotTrendDbOperations } from "../persistence/hot-trend-db-operations.js";
import { mergeTrendTopicsByIdentity } from "../modules/reverse-fetch-adapters.js";
import { extractJsonValue } from "../utils/json.js";
import { compactTextLine } from "../utils/text.js";
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

// ─── 依赖接口 ──────────────────────────────────────────────────────

/** Hot Trend Sync Engine 配置参数 */
export interface HotTrendSyncEngineSetupParams {
  app: FastifyInstance;
  ctx: AppContext;

  // 配置函数
  resolveHotTrendSyncIntervalMs: (type: HotTrendType) => number;
  resolveNextHotTrendRunAt: (type: HotTrendType, nowMs?: number) => number;
  resolveHotTrendVideoTopN: () => number;

  // 缓存 Map
  hotTrendCache: Map<HotTrendType, HotTrendSyncEntry>;
  hotTrendInFlight: Map<HotTrendType, Promise<HotTrendSyncEntry>>;

  // 标志位
  hotTrendAutoAnalyzeOnStartup: boolean;

  // 适配器工厂（完整 AdapterFactory 对象）
  adapterFactory: AdapterFactory;

  // LLM 请求函数（直接传递函数引用）
  requestLlmPlainTextWithMetadata: VideoHotTrendSyncDeps["requestLlmPlainTextWithMetadata"];
  requestGeminiPlainTextWithVideoPart: VideoHotTrendSyncDeps["requestGeminiPlainTextWithVideoPart"];
  buildGeminiRemoteVideoPart: VideoHotTrendSyncDeps["buildGeminiRemoteVideoPart"];
  buildGeminiInlineVideoPart: VideoHotTrendSyncDeps["buildGeminiInlineVideoPart"];

  // 视频反推函数
  runSharedVideoUrlReversePipelineForUser: (videoUrl: string, opts: { userId: string; projectId: string | null }) => Promise<{
    multimodalResult: { result: string };
    storyboardPanel: { report: unknown };
    resolvedVideoUrl: string;
  }>;
  runVideoHotTrendBatchReverseWithRetry: <TOutput>(input: {
    maxAttempts: number;
    execute: (attempt: number) => Promise<TOutput>;
  }) => Promise<VideoHotTrendBatchReverseResult<TOutput>>;

  // 引擎引用（用于 buildStoredHotTrendFallback 回调）
  getHotTrendSyncEngine: () => HotTrendSyncEngine;
}

// ─── 工厂函数 ──────────────────────────────────────────────────────

/**
 * 构建 Hot Trend Sync Engine 及其依赖
 */
export function createHotTrendSyncEngineSetup(
  params: HotTrendSyncEngineSetupParams,
): HotTrendSyncEngine {
  const {
    app,
    ctx,
    resolveHotTrendSyncIntervalMs,
    resolveNextHotTrendRunAt,
    resolveHotTrendVideoTopN,
    hotTrendCache,
    hotTrendInFlight,
    hotTrendAutoAnalyzeOnStartup,
    adapterFactory,
    requestLlmPlainTextWithMetadata,
    requestGeminiPlainTextWithVideoPart,
    buildGeminiRemoteVideoPart,
    buildGeminiInlineVideoPart,
    runSharedVideoUrlReversePipelineForUser,
    runVideoHotTrendBatchReverseWithRetry,
    getHotTrendSyncEngine,
  } = params;

  const {
    buildTikHubVideoAdapter,
    buildTikHubRealtimeAdapter,
    resolveTikHubTokenForHotTrends,
    buildDouhotAdapter,
    buildSquareTrendVideoResolveOrchestrator,
  } = adapterFactory;

  const hotTrendSyncEngine = createHotTrendSyncEngine({
    app,
    ctx,
    resolveHotTrendSyncIntervalMs,
    resolveNextHotTrendRunAt,
    buildTikHubVideoAdapter: async (tokenOverride) => {
      const resolvedToken = await resolveTikHubTokenForHotTrends();
      return buildTikHubVideoAdapter(tokenOverride, resolvedToken);
    },
    buildTikHubRealtimeAdapter: async (tokenOverride) => {
      const resolvedToken = await resolveTikHubTokenForHotTrends();
      return buildTikHubRealtimeAdapter(tokenOverride, resolvedToken);
    },
    hotTrendCache,
    hotTrendInFlight,
    hotTrendAutoAnalyzeOnStartup,
    videoSyncDeps: () => ({
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

      // 视频 URL 解析（通过 TikHub API 将抖音网页链接转换为视频直链）
      resolveVideoUrl: async (inputUrl: string): Promise<string> => {
        try {
          // 判断是否为抖音网页链接
          const parsed = new URL(inputUrl);
          const isDouyinWebpage = parsed.hostname.includes("douyin.com") &&
            !parsed.hostname.includes("douyinvod.com") &&
            !inputUrl.match(/\.(mp4|mov|avi|mkv)(\?|$)/i);

          if (!isDouyinWebpage) {
            // 非抖音网页链接，直接返回原 URL
            return inputUrl;
          }

          // 使用 orchestrator 解析视频直链
          const orchestrator = buildSquareTrendVideoResolveOrchestrator();
          const trace = await orchestrator.execute({
            userId: "hot-trend-sync",
            projectId: "hot-trend-video-url-resolve",
            url: inputUrl,
          });

          if (!trace.success || !trace.resolvedVideoUrl) {
            app.log.warn({ inputUrl, success: trace.success }, "video hot trend: url resolution failed");
            return inputUrl;
          }

          // 返回解析后的直链
          const resolvedUrl = trace.resolvedVideoUrl.trim();
          if (/^https?:\/\//i.test(resolvedUrl)) {
            app.log.info({ inputUrl, resolvedUrl }, "video hot trend: url resolved successfully");
            return resolvedUrl;
          }

          return inputUrl;
        } catch (err) {
          app.log.warn({ err, inputUrl }, "video hot trend: url resolution error");
          return inputUrl;
        }
      },

      // 数据获取
      buildTikHubVideoAdapter: (tokenOverride) => ({
        fetchVideoHotTrends: async (limit, dateWindow) => {
          const token = await resolveTikHubTokenForHotTrends();
          return buildTikHubVideoAdapter(tokenOverride, token).fetchVideoHotTrends(limit, dateWindow);
        },
      }),
      buildDouhotAdapter: () => ({
        fetchVideoHotTrends: (limit, dateWindow) =>
          buildDouhotAdapter().fetchVideoHotTrends(limit, dateWindow),
      }),
      buildStoredHotTrendFallback: async (type, limit) => {
        const fallback = await getHotTrendSyncEngine().buildStoredHotTrendFallback(type, limit);
        return fallback ? { topics: fallback.topics, updatedAt: fallback.updatedAt } : null;
      },

      // 趋势条目操作（使用引擎内部函数，此处透传空实现占位，实际由引擎内部处理）
      upsertTrendEntry: () => { throw new Error("unreachable: upsertTrendEntry handled inside engine"); },
      mergeTrendTopicsByIdentity: (topicGroups, limit) =>
        mergeTrendTopicsByIdentity(topicGroups, limit),

      // 资产服务
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

      // 共享 DB 连接池的数据库操作（nrm_hot_trend_assets + nrm_script_data）
      // 已提取到 persistence/hot-trend-db-operations.ts
      ...(() => {
        const hotTrendDbOperations = createHotTrendDbOperations({
          repos: ctx.repos,
          storage: ctx.storage ?? undefined,
          videoDownloadTimeoutMs: ctx.configService.get().videoDownloadTimeoutMs,
        });
        return {
          insertHotTrendAsset: hotTrendDbOperations.insertHotTrendAsset,
          findHotTrendAssetByTopic: hotTrendDbOperations.findHotTrendAssetByTopic,
          updateHotTrendAssetScriptId: hotTrendDbOperations.updateHotTrendAssetScriptId,
          updateHotTrendAssetSourceOssUrl: hotTrendDbOperations.updateHotTrendAssetSourceOssUrl,
          insertScriptData: hotTrendDbOperations.insertScriptData,
          insertShotBreakdown: hotTrendDbOperations.insertShotBreakdown,
          insertEmotionArchetype: hotTrendDbOperations.insertEmotionArchetype,
          closeSharedDbPool: hotTrendDbOperations.closeSharedDbPool,
          downloadVideoForLlm: hotTrendDbOperations.downloadVideoForLlm,
          uploadVideoToOss: hotTrendDbOperations.uploadVideoToOss,
        };
      })(),

      // 用户获取 — 委托引擎内部的 resolveHotTrendOwner
      getOwner: () => { throw new Error("unreachable: getOwner handled inside engine"); },

      // 审计记录（旧函数，保持向后兼容）
      recordRouteAudit: (routeKey, startedAt, status, cost, errorCode, errorMessage, requestSummary, responseSummary) =>
        recordRouteAudit(ctx, routeKey as ProviderRouteKey, startedAt, status, cost, errorCode, errorMessage, requestSummary, responseSummary),

      // 调试记录（新函数，用于 LLM 调试气泡）
      createLlmDebugRecord: (input) =>
        createLlmDebugRecord(ctx, {
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
        }),
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
        hotTrendVideoReverseTopN: resolveHotTrendVideoTopN(),
      },

      // 日志
      log: {
        info: (obj, msg) => app.log.info(obj, msg),
        warn: (obj, msg) => app.log.warn(obj, msg),
        error: (obj, msg) => app.log.error(obj, msg),
      },
    }),
  });

  return hotTrendSyncEngine;
}