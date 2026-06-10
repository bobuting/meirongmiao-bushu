import type {
  ReverseStoryboardLibraryItem,
  ReverseStoryboardPanelViewModel,
} from "../contracts/reverse-storyboard-report.js";
import { resolveReverseStoryboardPrimaryTopicFromPanel } from "./reverse-storyboard-primary-topic.js";

function normalizeOptionalText(input: string | null | undefined): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstNonEmptyText(candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeOptionalText(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function truncateText(input: string, maxLength = 120): string {
  const normalized = input.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function normalizeTagList(tags: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  const output: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const normalized = String(raw ?? "").trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

export function buildReverseStoryboardLibraryCreateInput(input: {
  readonly title?: string | null;
  readonly content?: string | null;
  readonly tags?: readonly string[];
  readonly panel: ReverseStoryboardPanelViewModel;
}): Omit<ReverseStoryboardLibraryItem, "id" | "userId" | "createdAt" | "updatedAt"> {
  const primaryTopic = resolveReverseStoryboardPrimaryTopicFromPanel(input.panel);
  const content =
    firstNonEmptyText([input.content, input.panel.report.rawMarkdown]) ?? "分镜结果报告";
  const title =
    firstNonEmptyText([
      input.title,
      primaryTopic,
      input.panel.report.frames[0]?.title ? `反推分镜 - ${input.panel.report.frames[0].title}` : null,
      input.panel.source.filename,
      input.panel.source.videoUrl ? "视频链接反推分镜" : null,
      "反推分镜卡片",
    ]) ?? "反推分镜卡片";
  const summary =
    firstNonEmptyText([
      primaryTopic,
      input.panel.report.intro,
      ...input.panel.report.sections.map((section) => section.content),
      input.panel.report.frames[0]?.narration,
      content,
    ]) ?? content;

  return {
    title,
    summary: truncateText(summary),
    tags: normalizeTagList(input.tags),
    sourceType: input.panel.source.sourceType,
    sourceMeta: {
      videoUrl: normalizeOptionalText(input.panel.source.videoUrl),
      filename: normalizeOptionalText(input.panel.source.filename),
      mimeType: normalizeOptionalText(input.panel.source.mimeType),
      duration:
        typeof input.panel.source.duration === "number" && Number.isFinite(input.panel.source.duration)
          ? input.panel.source.duration
          : null,
    },
    report: input.panel.report,
    content,
  };
}
