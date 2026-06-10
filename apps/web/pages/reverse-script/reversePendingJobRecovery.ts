import { ApiError, type ReverseParseV2JobDto } from "../../services/backendApi";

export type ReversePendingJobEntryPoint = "square" | "reverse-script";
export type ReversePendingJobInputMode = "douyin_url" | "video_url" | "upload_file";

export interface ReversePendingJobRecord {
  jobId: string;
  sourceHash: string;
  inputMode: ReversePendingJobInputMode;
  entryPoint: ReversePendingJobEntryPoint;
  projectId: string | null;
  startedAt: number;
}

const REVERSE_PENDING_JOB_LEGACY_STORAGE_KEY = "reverse.pending.job.v1";
const REVERSE_PENDING_JOBS_STORAGE_KEY = "reverse.pending.jobs.v2";
const REVERSE_PENDING_JOB_TTL_MS = 2 * 60 * 60 * 1000;

function normalizeSourceHash(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 1000);
}

function normalizePendingJobRecord(input: unknown): ReversePendingJobRecord | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const source = input as Record<string, unknown>;
  const jobId = String(source.jobId ?? "").trim();
  const sourceHash = normalizeSourceHash(String(source.sourceHash ?? ""));
  const inputMode =
    source.inputMode === "douyin_url" || source.inputMode === "video_url" || source.inputMode === "upload_file"
      ? source.inputMode
      : null;
  const entryPoint = source.entryPoint === "square" || source.entryPoint === "reverse-script" ? source.entryPoint : null;
  const projectId = typeof source.projectId === "string" && source.projectId.trim().length > 0 ? source.projectId.trim() : null;
  const startedAt = Number(source.startedAt);
  if (!jobId || !sourceHash || !inputMode || !entryPoint || !Number.isFinite(startedAt) || startedAt <= 0) {
    return null;
  }
  return {
    jobId,
    sourceHash,
    inputMode,
    entryPoint,
    projectId,
    startedAt: Math.floor(startedAt),
  };
}

export function buildReversePendingJobRecord(input: {
  jobId: string;
  source: string;
  inputMode: ReversePendingJobInputMode;
  entryPoint: ReversePendingJobEntryPoint;
  projectId?: string | null;
  startedAt?: number;
}): ReversePendingJobRecord {
  return {
    jobId: input.jobId.trim(),
    sourceHash: normalizeSourceHash(input.source),
    inputMode: input.inputMode,
    entryPoint: input.entryPoint,
    projectId: input.projectId?.trim() || null,
    startedAt: Math.floor(input.startedAt ?? Date.now()),
  };
}

export function clearLegacyPendingReverseJobStorage(): boolean {
  try {
    const existed = Boolean(localStorage.getItem(REVERSE_PENDING_JOB_LEGACY_STORAGE_KEY));
    if (existed) {
      localStorage.removeItem(REVERSE_PENDING_JOB_LEGACY_STORAGE_KEY);
    }
    return existed;
  } catch {
    return false;
  }
}

export function readPendingReverseJobs(entryPoint?: ReversePendingJobEntryPoint): ReversePendingJobRecord[] {
  try {
    const raw = localStorage.getItem(REVERSE_PENDING_JOBS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => normalizePendingJobRecord(item))
      .filter((item): item is ReversePendingJobRecord => Boolean(item))
      .filter((item) => (entryPoint ? item.entryPoint === entryPoint : true))
      .sort((left, right) => right.startedAt - left.startedAt);
  } catch {
    return [];
  }
}

function writePendingReverseJobs(items: ReversePendingJobRecord[]): void {
  try {
    localStorage.setItem(REVERSE_PENDING_JOBS_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore localStorage failures
  }
}

export function upsertPendingReverseJob(record: ReversePendingJobRecord): void {
  const current = readPendingReverseJobs();
  const next = [
    record,
    ...current.filter((item) => item.jobId !== record.jobId),
  ].sort((left, right) => right.startedAt - left.startedAt);
  writePendingReverseJobs(next);
}

export function removePendingReverseJob(jobId: string): void {
  const normalizedJobId = jobId.trim();
  if (!normalizedJobId) {
    return;
  }
  const current = readPendingReverseJobs();
  writePendingReverseJobs(current.filter((item) => item.jobId !== normalizedJobId));
}

export function pruneExpiredPendingReverseJobs(now = Date.now()): void {
  const current = readPendingReverseJobs();
  writePendingReverseJobs(current.filter((item) => now - item.startedAt <= REVERSE_PENDING_JOB_TTL_MS));
}

export async function recoverPendingReverseJobs(input: {
  entryPoint: ReversePendingJobEntryPoint;
  fetchJob: (jobId: string) => Promise<ReverseParseV2JobDto>;
  onCompleted: (job: ReversePendingJobRecord, result: NonNullable<ReverseParseV2JobDto["result"]>) => Promise<void> | void;
  onFailed: (job: ReversePendingJobRecord, error: NonNullable<ReverseParseV2JobDto["error"]>) => Promise<void> | void;
  onExpired?: (job: ReversePendingJobRecord) => Promise<void> | void;
}): Promise<boolean> {
  pruneExpiredPendingReverseJobs();
  const pendingJobs = readPendingReverseJobs(input.entryPoint);
  for (const pendingJob of pendingJobs) {
    let job: ReverseParseV2JobDto;
    try {
      job = await input.fetchJob(pendingJob.jobId);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 410)) {
        removePendingReverseJob(pendingJob.jobId);
        await input.onExpired?.(pendingJob);
        return true;
      }
      throw error;
    }
    if (job.status === "completed" && job.result) {
      removePendingReverseJob(pendingJob.jobId);
      await input.onCompleted(pendingJob, job.result);
      return true;
    }
    if (job.status === "failed" && job.error) {
      removePendingReverseJob(pendingJob.jobId);
      await input.onFailed(pendingJob, job.error);
      return true;
    }
    if (job.status === "expired") {
      removePendingReverseJob(pendingJob.jobId);
      await input.onExpired?.(pendingJob);
      return true;
    }
  }
  return false;
}
