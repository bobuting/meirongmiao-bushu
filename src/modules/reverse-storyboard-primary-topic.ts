import type {
  ReverseStoryboardPanelViewModel,
  ReverseStoryboardReport,
} from "../contracts/reverse-storyboard-report.js";

function normalizeOptionalText(input: string | null | undefined): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeParagraph(input: string): string {
  return input
    .replace(/^[-*•#>\s]+/u, "")
    .replace(/^(?:第)?[\d一二三四五六七八九十]+[.、)：:\-]\s*/u, "")
    .trim();
}

function splitParagraphs(input: string | null | undefined): string[] {
  const normalized = normalizeOptionalText(input);
  if (!normalized) {
    return [];
  }
  const paragraphs = normalized
    .split(/\n\s*\n/u)
    .map((paragraph) => normalizeParagraph(paragraph))
    .filter((paragraph) => paragraph.length > 0);
  if (paragraphs.length > 0) {
    return paragraphs;
  }
  return normalized
    .split(/\r?\n/u)
    .map((line) => normalizeParagraph(line))
    .filter((line) => line.length > 0);
}

function pickFirstParagraph(candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const paragraph = splitParagraphs(candidate)[0];
    if (paragraph) {
      return paragraph;
    }
  }
  return null;
}

export function resolveReverseStoryboardPrimaryTopic(
  report: Pick<ReverseStoryboardReport, "intro" | "sections"> | null | undefined,
): string | null {
  if (!report) {
    return null;
  }
  const positioningSection = report.sections.find((section) => section.id === "positioning");
  return pickFirstParagraph([
    positioningSection?.content,
    report.intro,
    ...report.sections.map((section) => section.content),
  ]);
}

export function resolveReverseStoryboardPrimaryTopicFromPanel(
  panel: Pick<ReverseStoryboardPanelViewModel, "report"> | null | undefined,
): string | null {
  return resolveReverseStoryboardPrimaryTopic(panel?.report ?? null);
}
