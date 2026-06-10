export type ProjectBackgroundGenerationPhase = "idle" | "running" | "completed" | "failed";

export interface ProjectBackgroundGenerationError {
  code: string | null;
  message: string | null;
}

export interface ProjectBackgroundGenerationTaskState {
  taskId: string | null;
  phase: ProjectBackgroundGenerationPhase;
  progress: number;
  startedAt: number | null;
  updatedAt: number | null;
  resultRefs: string[];
  error: ProjectBackgroundGenerationError | null;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePhase(value: unknown, fallback: ProjectBackgroundGenerationPhase): ProjectBackgroundGenerationPhase {
  if (value === "idle" || value === "running" || value === "completed" || value === "failed") {
    return value;
  }
  return fallback;
}

function normalizeTimestamp(value: unknown, fallback: number | null): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizeProgress(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.floor(parsed)));
}

function normalizeResultRefs(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed || normalized.includes(trimmed)) {
      continue;
    }
    normalized.push(trimmed);
  }
  return normalized;
}

function normalizeError(
  value: unknown,
  phase: ProjectBackgroundGenerationPhase,
  fallback: ProjectBackgroundGenerationError | null,
): ProjectBackgroundGenerationError | null {
  if (phase !== "failed") {
    return null;
  }
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const code = normalizeNullableString(source?.code ?? null);
  const message = normalizeNullableString(source?.message ?? null);
  if (code || message) {
    return { code, message };
  }
  return fallback ?? null;
}

export function createEmptyProjectBackgroundGenerationTaskState(
  updatedAt: number | null = null,
): ProjectBackgroundGenerationTaskState {
  return {
    taskId: null,
    phase: "idle",
    progress: 0,
    startedAt: null,
    updatedAt,
    resultRefs: [],
    error: null,
  };
}

export function normalizeProjectBackgroundGenerationTaskState(input: {
  value: unknown;
  previous?: ProjectBackgroundGenerationTaskState | null;
}): ProjectBackgroundGenerationTaskState {
  const previous = input.previous ?? createEmptyProjectBackgroundGenerationTaskState(null);
  const source =
    input.value && typeof input.value === "object" && !Array.isArray(input.value)
      ? (input.value as Record<string, unknown>)
      : null;
  if (!source) {
    return { ...previous, resultRefs: [...previous.resultRefs] };
  }

  const phase = normalizePhase(source.phase, previous.phase);
  let progress = normalizeProgress(source.progress, previous.progress);
  if (phase === "idle") {
    progress = 0;
  }
  if (phase === "completed" && progress < 100) {
    progress = 100;
  }

  const resultRefs = phase === "idle" ? [] : normalizeResultRefs(source.resultRefs, previous.resultRefs);
  const taskId =
    phase === "idle"
      ? null
      : normalizeNullableString(source.taskId) ??
        (previous.phase === "running" || previous.phase === "completed" || previous.phase === "failed"
          ? previous.taskId
          : null);
  const startedAt =
    phase === "idle"
      ? null
      : normalizeTimestamp(
          source.startedAt,
          previous.phase === "running" || previous.phase === "completed" || previous.phase === "failed"
            ? previous.startedAt
            : null,
        );
  const updatedAt = normalizeTimestamp(source.updatedAt, previous.updatedAt);

  return {
    taskId,
    phase,
    progress,
    startedAt,
    updatedAt,
    resultRefs,
    error: normalizeError(source.error, phase, previous.phase === "failed" ? previous.error : null),
  };
}
