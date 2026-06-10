/**
 * adapter-factory.ts
 *
 * 从 app.ts 提取的适配器构建函数：
 * ReverseFetchOrchestrator、TikHubAdapter、DouhotAdapter 等构建器。
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { SourceCredentialScope } from "../contracts/types.js";
import type { ReverseFetchAdapterRuntimeConfig } from "./reverse-fetch-adapters.js";
import {
  createDefaultReverseFetchAdapters,
  DouhotAdapter,
  TikHubTrendAdapter,
} from "./reverse-fetch-adapters.js";
import { ReverseFetchOrchestrator } from "./orchestrator.js";
import { resolveReverseFetchStageOrder } from "./trend-topic-normalizer.js";
import { resolveSquareTrendVideoReversePriority } from "./hot-trend-llm-stage-service.js";
import {
  resolveLatestSourceCredentialSecret,
  resolveTikHubProviderSecret,
  resolveTikHubTokenForUser,
  resolveTikHubTokenForHotTrends,
  resolveDouhotEndpointForHotTrends,
} from "../app-setup/credential-resolvers.js";
import { VIDEO_HOT_TREND_FETCH_CONTRACT } from "../contracts/hot-trend-fetch-config.js";
import type { SourceCredentialRepository, ReverseFetchOrchestratorRepository } from "../contracts/repository-port-narrowing.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 适配器工厂依赖 */
export interface AdapterFactoryDeps {
  app: FastifyInstance;
  ctx: AppContext;
  reverseAdapterConfig: ReverseFetchAdapterRuntimeConfig;
  tikhubVideoHotTimeoutMs: number;
  tikhubVideoHotPageSize: number;
  tikhubTimeoutMs: number;
  reverseStageOrder: string;
  tikhubApiToken: string | null;
  resolveHotTrendVideoDateWindowHours: () => number;
}

/** 适配器工厂返回值 */
export interface AdapterFactory {
  buildReverseFetchOrchestrator: () => ReverseFetchOrchestrator;
  buildSquareTrendVideoResolveOrchestrator: () => ReverseFetchOrchestrator;
  buildDouhotAdapter: () => DouhotAdapter;
  buildTikHubVideoAdapter: (tokenOverride?: string | null, hotTrendToken?: string | null) => TikHubTrendAdapter;
  buildTikHubRealtimeAdapter: (tokenOverride?: string | null, hotTrendToken?: string | null) => TikHubTrendAdapter;
  resolveTikHubTokenForUser: (userId: string) => Promise<string | null>;
  resolveTikHubTokenForHotTrends: () => Promise<string | null>;
  resolveTikHubProviderSecret: () => Promise<string | null>;
  resolveLatestSourceCredentialSecret: (scope: SourceCredentialScope, provider?: string) => Promise<string | null>;
  resolveDouhotEndpointForHotTrends: () => string | null;
  resolveHotTrendVideoDateWindowHours: () => number;
  credentialService: ReturnType<typeof createDefaultReverseFetchAdapters>["credentials"];
}

// ---------------------------------------------------------------------------
// 适配器工厂
// ---------------------------------------------------------------------------

export function createAdapterFactory(deps: AdapterFactoryDeps): AdapterFactory {
  const { app, ctx, reverseAdapterConfig, tikhubVideoHotTimeoutMs, tikhubVideoHotPageSize, tikhubTimeoutMs, reverseStageOrder, tikhubApiToken, resolveHotTrendVideoDateWindowHours } = deps;

  // 窄接口桥接
  const sourceCredentialRepo: SourceCredentialRepository = {
    generateId: () => ctx.clock.generateId(),
    now: () => ctx.clock.now(),
    sourceCredentials: ctx.repos.sourceCredentials,
  };

  const orchestratorRepo: ReverseFetchOrchestratorRepository = {
    generateId: () => ctx.clock.generateId(),
    now: () => ctx.clock.now(),
    reverseTraces: ctx.repos.reverseTraces,
    reverseAttempts: ctx.repos.reverseAttempts,
  };

  const reverseFetchRuntime = createDefaultReverseFetchAdapters(
    sourceCredentialRepo,
    ctx.auditStore,
    ctx.configService.get(),
    reverseAdapterConfig,
  );

  const credentialService = reverseFetchRuntime.credentials;

  const resolveRuntimeStageOrder = () =>
    resolveReverseFetchStageOrder(reverseStageOrder);

  const buildReverseFetchOrchestrator = () => {
    const runtime = createDefaultReverseFetchAdapters(
      sourceCredentialRepo,
      ctx.auditStore,
      ctx.configService.get(),
      reverseAdapterConfig,
    );
    return new ReverseFetchOrchestrator(orchestratorRepo, runtime.adapters, resolveRuntimeStageOrder());
  };

  const buildSquareTrendVideoResolveOrchestrator = () => {
    const runtime = createDefaultReverseFetchAdapters(sourceCredentialRepo, ctx.auditStore, {
      ...ctx.configService.get(),
      reverseExternalApiPriority: resolveSquareTrendVideoReversePriority(),
    }, reverseAdapterConfig);
    return new ReverseFetchOrchestrator(
      orchestratorRepo,
      runtime.adapters,
      resolveReverseFetchStageOrder("S5_EXTERNAL_API,S6_LOCAL_FILE"),
    );
  };

  const resolveTikHubTokenForUserBound = (userId: string) =>
    resolveTikHubTokenForUser(credentialService, userId);

  const resolveTikHubTokenForHotTrendsBound = () =>
    resolveTikHubTokenForHotTrends({ ctx, credentialService, runtimeConfig: { reverse: { tikhubApiToken } } });

  const resolveDouhotEndpointForHotTrendsBound = () => resolveDouhotEndpointForHotTrends(ctx) ?? null;

  const buildDouhotAdapter = () =>
    new DouhotAdapter(credentialService, resolveDouhotEndpointForHotTrendsBound() ?? undefined);

  const buildTikHubVideoAdapter = (tokenOverride?: string | null, hotTrendToken?: string | null) =>
    new TikHubTrendAdapter(
      ctx.configService.get().tikhubVideoHotApiUrl?.trim() || null,
      tokenOverride?.trim() || (hotTrendToken ?? null),
      tikhubVideoHotTimeoutMs,
      "TikHub 视频热榜",
      "POST",
      {
        pageSize: tikhubVideoHotPageSize,
        page: VIDEO_HOT_TREND_FETCH_CONTRACT.page,
        dateWindow: resolveHotTrendVideoDateWindowHours(),
      },
    );

  const buildTikHubRealtimeAdapter = (tokenOverride?: string | null, hotTrendToken?: string | null) =>
    new TikHubTrendAdapter(
      ctx.configService.get().tikhubRealtimeHotApiUrl?.trim() || null,
      tokenOverride?.trim() || (hotTrendToken ?? null),
      tikhubTimeoutMs,
      "TikHub 实时热榜",
      "GET",
    );

  return {
    buildReverseFetchOrchestrator,
    buildSquareTrendVideoResolveOrchestrator,
    buildDouhotAdapter,
    buildTikHubVideoAdapter,
    buildTikHubRealtimeAdapter,
    resolveTikHubTokenForUser: resolveTikHubTokenForUserBound,
    resolveTikHubTokenForHotTrends: resolveTikHubTokenForHotTrendsBound,
    resolveTikHubProviderSecret: () => resolveTikHubProviderSecret(ctx),
    resolveLatestSourceCredentialSecret: (scope, provider) => resolveLatestSourceCredentialSecret(ctx, scope, provider),
    resolveDouhotEndpointForHotTrends: resolveDouhotEndpointForHotTrendsBound,
    resolveHotTrendVideoDateWindowHours,
    credentialService,
  };
}