import type { ReverseStoryboardPanelViewModel } from "../../../../src/contracts/reverse-storyboard-report";

export interface VideoUrlReportSection {
  id: 1 | 2 | 3 | 4 | 5;
  title: string;
  content: string;
}

export interface ParsedVideoUrlStructuredReport {
  intro: string;
  sections: VideoUrlReportSection[];
  hasStructuredSections: boolean;
}

export const VIDEO_URL_REPORT_SECTION_TITLES: ReadonlyArray<VideoUrlReportSection["title"]> = [
  "内容主题与人设定位",
  "叙事结构与镜头节奏",
  "爆点拆解",
  "可复刻脚本（含分镜建议）",
  "可执行优化建议",
];

const SECTION_HEADER_PATTERN = /(?:^|\n)\s*(?:#{1,6}\s*)?([1-5])\s*[\.、)）]\s*[^\n]*/g;

function createEmptySections(): VideoUrlReportSection[] {
  return VIDEO_URL_REPORT_SECTION_TITLES.map((title, index) => ({
    id: (index + 1) as VideoUrlReportSection["id"],
    title,
    content: "",
  }));
}

export function buildVideoUrlStoryboardFallbackText(
  storyboardPanel: ReverseStoryboardPanelViewModel | null | undefined,
): string {
  if (!storyboardPanel) {
    return "";
  }
  const rawMarkdown = storyboardPanel.report.rawMarkdown.trim();
  if (rawMarkdown) {
    return rawMarkdown;
  }
  const intro = storyboardPanel.report.intro?.trim() ?? "";
  const sectionBlocks = storyboardPanel.report.sections
    .map((section) => {
      const content = section.content.trim();
      if (!content) {
        return "";
      }
      return `### ${section.order}. ${section.title}\n${content}`;
    })
    .filter((item) => item.length > 0);
  return [intro, ...sectionBlocks].filter((item) => item.length > 0).join("\n\n");
}

export function parseVideoUrlStructuredReport(rawText: string): ParsedVideoUrlStructuredReport {
  const text = rawText.trim();
  if (!text) {
    return {
      intro: "",
      sections: createEmptySections(),
      hasStructuredSections: false,
    };
  }

  const matches = Array.from(text.matchAll(SECTION_HEADER_PATTERN)).filter(
    (match) => typeof match.index === "number",
  );

  if (matches.length === 0) {
    return {
      intro: text,
      sections: createEmptySections(),
      hasStructuredSections: false,
    };
  }

  const intro = text.slice(0, matches[0].index ?? 0).trim();
  const sectionContentById = new Map<number, string>();

  for (let index = 0; index < matches.length; index += 1) {
    const currentMatch = matches[index];
    const id = Number(currentMatch[1]);
    if (!Number.isInteger(id) || id < 1 || id > 5 || sectionContentById.has(id)) {
      continue;
    }

    const headingStart = currentMatch.index ?? 0;
    let contentStart = headingStart + currentMatch[0].length;
    if (text[contentStart] === "\n") {
      contentStart += 1;
    }
    const nextHeadingStart = matches[index + 1]?.index ?? text.length;
    const content = text.slice(contentStart, nextHeadingStart).trim();
    sectionContentById.set(id, content);
  }

  const sections = VIDEO_URL_REPORT_SECTION_TITLES.map((title, index) => {
    const id = (index + 1) as VideoUrlReportSection["id"];
    return {
      id,
      title,
      content: sectionContentById.get(id) ?? "",
    };
  });

  return {
    intro,
    sections,
    hasStructuredSections: sections.some((section) => section.content.length > 0),
  };
}
