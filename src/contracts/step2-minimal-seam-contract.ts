export const STEP2_MINIMAL_SEAM_CONTRACT_VERSION = "AT35-02.v1";

export const STEP2_MINIMAL_SEAM_IDS = ["scheduler", "runtime-state", "card-actions"] as const;
export type Step2MinimalSeamId = (typeof STEP2_MINIMAL_SEAM_IDS)[number];

export interface Step2MinimalSeamEntry {
  seamId: Step2MinimalSeamId;
  currentOwnerFiles: readonly string[];
  targetFile: string | null;
  ownedSymbols: readonly string[];
  ownedConcerns: readonly string[];
  contractDependencies: readonly string[];
}

export const STEP2_MINIMAL_SEAM_PAGE_REMAINING_RESPONSIBILITIES = [
  "route orchestration",
  "query wiring",
  "modal visibility",
  "react effect subscriptions",
] as const;

export const STEP2_MINIMAL_SEAM_INVARIANTS = [
  "CharacterSelection.tsx may keep page orchestration but must not remain the long-term owner of scheduler/card action branching.",
  "Runtime-state seam stays pure and must not import React hooks or backendApi.",
  "Card preview panel stays presentational and never calls backendApi directly.",
  "AT35 business tasks that touch progress, prompt wiring, or candidate actions must land on a named seam instead of re-expanding page-local closures.",
] as const;

export const STEP2_MINIMAL_SEAM_PLAN: readonly Step2MinimalSeamEntry[] = [
  {
    seamId: "scheduler",
    currentOwnerFiles: ["apps/web/pages/project-flow/CharacterSelection.tsx"],
    targetFile: "apps/web/pages/project-flow/step2GenerationScheduler.ts",
    ownedSymbols: [
      "handleRegenerateStyledViewBySlot",
      "handleGenerateAllStyledViews",
      "handleStopStyledGeneration",
    ],
    ownedConcerns: [
      "manual-trigger-whitelist",
      "batch-kickoff-order",
      "background-task-progress-hints",
      "stop-signal-bridge",
    ],
    contractDependencies: [
      "src/contracts/step2-candidate-progress-contract.ts",
      "src/contracts/step2-candidate-runtime-state.ts",
    ],
  },
  {
    seamId: "runtime-state",
    currentOwnerFiles: [
      "src/contracts/step2-candidate-progress-contract.ts",
      "src/contracts/step2-candidate-runtime-state.ts",
      "apps/web/pages/project-flow/step2CharacterSelectionController.ts",
    ],
    targetFile: null,
    ownedSymbols: [
      "computeCandidateProgress",
      "enforceMonotonicProgress",
      "resolveStep2CandidateRuntimeState",
      "resolveStep2CharacterSelectionControllerState",
    ],
    ownedConcerns: [
      "monotonic-progress-policy",
      "loading-video-bridge",
      "step2-step3-gate-derived-state",
      "next-button-readiness",
    ],
    contractDependencies: [
      "src/contracts/step2-five-view-candidate-board-contract.ts",
      "src/contracts/step2-regenerate-confirm-contract.ts",
    ],
  },
  {
    seamId: "card-actions",
    currentOwnerFiles: [
      "src/contracts/step2-regenerate-confirm-contract.ts",
      "apps/web/pages/project-flow/step2V2CandidatePreviewPanel.tsx",
      "apps/web/pages/project-flow/CharacterSelection.tsx",
    ],
    targetFile: "apps/web/pages/project-flow/step2CandidateCardActions.ts",
    ownedSymbols: [
      "createStep2RegenerateRequest",
      "resolveStep2Step3GateState",
      "handleStep2V2RegenerateCandidate",
      "handleStep2V2ConfirmCandidate",
    ],
    ownedConcerns: [
      "prompt-override-branching",
      "candidate-panel-action-wiring",
      "confirm-unlocks-step3",
      "candidate-level-regenerate-entry",
    ],
    contractDependencies: [
      "src/contracts/step2-five-view-candidate-board-contract.ts",
      "src/contracts/step2-regenerate-confirm-contract.ts",
    ],
  },
] as const;

function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`${fieldName} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function assertSeamId(value: unknown, fieldName: string): Step2MinimalSeamId {
  if (!STEP2_MINIMAL_SEAM_IDS.includes(value as Step2MinimalSeamId)) {
    throw new Error(`${fieldName} must be scheduler|runtime-state|card-actions`);
  }
  return value as Step2MinimalSeamId;
}

export function normalizeStep2MinimalSeamPlan(input: unknown): Step2MinimalSeamEntry[] {
  if (!Array.isArray(input)) {
    throw new Error("step2 minimal seam plan must be an array");
  }

  const seen = new Set<Step2MinimalSeamId>();
  return input.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`plan[${index}] must be an object`);
    }
    const record = item as Record<string, unknown>;
    const seamId = assertSeamId(record.seamId, `plan[${index}].seamId`);
    if (seen.has(seamId)) {
      throw new Error(`duplicate seamId: ${seamId}`);
    }
    seen.add(seamId);

    const targetFile = record.targetFile;
    if (targetFile !== null && (typeof targetFile !== "string" || targetFile.trim().length === 0)) {
      throw new Error(`plan[${index}].targetFile must be a non-empty string or null`);
    }

    return {
      seamId,
      currentOwnerFiles: assertStringArray(record.currentOwnerFiles, `plan[${index}].currentOwnerFiles`),
      targetFile: targetFile === null ? null : targetFile.trim(),
      ownedSymbols: assertStringArray(record.ownedSymbols, `plan[${index}].ownedSymbols`),
      ownedConcerns: assertStringArray(record.ownedConcerns, `plan[${index}].ownedConcerns`),
      contractDependencies: assertStringArray(record.contractDependencies, `plan[${index}].contractDependencies`),
    };
  });
}

export function getStep2MinimalSeamEntry(seamId: Step2MinimalSeamId): Step2MinimalSeamEntry {
  const entry = STEP2_MINIMAL_SEAM_PLAN.find((item) => item.seamId === seamId);
  if (!entry) {
    throw new Error(`unknown seamId: ${seamId}`);
  }
  return entry;
}

export function assertStep2MinimalSeamContract(): {
  version: string;
  seamCount: number;
  extractionTargetCount: number;
  hotspotFile: string;
  runtimeAlreadySeamed: boolean;
} {
  return {
    version: STEP2_MINIMAL_SEAM_CONTRACT_VERSION,
    seamCount: STEP2_MINIMAL_SEAM_PLAN.length,
    extractionTargetCount: STEP2_MINIMAL_SEAM_PLAN.filter((entry) => entry.targetFile).length,
    hotspotFile: "apps/web/pages/project-flow/CharacterSelection.tsx",
    runtimeAlreadySeamed: getStep2MinimalSeamEntry("runtime-state").targetFile === null,
  };
}
