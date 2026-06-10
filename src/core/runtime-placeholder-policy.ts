import {
  DEV_FIXTURE_POLICY,
  RUNTIME_DEFAULT_ENDPOINT_MARKERS,
  RUNTIME_PLACEHOLDER_FORBIDDEN_URL_MARKERS,
  RUNTIME_PLACEHOLDER_POLICY_TARGETS,
  type RuntimePolicyScope,
} from "../contracts/runtime-placeholder-policy-contract.js";

export interface ResolveResourceUrlByPolicyInput {
  moduleId: string;
  policyKey: string;
  candidateUrl?: string | null;
  fixtureFallbackUrl?: string | null;
  scope?: RuntimePolicyScope;
}

export interface ResolveEndpointByPolicyInput {
  moduleId: string;
  policyKey: string;
  endpoint?: string | null;
  scope?: RuntimePolicyScope;
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeHost(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function includesMarker(value: string, markers: readonly string[]): boolean {
  const lower = value.toLowerCase();
  return markers.some((marker) => lower.includes(marker.toLowerCase()));
}

function hasTarget(
  moduleId: string,
  kind: "resource_url" | "external_endpoint",
  policyKey: string,
): boolean {
  return RUNTIME_PLACEHOLDER_POLICY_TARGETS.some(
    (item) => item.moduleId === moduleId && item.kind === kind && item.policyKey === policyKey,
  );
}

export function resolveRuntimePolicyScope(nodeEnv: string | undefined = process.env.NODE_ENV): RuntimePolicyScope {
  const normalized = (nodeEnv ?? "").trim().toLowerCase();
  if (normalized === "production") {
    return "production";
  }
  if (normalized === "test") {
    return "test";
  }
  return "development";
}

export function resolveResourceUrlByPolicy(input: ResolveResourceUrlByPolicyInput): string | null {
  const scope = input.scope ?? resolveRuntimePolicyScope();
  if (!hasTarget(input.moduleId, "resource_url", input.policyKey)) {
    return null;
  }

  const candidate = normalizeText(input.candidateUrl);
  if (candidate) {
    if (scope === "production" && includesMarker(candidate, RUNTIME_PLACEHOLDER_FORBIDDEN_URL_MARKERS)) {
      return null;
    }
    return candidate;
  }

  const fixtureFallback = normalizeText(input.fixtureFallbackUrl);
  if (!fixtureFallback) {
    return null;
  }
  if (!DEV_FIXTURE_POLICY.allowedScopes.includes(scope)) {
    return null;
  }
  return fixtureFallback;
}

export function resolveEndpointByPolicy(input: ResolveEndpointByPolicyInput): string | null {
  const scope = input.scope ?? resolveRuntimePolicyScope();
  if (!hasTarget(input.moduleId, "external_endpoint", input.policyKey)) {
    return null;
  }
  const endpoint = normalizeText(input.endpoint);
  if (!endpoint) {
    return null;
  }
  if (scope === "production" && includesMarker(endpoint, RUNTIME_DEFAULT_ENDPOINT_MARKERS)) {
    return null;
  }
  const host = normalizeHost(endpoint);
  if (host && DEV_FIXTURE_POLICY.allowedEndpointHosts.includes(host) && scope === "production") {
    return null;
  }
  return endpoint;
}
