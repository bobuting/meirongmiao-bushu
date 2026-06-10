export type Step3ImportMode = "script_text" | "storyboard_frames";

export type Step3ImportTarget = "step1" | "step3" | "project_selector";

export type Step3ImportFallbackPolicy =
  | "allow_step1_bootstrap"
  | "require_project_selection";

export interface Step3ImportBoundaryDefinition {
  mode: Step3ImportMode;
  requiresProjectContext: boolean;
  targetWhenProjectContext: "step3";
  targetWhenNoProjectContext: Step3ImportTarget;
  fallbackPolicy: Step3ImportFallbackPolicy;
  preserveExistingScriptLibraryFlow: boolean;
  summary: string;
}

export interface Step3ImportBoundaryResolution {
  mode: Step3ImportMode;
  hasProjectContext: boolean;
  requiresProjectContext: boolean;
  resolvedTarget: Step3ImportTarget;
  fallbackPolicy: Step3ImportFallbackPolicy;
  allowImplicitStep1Bootstrap: boolean;
  preserveExistingScriptLibraryFlow: boolean;
}

export const STEP3_IMPORT_BOUNDARY_CONTRACT_VERSION = "AT29-01.v2";

export const STEP3_IMPORT_BOUNDARY_INVARIANTS = [
  "script_text imports keep the current Step1 bootstrap path when no project context exists.",
  "storyboard_frames imports must never silently fall back to step1 when project context is missing.",
  "both import modes may route directly to step3 when a project context already exists.",
  "future storyboard import UI must prompt project selection or creation before step3 hydration.",
] as const;

export const STEP3_IMPORT_BOUNDARIES: Record<Step3ImportMode, Step3ImportBoundaryDefinition> = {
  script_text: {
    mode: "script_text",
    requiresProjectContext: false,
    targetWhenProjectContext: "step3",
    targetWhenNoProjectContext: "step1",
    fallbackPolicy: "allow_step1_bootstrap",
    preserveExistingScriptLibraryFlow: true,
    summary: "Script library import may continue to bootstrap Step1 when no project is active.",
  },
  storyboard_frames: {
    mode: "storyboard_frames",
    requiresProjectContext: true,
    targetWhenProjectContext: "step3",
    targetWhenNoProjectContext: "project_selector",
    fallbackPolicy: "require_project_selection",
    preserveExistingScriptLibraryFlow: false,
    summary: "Storyboard imports require an existing project context and must not silently downgrade to Step1.",
  },
};

export function resolveStep3ImportBoundary(
  mode: Step3ImportMode,
  hasProjectContext: boolean,
): Step3ImportBoundaryResolution {
  const definition = STEP3_IMPORT_BOUNDARIES[mode];
  const resolvedTarget = hasProjectContext
    ? definition.targetWhenProjectContext
    : definition.targetWhenNoProjectContext;
  return {
    mode,
    hasProjectContext,
    requiresProjectContext: definition.requiresProjectContext,
    resolvedTarget,
    fallbackPolicy: definition.fallbackPolicy,
    allowImplicitStep1Bootstrap: resolvedTarget === "step1",
    preserveExistingScriptLibraryFlow: definition.preserveExistingScriptLibraryFlow,
  };
}
