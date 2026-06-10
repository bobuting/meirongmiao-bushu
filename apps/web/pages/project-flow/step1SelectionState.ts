export type Step1OutfitSource = "visual" | "analysis";

export interface Step1SelectionState {
  readonly selectedOutfitId: string | null;
  readonly selectedOutfitSource: Step1OutfitSource | null;
}

export type Step1SelectionTransitionKind = "select" | "switch_source" | "unselect";

export interface Step1SelectionTransitionResult {
  readonly kind: Step1SelectionTransitionKind;
  readonly nextState: Step1SelectionState;
}

export function normalizeStep1SelectionState(state: Step1SelectionState): Step1SelectionState {
  if (!state.selectedOutfitId) {
    return { selectedOutfitId: null, selectedOutfitSource: null };
  }

  return {
    selectedOutfitId: state.selectedOutfitId,
    selectedOutfitSource: state.selectedOutfitSource ?? "visual",
  };
}

export function resolveStep1SelectionTransition(
  currentState: Step1SelectionState,
  targetOutfitId: string,
  targetSource: Step1OutfitSource,
): Step1SelectionTransitionResult {
  const current = normalizeStep1SelectionState(currentState);

  if (current.selectedOutfitId === targetOutfitId) {
    if (current.selectedOutfitSource === targetSource) {
      return {
        kind: "unselect",
        nextState: { selectedOutfitId: null, selectedOutfitSource: null },
      };
    }

    if (current.selectedOutfitSource !== null) {
      return {
        kind: "switch_source",
        nextState: { selectedOutfitId: targetOutfitId, selectedOutfitSource: targetSource },
      };
    }
  }

  return {
    kind: "select",
    nextState: { selectedOutfitId: targetOutfitId, selectedOutfitSource: targetSource },
  };
}
