import type { ReverseStoryboardLibraryRecordDto } from "../../../../src/contracts/reverse-storyboard-library-api";
import type { ReverseStoryboardSourceType } from "../../../../src/contracts/reverse-storyboard-report";

export interface ReverseStoryboardLibraryCardViewModel {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly preview: string;
  readonly tags: readonly string[];
  readonly sourceType: ReverseStoryboardSourceType;
  readonly sourceLabel: string;
  readonly sourceValue: string | null;
  readonly frameCount: number;
  readonly frameTitles: readonly string[];
  readonly currentVersion: number;
  readonly createdDate: string;
  readonly filterTimestamp: number;
  readonly updatedAt: number;
  readonly updatedDate: string;
  readonly durationLabel: string;
  readonly optimizationSuggestions: readonly string[];
}

function pickStoryboardSummary(item: ReverseStoryboardLibraryRecordDto): string {
  const candidates = [
    item.summary,
    item.report.intro,
    ...item.report.sections.map((section) => section.content),
    item.content,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate ?? "").trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return "暂无分镜摘要";
}

function formatDate(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return date.toISOString().slice(0, 10);
}

function formatDuration(duration: number | null | undefined): string {
  if (!Number.isFinite(Number(duration)) || Number(duration) <= 0) {
    return "--";
  }
  return `${Math.round(Number(duration))}s`;
}

function parseHotTrendUpdatedAtTag(tags: readonly string[]): string | null {
  const tag = tags.find((item) => item.startsWith("hottrend-updated-at:"));
  if (!tag) {
    return null;
  }
  const value = tag.slice("hottrend-updated-at:".length).replace(/_/g, " ").trim();
  return value.length > 0 && value.toLowerCase() !== "unknown" ? value : null;
}

function resolveDisplayTimestamp(tags: readonly string[], fallbackUpdatedAt: number): number {
  const taggedTime = parseHotTrendUpdatedAtTag(tags);
  if (taggedTime) {
    const parsed = Date.parse(taggedTime);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallbackUpdatedAt;
}

function toSourceLabel(sourceType: ReverseStoryboardSourceType): string {
  return sourceType === "upload_file" ? "上传文件反推" : "视频链接反推";
}

function normalizeSuggestionLine(line: string): string {
  return line
    .replace(/^[-*•]+/u, "")
    .replace(/^[\d一二三四五六七八九十]+[\.、)）]\s*/u, "")
    .trim();
}

function collectSuggestionCandidates(text: string): string[] {
  if (!text.trim()) {
    return [];
  }
  const lines = text
    .split(/\r?\n/u)
    .flatMap((line) => line.split(/[；;。]/u))
    .map((line) => normalizeSuggestionLine(line))
    .filter((line) => line.length > 0);
  return [...new Set(lines)];
}

function buildOptimizationSuggestions(item: ReverseStoryboardLibraryRecordDto): string[] {
  const optimizationSection =
    item.report.sections.find((section) => section.id === "optimization") ??
    item.report.sections.find((section) => section.title.includes("优化"));
  const candidates = [
    ...collectSuggestionCandidates(optimizationSection?.content ?? ""),
    ...collectSuggestionCandidates(item.summary),
    ...collectSuggestionCandidates(item.report.intro ?? ""),
  ];
  const deduped = [...new Set(candidates)].slice(0, 5);
  const fallback = [
    "强化开场 3 秒结果展示，提升停留率。",
    "统一口播关键词，保证单镜头信息密度。",
    "增加对比镜头，突出核心变化点。",
    "结尾补充明确行动指令，提升转化率。",
    "保持字幕与画面节奏同步，减少跳失。",
  ];
  while (deduped.length < 5) {
    deduped.push(fallback[deduped.length] ?? "补充可执行优化建议。");
  }
  return deduped.slice(0, 5);
}

export function buildReverseStoryboardLibraryCard(
  item: ReverseStoryboardLibraryRecordDto,
): ReverseStoryboardLibraryCardViewModel {
  const summary = pickStoryboardSummary(item);
  const displayTimestamp = resolveDisplayTimestamp(item.tags, item.updatedAt);
  return {
    id: item.id,
    title: item.title,
    summary,
    preview: summary,
    tags: [...item.tags],
    sourceType: item.sourceType,
    sourceLabel: toSourceLabel(item.sourceType),
    sourceValue:
      item.sourceType === "upload_file"
        ? item.sourceMeta.filename ?? null
        : item.sourceMeta.videoUrl ?? null,
    frameCount: item.report.frames.length,
    frameTitles: item.report.frames.map((frame) => frame.title.trim()).filter((title) => title.length > 0).slice(0, 3),
    currentVersion: item.currentVersion,
    createdDate: formatDate(displayTimestamp),
    filterTimestamp: displayTimestamp,
    updatedAt: displayTimestamp,
    updatedDate: formatDate(displayTimestamp),
    durationLabel: formatDuration(item.sourceMeta.duration),
    optimizationSuggestions: buildOptimizationSuggestions(item),
  };
}

export function buildReverseStoryboardLibraryCards(
  items: readonly ReverseStoryboardLibraryRecordDto[],
): ReverseStoryboardLibraryCardViewModel[] {
  return [...items]
    .sort((left, right) => {
      if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt - left.updatedAt;
      }
      if (right.createdAt !== left.createdAt) {
        return right.createdAt - left.createdAt;
      }
      return left.title.localeCompare(right.title, "zh-CN");
    })
    .map((item) => buildReverseStoryboardLibraryCard(item));
}
