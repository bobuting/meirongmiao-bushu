import type { AppConfig, ReverseFetchStage, TrendWindow } from "./types.js";
import type {
  DouhotEntry,
  ReverseFetchInput,
  ReverseFetchTraceResult,
  ReverseFetcherAdapter,
  TrendSourceAdapter,
  TrendTopic,
} from "./douyin-integration.js";
import type { ReverseExternalApiConfig } from "../modules/douyin-integration-service.js";

export const DOUYIN_INTEGRATION_SPLIT_CONTRACT_VERSION = "AT28-25.v1";

// ExternalApiAdapter 只使用 TikHub 解析视频真实下载地址
export const DOUYIN_EXTERNAL_API_PROVIDER_KEYS = ["tikhub"] as const;

export type DouyinExternalApiProviderKey = (typeof DOUYIN_EXTERNAL_API_PROVIDER_KEYS)[number];

export const DOUYIN_INTEGRATION_SPLIT_MODULES = [
  "reverse_fetch_adapters",
  "trend_topic_normalizer",
  "external_api_resolver",
  "douyin_orchestrator",
] as const;

export type DouyinIntegrationSplitModuleId = (typeof DOUYIN_INTEGRATION_SPLIT_MODULES)[number];

export interface TrendFetcher extends TrendSourceAdapter {}

export interface ReverseResolver extends ReverseFetcherAdapter {
  fetch(input: ReverseFetchInput): ReturnType<ReverseFetcherAdapter["fetch"]>;
}

export interface TopicNormalizer {
  resolveStageOrder(raw: string | undefined): ReverseFetchStage[];
  mapDouhotEntryToTrendTopic(entry: DouhotEntry): TrendTopic;
}

export interface ExternalApiResolver {
  buildReverseExternalApiConfig(config?: Partial<AppConfig>): ReverseExternalApiConfig;
}

export interface DouyinOrchestrator {
  execute(input: ReverseFetchInput): Promise<ReverseFetchTraceResult>;
}

export const DOUYIN_INTEGRATION_SPLIT_TARGET_FILES: Record<DouyinIntegrationSplitModuleId, string> = {
  reverse_fetch_adapters: "src/modules/reverse-fetch-adapters.ts",
  trend_topic_normalizer: "src/modules/trend-topic-normalizer.ts",
  external_api_resolver: "src/modules/external-api-resolver.ts",
  douyin_orchestrator: "src/modules/orchestrator.ts",
};

export const DOUYIN_INTEGRATION_SPLIT_EXPORT_SURFACE: Record<
  DouyinIntegrationSplitModuleId,
  readonly string[]
> = {
  reverse_fetch_adapters: [
    "CustomCookieAdapter",
    "PublicPoolAdapter",
    "PlaywrightGuestAdapter",
    "UserQrCookieAdapter",
    "ExternalApiAdapter",
    "TikHubTrendAdapter",
    "DouhotAdapter",
  ],
  trend_topic_normalizer: [
    "resolveReverseFetchStageOrder",
    "mapDouhotEntryToTrendTopic",
  ],
  external_api_resolver: [
    "buildReverseExternalApiConfig",
  ],
  douyin_orchestrator: ["ReverseFetchOrchestrator"],
};

export function assertDouyinIntegrationSplitContract(): {
  version: string;
  moduleCount: number;
  exportSymbolCount: number;
  externalApiProviderCount: number;
} {
  const moduleSet = new Set(DOUYIN_INTEGRATION_SPLIT_MODULES);
  if (moduleSet.size !== DOUYIN_INTEGRATION_SPLIT_MODULES.length) {
    throw new Error("douyin integration split module ids must remain unique");
  }
  const targetFileSet = new Set(Object.values(DOUYIN_INTEGRATION_SPLIT_TARGET_FILES));
  if (targetFileSet.size !== DOUYIN_INTEGRATION_SPLIT_MODULES.length) {
    throw new Error("every split module must map to a unique target file");
  }
  const exportedSymbols = Object.values(DOUYIN_INTEGRATION_SPLIT_EXPORT_SURFACE).flat();
  if (new Set(exportedSymbols).size !== exportedSymbols.length) {
    throw new Error("split export symbols must not overlap across module boundaries");
  }
  for (const moduleId of DOUYIN_INTEGRATION_SPLIT_MODULES) {
    if (DOUYIN_INTEGRATION_SPLIT_EXPORT_SURFACE[moduleId].length < 1) {
      throw new Error(`split module ${moduleId} must keep at least one exported symbol`);
    }
  }
  if (new Set(DOUYIN_EXTERNAL_API_PROVIDER_KEYS).size !== DOUYIN_EXTERNAL_API_PROVIDER_KEYS.length) {
    throw new Error("external api provider keys must remain unique");
  }

  return {
    version: DOUYIN_INTEGRATION_SPLIT_CONTRACT_VERSION,
    moduleCount: DOUYIN_INTEGRATION_SPLIT_MODULES.length,
    exportSymbolCount: exportedSymbols.length,
    externalApiProviderCount: DOUYIN_EXTERNAL_API_PROVIDER_KEYS.length,
  };
}
