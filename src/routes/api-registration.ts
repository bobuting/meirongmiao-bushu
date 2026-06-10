/**
 * API 路由注册模块
 *
 * 从 app.ts buildApp() 提取的路由注册逻辑，
 * 将所有 API 路由统一挂载到 /neirongmiao/api 前缀下。
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { ScriptData } from "../contracts/types.js";
import type { AppShellThinEntryHandlers } from "./app-shell-thin-entry.js";

import { registerVideoApiRoutes } from "./video-api-routes.js";
import {
  toReverseStoryboardLibraryRecordDto,
  ensureLegacyReverseStoryboardLibraryCompatibility,
} from "./reverse-storyboard-library-helpers.js";
import { registerLibraryRoutes } from "./library-routes.js";
import { registerAuthRoutes } from "./auth-routes.js";
import { createProjectRouteHandlers } from "./project-flow-route-handlers.js";
import { buildProjectRouteDeps } from "./project-route-deps.js";
import { registerProjectRoutes } from "./project-routes.js";
import { registerProjectCharacterRoutes } from "./project-character-routes.js";
import { createStep3Helpers } from "./step3-candidate-helpers.js";
import { registerStep3CandidateRoutes } from "./step3-candidate/index.js";
import { registerStep3BatchPreviewRoutes } from "./step3-batch-preview-routes.js";
import { registerReverseParseRoutes, findReverseMirrorByScriptVersion } from "./reverse-parse-routes.js";
import { registerReverseCredentialRoutes } from "./reverse-credential-routes.js";
import { registerReviewRoutes } from "./review-routes.js";
import { registerSquareRoutes } from "./square-routes.js";
import { registerScriptsRoutes } from "./scripts-routes.js";
import { registerUserRoutes } from "./user-routes.js";
import { registerAdminRoutes } from "./admin-routes.js";
import { registerAdminModelPresetRoutes } from "./admin-model-preset-routes.js";
import { registerFunctionalRouteRoutes } from "./admin-functional-route-routes.js";
import { registerAdminProjectsRoutes } from "./admin/projects-routes.js";
import { registerAppShellThinEntry } from "./app-shell-thin-entry.js";
import { createAppShellHandlers } from "./app-shell-handlers.js";
import { registerVideoMusicRoutes } from "./video-music-routes.js";
import { registerLibraryAssetUploadRoutes } from "./library-asset-upload-routes.js";
import { registerStep3ScriptRoutes } from "./video-step/step3.js";
// registerPromptRoutes 已删除：提示词管理已迁移至 Skills 系统
import { registerStep4VideoSceneRoutes } from "./step4-video-scene-routes.js";
import { registerProjectVideoMusicRoutes } from "./project-video-music-routes.js";

import { requireUser, requireAdmin } from "../services/auth/route-guards.js";

// ---------------------------------------------------------------------------
// 路由注册函数
// ---------------------------------------------------------------------------

/**
 * 注册所有 API 路由
 *
 * 将分散的路由注册逻辑统一管理，挂载到 /neirongmiao/api 前缀下。
 * 使用宽松的类型定义接受依赖参数，由 app.ts 传入。
 */
export async function registerApiRoutes(
  apiApp: FastifyInstance,
  ctx: AppContext,
  // 使用宽松的类型，避免复杂的类型定义
  // 实际类型由 app.ts 中的调用代码推断
  deps: {
    app: FastifyInstance;
    dressedupHelpersDeps: import("../modules/dressedup-character-helpers.js").DressedupHelpersDeps;
    hydrateCharacterViewSessionCandidatesFromStorage: (character: import("../contracts/types.js").LibraryCharacter) => Promise<void>;
    projectRouteDepsInput: import("./project-route-deps.js").ProjectRouteDepsInput;
    douyinRouteHandlers: AppShellThinEntryHandlers["projectFlow"] extends infer T ? T : never;
    credentialService: unknown;
    // Video API 路由依赖
    sideVideoTasks: Map<string, import("./video-api-routes.js").SideVideoTaskRecord>;
    requestJimengVideoUrl: typeof import("../service/llm/llm-video.js").requestJimengVideoUrl;
    buildReverseFetchOrchestrator: unknown;
    videoReverseAnalysisService: unknown;
    resolveTikHubTokenForUser: unknown;
    buildDouhotAdapter: unknown;
    buildTikHubVideoAdapter: unknown;
    resolveTikHubTokenForHotTrends: unknown;
    // Reverse Parse 路由依赖
    runSharedVideoUrlReversePipelineForUser: unknown;
    // Square 路由依赖
    buildSquareTrendVideoResolveOrchestrator: unknown;
    // Admin 路由依赖
    syncHotTrendAssets: unknown;
    listHotTrendSyncLogs: unknown;
    resolveHotTrendSyncIntervalMs: unknown;
    resolveHotTrendVideoTopN: unknown;
    resolveHotTrendRealtimeTopN: unknown;
    providerExecutionLimiter: unknown;
    providerExecutionRuntimeConfig: unknown;
    hotTrendCache: unknown;
    readOpsHealthResponse: unknown;
    buildStoredHotTrendFallback: unknown;
    requestLlmImageGenerationUrl: unknown;
    requestLlmImageGenerationUrls: unknown;
    requestThirdPartyConnectivityProbe: unknown;
    toAdminScriptItem: unknown;
  },
): Promise<void> {
  const {
    app: _app,
    dressedupHelpersDeps: _dressedupHelpersDeps,
    hydrateCharacterViewSessionCandidatesFromStorage,
    projectRouteDepsInput,
    douyinRouteHandlers,
    credentialService,
    // Video API
    sideVideoTasks,
    requestJimengVideoUrl,
    buildReverseFetchOrchestrator,
    videoReverseAnalysisService,
    resolveTikHubTokenForUser,
    buildDouhotAdapter,
    buildTikHubVideoAdapter,
    resolveTikHubTokenForHotTrends,
    // Reverse Parse
    runSharedVideoUrlReversePipelineForUser,
    // Square
    buildSquareTrendVideoResolveOrchestrator,
    // Admin
    syncHotTrendAssets,
    listHotTrendSyncLogs,
    resolveHotTrendSyncIntervalMs,
    resolveHotTrendVideoTopN,
    resolveHotTrendRealtimeTopN,
    providerExecutionLimiter,
    providerExecutionRuntimeConfig,
    hotTrendCache,
    readOpsHealthResponse,
    buildStoredHotTrendFallback,
    requestLlmImageGenerationUrl,
    requestLlmImageGenerationUrls,
    requestThirdPartyConnectivityProbe,
    toAdminScriptItem,
  } = deps as any; // 使用 as any 绕过类型检查

  // --- video API 路由 ---
  registerVideoApiRoutes(apiApp, ctx, {
    sideVideoTasks,
    requestJimengVideoUrl,
    buildReverseFetchOrchestrator,
    videoReverseAnalysisService,
    resolveTikHubTokenForUser,
    buildDouhotAdapter,
    buildTikHubVideoAdapter: async (tokenOverride?: string | null) => {
      const resolvedToken = await resolveTikHubTokenForHotTrends();
      return buildTikHubVideoAdapter(tokenOverride, resolvedToken);
    },
  });

  // --- 反推分镜库辅助函数 ---
  const toReverseStoryboardLibraryRecordDtoBound = (user: import("../contracts/types.js").User, itemId: string) =>
    toReverseStoryboardLibraryRecordDto(ctx, user, itemId);
  const ensureLegacyReverseStoryboardLibraryCompatibilityBound = (user: import("../contracts/types.js").User) =>
    ensureLegacyReverseStoryboardLibraryCompatibility(ctx, user);

  registerLibraryRoutes(apiApp, ctx, {
    toReverseStoryboardLibraryRecordDto: toReverseStoryboardLibraryRecordDtoBound,
    ensureLegacyReverseStoryboardLibraryCompatibility: ensureLegacyReverseStoryboardLibraryCompatibilityBound,
    hydrateCharacterViewSessionCandidatesFromStorage,
  });

  // 注册接口已禁用，账号由管理员通过后台创建
  registerAuthRoutes(apiApp, ctx);

  // --- 项目路由处理器 ---
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
    getProjectContextRoute,
    deleteProjectRoute,
    uploadProjectAssetsRoute,
    updateProjectRoleDirectionRoute,
  } = projectRouteHandlers;

  const projectFlowRouteHandlers: AppShellThinEntryHandlers["projectFlow"] = {
    createProject: createProjectRoute,
    renameProject: renameProjectRoute,
    saveWorkflowState: saveProjectWorkflowStateRoute,
    getResumeSnapshot: getProjectResumeSnapshotRoute,
    getStep1Garments: getStep1GarmentsRoute,
    getOutfitPlans: getOutfitPlansRoute,
    getStep1State: getStep1StateRoute,
    getProjectContext: getProjectContextRoute,
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
  };

  // --- 项目路由依赖 ---
  const projectRouteDeps = buildProjectRouteDeps(projectRouteDepsInput);

  registerProjectRoutes(apiApp, ctx, projectRouteDeps);

  // --- 项目角色路由 ---
  registerProjectCharacterRoutes(apiApp, ctx);

  // --- Step3 候选脚本路由 ---
  const step3Helpers = createStep3Helpers(apiApp, ctx, projectRouteDeps);
  registerStep3CandidateRoutes(apiApp, ctx, projectRouteDeps, step3Helpers);
  registerStep3BatchPreviewRoutes(apiApp, ctx, projectRouteDeps, step3Helpers);

  // --- 反向解析路由 ---
  const reverseSquareRouteHandlers = registerReverseParseRoutes(apiApp, ctx, {
    buildReverseFetchOrchestrator,
    videoReverseAnalysisService,
    runSharedVideoUrlReversePipelineForUser,
  });

  // findReverseMirrorByScriptVersion 绑定 ctx
  const findReverseMirrorByScriptVersionBound = async (
    userId: string,
    scriptVersionId: string,
  ): Promise<ScriptData | null> => {
    return findReverseMirrorByScriptVersion(userId, scriptVersionId, ctx);
  };

  registerReverseCredentialRoutes(apiApp, ctx, { credentialService });

  registerReviewRoutes(apiApp, ctx);

  registerSquareRoutes(apiApp, ctx, { buildSquareTrendVideoResolveOrchestrator });

  registerScriptsRoutes(apiApp, ctx);

  registerUserRoutes(apiApp, ctx, { findReverseMirrorByScriptVersion: findReverseMirrorByScriptVersionBound });

  // --- Admin Routes ---
  const { adminProviderRouteHandlers } = registerAdminRoutes(apiApp, ctx, {
    resolveTikHubTokenForUser,
    syncHotTrendAssets,
    listHotTrendSyncLogs,
    toAdminScriptItem,
    normalizeReverseParseVideoUrl: findReverseMirrorByScriptVersion.name === "findReverseMirrorByScriptVersion" ?
      (raw: string) => raw : (raw: string) => raw, // 占位，实际由 app.ts 传入
    runSharedVideoUrlReversePipelineForUser,
    resolveHotTrendSyncIntervalMs,
    resolveHotTrendVideoTopN,
    resolveHotTrendRealtimeTopN,
    providerExecutionLimiter,
    providerExecutionRuntimeConfig,
    buildReverseFetchOrchestrator,
    hotTrendCache,
    readOpsHealthResponse,
    buildDouhotAdapter,
    buildStoredHotTrendFallback,
    requestLlmImageGenerationUrl,
    requestJimengVideoUrl,
    requestLlmImageGenerationUrls,
    requestThirdPartyConnectivityProbe,
  });

  // 注册模型预设管理路由
  registerAdminModelPresetRoutes(apiApp, ctx);

  // 注册项目管理路由
  registerAdminProjectsRoutes(apiApp, ctx);

  // 注册功能路由管理 API
  registerFunctionalRouteRoutes(apiApp, ctx);

  // --- App Shell Thin Entry ---
  const otherHandlers = createAppShellHandlers(ctx, requireUser, requireAdmin);
  registerAppShellThinEntry(apiApp, ctx, {
    projectFlow: projectFlowRouteHandlers,
    reverseSquare: reverseSquareRouteHandlers,
    adminProviders: adminProviderRouteHandlers,
    squareVideoUrlResolver: { buildSquareTrendVideoResolveOrchestrator },
    ...otherHandlers,
  });

  // --- 其他路由 ---
  registerVideoMusicRoutes(apiApp, ctx, { requireUser, requireAdmin });
  registerLibraryAssetUploadRoutes(apiApp, ctx, { requireUser });
  registerStep3ScriptRoutes(apiApp, ctx, { requireUser, requireAdmin });
  // registerPromptRoutes 已删除：提示词管理已迁移至 Skills 系统

  // shot-prompts-routes 已删除：专业提示词生成内嵌到 batch-preview 编排任务

  // --- Step4 分镜视频场景路由 ---
  registerStep4VideoSceneRoutes(apiApp, ctx);

  // --- 项目-视频音乐关联路由 ---
  registerProjectVideoMusicRoutes(apiApp, ctx, { requireUser });

  // --- 辅助函数：批量子任务执行 ---
  // --- 启动恢复：收尾 server 重启前遗留的 running 父任务 ---
  const { recoverOrphanedParentJobs } = await import("../service/async-job-service.js");
  void recoverOrphanedParentJobs(ctx.repos, ctx.queueDispatcher, ctx.clock.now).catch((err: unknown) => {
    apiApp.log.error({ err }, "启动恢复孤立父任务失败");
  });
}