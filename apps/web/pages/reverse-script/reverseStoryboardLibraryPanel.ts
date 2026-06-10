import type { ReverseStoryboardLibraryRecordDto } from "../../../../src/contracts/reverse-storyboard-library-api";
import type { ReverseStoryboardPanelViewModel } from "../../../../src/contracts/reverse-storyboard-report";

export interface ReverseStoryboardLibrarySegmentViewModel {
  readonly time: string;
  readonly title: string;
  readonly content: string;
  readonly visualCue: string;
}

function fallbackTime(index: number, value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  if (normalized.length > 0) {
    return normalized;
  }
  const start = (index - 1) * 3;
  const end = index * 3;
  return `${start}-${end}s`;
}

function fallbackTitle(index: number, value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : `镜头 ${index}`;
}

export function buildReverseStoryboardLibraryPanel(
  item: ReverseStoryboardLibraryRecordDto,
): ReverseStoryboardPanelViewModel {
  return {
    source: {
      sourceType: item.sourceType,
      videoUrl: item.sourceMeta.videoUrl ?? null,
      filename: item.sourceMeta.filename ?? null,
      mimeType: item.sourceMeta.mimeType ?? null,
      duration: Number.isFinite(Number(item.sourceMeta.duration)) ? Number(item.sourceMeta.duration) : null,
    },
    report: item.report,
    diagnostics: {
      source: "reverse_storyboard_library",
      libraryItemId: item.id,
      currentVersion: item.currentVersion,
    },
    raw: {
      libraryItemId: item.id,
      updatedAt: item.updatedAt,
    },
  };
}

export function buildReverseStoryboardLibrarySegments(
  item: ReverseStoryboardLibraryRecordDto,
): ReverseStoryboardLibrarySegmentViewModel[] {
  return item.report.frames.map((frame) => ({
    time: fallbackTime(frame.index, frame.time),
    title: fallbackTitle(frame.index, frame.title),
    content: String(frame.narration ?? "").trim(),
    visualCue: String(frame.visualCue ?? "").trim(),
  }));
}
