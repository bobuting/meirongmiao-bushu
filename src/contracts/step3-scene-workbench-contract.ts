import { STEP3_IMPORT_BOUNDARY_CONTRACT_VERSION } from "./step3-import-boundary.js";
import {
  STEP3_MINIMAL_SEAM_CONTRACT_VERSION,
  STEP3_MINIMAL_SEAM_IDS,
} from "./step3-minimal-seam-contract.js";
import { STEP3_STRUCTURED_SCRIPT_CARD_CONTRACT_VERSION } from "./step3-structured-script-card-contract.js";

export const STEP3_SCENE_WORKBENCH_CONTRACT_VERSION = "AT34-03.v1";
export const STEP3_SCENE_POOL_MAX_SCENES = 8;
export const STEP3_IMPORT_SANITIZER_BLOCKED_PREFIXES = ["- 链接:", "- 评估:", "- 原因:", "链接：", "评估：", "原因："] as const;

export const STEP3_SCENE_WORKBENCH_REUSED_CONTRACTS = [
  STEP3_MINIMAL_SEAM_CONTRACT_VERSION,
  STEP3_IMPORT_BOUNDARY_CONTRACT_VERSION,
  STEP3_STRUCTURED_SCRIPT_CARD_CONTRACT_VERSION,
] as const;

export const STEP3_SCENE_WORKBENCH_INVARIANTS = [
  "AT34 Step3 work must reuse the AT35 minimal seams instead of reopening ScriptEditor.tsx as the owner of import, reference, scene-pool, or card mapping logic.",
  "Full-script import must strip ranking metadata lines such as links, evaluation, and reasons before the text enters Step3 segmentation.",
  "Step3 character references must prioritize the confirmed Step2 role result over legacy Step2 view fallbacks.",
  "A single script may expose at most eight canonical scenes, and frame-level variants must reference the canonical pool instead of creating one prompt per frame by default.",
  "Stitch card UI consumes a serializable view-model that keeps role refs, selected scene ref, main prompt, and scene reinforce prompt separate.",
] as const;

export interface Step3CanonicalScenePool {
  scenes: Array<{
    id: string;
    label: string;
    prompt: string;
    linkedFrameIndexes: number[];
  }>;
}

export interface Step3StoryCardViewModelContract {
  roleReferenceImages: string[];
  selectedSceneImageUrl: string | null;
  mainVisualPrompt: string;
  sceneReinforcePrompt: string;
}

export interface Step3WorkbenchOwnerEntry {
  seamId: (typeof STEP3_MINIMAL_SEAM_IDS)[number];
  currentOwnerFiles: readonly string[];
  targetFile: string | null;
  ownedSymbols: readonly string[];
}

export const STEP3_SCENE_WORKBENCH_OWNER_PLAN: readonly Step3WorkbenchOwnerEntry[] = [
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
  },
  {
    seamId: "scene-pool",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/step3ReferenceSelection.ts",
      "apps/web/pages/project-flow/ScriptEditor.tsx",
    ],
    targetFile: null,
    ownedSymbols: ["buildStep3SceneReferencePool", "syncStep3SegmentReferenceSelections"],
  },
  {
    seamId: "card-adapter",
    currentOwnerFiles: [
      "src/contracts/step3-structured-script-card-contract.ts",
      "apps/web/pages/project-flow/step3StructuredScriptCardViewModel.ts",
    ],
    targetFile: null,
    ownedSymbols: ["normalizeStep3StructuredScriptCard", "buildStep3StructuredScriptCardViewModel"],
  },
] as const;

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function assertPositiveInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return value as number;
}

export function normalizeStep3CanonicalScenePool(input: unknown): Step3CanonicalScenePool {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("scene pool must be an object");
  }
  const record = input as Record<string, unknown>;
  if (!Array.isArray(record.scenes)) {
    throw new Error("scene pool must include scenes array");
  }
  if (record.scenes.length > STEP3_SCENE_POOL_MAX_SCENES) {
    throw new Error(`scene pool must not exceed ${STEP3_SCENE_POOL_MAX_SCENES} scenes`);
  }
  return {
    scenes: record.scenes.map((scene, index) => {
      if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
        throw new Error(`scenes[${index}] must be an object`);
      }
      const entry = scene as Record<string, unknown>;
      if (!Array.isArray(entry.linkedFrameIndexes)) {
        throw new Error(`scenes[${index}].linkedFrameIndexes must be an array`);
      }
      return {
        id: assertNonEmptyString(entry.id, `scenes[${index}].id`),
        label: assertNonEmptyString(entry.label, `scenes[${index}].label`),
        prompt: assertNonEmptyString(entry.prompt, `scenes[${index}].prompt`),
        linkedFrameIndexes: entry.linkedFrameIndexes.map((value, frameIndex) =>
          assertPositiveInteger(value, `scenes[${index}].linkedFrameIndexes[${frameIndex}]`),
        ),
      };
    }),
  };
}

export function assertStep3SceneWorkbenchContract(): {
  version: string;
  reusedContractCount: number;
  seamOwnerCount: number;
  maxCanonicalScenes: number;
  blockedImportPrefixCount: number;
} {
  return {
    version: STEP3_SCENE_WORKBENCH_CONTRACT_VERSION,
    reusedContractCount: STEP3_SCENE_WORKBENCH_REUSED_CONTRACTS.length,
    seamOwnerCount: STEP3_SCENE_WORKBENCH_OWNER_PLAN.length,
    maxCanonicalScenes: STEP3_SCENE_POOL_MAX_SCENES,
    blockedImportPrefixCount: STEP3_IMPORT_SANITIZER_BLOCKED_PREFIXES.length,
  };
}
