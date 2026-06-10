export const DAY_MS = 24 * 60 * 60 * 1_000;
export const SNAPSHOT_SIZE_GUARD_CONTRACT_VERSION = "AT28-07.v1";

export const DEFAULT_WORKFLOW_STATE_SIZE_BUDGET = {
  maxProjectDataBytes: 128 * 1_024,
  maxPageContentSnapshotBytes: 64 * 1_024,
  maxStepStateBytes: 64 * 1_024,
  maxRecordBytes: 256 * 1_024,
} as const;

export type SnapshotRetentionCollection =
  | "reverseAttempts"
  | "reverseTraces"
  | "trendEntries"
  | "trendSyncJobs";

export interface SnapshotRetentionPolicy {
  readonly ttlMs: number;
  readonly maxItems: number;
  readonly sortBy: "updatedAt" | "createdAt";
}

export const DEFAULT_SNAPSHOT_RETENTION_POLICIES: Readonly<Record<SnapshotRetentionCollection, SnapshotRetentionPolicy>> =
  {
    reverseAttempts: {
      ttlMs: 7 * DAY_MS,
      maxItems: 1_500,
      sortBy: "updatedAt",
    },
    reverseTraces: {
      ttlMs: 7 * DAY_MS,
      maxItems: 500,
      sortBy: "updatedAt",
    },
    trendEntries: {
      ttlMs: 3 * DAY_MS,
      maxItems: 1_000,
      sortBy: "updatedAt",
    },
    trendSyncJobs: {
      ttlMs: 7 * DAY_MS,
      maxItems: 300,
      sortBy: "updatedAt",
    },
  };

export const SNAPSHOT_SIZE_GUARD_INVARIANTS = [
  "workflow-state projectData must fit inside a stable byte budget before entering snapshot persistence",
  "pageContentSnapshot and stepState are budgeted separately so resume-critical fields stay bounded",
  "ephemeral audit/trace/trend collections require both TTL and item-count caps",
  "capacity governance must fail closed on over-budget fields before full snapshot flush is attempted",
] as const;

export interface WorkflowStateSizeCandidate {
  readonly projectData?: unknown;
  readonly pageContentSnapshot?: unknown;
  readonly stepState?: unknown;
}

export type WorkflowStateBudgetViolation = "projectData" | "pageContentSnapshot" | "stepState" | "record";

export interface WorkflowStateBudgetReport {
  readonly projectDataBytes: number;
  readonly pageContentSnapshotBytes: number;
  readonly stepStateBytes: number;
  readonly recordBytes: number;
  readonly violations: readonly WorkflowStateBudgetViolation[];
}

export interface SnapshotRetentionRecord {
  readonly createdAt?: number | null;
  readonly updatedAt?: number | null;
}

export interface SnapshotRetentionResult<T> {
  readonly kept: T[];
  readonly expired: T[];
  readonly overCap: T[];
}

export function measureSerializedBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function evaluateWorkflowStateSizeBudget(
  candidate: WorkflowStateSizeCandidate,
  budget = DEFAULT_WORKFLOW_STATE_SIZE_BUDGET,
): WorkflowStateBudgetReport {
  const projectDataBytes = measureSerializedBytes(candidate.projectData ?? null);
  const pageContentSnapshotBytes = measureSerializedBytes(candidate.pageContentSnapshot ?? null);
  const stepStateBytes = measureSerializedBytes(candidate.stepState ?? null);
  const recordBytes = measureSerializedBytes({
    projectData: candidate.projectData ?? null,
    pageContentSnapshot: candidate.pageContentSnapshot ?? null,
    stepState: candidate.stepState ?? null,
  });

  const violations: WorkflowStateBudgetViolation[] = [];
  if (projectDataBytes > budget.maxProjectDataBytes) {
    violations.push("projectData");
  }
  if (pageContentSnapshotBytes > budget.maxPageContentSnapshotBytes) {
    violations.push("pageContentSnapshot");
  }
  if (stepStateBytes > budget.maxStepStateBytes) {
    violations.push("stepState");
  }
  if (recordBytes > budget.maxRecordBytes) {
    violations.push("record");
  }

  return {
    projectDataBytes,
    pageContentSnapshotBytes,
    stepStateBytes,
    recordBytes,
    violations,
  };
}

function resolveRetentionTimestamp(
  item: SnapshotRetentionRecord,
  sortBy: SnapshotRetentionPolicy["sortBy"],
): number {
  const preferred = sortBy === "updatedAt" ? item.updatedAt : item.createdAt;
  const fallback = sortBy === "updatedAt" ? item.createdAt : item.updatedAt;
  const raw = preferred ?? fallback ?? 0;
  const normalized = Number(raw);
  return Number.isFinite(normalized) ? normalized : 0;
}

export function applySnapshotRetentionPolicy<T extends SnapshotRetentionRecord>(
  items: readonly T[],
  now: number,
  policy: SnapshotRetentionPolicy,
): SnapshotRetentionResult<T> {
  const expired: T[] = [];
  const fresh: T[] = [];

  for (const item of items) {
    const timestamp = resolveRetentionTimestamp(item, policy.sortBy);
    if (timestamp > 0 && now - timestamp > policy.ttlMs) {
      expired.push(item);
      continue;
    }
    fresh.push(item);
  }

  const newestFirst = [...fresh].sort(
    (left, right) => resolveRetentionTimestamp(right, policy.sortBy) - resolveRetentionTimestamp(left, policy.sortBy),
  );
  const kept = newestFirst.slice(0, policy.maxItems);
  const overCap = newestFirst.slice(policy.maxItems);

  return {
    kept,
    expired,
    overCap,
  };
}
