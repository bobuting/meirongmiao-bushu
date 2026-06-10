export type Step1SelectionSource = "visual" | "analysis";

export type Step1SelectionStateTag = "idle" | "visual_selected" | "analysis_selected";

export type Step1SelectionEventType =
  | "select_visual"
  | "select_analysis"
  | "toggle_off"
  | "reset";

export interface Step1SelectionState {
  readonly tag: Step1SelectionStateTag;
  readonly selectedPlanId: string | null;
  readonly selectedSource: Step1SelectionSource | null;
}

export interface Step1SelectionEvent {
  readonly type: Step1SelectionEventType;
  readonly planId?: string;
}

export type Step1SelectionAllowedEventMap = Record<
  Step1SelectionStateTag,
  readonly Step1SelectionEventType[]
>;

export const STEP1_SELECTION_ALLOWED_EVENT_MAP: Step1SelectionAllowedEventMap = {
  idle: ["select_visual", "select_analysis", "reset"],
  visual_selected: ["select_analysis", "toggle_off", "reset"],
  analysis_selected: ["select_visual", "toggle_off", "reset"],
};

// Contract invariants for R1: state must always represent a single active source.
export const STEP1_SELECTION_INVARIANTS = [
  "At most one source can be selected at any time.",
  "When tag is idle, selectedSource and selectedPlanId must be null.",
  "When selectedSource exists, selectedPlanId must be non-empty.",
] as const;

export const STEP1_SELECTION_ILLEGAL_STATES = [
  "visual_selected and analysis_selected active at the same time",
  "idle with selectedSource not null",
  "idle with selectedPlanId not null",
  "selectedSource present with empty selectedPlanId",
] as const;

export function isStep1SelectionContractState(state: Step1SelectionState): boolean {
  if (state.tag === "idle") {
    return state.selectedSource === null && state.selectedPlanId === null;
  }

  if (!state.selectedSource || !state.selectedPlanId || state.selectedPlanId.trim().length === 0) {
    return false;
  }

  return (
    (state.tag === "visual_selected" && state.selectedSource === "visual") ||
    (state.tag === "analysis_selected" && state.selectedSource === "analysis")
  );
}

export const STEP1_SELECTION_CONTRACT_VERSION = "N23-R1-01.v1";
