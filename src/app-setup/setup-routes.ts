/**
 * 路由注册模块
 *
 * 阶段 5: 注册所有 API 路由到 Fastify 实例。
 *
 * 设计原则：
 * - 直接导入所有需要的函数，避免复杂的参数传递
 * - setupRoutes 只接收核心依赖（app、ctx、runtimeConfig 等）
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { RuntimeConfigBundle } from "../core/runtime-config.js";
import type { DouyinRouteHandlers, ProviderExecutionLimiter, ProviderExecutionRuntimeConfig, OutfitSetupResult, HotTrendConfigResolvers } from "./app-services.js";
import type { VideoReverseSetupResult } from "./app-services.js";
import type { DressedupHelpersDeps } from "../modules/dressedup-character-helpers.js";
import type { ProjectRouteDeps } from "../routes/project-route-shared.js";
import type { HotTrendType, HotTrendSyncEntry } from "../modules/hot-trend/index.js";
import type { AdapterFactory } from "../modules/adapter-factory.js";
import type { CapabilityDiagnostics } from "../services/llm/provider-resolver.js";
import type { HotTrendSyncEngine } from "../modules/hot-trend-sync.js";
import type { ScriptData } from "../contracts/types.js";
import type { ScriptQualityScoringDaemon } from "../modules/script-quality/scoring-daemon.js";
import type { MetricsScheduler } from "../modules/script-quality/metrics-scheduler.js";
import type { PromptEvolutionDaemon } from "../modules/prompt-evolution/evolution-daemon.js";

import { resolveObjectStorageLocalRoot } from "../storage/runtime.js";
import { requireUser, requireAdmin } from "../services/auth/route-guards.js";
import { registerStaticRoutes } from "../routes/static-routes.js";
import { registerAuthRoutes } from "../routes/auth-routes.js";
import { registerReviewRoutes } from "../routes/review-routes.js";
import { registerReverseCredentialRoutes } from "../routes/reverse-credential-routes.js";
import { registerReverseParseRoutes, findReverseMirrorByScriptVersion, normalizeReverseParseVideoUrl } from "../routes/reverse-parse-routes.js";
import { registerReverseSquareRoutes } from "../routes/reverse-square-routes.js";
import { registerUserRoutes } from "../routes/user-routes.js";
import { registerLibraryRoutes } from "../routes/library-routes.js";
import { registerSquareRoutes } from "../routes/square-routes.js";
import { registerSquarePublishRoutes } from "../routes/square-publish-routes.js";
import { registerSquareCreatorAdminRoutes } from "../routes/square-creator-admin-routes.js";
// import { registerSquareAggregateRoutes } from "../routes/square-aggregate-routes.js";
import { registerVideoApiRoutes } from "../routes/video-api-routes.js";
import { registerProjectRoutes } from "../routes/project-routes.js";
import { registerProjectCharacterRoutes } from "../routes/project-character-routes.js";
import { registerProjectCharacterMatchRoutes } from "../routes/project-character-match-routes.js";
import { registerStep3CandidateRoutes } from "../routes/step3-candidate/index.js";
import { registerStep3BatchPreviewRoutes } from "../routes/step3-batch-preview-routes.js";
import { createStep3Helpers } from "../routes/step3-candidate-helpers.js";
import { registerAdminRoutes } from "../routes/admin-routes.js";
import { registerAdminModelPresetRoutes } from "../routes/admin-model-preset-routes.js";
import { registerFunctionalRouteRoutes } from "../routes/admin-functional-route-routes.js";
import { registerCreditPricingRoutes } from "../routes/admin-credit-pricing-routes.js";
import { registerAdminProjectsRoutes } from "../routes/admin/projects-routes.js";
import { registerAdminFinalVideosRoutes } from "../routes/admin/final-videos-routes.js";
import { registerScriptsRoutes } from "../routes/scripts-routes.js";
import { registerScriptRoutes } from "../routes/script-routes.js";
import { registerVideoMusicRoutes, registerVideoMusicFileRoutes } from "../routes/video-music-routes.js";
import { registerProjectVideoMusicRoutes } from "../routes/project-video-music-routes.js";
import { registerOutfitChangeRoutes } from "../routes/outfit-change-routes.js";
import { registerActionTransferRoutes } from "../routes/action-transfer-routes.js";
import { registerActionTemplateRoutes } from "../routes/action-template-routes.js";
import { registerAdminActionTemplateRoutes } from "../routes/admin-action-template-routes.js";
import { registerRuntimeConfigRoutes } from "../routes/runtime-config-routes.js";
import { registerLibraryAssetUploadRoutes } from "../routes/library-asset-upload-routes.js";

// 旧的 prompt-routes 已删除，改用 Skills 系统
// shot-prompts-routes 已删除：专业提示词生成内嵌到 batch-preview 编排任务
import { registerStep4VideoSceneRoutes } from "../routes/step4-video-scene-routes.js";
import { registerGarmentAssetRoutes } from "../routes/garment-asset-routes.js";
import { registerProjectGarmentAssocRoutes } from "../routes/project-garment-assoc-routes.js";
import { registerMyLibraryRoutes } from "../routes/my-library-routes.js";
import { registerFrontendShellFallbackRoutes } from "../routes/frontend-shell-routes.js";
import { registerScriptEffectivenessRoutes } from "../routes/script-effectiveness-routes.js";
import { registerStep1OutfitRoutes } from "../routes/step1-outfit/index.js";
// image-project routes 已通过 app-shell-thin-entry.ts 注册
import { registerAppShellThinEntry, type AppShellThinEntryHandlers } from "../routes/app-shell-thin-entry.js";
import { registerAdminDeletedDataRoutes } from "../routes/admin-deleted-data-routes.js";
import { registerExtDouyinPublishRoutes } from "../routes/ext-douyin-publish-routes.js";
import { registerExtDouyinDownloadRoutes } from "../routes/ext-douyin-download-routes.js";
import { registerExtensionConfigRoutes } from "../routes/ext-douyin-config-routes.js";
import { registerErrorLogRoutes } from "../routes/admin/error-log-routes.js";
import { registerAnnouncementRoutes } from "../routes/announcement-routes.js";
import { registerShareRoutes } from "../routes/share-routes.js";
import { registerImageShareRoutes } from "../routes/image-share-routes.js";
import { registerAdminAestheticLibraryRoutes } from "../routes/admin-aesthetic-library-routes.js";
import { registerAdminSceneLibraryRoutes } from "../routes/admin-scene-library-routes.js";
import { getFinalVideosDbService } from "../service/final-videos-db-service.js";
import { registerAdminEmotionArchetypeLibraryRoutes } from "../routes/admin/emotion-archetype-library-routes.js";
import { createAppShellHandlers } from "../routes/app-shell-handlers.js";
import { registerSkillsTestRoutes } from "../routes/skills-test-routes.js";
import { registerSkillsAdminRoutes } from "../routes/admin/skills-admin-routes.js";
import { registerSkillsCrudRoutes } from "../routes/admin/skills-crud-routes.js";
import {
  toReverseStoryboardLibraryRecordDto,
  ensureLegacyReverseStoryboardLibraryCompatibility,
} from "../routes/reverse-storyboard-library-helpers.js";
import { createProjectRouteHandlers } from "../routes/project-flow-route-handlers.js";
import { createAdminDeletedDataHandlers } from "../routes/admin-deleted-data-handlers.js";
import { registerScriptQualityRoutes } from "../routes/admin/script-quality-routes.js";
import { registerScriptAdminRoutes } from "../routes/admin/script-admin-routes.js";
import { registerPromptEvolutionRoutes } from "../routes/admin/prompt-evolution-routes.js";
import { toAdminScriptItem } from "../routes/admin-helpers.js";
import { buildOpsHealthResponse } from "../modules/ops-api-governance.js";
import { setupSwagger } from "../swagger/setup-swagger.js";
import { DeletedDataCleanupService } from "../modules/deleted-data-cleanup-service.js";
import { DeletedDataCleanupScheduler } from "../scheduler/index.js";
import { setupEmotionArchetypeLibraryUpdate } from "./setup-emotion-archetype-library-update.js";
import { setupEmotionArchetypeExtraction } from "./setup-emotion-archetype-extraction.js";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Library 路由需要的函数导入
import {
  createCharacterViewSession,
  appendSessionLog,
  appendViewLog,
  syncCharacterViewsFromSession,
  isFiveViewKey,
  persistManualViewReferences,
  sanitizeGeneratedCandidates,
  hasEnoughUniqueCoverage,
  mergeCandidatesUnique,
  pickLatestCandidate,
  persistGeneratedViewCandidates,
  persistDressedupGeneratedViewCandidates,
  persistDressedupAllInOneSlotImageToStorage,
  persistDressedupViewImageToStorage,
  persistCharacterViewImageToStorage,
  normalizeImageIdentity,
  hasReachedViewCandidateLimit,
  buildViewCandidateLimitMessage,
  resolveDressedupPersistenceProject,
  VIEW_REFERENCE_LIMIT,
  VIEW_GENERATION_MAX_ATTEMPTS,
  VIEW_GENERATION_CANDIDATE_BATCH_SIZE,
  FIVE_VIEW_DEFINITIONS,
  requireOwnerLibraryCharacter,
} from "../modules/character-view-session.js";
import { hydrateCharacterViewSessionCandidatesFromStorage } from "../modules/dressedup-character-helpers.js";
import { summarizeReferenceImagesForLog } from "../modules/step2-styling-helpers.js";
import { requestLlmImageGenerationUrls, requestLlmImageGenerationUrl, requestThirdPartyConnectivityProbe } from "../services/media/image-generation-providers.js";
import { normalizeJimengImageRatio, normalizeJimengImageResolution, requestJimengVideoUrl } from "../service/llm/llm-video.js";
import type { VideoUrlResolver } from "../modules/video-url-resolver.js";

// ---------------------------------------------------------------------------
// 路由设置依赖接口
// ---------------------------------------------------------------------------

/** 路由设置所需的所有依赖 */
export interface RoutesSetupDeps {
  app: FastifyInstance;
  ctx: AppContext;
  runtimeConfig: RuntimeConfigBundle;
  douyinRouteHandlers: DouyinRouteHandlers;
  providerExecutionLimiter: ProviderExecutionLimiter;
  providerExecutionRuntimeConfig: ProviderExecutionRuntimeConfig;
  videoReverse: VideoReverseSetupResult;
  outfit: OutfitSetupResult;
  hotTrendConfig: HotTrendConfigResolvers;
  adapterFactory: AdapterFactory;
  hotTrendSyncEngine: HotTrendSyncEngine;
  dressedupHelpersDeps: DressedupHelpersDeps;
  projectRouteDeps: ProjectRouteDeps;
  sideVideoTasks: Map<
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
  >;
  hotTrendCache: Map<HotTrendType, HotTrendSyncEntry>;
  runSharedVideoUrlReversePipelineForUser: VideoUrlResolver["runSharedVideoUrlReversePipelineForUser"];
  scoringDaemon: ScriptQualityScoringDaemon;
  metricsScheduler: MetricsScheduler;
  evolutionDaemon: PromptEvolutionDaemon;
}

/** 路径常量（兼容 tsx 直接运行 src 目录和编译后的 dist 目录） */
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);
// 从 src/app-setup 或 dist/app-setup 向上两级到达项目根目录
const projectRoot = resolve(currentDirPath, "../..");
const publicRoot = join(currentDirPath, "../../public");
const appV4DistRoot = join(currentDirPath, "../../apps/web/dist");

// ---------------------------------------------------------------------------
// 路由注册函数
// ---------------------------------------------------------------------------

/**
 * 阶段 5: 注册所有 API 路由
 *
 * 将路由注册逻辑从 app.ts 提取，简化 buildApp 函数。
 */
export function setupRoutes(deps: RoutesSetupDeps): void {
  const {
    app,
    ctx,
    runtimeConfig,
    douyinRouteHandlers,
    providerExecutionLimiter,
    providerExecutionRuntimeConfig,
    videoReverse,
    hotTrendConfig,
    adapterFactory,
    hotTrendSyncEngine,
    dressedupHelpersDeps,
    projectRouteDeps,
    sideVideoTasks,
    hotTrendCache,
    runSharedVideoUrlReversePipelineForUser,
    scoringDaemon,
    metricsScheduler,
    evolutionDaemon,
  } = deps;

  // 对象存储配置
  const objectStorageDriver = runtimeConfig.objectStorage.driver;
  const objectStoragePublicBase = runtimeConfig.objectStorage.publicBase;
  const objectStorageLocalRoot = resolveObjectStorageLocalRoot(runtimeConfig.objectStorage.localDir ?? undefined);
  const persistenceReadyRequired = runtimeConfig.persistence.requireReady;

  // 持久化状态
  const persistenceStatus = {
    driver: "postgres" as const,
    enabled: Boolean(ctx.pool),
    status: ctx.pool ? "ready" as const : "idle" as const,
  };

  // 活动 Web Root
  const activeWebRoot = existsSync(join(appV4DistRoot, "index.html"))
    ? appV4DistRoot
    : publicRoot;

  // 注册静态路由
  registerStaticRoutes(app, {
    activeWebRoot,
    publicRoot,
    projectRoot,
    objectStoragePublicBase,
    objectStorageDriver,
    objectStorageLocalRoot,
    persistenceStatus,
    persistenceReadyRequired,
    runtimeConfigNodeEnv: runtimeConfig.server.nodeEnv,
    storageAdapter: ctx.storage,
  });

  // Ops 健康检查响应
  const readOpsHealthResponse = () =>
    buildOpsHealthResponse({
      driver: persistenceStatus.driver,
      enabled: persistenceStatus.enabled,
      status: persistenceStatus.status,
      requestedDriver: "postgres",
      readyRequired: persistenceReadyRequired,
      ready: persistenceStatus.enabled && persistenceStatus.status === "ready",
    });

  // Swagger 配置
  setupSwagger(app);

  // 包装函数：适配 registerLibraryRoutes 的函数签名
  const hydrateCharacterViewSessionCandidatesFromStorageWrapper = async (character: import("../contracts/types.js").LibraryCharacter) => {
    await hydrateCharacterViewSessionCandidatesFromStorage(dressedupHelpersDeps, character);
  };

  // --- 所有 API 路由统一挂载到 /neirongmiao/api 前缀下 ---
  app.register(async (apiApp) => {
    // Video API 路由
    registerVideoApiRoutes(apiApp, ctx, {
      sideVideoTasks,
      requestJimengVideoUrl,
      buildReverseFetchOrchestrator: adapterFactory.buildReverseFetchOrchestrator,
      videoReverseAnalysisService: videoReverse.videoReverseAnalysisService,
      resolveTikHubTokenForUser: adapterFactory.resolveTikHubTokenForUser,
      buildDouhotAdapter: adapterFactory.buildDouhotAdapter,
      buildTikHubVideoAdapter: async (tokenOverride?: string | null) => {
        const resolvedToken = await adapterFactory.resolveTikHubTokenForHotTrends();
        return adapterFactory.buildTikHubVideoAdapter(tokenOverride, resolvedToken);
      },
    });

    // 反推分镜库辅助函数（绑定 ctx）
    const toReverseStoryboardLibraryRecordDtoBound = (user: import("../contracts/types.js").User, itemId: string) =>
      toReverseStoryboardLibraryRecordDto(ctx, user, itemId);
    const ensureLegacyReverseStoryboardLibraryCompatibilityBound = (user: import("../contracts/types.js").User) =>
      ensureLegacyReverseStoryboardLibraryCompatibility(ctx, user);

    registerLibraryRoutes(apiApp, ctx, {
      toReverseStoryboardLibraryRecordDto: toReverseStoryboardLibraryRecordDtoBound,
      ensureLegacyReverseStoryboardLibraryCompatibility: ensureLegacyReverseStoryboardLibraryCompatibilityBound,
      hydrateCharacterViewSessionCandidatesFromStorage: hydrateCharacterViewSessionCandidatesFromStorageWrapper,
    });

    // Auth 路由
    registerAuthRoutes(apiApp, ctx);

    // 项目路由处理器
    const projectRouteHandlers = createProjectRouteHandlers({
      ctx,
    });
    const {
      createProjectRoute,
      renameProjectRoute,
      saveProjectWorkflowStateRoute,
      getProjectResumeSnapshotRoute,
      getStep1GarmentsRoute,
      getOutfitPlansRoute,
      getStep1StateRoute,
      deleteProjectRoute,
      uploadProjectAssetsRoute,
      updateProjectRoleDirectionRoute,
      getProjectContextRoute,
    } = projectRouteHandlers;

    const projectFlowRouteHandlers: AppShellThinEntryHandlers["projectFlow"] = {
      createProject: createProjectRoute,
      renameProject: renameProjectRoute,
      saveWorkflowState: saveProjectWorkflowStateRoute,
      getResumeSnapshot: getProjectResumeSnapshotRoute,
      getStep1Garments: getStep1GarmentsRoute,
      getOutfitPlans: getOutfitPlansRoute,
      getStep1State: getStep1StateRoute,
      deleteProject: deleteProjectRoute,
      uploadAssets: uploadProjectAssetsRoute,
      getDouyinPublishStatus: douyinRouteHandlers.getDouyinPublishStatus,
      getDouyinAuthStatus: douyinRouteHandlers.getDouyinAuthStatus,
      getDouyinRemoteLoginStatus: douyinRouteHandlers.getDouyinRemoteLoginStatus,
      generateDouyinQRCode: douyinRouteHandlers.generateDouyinQRCode,
      checkDouyinScanStatus: douyinRouteHandlers.checkDouyinScanStatus,
      clearDouyinCookie: douyinRouteHandlers.clearDouyinCookie,
      createDouyinRemoteSession: douyinRouteHandlers.createDouyinRemoteSession,
      getDouyinRemoteSession: douyinRouteHandlers.getDouyinRemoteSession,
      closeDouyinRemoteSession: douyinRouteHandlers.closeDouyinRemoteSession,
      publishToDouyin: douyinRouteHandlers.publishToDouyin,
      getPublishJob: douyinRouteHandlers.getPublishJob,
      getPublishJobs: douyinRouteHandlers.getPublishJobs,
      getPublishStagingScreenshot: douyinRouteHandlers.getPublishStagingScreenshot,
      updateRoleDirection: updateProjectRoleDirectionRoute,
      getProjectContext: getProjectContextRoute,
    };

    registerProjectRoutes(apiApp, ctx, projectRouteDeps);

    // 项目角色路由
    registerProjectCharacterRoutes(apiApp, ctx);

    // 项目角色服饰匹配路由
    registerProjectCharacterMatchRoutes(apiApp, ctx);

    // Step3 候选脚本路由
    const step3Helpers = createStep3Helpers(apiApp, ctx, projectRouteDeps);
    registerStep3CandidateRoutes(apiApp, ctx, projectRouteDeps, step3Helpers);
    registerStep3BatchPreviewRoutes(apiApp, ctx, projectRouteDeps, step3Helpers);

    // 反向解析路由（handlers 由 registerAppShellThinEntry 统一注册）
    const reverseSquareRouteHandlers = registerReverseParseRoutes(apiApp, ctx, {
      buildReverseFetchOrchestrator: adapterFactory.buildReverseFetchOrchestrator,
      videoReverseAnalysisService: videoReverse.videoReverseAnalysisService,
      runSharedVideoUrlReversePipelineForUser,
    });
    // 注意：registerReverseSquareRoutes 已移至 registerAppShellThinEntry 内部统一注册，避免重复

    const findReverseMirrorByScriptVersionBound = async (userId: string, scriptVersionId: string): Promise<ScriptData | null> => {
      return findReverseMirrorByScriptVersion(userId, scriptVersionId, ctx);
    };

    registerReverseCredentialRoutes(apiApp, ctx, { credentialService: adapterFactory.credentialService });
    registerReviewRoutes(apiApp, ctx);
    registerSquareRoutes(apiApp, ctx, { buildSquareTrendVideoResolveOrchestrator: adapterFactory.buildSquareTrendVideoResolveOrchestrator });
    registerSquarePublishRoutes(apiApp, ctx);
    registerSquareCreatorAdminRoutes(apiApp, ctx);
    registerScriptsRoutes(apiApp, ctx);
    registerScriptRoutes(apiApp, ctx);
    registerUserRoutes(apiApp, ctx, { findReverseMirrorByScriptVersion: findReverseMirrorByScriptVersionBound });

    // Admin 路由
    const toAdminScriptItemBound = (item: ScriptData) => toAdminScriptItem(ctx, item);
    const { adminProviderRouteHandlers } = registerAdminRoutes(apiApp, ctx, {
      resolveTikHubTokenForUser: adapterFactory.resolveTikHubTokenForUser,
      syncHotTrendAssets: hotTrendSyncEngine.syncHotTrendAssets,
      listHotTrendSyncLogs: hotTrendSyncEngine.listSyncLogs,
      toAdminScriptItem: toAdminScriptItemBound,
      normalizeReverseParseVideoUrl,
      runSharedVideoUrlReversePipelineForUser,
      resolveHotTrendSyncIntervalMs: hotTrendConfig.resolveHotTrendSyncIntervalMs,
      resolveHotTrendVideoTopN: hotTrendConfig.resolveHotTrendVideoTopN,
      resolveHotTrendRealtimeTopN: hotTrendConfig.resolveHotTrendRealtimeTopN,
      providerExecutionLimiter,
      providerExecutionRuntimeConfig,
      buildReverseFetchOrchestrator: adapterFactory.buildReverseFetchOrchestrator,
      hotTrendCache,
      readOpsHealthResponse,
      buildDouhotAdapter: adapterFactory.buildDouhotAdapter,
      buildStoredHotTrendFallback: async (type: HotTrendType, limit: number) => {
        const fallback = await hotTrendSyncEngine.buildStoredHotTrendFallback(type, limit);
        return fallback ? { topics: fallback.topics, updatedAt: fallback.updatedAt } : null;
      },
      requestLlmImageGenerationUrl,
      requestJimengVideoUrl,
      requestLlmImageGenerationUrls,
      requestThirdPartyConnectivityProbe,
    });

    // 模型预设管理路由
    registerAdminModelPresetRoutes(apiApp, ctx);
    registerFunctionalRouteRoutes(apiApp, ctx);

    // 积分定价管理路由
    registerCreditPricingRoutes(apiApp, ctx);

    // 项目管理路由
    registerAdminProjectsRoutes(apiApp, ctx);

    // 成片管理路由
    apiApp.register(async (fvApp) => {
      registerAdminFinalVideosRoutes(fvApp, ctx);
    }, { prefix: "/admin/final-videos" });

    // 伪删除数据清理服务和调度器
    const cleanupService = new DeletedDataCleanupService(ctx.pool, ctx.repos);
    const cleanupScheduler = DeletedDataCleanupScheduler.getInstance(ctx.pool, cleanupService);
    cleanupScheduler.start();

    // 情感原型库后置微调调度器（凌晨5点执行）
    if (ctx.pool) {
      setupEmotionArchetypeLibraryUpdate({ app, pool: ctx.pool, repos: ctx.repos });
    }

    // 情感原型自动提取调度器（凌晨6点执行，从三大热点数据源提取情感原型）
    if (ctx.pool) {
      setupEmotionArchetypeExtraction({ app, ctx });
    }

    // 管理员伪删除数据路由
    const deletedDataHandlers = createAdminDeletedDataHandlers(ctx, cleanupService, cleanupScheduler, cleanupService.getCleanupRepos());
    registerAdminDeletedDataRoutes(apiApp, deletedDataHandlers);

    // 管理员错误日志路由
    registerErrorLogRoutes(apiApp, ctx);

    // 脚本质量评分 Dashboard
    registerScriptQualityRoutes(apiApp, ctx);

    // 脚本管理（管理后台）
    if (ctx.pool) {
      apiApp.register(async (scriptAdminApp) => {
        await registerScriptAdminRoutes(scriptAdminApp, { ctx });
      }, { prefix: "/admin/script-management" });
    }

    // 任务管理（管理后台：系统任务 + 用户任务 + 调度配置）
    if (ctx.pool) {
      apiApp.register(async (taskAdminApp) => {
        const { registerTaskAdminRoutes } = await import("../routes/admin/task-admin-routes.js");
        await registerTaskAdminRoutes(taskAdminApp, { pool: ctx.pool!, ctx });
      }, { prefix: "/admin/task-management" });
    }

    // Prompt 进化提案审批
    registerPromptEvolutionRoutes(apiApp, ctx);

    // 公告路由（用户端 + 管理端）
    registerAnnouncementRoutes(apiApp, ctx);

    // 公开分享路由（无需认证）
    if (ctx.pool) {
      const finalVideosDbService = getFinalVideosDbService(ctx.repos);
      registerShareRoutes(apiApp, ctx, { finalVideosDbService });
      registerImageShareRoutes(apiApp, ctx);
    }

    // 审美特征库后台管理路由
    registerAdminAestheticLibraryRoutes(apiApp, ctx);

    // 场景库后台管理路由
    registerAdminSceneLibraryRoutes(apiApp, ctx);

    // 情感原型库后台管理路由
    registerAdminEmotionArchetypeLibraryRoutes(apiApp, ctx);

    // App Shell handlers
    const otherHandlers = createAppShellHandlers(ctx, requireUser, requireAdmin);
    registerAppShellThinEntry(apiApp, ctx, {
      projectFlow: projectFlowRouteHandlers,
      reverseSquare: reverseSquareRouteHandlers,
      adminProviders: adminProviderRouteHandlers,
      squareVideoUrlResolver: { buildSquareTrendVideoResolveOrchestrator: adapterFactory.buildSquareTrendVideoResolveOrchestrator },
      ...otherHandlers,
    });

    // 其他路由
    registerVideoMusicRoutes(apiApp, ctx, { requireUser, requireAdmin });
    registerLibraryAssetUploadRoutes(apiApp, ctx, { requireUser });
    // registerStep3ScriptRoutes 已弃用：脚本生成已迁移至 step3-candidate 全局队列架构
    registerScriptEffectivenessRoutes(apiApp, ctx);
    // registerPromptRoutes 已删除：提示词管理已迁移至 Skills 系统
    // shot-prompts-routes 已删除：专业提示词生成内嵌到 batch-preview 编排任务
    registerStep4VideoSceneRoutes(apiApp, ctx);
    // registerImageProjectRoutes 已在 app-shell-thin-entry.ts 中注册，无需重复
    registerGarmentAssetRoutes(apiApp, ctx, { requireUser });
    registerProjectGarmentAssocRoutes(apiApp, ctx, { requireUser });
    registerMyLibraryRoutes(apiApp, ctx);
    // 项目-视频音乐关联路由
    registerProjectVideoMusicRoutes(apiApp, ctx, { requireUser });
    // 服装换装视频生成路由
    await registerOutfitChangeRoutes(apiApp, { ctx });
    // AnimateAnyone 动作迁移路由
    await registerActionTransferRoutes(apiApp, { ctx });
    // 内置动作模板库路由（用户端）
    await registerActionTemplateRoutes(apiApp, { ctx });
    // 管理后台模板管理路由
    await registerAdminActionTemplateRoutes(apiApp, { ctx });
    // 运行时配置路由（前端获取环境信息）
    await registerRuntimeConfigRoutes(apiApp, { ctx });
    // Skills 测试路由
    registerSkillsTestRoutes(apiApp, ctx);
    // Skills 管理路由（独立子上下文，避免 requireAdmin hook 影响其他路由）
    apiApp.register(async (skillsAdminApp) => {
      await registerSkillsAdminRoutes(skillsAdminApp, { scoringDaemon, metricsScheduler, evolutionDaemon, pool: ctx.pool!, ctx });
    }, { prefix: "/admin/skills" });
    // Skills CRUD 路由（独立子上下文，避免 requireAdmin hook 影响其他路由）
    apiApp.register(async (skillsCrudApp) => {
      await registerSkillsCrudRoutes(skillsCrudApp, ctx);
    }, { prefix: "/admin/skills" });

    // 扩展发布专用路由（与服务端自动化完全隔离）
    registerExtDouyinPublishRoutes(apiApp, { ctx });
    registerExtDouyinDownloadRoutes(apiApp, { ctx });
    registerExtensionConfigRoutes(apiApp, { ctx });
  }, { prefix: "/neirongmiao/api" });

  // 视频音乐静态文件路由（不放在 API prefix 下）
  registerVideoMusicFileRoutes(app, ctx);

  // 前端 SPA fallback 路由
  registerFrontendShellFallbackRoutes(app, { activeWebRoot });
}