import type { LibraryScript } from "../contracts/types.js";
import type { ReverseStoryboardLibraryItem, ReverseStoryboardSourceType } from "../contracts/reverse-storyboard-report.js";
import {
  cloneReverseStoryboardPanelViewModel,
  cloneReverseStoryboardReport,
  mapRawReverseStoryboardReport,
} from "./reverse-storyboard-report-mapper.js";

export const LEGACY_VIDEO_REVERSE_TAG = "#视频链接反推";

export interface LegacyVideoReverseRecord {
  readonly scriptId: string;
  readonly itemId: string;
  readonly userId: string;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly sourceType: ReverseStoryboardSourceType;
  readonly sourceMeta: ReverseStoryboardLibraryItem["sourceMeta"];
  readonly report: ReverseStoryboardLibraryItem["report"];
  readonly content: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

function normalizeOptionalText(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTags(input: readonly string[]): string[] {
  const tags = input
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
  return [...new Set(tags)];
}

function buildSummary(report: ReverseStoryboardLibraryItem["report"], title: string, content: string): string {
  const sectionSummary = report.sections.map((section) => section.content.trim()).find((value) => value.length > 0);
  return report.intro?.trim() || sectionSummary || content.trim() || title;
}

function buildLegacySourceType(
  script: Pick<LibraryScript, "reverseContext">,
  panel: ReturnType<typeof cloneReverseStoryboardPanelViewModel>,
): ReverseStoryboardSourceType {
  if (panel?.source.sourceType === "upload_file") {
    return "upload_file";
  }
  const filename = normalizeOptionalText(panel?.source.filename ?? null);
  const videoUrl = normalizeOptionalText(panel?.source.videoUrl ?? script.reverseContext?.sourceMeta.videoUrl ?? null);
  return filename && !videoUrl ? "upload_file" : "video_url";
}

function buildLegacyRawMarkdown(
  script: Pick<LibraryScript, "content" | "reverseContext">,
  panel: ReturnType<typeof cloneReverseStoryboardPanelViewModel>,
): string {
  return (
    panel?.report.rawMarkdown?.trim() ||
    normalizeOptionalText(script.reverseContext?.sourceMeta.scriptText) ||
    script.content.trim()
  );
}

function buildLegacySourceMeta(
  script: Pick<LibraryScript, "reverseContext">,
  panel: ReturnType<typeof cloneReverseStoryboardPanelViewModel>,
): ReverseStoryboardLibraryItem["sourceMeta"] {
  return {
    videoUrl:
      normalizeOptionalText(panel?.source.videoUrl ?? null) ??
      normalizeOptionalText(script.reverseContext?.sourceMeta.videoUrl) ??
      normalizeOptionalText(script.reverseContext?.sourceMeta.url),
    filename: normalizeOptionalText(panel?.source.filename ?? null),
    mimeType: normalizeOptionalText(panel?.source.mimeType ?? null),
    duration:
      typeof panel?.source.duration === "number" && Number.isFinite(panel.source.duration)
        ? panel.source.duration
        : typeof script.reverseContext?.sourceMeta.duration === "number" &&
            Number.isFinite(script.reverseContext.sourceMeta.duration)
          ? script.reverseContext.sourceMeta.duration
          : null,
  };
}

function buildLegacySignature(input: {
  readonly userId: string;
  readonly sourceType: ReverseStoryboardSourceType;
  readonly title: string;
  readonly content: string;
  readonly sourceMeta: ReverseStoryboardLibraryItem["sourceMeta"];
}): string {
  return [
    input.userId,
    input.sourceType,
    normalizeOptionalText(input.title) ?? "",
    normalizeOptionalText(input.content) ?? "",
    normalizeOptionalText(input.sourceMeta.videoUrl) ?? "",
  ].join("::");
}

export function buildLegacyVideoReverseStoryboardItemId(scriptId: string): string {
  return `legacy-reverse-storyboard-${scriptId}`;
}

export function extractLegacyVideoReverseRecord(
  script: Pick<LibraryScript, "id" | "userId" | "title" | "tags" | "content" | "reverseContext" | "createdAt" | "updatedAt">,
): LegacyVideoReverseRecord | null {
  const legacyTags = normalizeTags([...(script.tags ?? []), ...(script.reverseContext?.keywords ?? [])]);
  if (!legacyTags.includes(LEGACY_VIDEO_REVERSE_TAG)) {
    return null;
  }
  const panel = cloneReverseStoryboardPanelViewModel(script.reverseContext?.storyboardPanel ?? null);
  const content = buildLegacyRawMarkdown(script, panel);
  if (!content) {
    return null;
  }
  const report = panel?.report
    ? cloneReverseStoryboardReport(panel.report)!
    : mapRawReverseStoryboardReport(content);
  const title = normalizeOptionalText(script.title) ?? "历史视频链接反推";
  const sourceType = buildLegacySourceType(script, panel);
  const sourceMeta = buildLegacySourceMeta(script, panel);
  return {
    scriptId: script.id,
    itemId: buildLegacyVideoReverseStoryboardItemId(script.id),
    userId: script.userId,
    title,
    summary: buildSummary(report, title, content),
    tags: normalizeTags(["#反推分镜", ...legacyTags]),
    sourceType,
    sourceMeta,
    report,
    content,
    createdAt: script.createdAt,
    updatedAt: script.updatedAt,
  };
}

export function collectLegacyVideoReverseRecords(
  scripts: readonly Pick<
    LibraryScript,
    "id" | "userId" | "title" | "tags" | "content" | "reverseContext" | "createdAt" | "updatedAt"
  >[],
): LegacyVideoReverseRecord[] {
  return scripts
    .map((script) => extractLegacyVideoReverseRecord(script))
    .filter((record): record is LegacyVideoReverseRecord => record !== null);
}

export function isLegacyVideoReverseRecordAlreadyMigrated(
  record: LegacyVideoReverseRecord,
  existingItems: readonly Pick<ReverseStoryboardLibraryItem, "id" | "userId" | "title" | "content" | "sourceType" | "sourceMeta">[],
): boolean {
  if (existingItems.some((item) => item.id === record.itemId)) {
    return true;
  }
  const recordSignature = buildLegacySignature(record);
  return existingItems.some((item) => buildLegacySignature(item) === recordSignature);
}

export async function migrateLegacyVideoReverseRecords<
  TItem extends Pick<ReverseStoryboardLibraryItem, "id" | "userId" | "title" | "content" | "sourceType" | "sourceMeta">,
>(input: {
  readonly legacyRecords: readonly LegacyVideoReverseRecord[];
  readonly existingItems: readonly TItem[];
  readonly createItem: (record: LegacyVideoReverseRecord) => Promise<TItem>;
}): Promise<{
  readonly createdItemIds: readonly string[];
  readonly skippedScriptIds: readonly string[];
}> {
  const existingItems = [...input.existingItems];
  const createdItemIds: string[] = [];
  const skippedScriptIds: string[] = [];
  for (const record of input.legacyRecords) {
    if (isLegacyVideoReverseRecordAlreadyMigrated(record, existingItems)) {
      skippedScriptIds.push(record.scriptId);
      continue;
    }
    const created = await input.createItem(record);
    existingItems.push(created);
    createdItemIds.push(created.id);
  }
  return {
    createdItemIds,
    skippedScriptIds,
  };
}
