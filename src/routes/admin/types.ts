/**
 * admin/types.ts
 * Admin 路由共享类型与依赖接口
 * 从 admin-routes.ts 提取，供 admin/ 子模块共用
 */
import type { ProviderRouteKey } from "../../contracts/provider-route-policy-contract.js";
import type { ScriptData } from "../../contracts/types.js";
import type { ReverseStoryboardPanelViewModel } from "../../contracts/reverse-storyboard-report.js";
import type { ScriptHints } from "../../services/reverse/script-parser.js";
import type { OpsHealthInput } from "../../modules/ops-api-governance.js";
import type { ProviderExecutionLimiter } from "../../contracts/provider-execution-governance-contract.js";
import type { ResolvedRouteProvider } from "../../services/llm/provider-resolver.js";
import type {
  JimengImageRatio,
  JimengImageResolution,
} from "../../service/llm/llm-video.js";
import type { ImageGenerationDebugOptions } from "../../services/media/image-generation-providers.js";
import type {
  HotTrendType,
  HotTrendSyncEntry,
  SquareTrendTopic,
} from "../../modules/hot-trend/types.js";
import type {
  HotTrendSyncTriggerType,
  HotTrendSyncLogStatus,
  HotTrendSyncLogListResult,
} from "../../modules/hot-trend-sync.js";
import type { AppShellThinEntryHandlers } from "../app-shell-thin-entry.js";
import type { VideoScriptPayload } from "../../service/scripts-data-db-service.js";

// 与 admin-routes.ts 中 AdminRouteDeps 完全一致的定义
export interface AdminRouteDeps {
  readonly resolveTikHubTokenForUser: (userId: string) => Promise<string | null>;
  readonly syncHotTrendAssets: (type: HotTrendType, force?: boolean, tokenOverride?: string | null, triggerType?: HotTrendSyncTriggerType) => Promise<HotTrendSyncEntry>;
  readonly listHotTrendSyncLogs: (params: { page: number; limit: number; triggerType?: HotTrendSyncTriggerType; trendType?: HotTrendType; status?: HotTrendSyncLogStatus }) => Promise<HotTrendSyncLogListResult>;
  readonly toAdminScriptItem: (item: ScriptData) => Promise<Record<string, unknown>>;
  readonly normalizeReverseParseVideoUrl: (raw: string) => string;
  readonly runSharedVideoUrlReversePipelineForUser: (normalizedVideoUrl: string, options: { userId: string; projectId?: string | null }) => Promise<{ resolvedVideoUrl: string; multimodalResult: { result: string }; llmPayload: VideoScriptPayload; storyboardPanel: ReverseStoryboardPanelViewModel }>;
  readonly resolveHotTrendSyncIntervalMs: (type: HotTrendType) => number;
  readonly resolveHotTrendVideoTopN: () => number;
  readonly resolveHotTrendRealtimeTopN: () => number;
  readonly providerExecutionLimiter: ProviderExecutionLimiter;
  readonly providerExecutionRuntimeConfig: { maxConcurrency: number; timeoutMs: number };
  readonly buildReverseFetchOrchestrator: () => { execute: (input: { userId: string; projectId: string; url: string }) => Promise<{ success: boolean; traceId: string; finalStage: string | null; resolvedVideoUrl: string | null; scriptHints?: ScriptHints | null; attempts: Array<Record<string, unknown>>; nextAction?: string | null }> };
  readonly hotTrendCache: Map<HotTrendType, HotTrendSyncEntry>;
  readonly readOpsHealthResponse: () => { ok: true; persistence: OpsHealthInput };
  readonly buildDouhotAdapter: () => { health: () => Promise<unknown>; authStatus: () => Promise<unknown>; refreshSession: () => Promise<unknown> };
  readonly buildStoredHotTrendFallback: (type: HotTrendType, limit: number) => Promise<{ topics: SquareTrendTopic[]; updatedAt: string | null } | null>;
  readonly requestLlmImageGenerationUrl: (provider: ResolvedRouteProvider, prompt: string) => Promise<{ url: string; endpoint: string; requestBody: Record<string, unknown> }>;
  readonly requestJimengVideoUrl: (provider: ResolvedRouteProvider, prompt: string, options?: { imageUrl?: string | null; taskId?: string | null; referenceImages?: string[]; returnAuditInfo?: boolean }) => Promise<string | { videoUrl: string; auditInfo: { actualEndpoint: string; requestBodySummary: Record<string, unknown> } }>;
  readonly requestLlmImageGenerationUrls: typeof import("../../services/media/image-generation-providers.js").requestLlmImageGenerationUrls;
  readonly requestThirdPartyConnectivityProbe: (provider: ResolvedRouteProvider) => Promise<string>;
}

export type { AppShellThinEntryHandlers };
