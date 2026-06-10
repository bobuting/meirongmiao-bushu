// apps/web/pages/shared/step2-utils.ts
/**
 * Step2 角色定妆公共工具函数
 * 被 CharacterSelection.tsx 和 ImageCharacterSelection.tsx 共享
 */

import { useState, useEffect } from "react";

// ============================================================================
// 类型定义
// ============================================================================

export type FiveViewSlotKey = "front" | "left" | "right" | "back" | "closeup";

export type Step2StyledGenerationTriggerSource = "panel-single" | "panel-batch" | "panel-confirm-fallback";

export type BackgroundGenerationPhase = "idle" | "running" | "completed" | "failed";

export interface BackgroundGenerationTaskState {
  taskId: string | null;
  phase: BackgroundGenerationPhase;
  progress: number;
  startedAt: number | null;
  updatedAt: number | null;
  resultRefs: string[];
  error: {
    code: string | null;
    message: string | null;
  } | null;
}

export interface Step2PersistedCandidatePreviewSelection {
  source: "generated" | "library" | null;
  generatedCandidateId: string | null;
  libraryCandidateId: string | null;
}

export interface CharacterOption {
  id: string;
  name: string;
  tags: string[];
  thumbnail: string;
  kind: "basic" | "image" | "video";
  status: "processing" | "ready";
  /** @deprecated 使用 fiveViewOssImageUrl 代替 */
  views: string[];
  fiveViewOssImageUrl?: string | null;
  /** 图片项目专用：角色关联表中的 generationSlot（1/2/3），用于匹配生成卡片槽位 */
  generationSlot?: number | null;
}

export interface ViewItem {
  id: string;
  label: string;
  imageUrl: string;
  viewKey?: FiveViewSlotKey;
}

export interface PreviewItem {
  id: string;
  label: string;
  imageUrl: string;
  viewKey?: FiveViewSlotKey;
  sourceImageUrl?: string;
}

// Step2FiveViewCandidateCard 类型从后端契约导入，不再本地定义
// 契约定义包含完整字段：sourceType, rowIndex, displayOrder, title, generationStatus, progressPercent
import type {
  Step2FiveViewCandidateCard as _ContractStep2FiveViewCandidateCard,
} from "../../../../src/contracts/step2-five-view-candidate-board-contract";
export type Step2FiveViewCandidateCard = _ContractStep2FiveViewCandidateCard;

export interface LibraryCharacterListItem {
  id: string;
  name: string;
  tags: string[];
  thumbnailUrl: string;
}

// ============================================================================
// 常量
// ============================================================================

export const VIEW_LABEL_BY_KEY: Record<FiveViewSlotKey, string> = {
  front: "正面",
  left: "左侧",
  right: "右侧",
  back: "背面",
  closeup: "特写",
};

export const FIVE_VIEW_SLOT_ORDER: FiveViewSlotKey[] = ["front", "left", "right", "back", "closeup"];
export const STEP2_V2_BACKGROUND_TASK_PREFIX = "step2-v2-generated";
export const STEP2_ALL_IN_ONE_PROGRESS_FALLBACK_DURATION_MS = 56_000;
export const STEP2_ALL_IN_ONE_PROGRESS_MIN_DURATION_MS = 24_000;
export const STEP2_ALL_IN_ONE_PROGRESS_MAX_DURATION_MS = 240_000;
export const STEP2_ALL_IN_ONE_PROGRESS_GENERATING_CAP_PERCENT = 78;

// ============================================================================
// 候选预览选择函数
// ============================================================================

export function isStep2StyledGenerationTriggerSource(value: unknown): value is Step2StyledGenerationTriggerSource {
  return value === "panel-single" || value === "panel-batch" || value === "panel-confirm-fallback";
}

export function resolveStep2PersistedCandidatePreviewSelection(
  projectData: Record<string, unknown> | null | undefined,
): Step2PersistedCandidatePreviewSelection {
  if (!projectData || typeof projectData !== "object" || Array.isArray(projectData)) {
    return {
      source: null,
      generatedCandidateId: null,
      libraryCandidateId: null,
    };
  }
  return {
    source:
      projectData.step2V2ActivePreviewSource === "generated" || projectData.step2V2ActivePreviewSource === "library"
        ? projectData.step2V2ActivePreviewSource
        : null,
    generatedCandidateId:
      typeof projectData.step2V2ActiveGeneratedCandidateId === "string"
        ? projectData.step2V2ActiveGeneratedCandidateId
        : null,
    libraryCandidateId:
      typeof projectData.step2V2ActiveLibraryCandidateId === "string"
        ? projectData.step2V2ActiveLibraryCandidateId
        : null,
  };
}

export function resolveStep2CandidateHasImage(
  candidate: Pick<Step2FiveViewCandidateCard, "closeupPreviewUrl" | "fiveViewAssetUrl"> | null | undefined,
): boolean {
  if (!candidate) {
    return false;
  }
  const imageUrl = (candidate.fiveViewAssetUrl ?? candidate.closeupPreviewUrl ?? "").trim();
  return imageUrl.length > 0;
}

// ============================================================================
// 文件处理函数
// ============================================================================

export const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });

// ============================================================================
// 加载海报帧
// ============================================================================

const STEP2_RUNTIME_PROGRESS_LOADING_POSTER_SRC = "/step2-progress-loading-poster.png";

let step2LoadingPosterFrameCache: string | null = null;
let step2LoadingPosterFramePromise: Promise<string> | null = null;

export function resolveStep2LoadingPosterFrameSrc(): Promise<string> {
  if (step2LoadingPosterFrameCache) {
    return Promise.resolve(step2LoadingPosterFrameCache);
  }
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(STEP2_RUNTIME_PROGRESS_LOADING_POSTER_SRC);
  }
  if (step2LoadingPosterFramePromise) {
    return step2LoadingPosterFramePromise;
  }

  step2LoadingPosterFramePromise = new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = 500;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, 300, 500);
        step2LoadingPosterFrameCache = canvas.toDataURL("image/jpeg", 0.85);
        resolve(step2LoadingPosterFrameCache);
      } else {
        resolve(STEP2_RUNTIME_PROGRESS_LOADING_POSTER_SRC);
      }
    };
    img.onerror = () => {
      resolve(STEP2_RUNTIME_PROGRESS_LOADING_POSTER_SRC);
    };
    img.src = STEP2_RUNTIME_PROGRESS_LOADING_POSTER_SRC;
  });

  void step2LoadingPosterFramePromise.finally(() => {
    step2LoadingPosterFramePromise = null;
  });

  return step2LoadingPosterFramePromise;
}

export function useStep2LoadingPosterFrameSrc(): string {
  const [src, setSrc] = useState<string>(step2LoadingPosterFrameCache ?? STEP2_RUNTIME_PROGRESS_LOADING_POSTER_SRC);

  useEffect(() => {
    let cancelled = false;
    void resolveStep2LoadingPosterFrameSrc().then((resolved) => {
      if (!cancelled && resolved) {
        setSrc(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return src;
}

// ============================================================================
// 进度计算函数
// ============================================================================

export function parseLogTimestampMs(logLine: string): number | null {
  const matched = String(logLine ?? "").match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+/);
  if (!matched?.[1]) {
    return null;
  }
  const parsed = Date.parse(matched[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function collectStep2AllInOneDurationSamplesMs(_presets: readonly CharacterOption[]): number[] {
  // viewSession 已移除，不再收集历史样本
  return [];
}

export function estimateStep2AllInOneDurationMs(durationSamplesMs: readonly number[]): number {
  if (durationSamplesMs.length < 1) {
    return STEP2_ALL_IN_ONE_PROGRESS_FALLBACK_DURATION_MS;
  }
  const recent = durationSamplesMs.slice(Math.max(0, durationSamplesMs.length - 20));
  const averageMs = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const expandedMs = Math.floor(averageMs * 2.4);
  return Math.max(
    STEP2_ALL_IN_ONE_PROGRESS_MIN_DURATION_MS,
    Math.min(STEP2_ALL_IN_ONE_PROGRESS_MAX_DURATION_MS, expandedMs),
  );
}

export function resolveStep2AllInOneSimulatedPercent(input: {
  nowMs: number;
  startedAtMs: number;
  estimatedDurationMs: number;
}): number {
  const elapsedMs = Math.max(0, input.nowMs - input.startedAtMs);
  const estimated = Math.max(STEP2_ALL_IN_ONE_PROGRESS_MIN_DURATION_MS, input.estimatedDurationMs);
  const ratio = Math.max(0, Math.min(1, elapsedMs / estimated));
  const percent = Math.floor(ratio * 100);
  return Math.max(1, Math.min(STEP2_ALL_IN_ONE_PROGRESS_GENERATING_CAP_PERCENT, percent));
}

// ============================================================================
// 候选 ID 解析
// ============================================================================

export function parseStep2GeneratedCandidateOrder(candidateId: string): 1 | 2 | 3 | null {
  const match = String(candidateId ?? "").match(/generated-(\d+)$/);
  if (!match?.[1]) {
    return null;
  }
  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3) {
    return null;
  }
  return parsed as 1 | 2 | 3;
}

// ============================================================================
// 进度标准化
// ============================================================================

export function clampTaskProgress(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(0, Math.min(100, Math.floor(fallback)));
  }
  return Math.max(0, Math.min(100, Math.floor(parsed)));
}

export function normalizeStep2BackendProgressSignal(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const normalized = Math.max(0, Math.min(100, Math.floor(parsed)));
  if (normalized <= 1 || normalized >= 100) {
    return null;
  }
  return normalized;
}

export function normalizeBackgroundGenerationTask(value: unknown): BackgroundGenerationTaskState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  const phase =
    source.phase === "idle" || source.phase === "running" || source.phase === "completed" || source.phase === "failed"
      ? source.phase
      : "idle";
  const taskId =
    typeof source.taskId === "string" && source.taskId.trim().length > 0
      ? source.taskId.trim()
      : null;
  const startedAt = Number(source.startedAt);
  const updatedAt = Number(source.updatedAt);
  const resultRefs = Array.isArray(source.resultRefs)
    ? Array.from(
        new Set(
          source.resultRefs
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter((item) => item.length > 0),
        ),
      )
    : [];
  const errorSource =
    source.error && typeof source.error === "object" && !Array.isArray(source.error)
      ? (source.error as Record<string, unknown>)
      : null;
  const baseProgress = clampTaskProgress(source.progress, 0);
  const progress = phase === "idle" ? 0 : phase === "completed" ? Math.max(100, baseProgress) : baseProgress;
  return {
    taskId: phase === "idle" ? null : taskId,
    phase,
    progress,
    startedAt: Number.isFinite(startedAt) && startedAt > 0 ? Math.floor(startedAt) : null,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.floor(updatedAt) : null,
    resultRefs: phase === "idle" ? [] : resultRefs,
    error:
      phase === "failed"
        ? {
            code:
              typeof errorSource?.code === "string" && errorSource.code.trim().length > 0
                ? errorSource.code.trim()
                : null,
            message:
              typeof errorSource?.message === "string" && errorSource.message.trim().length > 0
                ? errorSource.message.trim()
                : null,
          }
        : null,
  };
}

export function mergeBackgroundResultRefs(previous: readonly string[], next: readonly string[]): string[] {
  const merged = new Set<string>();
  for (const item of previous) {
    if (typeof item !== "string") {
      continue;
    }
    const normalized = item.trim();
    if (!normalized) {
      continue;
    }
    merged.add(normalized);
  }
  for (const item of next) {
    if (typeof item !== "string") {
      continue;
    }
    const normalized = item.trim();
    if (!normalized) {
      continue;
    }
    merged.add(normalized);
  }
  return [...merged];
}

export function isStep2GeneratedImageRef(value: string): boolean {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return false;
  }
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/storage/") ||
    trimmed.startsWith("data:image/")
  );
}

// ============================================================================
// 后台任务解析
// ============================================================================

export function resolveStep2V2BackgroundTaskCandidateId(task: BackgroundGenerationTaskState | null): string | null {
  if (!task || task.phase === "idle") {
    return null;
  }
  // 优先从 taskId 解析 candidateId，因为 taskId 是当前任务的准确标识
  // resultRefs 可能包含历史合并数据，多个卡位并行时会导致错误的 candidateId 匹配
  const matched = String(task.taskId ?? "").match(
    new RegExp(`^${STEP2_V2_BACKGROUND_TASK_PREFIX}-(.+)-\\d+$`),
  );
  if (matched?.[1]?.trim()) {
    return matched[1].trim();
  }
  // 回退到 resultRefs 中查找
  const fromRefs =
    task.resultRefs.find((item) => parseStep2GeneratedCandidateOrder(item) !== null) ??
    null;
  return fromRefs;
}

export function resolveStep2V2BackgroundTaskImageUrl(task: BackgroundGenerationTaskState | null): string | null {
  if (!task || task.phase === "idle") {
    return null;
  }
  const imageRef = task.resultRefs.find((item) => isStep2GeneratedImageRef(item)) ?? null;
  return imageRef?.trim() || null;
}

export function buildStep2V2BackgroundTaskId(candidateId: string): string {
  return `${STEP2_V2_BACKGROUND_TASK_PREFIX}-${candidateId}-${Date.now()}`;
}

// ============================================================================
// Per-candidate 后台任务 Map（取代单一 backgroundGenerationTask）
// ============================================================================

/**
 * 将旧的单一 backgroundGenerationTask 迁移为 per-candidate Map。
 * 新字段 backgroundGenerationTasks 以 candidateId 为 key 存储。
 */
export function migrateBackgroundGenerationTaskToMap(
  projectData: Record<string, unknown> | null | undefined,
): Record<string, BackgroundGenerationTaskState> {
  // 新格式已存在
  const newMap = projectData?.backgroundGenerationTasks;
  if (
    newMap &&
    typeof newMap === "object" &&
    !Array.isArray(newMap)
  ) {
    const result: Record<string, BackgroundGenerationTaskState> = {};
    for (const [key, value] of Object.entries(newMap as Record<string, unknown>)) {
      const normalized = normalizeBackgroundGenerationTask(value);
      if (normalized && normalized.phase !== "idle") {
        result[key] = normalized;
      }
    }
    return result;
  }
  // 旧格式迁移：将单一 task 转为以 candidateId 为 key 的 Map
  const singleTask = normalizeBackgroundGenerationTask(projectData?.backgroundGenerationTask);
  if (singleTask && singleTask.phase !== "idle") {
    const candidateId = resolveStep2V2BackgroundTaskCandidateId(singleTask);
    if (candidateId) {
      return { [candidateId]: singleTask };
    }
  }
  return {};
}

/**
 * 从 per-candidate Map 中获取指定 candidateId 的任务状态
 */
export function getBackgroundTaskForCandidate(
  tasksMap: Record<string, BackgroundGenerationTaskState>,
  candidateId: string,
): BackgroundGenerationTaskState | null {
  return normalizeBackgroundGenerationTask(tasksMap[candidateId]) ?? null;
}

// ============================================================================
// 视图槽位函数
// ============================================================================

export function inferSlotKey(label: string): FiveViewSlotKey | null {
  if (label.includes("特写")) return "closeup";
  if (label.includes("正")) return "front";
  if (label.includes("左")) return "left";
  if (label.includes("右")) return "right";
  if (label.includes("背")) return "back";
  return null;
}

export function normalizeSlotKey(viewKey?: string | null): FiveViewSlotKey | null {
  if (viewKey === "front" || viewKey === "left" || viewKey === "right" || viewKey === "back" || viewKey === "closeup") {
    return viewKey;
  }
  return null;
}

export function resolveSlotKey(item: { label?: string; viewKey?: string | null }): FiveViewSlotKey | null {
  const explicit = normalizeSlotKey(item.viewKey);
  if (explicit) {
    return explicit;
  }
  const label = String(item.label ?? "");
  return inferSlotKey(label);
}

export function normalizeFiveViewSlots(items: ViewItem[]): Record<FiveViewSlotKey, ViewItem | null> {
  const slots: Record<FiveViewSlotKey, ViewItem | null> = {
    closeup: null,
    front: null,
    left: null,
    right: null,
    back: null,
  };
  for (const item of items) {
    const key = resolveSlotKey(item);
    if (key && !slots[key]) {
      slots[key] = item;
    }
  }
  return slots;
}

export function normalizeViewItem(item: ViewItem): ViewItem {
  const resolvedViewKey = normalizeSlotKey(item.viewKey) ?? resolveSlotKey(item) ?? undefined;
  const resolvedLabel = item.label?.trim() || (resolvedViewKey ? VIEW_LABEL_BY_KEY[resolvedViewKey] : "视角");
  return {
    ...item,
    label: resolvedLabel,
    viewKey: resolvedViewKey,
  };
}

export function normalizePreviewItem(item: PreviewItem): PreviewItem {
  const resolvedViewKey = normalizeSlotKey(item.viewKey) ?? resolveSlotKey(item) ?? undefined;
  const resolvedLabel = item.label?.trim() || (resolvedViewKey ? VIEW_LABEL_BY_KEY[resolvedViewKey] : "视角");
  return {
    ...item,
    label: resolvedLabel,
    viewKey: resolvedViewKey,
  };
}

export function areNormalizedViewItemsEquivalent(left: ViewItem[], right: ViewItem[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => {
    const target = right[index];
    return (
      item.id === target?.id &&
      item.label === target?.label &&
      item.imageUrl === target?.imageUrl &&
      (item.viewKey ?? null) === (target?.viewKey ?? null)
    );
  });
}

export function areNormalizedPreviewItemsEquivalent(left: PreviewItem[], right: PreviewItem[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => {
    const target = right[index];
    return (
      item.id === target?.id &&
      item.label === target?.label &&
      item.imageUrl === target?.imageUrl &&
      (item.sourceImageUrl ?? null) === (target?.sourceImageUrl ?? null) &&
      (item.viewKey ?? null) === (target?.viewKey ?? null)
    );
  });
}