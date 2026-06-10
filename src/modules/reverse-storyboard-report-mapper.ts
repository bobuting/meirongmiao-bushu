import {
  REVERSE_STORYBOARD_SECTION_DEFINITIONS,
  createEmptyReverseStoryboardReport,
  type ReverseStoryboardFrameDraft,
  type ReverseStoryboardPanelViewModel,
  type ReverseStoryboardReport,
  type ReverseStoryboardSectionId,
  type ReverseStoryboardSourceType,
} from "../contracts/reverse-storyboard-report.js";

const SECTION_HEADER_PATTERN = /(?:^|\n)\s*(?:#{1,6}\s*)?([1-5])\s*[\.、)）：:-]\s*[^\n]*/g;
const FRAME_HEADER_PATTERN =
  /^(?:[-*]\s*)?(?:镜头|分镜|shot|scene)\s*([0-9]+|[一二三四五六七八九十]+)(?:\s*[：:、)\-\.]\s*(.*))?$/i;
const FRAME_KEY_VALUE_PATTERN =
  /^(时间|时长|time|标题|镜头标题|title|台词|口播|旁白|文案|narration|画面|视觉|镜头|visual|备注|说明|notes?)\s*[：:]\s*(.*)$/i;
const TABLE_SEPARATOR_PATTERN = /^\|\s*[:\-| ]+\|?\s*$/;

type MutableFrameDraft = {
  index: number;
  time: string | null;
  title: string | null;
  narration: string[];
  visualCue: string[];
  notes: string[];
  freeform: string[];
};

function normalizeText(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function parseChineseFrameIndex(token: string): number | null {
  const normalized = token.trim();
  const values: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (normalized === "十") {
    return 10;
  }
  if (normalized.endsWith("十") && normalized.length === 2) {
    const tens = values[normalized[0]];
    return tens ? tens * 10 : null;
  }
  if (normalized.includes("十") && normalized.length === 2) {
    const ones = values[normalized[1]];
    return ones ? 10 + ones : null;
  }
  return values[normalized] ?? null;
}

function parseFrameIndex(token: string): number | null {
  const numeric = Number(token);
  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }
  return parseChineseFrameIndex(token);
}

function normalizeMarkdownTableCells(line: string): string[] | null {
  const normalized = line.replace(/｜/g, "|").trim();
  if (!normalized.includes("|")) {
    return null;
  }
  if (TABLE_SEPARATOR_PATTERN.test(normalized)) {
    return null;
  }
  const compact = normalized.replace(/^\|/, "").replace(/\|$/, "");
  const cells = compact.split("|").map((cell) => cell.trim());
  if (cells.length < 2) {
    return null;
  }
  return cells;
}

function parseTableFrameDraft(line: string): MutableFrameDraft | null {
  const cells = normalizeMarkdownTableCells(line);
  if (!cells) {
    return null;
  }
  const frameIndex = parseFrameIndex(cells[0]);
  if (!frameIndex) {
    return null;
  }
  const draft = createMutableFrameDraft(frameIndex, cells[1] ?? null);
  const visualCue = cells[2]?.trim() ?? "";
  const time = cells[3]?.trim() ?? "";
  const narration = cells[4]?.trim() ?? "";
  const notes = cells[5]?.trim() ?? "";
  if (visualCue) {
    draft.visualCue.push(visualCue);
  }
  if (time) {
    draft.time = time;
  }
  if (narration) {
    draft.narration.push(narration);
  }
  if (notes) {
    draft.notes.push(notes);
  }
  if (!narration && visualCue) {
    draft.narration.push(visualCue);
  }
  return draft;
}

function createMutableFrameDraft(index: number, title: string | null): MutableFrameDraft {
  return {
    index,
    time: null,
    title: title && title.trim().length > 0 ? title.trim() : null,
    narration: [],
    visualCue: [],
    notes: [],
    freeform: [],
  };
}

function finalizeFrameDraft(frame: MutableFrameDraft | null): ReverseStoryboardFrameDraft[] {
  if (!frame) {
    return [];
  }
  const narration = frame.narration.join("\n").trim();
  const visualCue = frame.visualCue.join("\n").trim();
  const notes = frame.notes.join("\n").trim();
  const freeform = frame.freeform.join("\n").trim();
  const resolvedNarration = narration || freeform;
  const resolvedVisualCue = visualCue || (!narration && freeform ? "" : freeform);
  if (!resolvedNarration && !resolvedVisualCue) {
    return [];
  }
  return [
    {
      index: frame.index,
      time: frame.time?.trim() || null,
      title: frame.title?.trim() || `镜头 ${frame.index}`,
      narration: resolvedNarration,
      visualCue: resolvedVisualCue,
      notes: notes || null,
    },
  ];
}

function parseSectionContentById(rawMarkdown: string): {
  intro: string | null;
  sections: ReverseStoryboardReport["sections"];
  hasStructuredSections: boolean;
} {
  const text = normalizeText(rawMarkdown);
  if (!text) {
    const emptyReport = createEmptyReverseStoryboardReport("");
    return {
      intro: emptyReport.intro,
      sections: emptyReport.sections,
      hasStructuredSections: emptyReport.hasStructuredSections,
    };
  }

  const matches = Array.from(text.matchAll(SECTION_HEADER_PATTERN)).filter(
    (match) => typeof match.index === "number",
  );
  if (matches.length === 0) {
    const emptyReport = createEmptyReverseStoryboardReport(text);
    return {
      intro: emptyReport.intro,
      sections: emptyReport.sections,
      hasStructuredSections: emptyReport.hasStructuredSections,
    };
  }

  const sectionContentById = new Map<ReverseStoryboardSectionId, string>();
  const intro = text.slice(0, matches[0].index ?? 0).trim() || null;

  for (let index = 0; index < matches.length; index += 1) {
    const currentMatch = matches[index];
    const numericId = Number(currentMatch[1]);
    const definition = REVERSE_STORYBOARD_SECTION_DEFINITIONS[numericId - 1];
    if (!definition || sectionContentById.has(definition.id)) {
      continue;
    }
    const headingStart = currentMatch.index ?? 0;
    let contentStart = headingStart + currentMatch[0].length;
    if (text[contentStart] === "\n") {
      contentStart += 1;
    }
    const nextHeadingStart = matches[index + 1]?.index ?? text.length;
    sectionContentById.set(definition.id, text.slice(contentStart, nextHeadingStart).trim());
  }

  const sections = REVERSE_STORYBOARD_SECTION_DEFINITIONS.map((definition) => ({
    id: definition.id,
    title: definition.title,
    order: definition.order,
    content: sectionContentById.get(definition.id) ?? "",
  }));

  return {
    intro,
    sections,
    hasStructuredSections: sections.some((section) => section.content.length > 0),
  };
}

function parseStructuredFrames(rawMarkdown: string): ReverseStoryboardFrameDraft[] {
  const lines = rawMarkdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const frames: ReverseStoryboardFrameDraft[] = [];
  let current: MutableFrameDraft | null = null;

  for (const line of lines) {
    const tableFrame = parseTableFrameDraft(line);
    if (tableFrame) {
      frames.push(...finalizeFrameDraft(current));
      current = tableFrame;
      continue;
    }

    const headerMatch = line.match(FRAME_HEADER_PATTERN);
    if (headerMatch) {
      frames.push(...finalizeFrameDraft(current));
      const frameIndex = parseFrameIndex(headerMatch[1]);
      if (!frameIndex) {
        current = null;
        continue;
      }
      current = createMutableFrameDraft(frameIndex, headerMatch[2] ?? null);
      continue;
    }

    if (!current) {
      continue;
    }

    const keyValueMatch = line.match(FRAME_KEY_VALUE_PATTERN);
    if (!keyValueMatch) {
      current.freeform.push(line);
      continue;
    }

    const key = keyValueMatch[1].toLowerCase();
    const value = keyValueMatch[2].trim();
    if (!value) {
      continue;
    }
    if (key === "时间" || key === "时长" || key === "time") {
      current.time = value;
      continue;
    }
    if (key === "标题" || key === "镜头标题" || key === "title") {
      current.title = value;
      continue;
    }
    if (
      key === "台词" ||
      key === "口播" ||
      key === "旁白" ||
      key === "文案" ||
      key === "narration"
    ) {
      current.narration.push(value);
      continue;
    }
    if (key === "备注" || key === "说明" || key === "notes" || key === "note") {
      current.notes.push(value);
      continue;
    }
    current.visualCue.push(value);
  }

  frames.push(...finalizeFrameDraft(current));
  return frames.sort((left, right) => left.index - right.index);
}

function parseFallbackFrames(rawMarkdown: string): ReverseStoryboardFrameDraft[] {
  const paragraphs = rawMarkdown
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return paragraphs.map((paragraph, index) => ({
    index: index + 1,
    title: `镜头 ${index + 1}`,
    narration: paragraph,
    visualCue: "",
    notes: null,
  }));
}

export function mapRawReverseStoryboardReport(rawMarkdown: string): ReverseStoryboardReport {
  const normalizedRawMarkdown = normalizeText(rawMarkdown);
  const parsedSections = parseSectionContentById(normalizedRawMarkdown);
  const frameSource =
    parsedSections.sections.find((section) => section.id === "replica")?.content || normalizedRawMarkdown;
  const frames = parseStructuredFrames(frameSource);
  return {
    intro: parsedSections.intro,
    sections: parsedSections.sections,
    frames: frames.length > 0 ? frames : parsedSections.hasStructuredSections ? parseFallbackFrames(frameSource) : [],
    rawMarkdown: normalizedRawMarkdown,
    hasStructuredSections: parsedSections.hasStructuredSections,
  };
}

export interface ReverseStoryboardSegmentViewModel {
  title: string;
  content: string;
  visualCue: string;
  visualPrompt: string;
}

export function mapReverseStoryboardReportToSegments(
  report: ReverseStoryboardReport,
  maxCount = 20,
): ReverseStoryboardSegmentViewModel[] {
  const normalizedMaxCount = Math.max(1, Math.floor(maxCount));
  const fromFrames = report.frames
    .map((frame, index) => {
      const content = frame.narration.trim();
      if (!content) {
        return null;
      }
      const visualCue = (frame.visualCue || `画面：${content.slice(0, 56)}`).trim();
      return {
        title: frame.title?.trim() || `镜头 ${index + 1}`,
        content,
        visualCue,
        visualPrompt: visualCue,
      };
    })
    .filter((segment): segment is ReverseStoryboardSegmentViewModel => segment !== null)
    .slice(0, normalizedMaxCount);

  if (fromFrames.length > 0) {
    return fromFrames;
  }

  return report.rawMarkdown
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph, index) => {
      const visualCue = `画面：${paragraph.slice(0, 56)}`;
      return {
        title: `镜头 ${index + 1}`,
        content: paragraph,
        visualCue,
        visualPrompt: visualCue,
      };
    })
    .slice(0, normalizedMaxCount);
}

export function cloneReverseStoryboardReport(
  report: ReverseStoryboardReport | null | undefined,
): ReverseStoryboardReport | null | undefined {
  if (report === undefined) {
    return undefined;
  }
  if (report === null) {
    return null;
  }
  return {
    intro: report.intro,
    sections: report.sections.map((section) => ({ ...section })),
    frames: report.frames.map((frame) => ({ ...frame })),
    rawMarkdown: report.rawMarkdown,
    hasStructuredSections: report.hasStructuredSections,
  };
}

export function buildReverseStoryboardPanelViewModel(input: {
  sourceType: ReverseStoryboardSourceType;
  videoUrl?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  duration?: number | null;
  rawMarkdown: string;
  diagnostics?: unknown;
  raw?: unknown;
}): ReverseStoryboardPanelViewModel {
  return {
    source: {
      sourceType: input.sourceType,
      videoUrl: input.videoUrl?.trim() || null,
      filename: input.filename?.trim() || null,
      mimeType: input.mimeType?.trim() || null,
      duration: typeof input.duration === "number" && Number.isFinite(input.duration) ? input.duration : null,
    },
    report: mapRawReverseStoryboardReport(input.rawMarkdown),
    diagnostics: input.diagnostics ?? null,
    raw: input.raw ?? null,
  };
}

export function cloneReverseStoryboardPanelViewModel(
  panel: ReverseStoryboardPanelViewModel | null | undefined,
): ReverseStoryboardPanelViewModel | null | undefined {
  if (panel === undefined) {
    return undefined;
  }
  if (panel === null) {
    return null;
  }
  return {
    source: { ...panel.source },
    report: cloneReverseStoryboardReport(panel.report)!,
    diagnostics: panel.diagnostics,
    raw: panel.raw,
  };
}
