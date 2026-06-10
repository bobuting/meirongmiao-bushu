/**
 * 应用服务接口定义
 *
 * 定义 buildApp 各阶段创建的服务接口，用于类型安全和依赖注入。
 */

import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { AppContext } from "../core/app-context.js";
import type { RuntimeConfigBundle } from "../core/runtime-config.js";
import type {
  OutfitPlan,
} from "../contracts/types.js";
import type { ResolvedRouteProvider } from "../contracts/provider-route-contract.js";
import type { VideoReverseAnalysisServicePort } from "../contracts/video-reverse-analysis-service.js";
import type { ErrorLogService } from "../services/error-log/error-log-service.js";
import type { ErrorLogQueue } from "../services/error-log/error-log-queue.js";
import type { ErrorLogCleanupScheduler } from "../scheduler/error-log-cleanup-scheduler.js";
import type { StuckJobCleanupScheduler } from "../scheduler/stuck-job-cleanup-scheduler.js";
import type { ScriptQualityScoringDaemon } from "../modules/script-quality/scoring-daemon.js";
import type { DailyScoringScheduler } from "../modules/script-quality/daily-scoring-scheduler.js";
import type { MetricsScheduler } from "../modules/script-quality/metrics-scheduler.js";
import type { PromptEvolutionDaemon } from "../modules/prompt-evolution/evolution-daemon.js";

// ---------------------------------------------------------------------------
// 核心设置结果
// ---------------------------------------------------------------------------

/** 核心初始化结果 */
export interface CoreSetupResult {
  app: FastifyInstance;
  ctx: AppContext;
  runtimeConfig: RuntimeConfigBundle;
  pool: Pool;
  douyinRouteHandlers: DouyinRouteHandlers;
  providerExecutionLimiter: ProviderExecutionLimiter;
  providerExecutionRuntimeConfig: ProviderExecutionRuntimeConfig;
  errorLogService: ErrorLogService;
  errorLogQueue: ErrorLogQueue;
  errorLogCleanupScheduler: ErrorLogCleanupScheduler;
  stuckJobCleanupScheduler: StuckJobCleanupScheduler;
  scoringDaemon: ScriptQualityScoringDaemon;
  dailyScoringScheduler: DailyScoringScheduler;
  metricsScheduler: MetricsScheduler;
  evolutionDaemon: PromptEvolutionDaemon;
}

/** 抖音路由处理器 */
export interface DouyinRouteHandlers {
  getDouyinPublishStatus: (request: unknown) => Promise<unknown>;
  getDouyinAuthStatus: (request: unknown) => Promise<unknown>;
  getDouyinRemoteLoginStatus: (request: unknown) => Promise<unknown>;
  generateDouyinQRCode: (request: unknown) => Promise<unknown>;
  checkDouyinScanStatus: (request: unknown) => Promise<unknown>;
  clearDouyinCookie: (request: unknown) => Promise<unknown>;
  createDouyinRemoteSession: (request: unknown) => Promise<unknown>;
  getDouyinRemoteSession: (request: unknown) => Promise<unknown>;
  closeDouyinRemoteSession: (request: unknown) => Promise<unknown>;
  publishToDouyin: (request: unknown) => Promise<unknown>;
  getPublishJob: (request: unknown) => Promise<unknown>;
  getPublishJobs: (request: unknown) => Promise<unknown>;
  getPublishStagingScreenshot: (request: unknown) => Promise<unknown>;
}

/** Provider 执行限制器 */
export type ProviderExecutionLimiter = ReturnType<typeof import("../modules/provider-execution-governance.js").createInMemoryProviderExecutionLimiter>;

/** Provider 执行运行时配置 */
export interface ProviderExecutionRuntimeConfig {
  readonly maxConcurrency: number;
  readonly timeoutMs: number;
  readonly slowRequestThresholdMs: number;
}

// ---------------------------------------------------------------------------
// Video Reverse 服务
// ---------------------------------------------------------------------------

/** Video Reverse 服务设置结果 */
export interface VideoReverseSetupResult {
  videoReverseAnalysisService: VideoReverseAnalysisServicePort;
  resolveVideoReverseProviderChain: (
    sourceType: "video_url" | "upload_file",
    apiFallbackOrder?: readonly string[],
  ) => Promise<{ providers: ResolvedRouteProvider[]; hasUnsupportedProviders: boolean }>;
}

// ---------------------------------------------------------------------------
// Outfit 服务
// ---------------------------------------------------------------------------

/** Outfit 服务设置结果 */
export interface OutfitSetupResult {
  resolveMaxOutfitAnalysisCards: () => number;
  normalizeOutfitPlans: (plans: OutfitPlan[]) => OutfitPlan[];
  listOutfitPlansByProject: (projectId: string) => Promise<OutfitPlan[]>;
}

// ---------------------------------------------------------------------------
// Hot Trend 服务
// ---------------------------------------------------------------------------

/** 热门趋势配置解析结果（从 setup-hot-trend.ts 导出） */
export type { HotTrendConfigResolvers } from "./setup-hot-trend.js";
import type { HotTrendConfigResolvers } from "./setup-hot-trend.js";

// ---------------------------------------------------------------------------
// 路由设置
// ---------------------------------------------------------------------------

/** 路由设置依赖 */
export interface RoutesSetupDeps {
  core: CoreSetupResult;
  videoReverse: VideoReverseSetupResult;
  outfit: OutfitSetupResult;
  hotTrend: HotTrendConfigResolvers;
}

/** 对象存储配置 */
export interface ObjectStorageConfig {
  driver: string;
  publicBase: string | null;
  localRoot: string;
}

// ---------------------------------------------------------------------------
// 完整应用服务
// ---------------------------------------------------------------------------

/** 应用服务集合 */
export interface AppServices {
  core: CoreSetupResult;
  videoReverse: VideoReverseSetupResult;
  outfit: OutfitSetupResult;
  hotTrend: HotTrendConfigResolvers;
  objectStorage: ObjectStorageConfig;
}