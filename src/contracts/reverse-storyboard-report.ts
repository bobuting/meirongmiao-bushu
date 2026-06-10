export const REVERSE_STORYBOARD_REPORT_CONTRACT_VERSION = "AT29-06.v1";

export const REVERSE_STORYBOARD_SECTION_DEFINITIONS = [
  { id: "positioning", order: 1, title: "内容主题与人设定位" },
  { id: "rhythm", order: 2, title: "叙事结构与镜头节奏" },
  { id: "hook", order: 3, title: "爆点拆解" },
  { id: "replica", order: 4, title: "可复刻脚本（含分镜建议）" },
  { id: "optimization", order: 5, title: "可执行优化建议" },
] as const;

export type ReverseStoryboardSectionId = (typeof REVERSE_STORYBOARD_SECTION_DEFINITIONS)[number]["id"];
export type ReverseStoryboardSourceType = "video_url" | "upload_file";

export const REVERSE_STORYBOARD_DTO_INVARIANTS = [
  "Reverse storyboard reports keep a stable five-section order for the right-side panel.",
  "Storyboard frames stay structured and editable; they are not replaced by raw markdown-only persistence.",
  "Reverse storyboard library items remain a separate domain from the legacy script library.",
  "Storyboard import payloads hydrate Step3 segments with sceneImageUrl=null and require project context.",
] as const;

export interface ReverseStoryboardReportSection {
  readonly id: ReverseStoryboardSectionId;
  readonly title: string;
  readonly content: string;
  readonly order: number;
}

export interface ReverseStoryboardFrameDraft {
  readonly index: number;
  readonly time?: string | null;
  readonly title: string;
  readonly narration: string;
  readonly visualCue: string;
  readonly notes?: string | null;
}

export interface ReverseStoryboardReport {
  readonly intro: string | null;
  readonly sections: readonly ReverseStoryboardReportSection[];
  readonly frames: readonly ReverseStoryboardFrameDraft[];
  readonly rawMarkdown: string;
  readonly hasStructuredSections: boolean;
}

export interface ReverseStoryboardPanelViewModel {
  readonly source: {
    readonly sourceType: ReverseStoryboardSourceType;
    readonly videoUrl: string | null;
    readonly filename: string | null;
    readonly mimeType: string | null;
    readonly duration: number | null;
  };
  readonly report: ReverseStoryboardReport;
  readonly diagnostics: unknown;
  readonly raw: unknown;
}

export interface ReverseStoryboardLibraryItem {
  readonly id: string;
  readonly userId: string;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly sourceType: ReverseStoryboardSourceType;
  readonly sourceMeta: {
    readonly videoUrl?: string | null;
    readonly filename?: string | null;
    readonly mimeType?: string | null;
    readonly duration?: number | null;
  };
  readonly report: ReverseStoryboardReport;
  readonly content: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface Step3ImportedStoryboardPayload {
  readonly sourceLibraryId: string;
  readonly title: string;
  readonly importMode: "storyboard_frames";
  readonly requireProjectContext: true;
  readonly segments: ReadonlyArray<{
    readonly time: string;
    readonly title: string;
    readonly content: string;
    readonly visualCue: string;
    readonly sceneImageUrl: null;
  }>;
}

function buildDefaultSegmentTime(index: number): string {
  const start = (index - 1) * 3;
  const end = index * 3;
  return `${start}-${end}s`;
}

function buildStep3ImportedStoryboardSegmentContent(input: {
  narration: string;
  visualCue: string;
}): string {
  const narration = input.narration.trim();
  const visualCue = input.visualCue.trim();
  const lines: string[] = [];
  if (narration.length > 0) {
    lines.push(`旁白：${narration}`);
  }
  if (visualCue.length > 0) {
    lines.push(`画面：${visualCue}`);
  }
  return lines.join("\n").trim();
}

export function createEmptyReverseStoryboardReport(rawMarkdown = ""): ReverseStoryboardReport {
  return {
    intro: rawMarkdown.trim() || null,
    sections: REVERSE_STORYBOARD_SECTION_DEFINITIONS.map((definition) => ({
      id: definition.id,
      title: definition.title,
      content: "",
      order: definition.order,
    })),
    frames: [],
    rawMarkdown,
    hasStructuredSections: false,
  };
}

export function buildStep3ImportedStoryboardPayload(input: {
  readonly sourceLibraryId: string;
  readonly title: string;
  readonly frames: readonly ReverseStoryboardFrameDraft[];
}): Step3ImportedStoryboardPayload {
  return {
    sourceLibraryId: input.sourceLibraryId,
    title: input.title,
    importMode: "storyboard_frames",
    requireProjectContext: true,
    segments: input.frames.map((frame) => ({
      time: frame.time?.trim() || buildDefaultSegmentTime(frame.index),
      title: frame.title.trim() || `镜头 ${frame.index}`,
      content: buildStep3ImportedStoryboardSegmentContent({
        narration: frame.narration,
        visualCue: frame.visualCue,
      }),
      visualCue: frame.visualCue.trim() || frame.narration.trim(),
      sceneImageUrl: null,
    })),
  };
}
