import {
  OPS_API_VERSION_POLICY,
  OPS_TREND_CACHE_CONTRACT,
  assertOpsApiGovernanceContract,
  isHealthResponseContractCompatible,
  isProviderAuditRecordContractCompatible,
} from "../contracts/ops-api-governance-contract.js";

export const OPS_API_GOVERNANCE_IMPL_VERSION = "AT28-35.v1";

export interface OpsHealthInput {
  driver: string;
  enabled: boolean;
  status: string;
  requestedDriver: string;
  readyRequired: boolean;
  ready: boolean;
}

export interface OpsProviderAuditInput {
  providerId: string;
  routeKey: string;
  status: "pending" | "success" | "error" | "timeout";
  latencyMs: number;
  cost: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: number;
}

export interface OpsTrendCacheEntryInput {
  type: string;
  source: string;
  analysisSource: string;
  syncedAt: number;
  nextSyncAt: number;
  topicCount: number;
}

export function buildOpsHealthResponse(input: OpsHealthInput): {
  ok: true;
  persistence: OpsHealthInput;
} {
  return {
    ok: true,
    persistence: {
      driver: input.driver,
      enabled: input.enabled,
      status: input.status,
      requestedDriver: input.requestedDriver,
      readyRequired: input.readyRequired,
      ready: input.ready,
    },
  };
}

export function summarizeProviderAuditGovernance(records: readonly OpsProviderAuditInput[]): {
  total: number;
  compatible: number;
  incompatible: number;
  compatibleRatio: number;
} {
  const compatible = records.filter((item) => isProviderAuditRecordContractCompatible(item)).length;
  const total = records.length;
  return {
    total,
    compatible,
    incompatible: Math.max(0, total - compatible),
    compatibleRatio: total > 0 ? compatible / total : 1,
  };
}

export function summarizeTrendCacheGovernance(
  entries: readonly OpsTrendCacheEntryInput[],
  now: number,
): {
  staleWhileRefresh: true;
  coldStartFallbackAllowed: true;
  cacheEntity: "hot-trends";
  entries: Array<
    OpsTrendCacheEntryInput & {
      stale: boolean;
      remainingMs: number;
    }
  >;
} {
  return {
    ...OPS_TREND_CACHE_CONTRACT,
    entries: entries.map((entry) => {
      const remainingMs = Math.max(0, Math.floor(entry.nextSyncAt - now));
      return {
        ...entry,
        stale: remainingMs <= 0,
        remainingMs,
      };
    }),
  };
}

export function buildOpsApiGovernanceBaselineReport(input: {
  health: ReturnType<typeof buildOpsHealthResponse>;
  audits: readonly OpsProviderAuditInput[];
  trendCacheEntries: readonly OpsTrendCacheEntryInput[];
  now: number;
}): {
  contract: ReturnType<typeof assertOpsApiGovernanceContract>;
  implementationVersion: string;
  checkedAt: number;
  health: {
    contractCompatible: boolean;
    payload: ReturnType<typeof buildOpsHealthResponse>;
  };
  providerAudits: ReturnType<typeof summarizeProviderAuditGovernance>;
  apiVersionPolicy: typeof OPS_API_VERSION_POLICY;
  trendCache: ReturnType<typeof summarizeTrendCacheGovernance>;
} {
  return {
    contract: assertOpsApiGovernanceContract(),
    implementationVersion: OPS_API_GOVERNANCE_IMPL_VERSION,
    checkedAt: Math.floor(input.now),
    health: {
      contractCompatible: isHealthResponseContractCompatible(input.health),
      payload: input.health,
    },
    providerAudits: summarizeProviderAuditGovernance(input.audits),
    apiVersionPolicy: OPS_API_VERSION_POLICY,
    trendCache: summarizeTrendCacheGovernance(input.trendCacheEntries, input.now),
  };
}
