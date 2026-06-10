export const RUNTIME_PLACEHOLDER_POLICY_CONTRACT_VERSION = "AT28-43.v1";

export type RuntimePolicyScope = "production" | "development" | "test";

export type ResourcePolicySource = "runtime" | "fixture";
export type RuntimePolicyTargetKind = "resource_url" | "external_endpoint";

export interface RuntimePolicyTarget {
  moduleId: string;
  kind: RuntimePolicyTargetKind;
  policyKey: string;
  notes: string;
}

export interface ResourceUrlPolicyInput {
  scope: RuntimePolicyScope;
  source: ResourcePolicySource;
  moduleId: string;
  policyKey: string;
  candidateUrl: string | null;
}

export interface ResourceUrlPolicyDecision {
  allow: boolean;
  reason:
    | "ok"
    | "empty"
    | "placeholder_forbidden"
    | "fixture_scope_missing"
    | "fixture_not_allowed"
    | "unknown_target";
}

export interface ExternalEndpointPolicyInput {
  scope: RuntimePolicyScope;
  moduleId: string;
  policyKey: string;
  endpoint: string | null;
}

export interface ExternalEndpointPolicyDecision {
  allow: boolean;
  reason:
    | "ok"
    | "empty"
    | "default_endpoint_forbidden"
    | "endpoint_not_configured"
    | "unknown_target";
}

export interface ResourceUrlPolicyPort {
  checkResourceUrl(input: ResourceUrlPolicyInput): ResourceUrlPolicyDecision;
}

export interface ExternalEndpointPolicyPort {
  checkEndpoint(input: ExternalEndpointPolicyInput): ExternalEndpointPolicyDecision;
}

export interface DevFixturePolicy {
  allowedScopes: readonly RuntimePolicyScope[];
  allowedResourceUrlHosts: readonly string[];
  allowedEndpointHosts: readonly string[];
  mustTagSourceAsFixture: boolean;
  notes: string;
}

export const RUNTIME_PLACEHOLDER_POLICY_TARGETS: readonly RuntimePolicyTarget[] = [
  {
    moduleId: "src/modules/storyboard-service.ts",
    kind: "resource_url",
    policyKey: "storyboard.variant_url",
    notes: "Storyboard frame variants must not persist mock.cdn URLs in production runtime paths.",
  },
  {
    moduleId: "src/modules/character-library-service.ts",
    kind: "resource_url",
    policyKey: "character_library.five_view_url",
    notes: "Generated character views must not persist placehold.co URLs in production runtime paths.",
  },
  {
    moduleId: "src/modules/douyin-integration-service.ts",
    kind: "external_endpoint",
    policyKey: "reverse_fetch.adapter_endpoint",
    notes: "Reverse adapter endpoints must come from explicit runtime configuration.",
  },
] as const;

export const RUNTIME_PLACEHOLDER_FORBIDDEN_URL_MARKERS = [
  "mock.cdn",
  "placehold.co",
  "cdn.example.com",
] as const;

export const RUNTIME_DEFAULT_ENDPOINT_MARKERS = [
  "http://127.0.0.1",
  "http://localhost",
  "https://example.com",
] as const;

export const RUNTIME_PLACEHOLDER_MIGRATION_CHECKLIST = [
  "AT28-44 must replace runtime placeholder URL fallbacks with explicit storage/runtime URL resolution.",
  "AT28-44 must isolate dev/test fixture URLs behind source=fixture and non-production scope gates.",
  "AT28-44 must remove implicit default external endpoints from reverse fetch adapters.",
  "AT28-44 must return explicit empty/error responses instead of silently emitting mock/default fallbacks.",
] as const;

export const RUNTIME_PLACEHOLDER_POLICY_INVARIANTS = [
  "Production runtime paths must not emit placeholder/demo URL markers.",
  "Business runtime paths must not fallback to implicit default external endpoints.",
  "Fixture-only URL/endpoint values are allowed only when scope is development/test and source is fixture.",
] as const;

export const DEV_FIXTURE_POLICY: DevFixturePolicy = {
  allowedScopes: ["development", "test"],
  allowedResourceUrlHosts: ["placehold.co", "cdn.example.com"],
  allowedEndpointHosts: ["localhost", "127.0.0.1"],
  mustTagSourceAsFixture: true,
  notes: "Fixture values stay available for tests/dev but must be isolated from production runtime paths.",
} as const;

function uniqueCount(values: readonly string[]): number {
  return new Set(values).size;
}

export function assertRuntimePlaceholderPolicyContract(): {
  version: string;
  targetCount: number;
  resourceTargetCount: number;
  endpointTargetCount: number;
  forbiddenUrlMarkerCount: number;
  defaultEndpointMarkerCount: number;
} {
  if (RUNTIME_PLACEHOLDER_POLICY_TARGETS.length < 4) {
    throw new Error("Runtime placeholder policy target set is incomplete.");
  }
  const requiredModules = new Set([
    "src/modules/storyboard-service.ts",
    "src/modules/character-library-service.ts",
    "src/modules/douyin-integration-service.ts",
  ]);
  const seenPolicyKeys = new Set<string>();
  for (const target of RUNTIME_PLACEHOLDER_POLICY_TARGETS) {
    requiredModules.delete(target.moduleId);
    if (seenPolicyKeys.has(target.policyKey)) {
      throw new Error(`Duplicate runtime placeholder policy key: ${target.policyKey}`);
    }
    seenPolicyKeys.add(target.policyKey);
  }
  if (requiredModules.size > 0) {
    throw new Error(`Missing runtime placeholder policy modules: ${[...requiredModules].join(", ")}`);
  }
  if (uniqueCount(RUNTIME_PLACEHOLDER_FORBIDDEN_URL_MARKERS) !== RUNTIME_PLACEHOLDER_FORBIDDEN_URL_MARKERS.length) {
    throw new Error("Duplicate forbidden URL marker.");
  }
  if (uniqueCount(RUNTIME_DEFAULT_ENDPOINT_MARKERS) !== RUNTIME_DEFAULT_ENDPOINT_MARKERS.length) {
    throw new Error("Duplicate default endpoint marker.");
  }
  if (DEV_FIXTURE_POLICY.allowedScopes.includes("production")) {
    throw new Error("Dev fixture policy must not allow production scope.");
  }
  if (DEV_FIXTURE_POLICY.mustTagSourceAsFixture !== true) {
    throw new Error("Dev fixture policy must require fixture source tagging.");
  }
  const resourceTargetCount = RUNTIME_PLACEHOLDER_POLICY_TARGETS.filter(
    (item) => item.kind === "resource_url",
  ).length;
  const endpointTargetCount = RUNTIME_PLACEHOLDER_POLICY_TARGETS.filter(
    (item) => item.kind === "external_endpoint",
  ).length;
  if (resourceTargetCount < 3) {
    throw new Error("Runtime placeholder policy requires at least 3 resource-url targets.");
  }
  if (endpointTargetCount < 1) {
    throw new Error("Runtime placeholder policy requires at least 1 external-endpoint target.");
  }

  return {
    version: RUNTIME_PLACEHOLDER_POLICY_CONTRACT_VERSION,
    targetCount: RUNTIME_PLACEHOLDER_POLICY_TARGETS.length,
    resourceTargetCount,
    endpointTargetCount,
    forbiddenUrlMarkerCount: RUNTIME_PLACEHOLDER_FORBIDDEN_URL_MARKERS.length,
    defaultEndpointMarkerCount: RUNTIME_DEFAULT_ENDPOINT_MARKERS.length,
  };
}
