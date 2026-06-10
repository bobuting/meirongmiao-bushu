import {
  STEP2_GENERATION_DEPENDENCY_CONTRACT_VERSION,
  STEP2_GENERATION_DEPENDENCY_INVARIANTS,
} from "./step2-generation-dependency-contract.js";
import {
  STEP2_RUNTIME_PROGRESS_CONTRACT_VERSION,
  STEP2_RUNTIME_PROGRESS_INVARIANTS,
} from "./step2-runtime-progress-contract.js";

export const STEP2_GENERATION_RUNTIME_CONTRACT_VERSION = "AT34-02.v1";
export const STEP2_STAGGERED_BATCH_DEFAULT_INTERVAL_MS = 1000;
export const STEP2_STAGGERED_BATCH_DEFAULT_MAX_IN_FLIGHT = 3;
export const STEP2_DRESSEDUP5IN1_STORAGE_ROOT = "dressedup5in1/0";

export const STEP2_GENERATION_RUNTIME_REUSED_CONTRACTS = [
  STEP2_GENERATION_DEPENDENCY_CONTRACT_VERSION,
  STEP2_RUNTIME_PROGRESS_CONTRACT_VERSION,
] as const;

export const STEP2_GENERATION_RUNTIME_INVARIANTS = [
  "AT34 Step2 residual work must reuse AT35 dependency gating and AT35 runtime progress instead of redefining them.",
  "Batch kickoff policy is 1s staggered start with max 3 in-flight cards by default, instead of strict serial await chaining.",
  "Single-card retry must move to the card top-right surface and stay candidate-scoped, not active-preview scoped only.",
  "New persistence writes must converge on dressedup5in1/0 semantics while legacy dressedup reads remain compatible until migration completes.",
] as const;

export interface Step2ResidualRuntimeOwner {
  seamId: "scheduler" | "card-retry" | "persistence";
  currentOwnerFiles: readonly string[];
  targetFile: string;
  ownedSymbols: readonly string[];
  reusesContracts: readonly string[];
}

export const STEP2_GENERATION_RUNTIME_OWNER_PLAN: readonly Step2ResidualRuntimeOwner[] = [
  {
    seamId: "scheduler",
    currentOwnerFiles: ["apps/web/pages/project-flow/CharacterSelection.tsx"],
    targetFile: "apps/web/pages/project-flow/step2GenerationScheduler.ts",
    ownedSymbols: ["handleStep2V2BatchGenerate", "runStep2V2CandidateGeneration"],
    reusesContracts: [STEP2_GENERATION_DEPENDENCY_CONTRACT_VERSION, STEP2_RUNTIME_PROGRESS_CONTRACT_VERSION],
  },
  {
    seamId: "card-retry",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/CharacterSelection.tsx",
      "apps/web/pages/project-flow/step2V2CandidatePreviewPanel.tsx",
    ],
    targetFile: "apps/web/pages/project-flow/step2CandidateCardActions.ts",
    ownedSymbols: ["handleStep2V2RegenerateCandidate", "step2-v2-regenerate-button"],
    reusesContracts: [STEP2_RUNTIME_PROGRESS_CONTRACT_VERSION],
  },
  {
    seamId: "persistence",
    currentOwnerFiles: ["src/app.ts"],
    targetFile: "src/modules/step2-dressedup-storage-prefix.ts",
    ownedSymbols: ["buildDressedupViewStoragePrefix"],
    reusesContracts: [STEP2_GENERATION_DEPENDENCY_CONTRACT_VERSION],
  },
] as const;

export interface Step2StaggeredBatchPlan {
  candidateIds: string[];
  kickoffIntervalMs: number;
  maxInFlight: number;
  storagePrefix: string;
}

function normalizeStringList(values: readonly string[], fieldName: string): string[] {
  const normalized = [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
  if (normalized.length === 0) {
    throw new Error(`${fieldName} must include at least one candidate id`);
  }
  return normalized;
}

function normalizePositiveInteger(value: number | null | undefined, fallback: number, fieldName: string): number {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return value;
}

export function createStep2StaggeredBatchPlan(input: {
  candidateIds: readonly string[];
  kickoffIntervalMs?: number | null;
  maxInFlight?: number | null;
  storagePrefix?: string | null;
}): Step2StaggeredBatchPlan {
  const candidateIds = normalizeStringList(input.candidateIds, "candidateIds");
  const storagePrefix = input.storagePrefix?.trim() || STEP2_DRESSEDUP5IN1_STORAGE_ROOT;
  if (storagePrefix.length < 1) {
    throw new Error("storagePrefix must be a non-empty string");
  }
  return {
    candidateIds,
    kickoffIntervalMs: normalizePositiveInteger(
      input.kickoffIntervalMs,
      STEP2_STAGGERED_BATCH_DEFAULT_INTERVAL_MS,
      "kickoffIntervalMs",
    ),
    maxInFlight: normalizePositiveInteger(
      input.maxInFlight,
      STEP2_STAGGERED_BATCH_DEFAULT_MAX_IN_FLIGHT,
      "maxInFlight",
    ),
    storagePrefix,
  };
}

export function assertStep2GenerationRuntimeContract(): {
  version: string;
  ownerCount: number;
  defaultKickoffIntervalMs: number;
  defaultMaxInFlight: number;
  storageRoot: string;
  reusedContractCount: number;
  dependencyInvariantCount: number;
  runtimeProgressInvariantCount: number;
} {
  return {
    version: STEP2_GENERATION_RUNTIME_CONTRACT_VERSION,
    ownerCount: STEP2_GENERATION_RUNTIME_OWNER_PLAN.length,
    defaultKickoffIntervalMs: STEP2_STAGGERED_BATCH_DEFAULT_INTERVAL_MS,
    defaultMaxInFlight: STEP2_STAGGERED_BATCH_DEFAULT_MAX_IN_FLIGHT,
    storageRoot: STEP2_DRESSEDUP5IN1_STORAGE_ROOT,
    reusedContractCount: STEP2_GENERATION_RUNTIME_REUSED_CONTRACTS.length,
    dependencyInvariantCount: STEP2_GENERATION_DEPENDENCY_INVARIANTS.length,
    runtimeProgressInvariantCount: STEP2_RUNTIME_PROGRESS_INVARIANTS.length,
  };
}
