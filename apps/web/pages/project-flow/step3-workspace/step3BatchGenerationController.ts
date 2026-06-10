import {
  buildStep3BatchGenerationTargets,
  normalizeStep3BatchThreadCount,
  resolveStep3BatchAction,
  type Step3BatchGenerationFrameCandidate,
  type Step3BatchGenerationRuntimeState,
} from "../../../../../src/contracts/step3-frame-parameter-contract";

export interface Step3BatchGenerationViewState extends Step3BatchGenerationRuntimeState {
  targetCount: number;
  completedCount: number;
  failedCount: number;
  requestedStop: boolean;
}

export interface Step3BatchGenerationTarget extends Step3BatchGenerationFrameCandidate {
  id: string;
}

export function createIdleStep3BatchGenerationState(threadCount = 2): Step3BatchGenerationViewState {
  return {
    running: false,
    queued: 0,
    active: 0,
    threadCount: normalizeStep3BatchThreadCount(threadCount),
    targetCount: 0,
    completedCount: 0,
    failedCount: 0,
    requestedStop: false,
  };
}

export { buildStep3BatchGenerationTargets, normalizeStep3BatchThreadCount, resolveStep3BatchAction };
