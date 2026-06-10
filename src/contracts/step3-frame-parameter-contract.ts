export const STEP3_FRAME_PARAMETER_CONTRACT_VERSION = "AT41-04.v1";

export const STEP3_FRAME_PARAMETER_IDS = [
  "global-parameter-bar",
  "frame-override",
  "batch-control",
] as const;
export type Step3FrameParameterId = (typeof STEP3_FRAME_PARAMETER_IDS)[number];

export type Step3FrameRatio = "1:1" | "3:4" | "9:16" | "16:9";
export type Step3FrameResolution = "1k" | "2k" | "4k";

export interface Step3GlobalFrameParameters {
  ratio: Step3FrameRatio;
  resolution: Step3FrameResolution;
}

export interface Step3FrameParameterOverride {
  ratio?: Step3FrameRatio | null;
  resolution?: Step3FrameResolution | null;
}

export interface Step3ResolvedFrameParameters {
  ratio: Step3FrameRatio;
  resolution: Step3FrameResolution;
  ratioSource: "global" | "frame";
  resolutionSource: "global" | "frame";
}

export interface Step3FrameParameterEntry {
  parameterId: Step3FrameParameterId;
  currentOwnerFiles: readonly string[];
  targetFile: string;
  ownedSymbols: readonly string[];
  ownedConcerns: readonly string[];
  contractDependencies: readonly string[];
}

export interface Step3BatchGenerationFrameCandidate {
  id: string;
  hasImage: boolean;
  locked: boolean;
  completed: boolean;
}

export interface Step3BatchGenerationRuntimeState {
  running: boolean;
  queued: number;
  active: number;
  threadCount: number;
}

export const STEP3_FRAME_RATIO_OPTIONS: readonly Step3FrameRatio[] = ["9:16", "3:4", "1:1", "16:9"] as const;
export const STEP3_FRAME_RESOLUTION_OPTIONS: readonly Step3FrameResolution[] = ["1k", "2k", "4k"] as const;

export const STEP3_FRAME_PARAMETER_DEFAULTS: Step3GlobalFrameParameters = {
  ratio: "9:16",
  resolution: "2k",
};

export const STEP3_BATCH_THREAD_RANGE = {
  min: 1,
  max: 8,
  default: 2,
} as const;

export const STEP3_FRAME_PARAMETER_EXCLUDED_FIELDS = [
  "sharpness",
  "maskDataUrl",
] as const;

export const STEP3_FRAME_PARAMETER_INVARIANTS = [
  "Global ratio and resolution live in the Step3 bottom control bar and provide the default values for every frame.",
  "Per-frame overrides start unset; when unset they inherit global parameters, and when set they affect only the current frame.",
  "Only ratio and resolution participate in first-round per-frame overrides; sharpness and mask data stay outside the AT41-04 contract.",
  "Batch generation targets only frames that are missing an image, not locked, and not already completed.",
  "The Step3 batch button reads as batch-generate when nothing is active or queued, and flips to stop when any frame generation is active or queued.",
  "Thread count controls concurrent Step3 frame-image generation only and must not leak into Step4 video generation orchestration.",
  "Stop semantics are best-effort cancellation for active work and hard stop for queued work.",
] as const;

export const STEP3_FRAME_PARAMETER_PLAN: readonly Step3FrameParameterEntry[] = [
  {
    parameterId: "global-parameter-bar",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/ScriptEditor.tsx",
      "apps/web/pages/project-flow/step4GenerationSettings.ts",
    ],
    targetFile: "apps/web/pages/project-flow/step3-workspace/step3GlobalControlBar.tsx",
    ownedSymbols: [
      "STEP4_PREVIEW_RATIO_OPTIONS",
      "STEP4_PREVIEW_RESOLUTION_OPTIONS",
      "normalizeStep4PreviewRatio",
      "normalizeStep4PreviewResolution",
      "step4PreviewRatio",
      "step4PreviewResolution",
    ],
    ownedConcerns: [
      "global-ratio-setting",
      "global-resolution-setting",
      "bottom-bar-defaults",
      "serialized-global-parameter-state",
    ],
    contractDependencies: [
      "src/contracts/project-page-content-snapshot.ts",
      "src/contracts/project-flow-ui-shared-contract.ts",
    ],
  },
  {
    parameterId: "frame-override",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/ScriptEditor.tsx",
      "apps/web/pages/project-flow/step3-workspace/step3FrameOverrideController.ts",
    ],
    targetFile: "apps/web/pages/project-flow/step3-workspace/step3FrameOverrideController.ts",
    ownedSymbols: [
      "step4FrameOverrideSettings",
      "resolveStep3FrameOverrideViewModel",
      "patchStep3FrameOverrideState",
      "override.ratio",
      "override.resolution",
    ],
    ownedConcerns: [
      "per-frame-ratio-override",
      "per-frame-resolution-override",
      "inherit-global-when-unset",
      "frame-local-precedence",
    ],
    contractDependencies: [
      "src/contracts/project-page-content-snapshot.ts",
      "src/contracts/project-flow-ui-shared-contract.ts",
    ],
  },
  {
    parameterId: "batch-control",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/ScriptEditor.tsx",
      "apps/web/pages/project-flow/step3-workspace/step3BatchGenerationController.ts",
    ],
    targetFile: "apps/web/pages/project-flow/step3-workspace/step3BatchGenerationController.ts",
    ownedSymbols: [
      "step3BatchThreadCount",
      "step3BatchState",
      "createIdleStep3BatchGenerationState",
      "buildStep3BatchGenerationTargets",
    ],
    ownedConcerns: [
      "batch-generate-entry",
      "stop-all-running-and-queued-frames",
      "thread-count-normalization",
      "frame-target-filtering",
    ],
    contractDependencies: [
      "src/contracts/project-flow-ui-shared-contract.ts",
      "src/contracts/project-page-content-snapshot.ts",
    ],
  },
] as const;

export function normalizeStep3FrameRatio(value: unknown): Step3FrameRatio {
  return value === "1:1" || value === "3:4" || value === "9:16" || value === "16:9"
    ? value
    : STEP3_FRAME_PARAMETER_DEFAULTS.ratio;
}

export function normalizeStep3FrameResolution(value: unknown): Step3FrameResolution {
  return value === "1k" || value === "2k" || value === "4k"
    ? value
    : STEP3_FRAME_PARAMETER_DEFAULTS.resolution;
}

export function resolveStep3FrameParameters(
  globalInput: Partial<Step3GlobalFrameParameters> | null | undefined,
  overrideInput: Step3FrameParameterOverride | null | undefined,
): Step3ResolvedFrameParameters {
  const globalRatio = normalizeStep3FrameRatio(globalInput?.ratio);
  const globalResolution = normalizeStep3FrameResolution(globalInput?.resolution);
  const overrideRatio =
    overrideInput?.ratio === undefined || overrideInput?.ratio === null
      ? null
      : normalizeStep3FrameRatio(overrideInput.ratio);
  const overrideResolution =
    overrideInput?.resolution === undefined || overrideInput?.resolution === null
      ? null
      : normalizeStep3FrameResolution(overrideInput.resolution);
  return {
    ratio: overrideRatio ?? globalRatio,
    resolution: overrideResolution ?? globalResolution,
    ratioSource: overrideRatio ? "frame" : "global",
    resolutionSource: overrideResolution ? "frame" : "global",
  };
}

export function normalizeStep3BatchThreadCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return STEP3_BATCH_THREAD_RANGE.default;
  }
  return Math.max(STEP3_BATCH_THREAD_RANGE.min, Math.min(STEP3_BATCH_THREAD_RANGE.max, Math.round(parsed)));
}

export function resolveStep3BatchAction(state: Step3BatchGenerationRuntimeState): "batch-generate" | "stop" {
  return state.running || state.queued > 0 || state.active > 0 ? "stop" : "batch-generate";
}

export function buildStep3BatchGenerationTargets<TFrame extends Step3BatchGenerationFrameCandidate>(
  frames: readonly TFrame[],
): TFrame[] {
  return frames.filter((frame) => !frame.hasImage && !frame.locked && !frame.completed);
}

function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`${fieldName} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function assertParameterId(value: unknown, fieldName: string): Step3FrameParameterId {
  if (!STEP3_FRAME_PARAMETER_IDS.includes(value as Step3FrameParameterId)) {
    throw new Error(`${fieldName} must be global-parameter-bar|frame-override|batch-control`);
  }
  return value as Step3FrameParameterId;
}

export function normalizeStep3FrameParameterPlan(input: unknown): Step3FrameParameterEntry[] {
  if (!Array.isArray(input)) {
    throw new Error("step3 frame parameter plan must be an array");
  }
  const seen = new Set<Step3FrameParameterId>();
  return input.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`plan[${index}] must be an object`);
    }
    const record = item as Record<string, unknown>;
    const parameterId = assertParameterId(record.parameterId, `plan[${index}].parameterId`);
    if (seen.has(parameterId)) {
      throw new Error(`duplicate parameterId: ${parameterId}`);
    }
    seen.add(parameterId);
    const targetFile = typeof record.targetFile === "string" ? record.targetFile.trim() : "";
    if (!targetFile) {
      throw new Error(`plan[${index}].targetFile must be a non-empty string`);
    }
    return {
      parameterId,
      currentOwnerFiles: assertStringArray(record.currentOwnerFiles, `plan[${index}].currentOwnerFiles`),
      targetFile,
      ownedSymbols: assertStringArray(record.ownedSymbols, `plan[${index}].ownedSymbols`),
      ownedConcerns: assertStringArray(record.ownedConcerns, `plan[${index}].ownedConcerns`),
      contractDependencies: assertStringArray(record.contractDependencies, `plan[${index}].contractDependencies`),
    };
  });
}

export function assertStep3FrameParameterContract(): {
  version: string;
  parameterCount: number;
  ratioOptionCount: number;
  resolutionOptionCount: number;
  defaultThreadCount: number;
  excludedFieldCount: number;
} {
  return {
    version: STEP3_FRAME_PARAMETER_CONTRACT_VERSION,
    parameterCount: STEP3_FRAME_PARAMETER_PLAN.length,
    ratioOptionCount: STEP3_FRAME_RATIO_OPTIONS.length,
    resolutionOptionCount: STEP3_FRAME_RESOLUTION_OPTIONS.length,
    defaultThreadCount: STEP3_BATCH_THREAD_RANGE.default,
    excludedFieldCount: STEP3_FRAME_PARAMETER_EXCLUDED_FIELDS.length,
  };
}
