import type { ProviderRouteKey } from "./provider-route-policy-contract.js";
import { parseProviderRouteKey } from "./provider-route-policy-contract.js";

export const PROVIDER_EXECUTION_GOVERNANCE_CONTRACT_VERSION = "AT28-31.v1";

export const PROVIDER_EXECUTION_GOVERNANCE_STATUS = ["pending", "success", "error", "timeout"] as const;

export type ProviderExecutionGovernanceStatus = (typeof PROVIDER_EXECUTION_GOVERNANCE_STATUS)[number];

export interface ProviderExecutionLease {
  readonly routeKey: ProviderRouteKey;
  readonly requestId: string;
  readonly acquiredAt: number;
  readonly maxConcurrency: number;
}

export interface ProviderExecutionLimiter {
  acquire(input: {
    routeKey: ProviderRouteKey;
    requestId: string;
    maxConcurrency: number;
  }): Promise<ProviderExecutionLease>;
  release(lease: ProviderExecutionLease): void;
}

export interface ProviderExecutionTimeoutDecision {
  readonly routeKey: ProviderRouteKey;
  readonly timeoutMs: number;
  readonly slowRequestThresholdMs: number;
}

export interface TimeoutPolicyPort {
  resolveTimeout(routeKey: ProviderRouteKey): ProviderExecutionTimeoutDecision;
}

export interface ProviderRouteAuditRecord {
  readonly providerId: string;
  readonly routeKey: ProviderRouteKey;
  readonly requestId: string;
  readonly status: ProviderExecutionGovernanceStatus;
  readonly latencyMs: number;
  readonly timeoutMs: number;
  readonly slowRequest: boolean;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly requestSummary: string | null;
  readonly responseSummary: string | null;
  readonly createdAt: number;
}

export interface RouteAuditSink {
  writeRouteAudit(record: ProviderRouteAuditRecord): void | Promise<void>;
}

export interface ProviderExecutionGovernanceConfigInput {
  maxConcurrency?: unknown;
  timeoutMs?: unknown;
  slowRequestThresholdMs?: unknown;
}

export interface ProviderExecutionGovernanceConfig {
  maxConcurrency: number;
  timeoutMs: number;
  slowRequestThresholdMs: number;
}

export const PROVIDER_EXECUTION_GOVERNANCE_DEFAULTS: ProviderExecutionGovernanceConfig = {
  maxConcurrency: 4,
  timeoutMs: 20_000,
  slowRequestThresholdMs: 15_000,
};

function normalizeFiniteInteger(value: unknown, fallback: number): number {
  if (value === undefined || value === null) {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.floor(numeric);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeSummary(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeProviderExecutionGovernanceConfig(
  input: ProviderExecutionGovernanceConfigInput,
): ProviderExecutionGovernanceConfig {
  const maxConcurrency = clamp(
    normalizeFiniteInteger(input.maxConcurrency, PROVIDER_EXECUTION_GOVERNANCE_DEFAULTS.maxConcurrency),
    1,
    16,
  );
  const timeoutMs = clamp(
    normalizeFiniteInteger(input.timeoutMs, PROVIDER_EXECUTION_GOVERNANCE_DEFAULTS.timeoutMs),
    1_000,
    240_000,
  );
  const requestedSlowThreshold = clamp(
    normalizeFiniteInteger(
      input.slowRequestThresholdMs,
      PROVIDER_EXECUTION_GOVERNANCE_DEFAULTS.slowRequestThresholdMs,
    ),
    1_000,
    timeoutMs,
  );
  return {
    maxConcurrency,
    timeoutMs,
    slowRequestThresholdMs: requestedSlowThreshold,
  };
}

export function parseProviderExecutionRouteKey(value: unknown): ProviderRouteKey {
  return parseProviderRouteKey(value);
}

export interface ProviderRouteAuditRecordInput {
  providerId: string;
  routeKey: ProviderRouteKey;
  requestId: string;
  status: ProviderExecutionGovernanceStatus;
  latencyMs: number;
  timeoutMs: number;
  slowRequestThresholdMs: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  requestSummary?: string | null;
  responseSummary?: string | null;
  createdAt?: number;
}

export function createProviderRouteAuditRecord(input: ProviderRouteAuditRecordInput): ProviderRouteAuditRecord {
  const normalizedLatencyMs = Math.max(0, Math.floor(Number(input.latencyMs)));
  const normalizedTimeoutMs = Math.max(1_000, Math.floor(Number(input.timeoutMs)));
  const normalizedSlowThresholdMs = clamp(
    Math.floor(Number(input.slowRequestThresholdMs)),
    1_000,
    normalizedTimeoutMs,
  );
  return {
    providerId: input.providerId.trim(),
    routeKey: input.routeKey,
    requestId: input.requestId.trim(),
    status: input.status,
    latencyMs: normalizedLatencyMs,
    timeoutMs: normalizedTimeoutMs,
    slowRequest: normalizedLatencyMs >= normalizedSlowThresholdMs,
    errorCode: normalizeSummary(input.errorCode),
    errorMessage: normalizeSummary(input.errorMessage),
    requestSummary: normalizeSummary(input.requestSummary),
    responseSummary: normalizeSummary(input.responseSummary),
    createdAt:
      typeof input.createdAt === "number" && Number.isFinite(input.createdAt)
        ? Math.floor(input.createdAt)
        : Date.now(),
  };
}

export function assertProviderExecutionGovernanceContract(): {
  version: string;
  statusCount: number;
  defaults: ProviderExecutionGovernanceConfig;
} {
  if (new Set(PROVIDER_EXECUTION_GOVERNANCE_STATUS).size !== PROVIDER_EXECUTION_GOVERNANCE_STATUS.length) {
    throw new Error("provider execution governance status values must remain unique");
  }
  const defaults = normalizeProviderExecutionGovernanceConfig(PROVIDER_EXECUTION_GOVERNANCE_DEFAULTS);
  return {
    version: PROVIDER_EXECUTION_GOVERNANCE_CONTRACT_VERSION,
    statusCount: PROVIDER_EXECUTION_GOVERNANCE_STATUS.length,
    defaults,
  };
}
