export const STEP3_MINIMAL_SEAM_CONTRACT_VERSION = "AT35-03.v1";

export const STEP3_MINIMAL_SEAM_IDS = [
  "import-sanitizer",
  "reference-bridge",
  "scene-pool",
  "card-adapter",
] as const;
export type Step3MinimalSeamId = (typeof STEP3_MINIMAL_SEAM_IDS)[number];

export interface Step3MinimalSeamEntry {
  seamId: Step3MinimalSeamId;
  currentOwnerFiles: readonly string[];
  targetFile: string | null;
  ownedSymbols: readonly string[];
  ownedConcerns: readonly string[];
  contractDependencies: readonly string[];
}

export const STEP3_MINIMAL_SEAM_PAGE_REMAINING_RESPONSIBILITIES = [
  "route orchestration",
  "query wiring",
  "editor-local draft state",
  "mutation lifecycle and feedback",
] as const;

export const STEP3_MINIMAL_SEAM_INVARIANTS = [
  "ScriptEditor.tsx may keep workbench orchestration but must not become the long-term owner of import sanitization, reference derivation, scene pool shaping, or candidate card mapping.",
  "Import-sanitizer seam must stay pure and must not call backendApi directly.",
  "Reference-bridge and scene-pool seams must exchange serializable DTOs only.",
  "Card-adapter seam must normalize candidate cards before Step3 UI renders them.",
  "AT35 Step3 business tasks must extend the named seam files instead of re-expanding page-local branches inside ScriptEditor.tsx.",
] as const;

export const STEP3_MINIMAL_SEAM_PLAN: readonly Step3MinimalSeamEntry[] = [
  {
    seamId: "import-sanitizer",
    currentOwnerFiles: [
      "src/contracts/step3-import-boundary.ts",
      "apps/web/pages/project-flow/step3ImportedStoryboard.ts",
      "apps/web/pages/project-flow/step3WorkflowSyncSanitizer.ts",
    ],
    targetFile: null,
    ownedSymbols: [
      "resolveStep3ImportBoundary",
      "hydrateImportedStoryboardSegments",
      "sanitizeStep3SegmentsForWorkflowTransition",
      "sanitizeProjectDataForWorkflowStateSync",
    ],
    ownedConcerns: [
      "import-target-resolution",
      "storyboard-segment-hydration",
      "workflow-sync-sanitization",
      "legacy-import-boundary",
    ],
    contractDependencies: [
      "src/contracts/reverse-storyboard-report.ts",
      "src/contracts/media-url-safety.ts",
    ],
  },
  {
    seamId: "reference-bridge",
    currentOwnerFiles: [
      "apps/web/utils/step3CharacterReferencePool.ts",
      "apps/web/pages/project-flow/ScriptEditor.tsx",
    ],
    targetFile: "apps/web/utils/step3CharacterReferenceBridge.ts",
    ownedSymbols: [
      "normalizeStep3CharacterReferencePool",
      "buildStep3CharacterReferencePoolFromStep2Views",
      "step3CharacterReferencePool",
    ],
    ownedConcerns: [
      "step2-to-step3-character-handoff",
      "persisted-reference-pool-normalization",
      "confirmed-dressedup-angle-priority",
    ],
    contractDependencies: [
      "src/contracts/project-flow-ui-shared-contract.ts",
      "apps/web/types.ts",
    ],
  },
  {
    seamId: "scene-pool",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/step3ReferenceSelection.ts",
      "apps/web/pages/project-flow/ScriptEditor.tsx",
    ],
    targetFile: null,
    ownedSymbols: [
      "buildStep3SceneReferencePool",
      "syncStep3SegmentReferenceSelections",
      "attachSceneSelectionsToSegments",
      "sceneReferencePool",
    ],
    ownedConcerns: [
      "selected-scene-only-pool",
      "segment-selection-synchronization",
      "legacy-safe-scene-fallback",
      "scene-sidebar-input-shaping",
    ],
    contractDependencies: [
      "src/contracts/project-flow-ui-shared-contract.ts",
      "apps/web/pages/project-flow/step3FrameLayout.ts",
    ],
  },
  {
    seamId: "card-adapter",
    currentOwnerFiles: [
      "src/contracts/step3-structured-script-card-contract.ts",
      "apps/web/pages/project-flow/step3StructuredScriptCardViewModel.ts",
      "apps/web/pages/project-flow/step3ScriptCandidatesController.ts",
    ],
    targetFile: null,
    ownedSymbols: [
      "normalizeStep3StructuredScriptCard",
      "buildStep3StructuredScriptCardViewModel",
      "buildStep3ScriptCandidates",
      "buildStep3ScriptClueTitle",
    ],
    ownedConcerns: [
      "structured-card-field-shape",
      "candidate-card-view-model",
      "script-source-labeling",
      "candidate-list-merge-order",
    ],
    contractDependencies: [
      "src/contracts/step3-structured-script-card-contract.ts",
      "apps/web/pages/project-flow/step3StructuredScriptCandidatesPanel.tsx",
    ],
  },
] as const;

function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`${fieldName} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function assertSeamId(value: unknown, fieldName: string): Step3MinimalSeamId {
  if (!STEP3_MINIMAL_SEAM_IDS.includes(value as Step3MinimalSeamId)) {
    throw new Error(`${fieldName} must be import-sanitizer|reference-bridge|scene-pool|card-adapter`);
  }
  return value as Step3MinimalSeamId;
}

export function normalizeStep3MinimalSeamPlan(input: unknown): Step3MinimalSeamEntry[] {
  if (!Array.isArray(input)) {
    throw new Error("step3 minimal seam plan must be an array");
  }

  const seen = new Set<Step3MinimalSeamId>();
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
    let normalizedTargetFile: string | null;
    if (targetFile === null) {
      normalizedTargetFile = null;
    } else if (typeof targetFile === "string") {
      normalizedTargetFile = targetFile.trim();
      if (normalizedTargetFile.length === 0) {
        throw new Error(`plan[${index}].targetFile must be a non-empty string or null`);
      }
    } else {
      throw new Error(`plan[${index}].targetFile must be a non-empty string or null`);
    }

    return {
      seamId,
      currentOwnerFiles: assertStringArray(record.currentOwnerFiles, `plan[${index}].currentOwnerFiles`),
      targetFile: normalizedTargetFile,
      ownedSymbols: assertStringArray(record.ownedSymbols, `plan[${index}].ownedSymbols`),
      ownedConcerns: assertStringArray(record.ownedConcerns, `plan[${index}].ownedConcerns`),
      contractDependencies: assertStringArray(record.contractDependencies, `plan[${index}].contractDependencies`),
    };
  });
}

export function getStep3MinimalSeamEntry(seamId: Step3MinimalSeamId): Step3MinimalSeamEntry {
  const entry = STEP3_MINIMAL_SEAM_PLAN.find((item) => item.seamId === seamId);
  if (!entry) {
    throw new Error(`unknown seamId: ${seamId}`);
  }
  return entry;
}

export function assertStep3MinimalSeamContract(): {
  version: string;
  seamCount: number;
  extractionTargetCount: number;
  hotspotFile: string;
  existingSeamCount: number;
} {
  return {
    version: STEP3_MINIMAL_SEAM_CONTRACT_VERSION,
    seamCount: STEP3_MINIMAL_SEAM_PLAN.length,
    extractionTargetCount: STEP3_MINIMAL_SEAM_PLAN.filter((entry) => entry.targetFile).length,
    hotspotFile: "apps/web/pages/project-flow/ScriptEditor.tsx",
    existingSeamCount: STEP3_MINIMAL_SEAM_PLAN.filter((entry) => entry.targetFile === null).length,
  };
}
