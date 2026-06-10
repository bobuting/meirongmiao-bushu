// apps/web/pages/project-flow/step4-video-workspace/step4-utils.ts
/**
 * Step4 视频工作区工具函数
 */

import type { Step4VideoJobSegment } from "./step4VideoJobOrchestrator";
import { isStep4VideoAsset } from "./step4VideoJobOrchestrator";
import type { Step4VideoClipStatus } from "./step4VideoJobOrchestrator";

// ============================================================================
// 数组工具函数
// ============================================================================

export function dedupeSceneAssets(urls: string[], max = 4): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const raw of urls) {
    const value = raw.trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    next.push(value);
    if (next.length >= max) {
      break;
    }
  }
  return next;
}

export function moveArrayItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (typeof moved === "undefined") {
    return [...items];
  }
  next.splice(toIndex, 0, moved);
  return next;
}

export function reorderArrayByIndices<T>(items: readonly T[], orderedSourceIndices: readonly number[]): T[] {
  return orderedSourceIndices
    .map((sourceIndex) => items[sourceIndex])
    .filter((item): item is T => typeof item !== "undefined");
}

// ============================================================================
// 文本处理函数
// ============================================================================

export function stripPercentSuffix(label: string): string {
  return label.replace(/\s+\d+%$/, "").trim();
}

export function isStep4PendingProviderMessage(message: string): boolean {
  return /VIDEO_TASK_PENDING\s*\(running\)/i.test(message);
}

// ============================================================================
// 视频片段状态函数
// ============================================================================

export function buildStep4IdleClipStatuses(
  segments: Step4VideoJobSegment[],
  existing: Step4VideoClipStatus[],
): Step4VideoClipStatus[] {
  const existingById = new Map<number, Step4VideoClipStatus>(existing.map((item) => [item.id, item]));
  return segments.map((segment, index) => {
    const previous = existingById.get(index);
    const url = previous?.url?.trim() || "";
    const frameIndex = index + 1;
    const prompt =
      previous?.prompt?.trim() ||
      segment.videoCue?.trim() ||
      segment.visualCue?.trim() ||
      segment.content?.trim() ||
      `镜头 ${frameIndex} 视频片段`;
    if (url.length > 0 && isStep4VideoAsset(url)) {
      return {
        id: index,
        progress: 100,
        status: "completed" as const,
        prompt,
        url,
      };
    }
    return {
      id: index,
      progress: 0,
      status: "pending" as const,
      prompt,
      ...(url.length > 0 ? { url } : {}),
    };
  });
}

export function isSameStep4ClipStatuses(left: Step4VideoClipStatus[], right: Step4VideoClipStatus[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a.id !== b.id ||
      a.status !== b.status ||
      a.progress !== b.progress ||
      a.prompt !== b.prompt ||
      a.url !== b.url
    ) {
      return false;
    }
  }
  return true;
}

// ============================================================================
// 场景索引和变体函数
// ============================================================================

export function resolveStep4SceneIndexFromKey(rawKey: string, segmentCount: number): number | null {
  const trimmed = rawKey.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("frame:")) {
    const frameId = trimmed.slice(6).trim();
    if (!frameId) {
      return null;
    }
    return null; // frameId 需要额外映射
  }
  if (trimmed.startsWith("scene-fallback-")) {
    const suffix = trimmed.slice(15);
    const index = Number(suffix) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= segmentCount) {
      return null;
    }
    return index;
  }
  return null;
}

export function normalizeStep4SceneVariantsByScene(input: unknown, segmentCount: number): Record<number, string[]> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const source = input as Record<string, unknown>;
  const result: Record<number, string[]> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!Array.isArray(value)) {
      continue;
    }
    const sceneIndex = resolveStep4SceneIndexFromKey(key, segmentCount);
    if (sceneIndex === null) {
      continue;
    }
    const urls = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (urls.length > 0) {
      result[sceneIndex] = urls;
    }
  }
  return result;
}

export function normalizeStep4SelectedVariantByScene(input: unknown, segmentCount: number): Record<number, number> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const source = input as Record<string, unknown>;
  const result: Record<number, number> = {};
  for (const [key, value] of Object.entries(source)) {
    const sceneIndex = resolveStep4SceneIndexFromKey(key, segmentCount);
    if (sceneIndex === null) {
      continue;
    }
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 0) {
      continue;
    }
    result[sceneIndex] = numeric;
  }
  return result;
}

export function serializeStep4SceneVariantsByScene(input: Record<number, string[]>, segmentCount: number): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(input)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= segmentCount) {
      continue;
    }
    result[`scene-fallback-${index + 1}`] = value;
  }
  return result;
}

export function serializeStep4SelectedVariantByScene(input: Record<number, number>, segmentCount: number): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(input)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= segmentCount) {
      continue;
    }
    result[`scene-fallback-${index + 1}`] = value;
  }
  return result;
}

export function replacePrimarySceneVariant(currentVariants: string[], nextPrimaryUrl: string): string[] {
  const trimmed = nextPrimaryUrl.trim();
  if (!trimmed) {
    return currentVariants;
  }
  return [trimmed, ...currentVariants.filter((item) => item !== trimmed)];
}

// ============================================================================
// 配置归一化函数
// ============================================================================

export function normalizeAspectRatioCss(input: string | null | undefined): string {
  const raw = String(input ?? "").trim();
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!match) {
    return "9 / 16";
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "9 / 16";
  }
  return `${width} / ${height}`;
}

export function normalizeStep4ThreadCount(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    return 3;
  }
  return Math.max(1, Math.min(3, numeric));
}

// ============================================================================
// 场景排序函数
// ============================================================================

export function buildStep4SceneOrderKey(segment: Step4VideoJobSegment, fallbackIndex: number): string {
  const segmentRecord = segment as unknown as Record<string, unknown>;
  const parts = [
    typeof segmentRecord.title === "string" ? segmentRecord.title.trim() : "",
    typeof segment.videoCue === "string" ? segment.videoCue.trim() : "",
    typeof segment.visualCue === "string" ? segment.visualCue.trim() : "",
    typeof segment.content === "string" ? segment.content.trim() : "",
    typeof segmentRecord.sceneImageUrl === "string"
      ? String(segmentRecord.sceneImageUrl).trim()
      : "",
  ].filter((item) => item.length > 0);
  if (parts.length > 0) {
    // 添加 fallbackIndex 后缀确保唯一性（即使内容相同）
    return `${parts.join("::")}#${fallbackIndex}`;
  }
  return `scene-fallback-${fallbackIndex + 1}`;
}

export function normalizeStep4SceneOrderKeys(input: unknown, currentKeys: readonly string[]): string[] | null {
  if (!Array.isArray(input)) {
    return null;
  }
  const normalized = input
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  if (normalized.length !== currentKeys.length || currentKeys.length < 1) {
    return null;
  }
  const expectedCounts = new Map<string, number>();
  for (const key of currentKeys) {
    expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1);
  }
  for (const key of normalized) {
    const remaining = expectedCounts.get(key) ?? 0;
    if (remaining < 1) {
      return null;
    }
    expectedCounts.set(key, remaining - 1);
  }
  if ([...expectedCounts.values()].some((value) => value !== 0)) {
    return null;
  }
  return normalized;
}

export function resolveStep4SceneOrderIndices(
  currentKeys: readonly string[],
  targetKeys: readonly string[],
): number[] | null {
  if (currentKeys.length !== targetKeys.length) {
    return null;
  }
  const indexQueueByKey = new Map<string, number[]>();
  currentKeys.forEach((key, index) => {
    const queue = indexQueueByKey.get(key) ?? [];
    queue.push(index);
    indexQueueByKey.set(key, queue);
  });
  const orderedSourceIndices: number[] = [];
  for (const key of targetKeys) {
    const queue = indexQueueByKey.get(key);
    if (!queue || queue.length < 1) {
      return null;
    }
    const sourceIndex = queue.shift();
    if (!Number.isInteger(sourceIndex)) {
      return null;
    }
    orderedSourceIndices.push(sourceIndex as number);
  }
  return orderedSourceIndices;
}