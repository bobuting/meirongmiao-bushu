import type { Step3CandidateApiErrorCode } from "./step3-candidate-api-contract.js";
import type { Step3CandidateGenerationMode } from "./step3-candidate-snapshot-contract.js";

export const STEP3_CANDIDATE_DEGRADATION_CONTRACT_VERSION = "AT45-05.v1";

export interface Step3CandidateSnapshotCreationGuardInput {
  strictRealOnly: boolean;
  requiredSnapshotSize: number;
  realCandidateCount: number;
  totalCandidateCount: number;
}

export interface Step3CandidateSnapshotCreationGuardResult {
  allowed: boolean;
  generationMode: Step3CandidateGenerationMode | null;
  errorCode: Step3CandidateApiErrorCode | null;
}

function assertNonNegativeInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return value as number;
}

export function evaluateStep3CandidateSnapshotCreationGuard(
  input: Step3CandidateSnapshotCreationGuardInput,
): Step3CandidateSnapshotCreationGuardResult {
  const requiredSnapshotSize = assertNonNegativeInteger(input.requiredSnapshotSize, "requiredSnapshotSize");
  const realCandidateCount = assertNonNegativeInteger(input.realCandidateCount, "realCandidateCount");
  const totalCandidateCount = assertNonNegativeInteger(input.totalCandidateCount, "totalCandidateCount");
  if (requiredSnapshotSize < 1) {
    throw new Error("requiredSnapshotSize must be >= 1");
  }
  if (realCandidateCount > totalCandidateCount) {
    throw new Error("realCandidateCount must be <= totalCandidateCount");
  }

  if (realCandidateCount >= requiredSnapshotSize) {
    return {
      allowed: true,
      generationMode: "real",
      errorCode: null,
    };
  }

  if (input.strictRealOnly) {
    return {
      allowed: false,
      generationMode: null,
      errorCode: "HOT_TREND_REAL_DATA_REQUIRED",
    };
  }

  if (totalCandidateCount >= requiredSnapshotSize) {
    return {
      allowed: true,
      generationMode: "degraded",
      errorCode: null,
    };
  }

  return {
    allowed: false,
    generationMode: null,
    errorCode: "STEP3_CANDIDATE_NOT_ENOUGH_REAL_ITEMS",
  };
}

export function resolveStep3CandidateConfirmGuardErrorCode(
  generationMode: Step3CandidateGenerationMode,
): Step3CandidateApiErrorCode | null {
  return generationMode === "real" ? null : "STEP3_CANDIDATE_NOT_ENOUGH_REAL_ITEMS";
}

export function assertStep3CandidateDegradationContract(): {
  version: string;
  strictModeDeniesDegradedSnapshot: boolean;
  degradedSnapshotCanConfirm: boolean;
} {
  return {
    version: STEP3_CANDIDATE_DEGRADATION_CONTRACT_VERSION,
    strictModeDeniesDegradedSnapshot: true,
    degradedSnapshotCanConfirm: false,
  };
}
