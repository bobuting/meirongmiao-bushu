import type {
  Step3CandidateGenerationMode,
  Step3CandidateLockState,
  ScriptCandidateEntity,
} from "./step3-candidate-snapshot-contract.js";

export const STEP3_CANDIDATE_API_CONTRACT_VERSION = "AT45-04.v1";

export const STEP3_CANDIDATE_API_ERROR_CODES = [
  "STEP3_CANDIDATE_LOCKED",
  "STEP3_CANDIDATE_SNAPSHOT_NOT_FOUND",
  "STEP3_CANDIDATE_STALE_VERSION",
  "STEP3_CANDIDATE_NOT_ENOUGH_REAL_ITEMS",
  "HOT_TREND_REAL_DATA_REQUIRED",
] as const;

export type Step3CandidateApiErrorCode = (typeof STEP3_CANDIDATE_API_ERROR_CODES)[number];

export interface Step3CandidateSnapshotResponse {
  snapshotId: string;
  promptVersion: string;
  lockState: Step3CandidateLockState;
  lockVersion: number;
  generationMode: Step3CandidateGenerationMode;
  selectedCandidateId: string | null;
  confirmedCandidateId: string | null;
  items: ScriptCandidateEntity[];
}

export interface Step3CandidateSelectRequest {
  snapshotId: string;
  candidateId: string;
}

export interface Step3CandidateConfirmRequest extends Step3CandidateSelectRequest {
  expectedLockVersion: number;
  idempotencyKey?: string;
}

export interface Step3CandidateRewriteApplyRequest extends Step3CandidateSelectRequest {
  expectedLockVersion?: number;
}

export interface Step3CandidateAdminUnlockRequest {
  snapshotId: string;
  reason: string;
  idempotencyKey?: string;
}

export interface Step3CandidateApiErrorPayload {
  code: Step3CandidateApiErrorCode;
  message: string;
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length < 1) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function assertNonNegativeInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return value as number;
}

export function normalizeStep3CandidateSelectRequest(input: unknown): Step3CandidateSelectRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("select request must be an object");
  }
  const source = input as Record<string, unknown>;
  return {
    snapshotId: assertNonEmptyString(source.snapshotId, "snapshotId"),
    candidateId: assertNonEmptyString(source.candidateId, "candidateId"),
  };
}

export function normalizeStep3CandidateConfirmRequest(input: unknown): Step3CandidateConfirmRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("confirm request must be an object");
  }
  const source = input as Record<string, unknown>;
  return {
    snapshotId: assertNonEmptyString(source.snapshotId, "snapshotId"),
    candidateId: assertNonEmptyString(source.candidateId, "candidateId"),
    expectedLockVersion: assertNonNegativeInteger(source.expectedLockVersion, "expectedLockVersion"),
    idempotencyKey:
      source.idempotencyKey === undefined || source.idempotencyKey === null
        ? undefined
        : assertNonEmptyString(source.idempotencyKey, "idempotencyKey"),
  };
}

export function normalizeStep3CandidateRewriteApplyRequest(input: unknown): Step3CandidateRewriteApplyRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("rewrite-and-apply request must be an object");
  }
  const source = input as Record<string, unknown>;
  const expectedLockVersionRaw =
    source.expectedLockVersion === undefined || source.expectedLockVersion === null
      ? undefined
      : assertNonNegativeInteger(source.expectedLockVersion, "expectedLockVersion");
  return {
    snapshotId: assertNonEmptyString(source.snapshotId, "snapshotId"),
    candidateId: assertNonEmptyString(source.candidateId, "candidateId"),
    ...(expectedLockVersionRaw !== undefined ? { expectedLockVersion: expectedLockVersionRaw } : {}),
  };
}

export function normalizeStep3CandidateAdminUnlockRequest(input: unknown): Step3CandidateAdminUnlockRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("admin-unlock request must be an object");
  }
  const source = input as Record<string, unknown>;
  return {
    snapshotId: assertNonEmptyString(source.snapshotId, "snapshotId"),
    reason: assertNonEmptyString(source.reason, "reason"),
    idempotencyKey:
      source.idempotencyKey === undefined || source.idempotencyKey === null
        ? undefined
        : assertNonEmptyString(source.idempotencyKey, "idempotencyKey"),
  };
}

export function assertStep3CandidateApiContract(): {
  version: string;
  routeCount: number;
  errorCodeCount: number;
  supportsIdempotency: boolean;
} {
  return {
    version: STEP3_CANDIDATE_API_CONTRACT_VERSION,
    routeCount: 5,
    errorCodeCount: STEP3_CANDIDATE_API_ERROR_CODES.length,
    supportsIdempotency: true,
  };
}

