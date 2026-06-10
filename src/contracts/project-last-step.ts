export type ProjectFlowStep = 1 | 2 | 3 | 4 | 5;

export interface ProjectLastStepEvent {
  readonly step: number;
  readonly trigger: "route-enter" | "resume-open" | "manual-jump";
}

const MIN_STEP = 1;
const MAX_STEP = 5;

export const PROJECT_LAST_STEP_CONTRACT_VERSION = "N23-R9-01.v2";

export const PROJECT_LAST_STEP_INVARIANTS = [
  "Project last_step must be updated on every route enter event.",
  "last_step stores the latest visited step, not the maximum historical step.",
  "New main-chain route-enter writes must be clamped into canonical Step1-Step5 before persistence.",
] as const;

export function normalizeProjectFlowStep(step: number | null | undefined, fallback: ProjectFlowStep = 1): ProjectFlowStep {
  if (!Number.isFinite(step)) {
    return fallback;
  }
  const normalized = Math.floor(Number(step));
  if (normalized <= MIN_STEP) {
    return MIN_STEP;
  }
  if (normalized >= MAX_STEP) {
    return MAX_STEP;
  }
  return normalized as ProjectFlowStep;
}

export function resolveProjectLastStep(_current: number | null | undefined, event: ProjectLastStepEvent): ProjectFlowStep {
  return normalizeProjectFlowStep(event.step, 1);
}
