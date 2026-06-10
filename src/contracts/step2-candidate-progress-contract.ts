export const STEP2_CANDIDATE_PROGRESS_CONTRACT_VERSION = "AT32-06.v1";

export type CandidatePhase = "queued" | "generating" | "finalizing" | "completed" | "failed";

export interface CandidateProgressInput {
  createdAt: number; // ms epoch
  startedAt?: number | null; // ms epoch
  completedAt?: number | null; // ms epoch
  failedAt?: number | null; // ms epoch
  totalSteps: number; // e.g. tiles/frames/subtasks count, >= 1
  completedSteps: number; // 0..totalSteps
}

export interface CandidateProgressResult {
  version: string;
  phase: CandidatePhase;
  percent: number; // 0..100, integer
  showGeneratingAnimation: boolean; // UI spinner/shimmer flag
  ariaLabel: string; // accessible label for screen readers
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Computes a user-facing progress model for Step2 candidate cards.
 * Contract rules (AT32-06):
 * - queued: no start time; percent=0; animation on; aria="排队中".
 * - generating: has startedAt and not finished; percent based on steps, clamped 5..99 to avoid 0% stall; animation on.
 * - finalizing: optional intermediate state when percent hits 100 without completedAt (rare); animation on with aria.
 * - completed: completedAt; percent=100; animation off; aria ends with "已完成".
 * - failed: failedAt; percent stays at last known or 100; animation off; aria includes "失败".
 */
export function computeCandidateProgress(input: CandidateProgressInput): CandidateProgressResult {
  if (!input || typeof input !== "object") throw new Error("input required");
  const total = Math.max(1, Math.floor(input.totalSteps || 0));
  const done = clamp(Math.floor(input.completedSteps || 0), 0, total);

  const hasStarted = !!input.startedAt && (!input.failedAt && !input.completedAt);
  const isCompleted = !!input.completedAt && !input.failedAt;
  const isFailed = !!input.failedAt;

  if (isFailed) {
    return {
      version: STEP2_CANDIDATE_PROGRESS_CONTRACT_VERSION,
      phase: "failed",
      percent: 100,
      showGeneratingAnimation: false,
      ariaLabel: "生成失败",
    };
  }

  if (isCompleted) {
    return {
      version: STEP2_CANDIDATE_PROGRESS_CONTRACT_VERSION,
      phase: "completed",
      percent: 100,
      showGeneratingAnimation: false,
      ariaLabel: "已完成",
    };
  }

  if (hasStarted) {
    const rawPct = Math.floor((done / total) * 100);
    const percent = clamp(rawPct, done > 0 ? 5 : 5, 99); // ensure visual movement
    return {
      version: STEP2_CANDIDATE_PROGRESS_CONTRACT_VERSION,
      phase: "generating",
      percent,
      showGeneratingAnimation: true,
      ariaLabel: `生成中… ${percent}%`,
    };
  }

  // queued
  return {
    version: STEP2_CANDIDATE_PROGRESS_CONTRACT_VERSION,
    phase: "queued",
    percent: 0,
    showGeneratingAnimation: true, // shimmer while waiting
    ariaLabel: "排队中",
  };
}

/**
 * Enforce monotonic non-decreasing percent for jittery backends.
 */
export function enforceMonotonicProgress(previousPercent: number, nextPercent: number): number {
  const prev = clamp(Math.floor(previousPercent || 0), 0, 100);
  const next = clamp(Math.floor(nextPercent || 0), 0, 100);
  return Math.max(prev, next);
}

export function assertStep2CandidateProgressContract(): { version: string; hasAnimationPolicy: boolean } {
  return { version: STEP2_CANDIDATE_PROGRESS_CONTRACT_VERSION, hasAnimationPolicy: true };
}

