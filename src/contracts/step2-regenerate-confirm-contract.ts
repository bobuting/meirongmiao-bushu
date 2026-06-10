export const STEP2_REGENERATE_CONFIRM_CONTRACT_VERSION = "AT30-08.v1";

export const STEP2_REGENERATE_MODES = ["rerender", "img2img"] as const;
export type Step2RegenerateMode = (typeof STEP2_REGENERATE_MODES)[number];

export interface Step2RegenerateRequest {
  candidateId: string;
  promptOverride: string;
  mode: Step2RegenerateMode;
}

export interface Step2ConfirmResult {
  candidateId: string;
  step3Unlocked: boolean;
}

export interface Step2Step3GateState {
  confirmedCandidateId: string | null;
  step3Locked: boolean;
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value;
}

export function createStep2RegenerateRequest(input: {
  candidateId: string;
  promptOverride: string;
  mode: Step2RegenerateMode;
}): Step2RegenerateRequest {
  const candidateId = assertNonEmptyString(input.candidateId, "candidateId");
  if (typeof input.promptOverride !== "string") {
    throw new Error("promptOverride must be a string");
  }
  if (!STEP2_REGENERATE_MODES.includes(input.mode)) {
    throw new Error("mode must be rerender or img2img");
  }

  const promptOverride = input.promptOverride.trim();
  if (promptOverride.length === 0 && input.mode !== "rerender") {
    throw new Error("empty promptOverride must use rerender mode");
  }
  if (promptOverride.length > 0 && input.mode !== "img2img") {
    throw new Error("non-empty promptOverride must use img2img mode");
  }

  return {
    candidateId,
    promptOverride,
    mode: input.mode,
  };
}

export function resolveStep2Step3GateState(confirmedCandidateId: string | null): Step2Step3GateState {
  const validId =
    typeof confirmedCandidateId === "string" && confirmedCandidateId.trim().length > 0
      ? confirmedCandidateId
      : null;
  return {
    confirmedCandidateId: validId,
    step3Locked: validId === null,
  };
}

export function createStep2ConfirmResult(candidateId: string): Step2ConfirmResult {
  return {
    candidateId: assertNonEmptyString(candidateId, "candidateId"),
    step3Unlocked: true,
  };
}

export function assertStep2RegenerateConfirmContract(): {
  version: string;
  modeCount: number;
  requiresBranchSplit: boolean;
  requiresConfirmBeforeStep3: boolean;
} {
  return {
    version: STEP2_REGENERATE_CONFIRM_CONTRACT_VERSION,
    modeCount: STEP2_REGENERATE_MODES.length,
    requiresBranchSplit: true,
    requiresConfirmBeforeStep3: true,
  };
}
