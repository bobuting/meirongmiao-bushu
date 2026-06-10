/**
 * 应用构建模块
 *
 * buildApp 函数是应用的主入口，负责初始化所有服务和注册路由。
 *
 * 简化策略：
 * 1. 核心初始化 -> setupCore()
 * 2. Video Reverse -> setupVideoReverse()
 * 3. Outfit -> setupOutfit()
 * 4. Hot Trend -> setupHotTrend()
 * 5. 路由注册 -> setupRoutes()
 */

import type { FastifyInstance } from "fastify";
import type { HotTrendType, HotTrendSyncEntry } from "./modules/hot-trend/index.js";
import type { CapabilityDiagnostics } from "./services/llm/provider-resolver.js";

// App setup 模块导入
import { setupCore } from "./app-setup/setup-core.js";
import { setupVideoReverse } from "./app-setup/setup-video-reverse.js";
import { setupOutfit } from "./app-setup/setup-outfit.js";
import { setupHotTrend } from "./app-setup/setup-hot-trend.js";
import { createHotTrendSyncEngineSetup } from "./app-setup/setup-hot-trend-sync-engine.js";
import { registerAppRuntimeHooks } from "./app-setup/app-hooks.js";
import { setupRoutes } from "./app-setup/setup-routes.js";
import { setupAestheticLibraryUpdate } from "./app-setup/setup-aesthetic-library-update.js";
import { setupSceneLibraryUpdate } from "./app-setup/setup-scene-library-update.js";
import { setupHotTrendDailyReport } from "./app-setup/setup-hot-trend-daily-report.js";
import { setupVideoMusicSync } from "./app-setup/setup-video-music-sync.js";
import { setupSquareCreatorDiscovery } from "./app-setup/setup-square-creator-discovery.js";
import { setupSquareTemplateAutoPublish } from "./app-setup/setup-square-template-auto-publish.js";

// 运行时配置
import { resolveObjectStorageLocalRoot } from "./storage/runtime.js";
import { readBooleanEnv } from "./services/utils/content-type.js";
import { createAdapterFactory, type AdapterFactory, type AdapterFactoryDeps } from "./modules/adapter-factory.js";
import { createVideoUrlResolver } from "./modules/video-url-resolver.js";
import type { DressedupHelpersDeps } from "./modules/dressedup-character-helpers.js";
import { buildProjectRouteDeps } from "./routes/project-route-deps.js";

// LLM Transport 函数（用于热榜同步引擎）
import {
  requestLlmPlainTextWithMetadata,
  requestGeminiPlainTextWithVideoPart,
} from "./services/llm/llm-transport.js";
import {
  buildGeminiRemoteVideoPart,
  buildGeminiInlineVideoPart,
} from "./services/llm/gemini-utils.js";
import { runVideoHotTrendBatchReverseWithRetry } from "./modules/video-hot-trend-batch-reverse.js";

// ---------------------------------------------------------------------------
// 导出（通过 app-exports.ts 集中管理，此处保留兼容性导出）
// ---------------------------------------------------------------------------

export * from "./app-exports.js";

// ---------------------------------------------------------------------------
// buildApp 主函数
// ---------------------------------------------------------------------------

/**
 * 构建 Fastify 应用实例
 *
 * 阶段划分：
 * 1. 核心初始化（Fastify 实例、PG pool、AppContext）
 * 2. Video Reverse 服务
 * 3. Outfit 服务
 * 4. Hot Trend 配置
 * 5. 路由注册
 */
export async function buildApp(): Promise<FastifyInstance> {
  // 阶段 1: 核心初始化
  const core = await setupCore();
  const { app, ctx, runtimeConfig, douyinRouteHandlers, providerExecutionLimiter, providerExecutionRuntimeConfig } = core;

  // 对象存储配置
  const objectStorageDriver = runtimeConfig.objectStorage.driver;
  const objectStoragePublicBase = runtimeConfig.objectStorage.publicBase;
  const objectStorageLocalRoot = resolveObjectStorageLocalRoot(runtimeConfig.objectStorage.localDir ?? undefined);

  // 阶段 2: Video Reverse 服务
  const videoReverse = setupVideoReverse(ctx);

  // 阶段 3: Outfit 服务
  const outfit = setupOutfit(ctx);
  const { resolveMaxOutfitAnalysisCards } = outfit;

  // 阶段 4: Hot Trend 配置解析
  const hotTrendConfig = setupHotTrend(ctx);
  const { resolveHotTrendSyncIntervalMs, resolveHotTrendVideoTopN } = hotTrendConfig;

  // 热榜自动分析配置
  const hotTrendAutoAnalyzeOnStartup = readBooleanEnv(
    process.env.HOT_TREND_AUTO_ANALYZE_ON_STARTUP,
    process.env.NODE_ENV !== "test",
  );

  // 计算下次热榜同步时间
  const resolveNextHotTrendRunAt = (type: HotTrendType, nowMs = Date.now()): number => {
    const nowDate = new Date(nowMs);
    const next = new Date(nowDate.getTime());
    next.setMinutes(0, 0, 0);
    const intervalMs = resolveHotTrendSyncIntervalMs(type);
    const anchorMs = next.getTime();
    const remainder = anchorMs % intervalMs;
    if (remainder === 0) {
      return anchorMs + intervalMs;
    }
    return anchorMs + (intervalMs - remainder);
  };

  // 热榜运行时状态
  const hotTrendCache = new Map<HotTrendType, HotTrendSyncEntry>();
  const hotTrendInFlight = new Map<HotTrendType, Promise<HotTrendSyncEntry>>();

  // Side Video 任务状态
  const sideVideoTasks = new Map<
    string,
    {
      taskId: string;
      status: "queued" | "running" | "succeeded" | "failed";
      model: string;
      videoUrls: string[];
      raw: unknown;
      diagnostics: CapabilityDiagnostics;
      createdAt: number;
      updatedAt: number;
    }
  >();

  // Reverse Adapter 运行时配置
  const reverseAdapterRuntimeConfig = {
    customCookieEndpoint: runtimeConfig.reverse.customCookieEndpoint,
    customCookieTimeoutMs: runtimeConfig.reverse.customCookieTimeoutMs,
    publicPoolEndpoint: runtimeConfig.reverse.publicPoolEndpoint,
    publicPoolTimeoutMs: runtimeConfig.reverse.publicPoolTimeoutMs,
    playwrightGuestEndpoint: runtimeConfig.reverse.playwrightGuestEndpoint,
    playwrightGuestTimeoutMs: runtimeConfig.reverse.playwrightGuestTimeoutMs,
    userQrCookieEndpoint: runtimeConfig.reverse.userQrCookieEndpoint,
    userQrCookieTimeoutMs: runtimeConfig.reverse.userQrCookieTimeoutMs,
    externalApiTimeoutMs: runtimeConfig.reverse.externalApiTimeoutMs,
  };

  // 适配器工厂
  const adapterFactoryDeps: AdapterFactoryDeps = {
    app,
    ctx,
    reverseAdapterConfig: reverseAdapterRuntimeConfig,
    tikhubVideoHotTimeoutMs: runtimeConfig.reverse.tikhubVideoHotTimeoutMs,
    tikhubVideoHotPageSize: runtimeConfig.reverse.tikhubVideoHotPageSize,
    tikhubTimeoutMs: runtimeConfig.reverse.tikhubTimeoutMs,
    reverseStageOrder: runtimeConfig.reverse.stageOrder,
    tikhubApiToken: runtimeConfig.reverse.tikhubApiToken ?? null,
    resolveHotTrendVideoDateWindowHours: hotTrendConfig.resolveHotTrendVideoDateWindowHours,
  };
  const adapterFactory: AdapterFactory = createAdapterFactory(adapterFactoryDeps);

  // 对象存储日志
  app.log.info(
    {
      requestedDriver: objectStorageDriver,
      activeDriver: ctx.storage?.driver ?? null,
      publicBase: objectStoragePublicBase,
      localRoot: objectStorageDriver === "local" ? objectStorageLocalRoot : null,
      configuredLocalDir: runtimeConfig.objectStorage.localDir,
    },
    "object storage runtime resolved",
  );

  if (objectStorageDriver === "s3" && (!ctx.storage || ctx.storage.driver !== "s3")) {
    throw new Error(
      "[startup] OBJECT_STORAGE_DRIVER=s3 but s3 adapter init failed. Check OBJECT_STORAGE_BUCKET, S3_REGION and credential chain.",
    );
  }
  if (objectStorageDriver === "supabase") {
    app.log.warn(
      { driver: objectStorageDriver },
      "object storage driver is configured without writable SDK adapter in current codebase",
    );
  }

  // Dressedup 辅助函数依赖
  const dressedupHelpersDeps: DressedupHelpersDeps = {
    app,
    ctx,
    objectStorageDriver,
    objectStorageLocalRoot,
  };

  // 视频 URL 解析器
  const videoUrlResolver = createVideoUrlResolver({
    app,
    ctx,
    buildSquareTrendVideoResolveOrchestrator: adapterFactory.buildSquareTrendVideoResolveOrchestrator,
    resolveTikHubTokenForUserBound: adapterFactory.resolveTikHubTokenForUser,
    resolveTikHubTokenForHotTrendsBound: adapterFactory.resolveTikHubTokenForHotTrends,
    videoReverseAnalysisService: videoReverse.videoReverseAnalysisService,
    videoDownloadTimeoutMs: ctx.configService.get().videoDownloadTimeoutMs,
  });
  const { runSharedVideoUrlReversePipelineForUser } = videoUrlResolver;

  // 热榜同步引擎（使用延迟初始化解决自引用问题）
  let hotTrendSyncEngineRef: ReturnType<typeof import("./modules/hot-trend-sync.js").createHotTrendSyncEngine> | null = null;
  const hotTrendSyncEngine = createHotTrendSyncEngineSetup({
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
    getHotTrendSyncEngine: () => hotTrendSyncEngineRef!,
  });
  hotTrendSyncEngineRef = hotTrendSyncEngine;
  hotTrendSyncEngine.startSchedulerHooks();

  // 审美特征库定时更新（每日凌晨 4 点）
  const aestheticLibraryScheduler = setupAestheticLibraryUpdate({ ctx });

  // 场景库定时更新（每日凌晨 4:30）
  const sceneLibraryScheduler = setupSceneLibraryUpdate({ ctx });

  // 每日热点分析报告（凌晨 2 点预计算）
  const hotTrendDailyReportScheduler = setupHotTrendDailyReport({ ctx, runtimeConfig });

  // 视频音乐库同步（凌晨 1 点）
  const videoMusicSyncScheduler = setupVideoMusicSync(ctx);

  // 达人发现（凌晨 2 点，默认禁用）
  setupSquareCreatorDiscovery({ ctx, runtimeConfig });

  // 模板自动发布（凌晨 3 点，默认禁用）
  setupSquareTemplateAutoPublish({ ctx, runtimeConfig });

  // 注册运行时 hooks（错误处理 + CORS）
  registerAppRuntimeHooks(app);

  // 项目路由依赖构建
  const projectRouteDeps = buildProjectRouteDeps({
    app,
    ctx,
    dressedupHelpersDeps,
    resolveMaxOutfitAnalysisCards,
  });

  // 阶段 5: 路由注册
  setupRoutes({
    app,
    ctx,
    runtimeConfig,
    douyinRouteHandlers,
    providerExecutionLimiter,
    providerExecutionRuntimeConfig,
    videoReverse,
    outfit,
    hotTrendConfig,
    adapterFactory,
    hotTrendSyncEngine,
    dressedupHelpersDeps,
    projectRouteDeps,
    sideVideoTasks,
    hotTrendCache,
    runSharedVideoUrlReversePipelineForUser,
    scoringDaemon: core.scoringDaemon,
    metricsScheduler: core.metricsScheduler,
    evolutionDaemon: core.evolutionDaemon,
  });

  return app;
}