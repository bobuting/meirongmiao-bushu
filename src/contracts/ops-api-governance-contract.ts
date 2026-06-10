export const OPS_API_GOVERNANCE_CONTRACT_VERSION = "AT28-34.v1";

export const OPS_API_GOVERNANCE_INVARIANTS = [
  "Health endpoint must expose deterministic readiness fields for runtime governance.",
  "Provider route-audit records must keep a stable column contract for admin observability.",
  "Hot-trends reads must keep stale-while-refresh cache semantics to avoid blank-page regressions.",
  "Versioned API rollout policy is planned under /api/v1 while keeping legacy routes compatible.",
] as const;

export const OPS_HEALTH_REQUIRED_KEYS = [
  "ok",
  "persistence.driver",
  "persistence.enabled",
  "persistence.status",
  "persistence.requestedDriver",
  "persistence.readyRequired",
  "persistence.ready",
] as const;

export const OPS_PROVIDER_AUDIT_REQUIRED_COLUMNS = [
  "providerId",
  "routeKey",
  "status",
  "latencyMs",
  "cost",
  "errorCode",
  "errorMessage",
  "createdAt",
] as const;

export const OPS_TREND_CACHE_CONTRACT = {
  staleWhileRefresh: true,
  coldStartFallbackAllowed: true,
  cacheEntity: "hot-trends",
} as const;

export const OPS_API_VERSION_POLICY = {
  legacyPrefix: "/api",
  targetVersionPrefix: "/api/v1",
  rolloutMode: "planned",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isHealthResponseContractCompatible(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (value.ok !== true) {
    return false;
  }
  const persistence = value.persistence;
  if (!isRecord(persistence)) {
    return false;
  }
  return (
    typeof persistence.driver === "string" &&
    typeof persistence.enabled === "boolean" &&
    typeof persistence.status === "string" &&
    typeof persistence.requestedDriver === "string" &&
    typeof persistence.readyRequired === "boolean" &&
    typeof persistence.ready === "boolean"
  );
}

export function isProviderAuditRecordContractCompatible(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const status = value.status;
  const statusValid = status === "pending" || status === "success" || status === "error" || status === "timeout";
  return (
    typeof value.providerId === "string" &&
    typeof value.routeKey === "string" &&
    statusValid &&
    typeof value.latencyMs === "number" &&
    typeof value.cost === "number" &&
    (typeof value.errorCode === "string" || value.errorCode === null || value.errorCode === undefined) &&
    (typeof value.errorMessage === "string" || value.errorMessage === null || value.errorMessage === undefined) &&
    typeof value.createdAt === "number"
  );
}

export function assertOpsApiGovernanceContract(): {
  version: string;
  invariantCount: number;
  healthFieldCount: number;
  providerAuditColumnCount: number;
  targetVersionPrefix: string;
} {
  return {
    version: OPS_API_GOVERNANCE_CONTRACT_VERSION,
    invariantCount: OPS_API_GOVERNANCE_INVARIANTS.length,
    healthFieldCount: OPS_HEALTH_REQUIRED_KEYS.length,
    providerAuditColumnCount: OPS_PROVIDER_AUDIT_REQUIRED_COLUMNS.length,
    targetVersionPrefix: OPS_API_VERSION_POLICY.targetVersionPrefix,
  };
}

