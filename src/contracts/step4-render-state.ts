export type Step4RenderState = "skeleton" | "loading" | "success" | "error";

export interface Step4RenderSnapshot {
  readonly hasStoryboardRequestStarted: boolean;
  readonly requestInFlight: boolean;
  readonly frameCount: number;
  readonly readyCount: number;
  readonly errorCount: number;
}

export const STEP4_RENDER_STATE_INVARIANTS = [
  "Step4 must never render blank shell before first storyboard request settles.",
  "When request is in-flight, render state must be loading regardless of current frame placeholders.",
  "At least one ready frame upgrades render state to success.",
  "If all known frames are error and none ready, render state is error.",
] as const;

export const STEP4_ALLOWED_RENDER_TRANSITIONS: Readonly<Record<Step4RenderState, readonly Step4RenderState[]>> = {
  skeleton: ["skeleton", "loading", "success", "error"],
  loading: ["loading", "success", "error"],
  success: ["success", "loading", "error"],
  error: ["error", "loading", "success"],
};

export function resolveStep4RenderState(snapshot: Step4RenderSnapshot): Step4RenderState {
  if (!snapshot.hasStoryboardRequestStarted) {
    return "skeleton";
  }
  if (snapshot.requestInFlight) {
    return "loading";
  }
  if (snapshot.readyCount > 0) {
    return "success";
  }
  if (snapshot.frameCount > 0 && snapshot.errorCount >= snapshot.frameCount) {
    return "error";
  }
  if (snapshot.errorCount > 0 && snapshot.readyCount === 0) {
    return "error";
  }
  return "skeleton";
}

export function isStep4RenderTransitionAllowed(from: Step4RenderState, to: Step4RenderState): boolean {
  return STEP4_ALLOWED_RENDER_TRANSITIONS[from].includes(to);
}

export const STEP4_RENDER_STATE_CONTRACT_VERSION = "N23-R8-01.v1";
