export const STORYBOARD_CHARACTER_SUMMARY_CONTRACT_VERSION = "AT38-02.v1";
export const MAX_CHARACTER_SUMMARY_FIELD_LENGTH = 120;
export const MAX_STORYBOARD_CHARACTER_SUMMARY_LENGTH = 320;
export const MAX_STORYBOARD_CHARACTER_STYLING_PROMPT_LENGTH = 1200;

export const STORYBOARD_CHARACTER_SUMMARY_INVARIANTS = [
  "characterSummaryText must be text-only and must never embed image URLs or data URLs.",
  "characterStylingPrompt (if present) must be text-only and must never embed image URLs or data URLs.",
  "The summary order is stable: character, outfit, project context, then reference anchors.",
  "Missing fields fail closed to readable placeholders instead of disappearing from the summary.",
  "Each field and the final summary are length-bounded to prevent prompt bloat.",
] as const;

export interface CharacterSummarySource {
  readonly characterName?: string | null;
  readonly outfitSummary?: string | null;
  readonly projectContext?: string | null;
  readonly referenceAnchors?: readonly string[] | null;
}

export interface StoryboardPromptInput {
  readonly script: string;
  readonly frameCount: number;
  readonly writingStyle?: string | null;
  readonly templateLabel?: string | null;
  readonly characterStylingPrompt?: string | null;
  readonly characterSummaryText: string;
}

function normalizeSummaryValue(value: unknown, fallback: string): string {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!normalized) {
    return fallback;
  }
  if (normalized.length <= MAX_CHARACTER_SUMMARY_FIELD_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_CHARACTER_SUMMARY_FIELD_LENGTH - 3).trim()}...`;
}

function normalizeReferenceAnchors(value: readonly string[] | null | undefined): string {
  if (!Array.isArray(value) || value.length < 1) {
    return "未提供";
  }
  const deduped = [...new Set(value.map((item) => normalizeSummaryValue(item, "")).filter((item) => item.length > 0))];
  if (deduped.length < 1) {
    return "未提供";
  }
  return normalizeSummaryValue(deduped.join("/"), "未提供");
}

function normalizeCharacterStylingPrompt(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value
    .replace(/data:image\/[^\s"')]+/gi, " ")
    .replace(/https?:\/\/[^\s"')]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length <= MAX_STORYBOARD_CHARACTER_STYLING_PROMPT_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_STORYBOARD_CHARACTER_STYLING_PROMPT_LENGTH - 3).trim()}...`;
}

export function buildStoryboardCharacterSummary(source: CharacterSummarySource): string {
  const sections = [
    `角色主体=${normalizeSummaryValue(source.characterName, "未命名角色")}`,
    `服装锚点=${normalizeSummaryValue(source.outfitSummary, "未指定搭配")}`,
    `项目上下文=${normalizeSummaryValue(source.projectContext, "无项目上下文")}`,
    `视角锚点=${normalizeReferenceAnchors(source.referenceAnchors)}`,
  ];
  const summary = sections.join("；");
  if (summary.length <= MAX_STORYBOARD_CHARACTER_SUMMARY_LENGTH) {
    return summary;
  }
  return `${summary.slice(0, MAX_STORYBOARD_CHARACTER_SUMMARY_LENGTH - 3).trim()}...`;
}

export function buildStoryboardPromptInput(
  base: Omit<StoryboardPromptInput, "characterSummaryText">,
  source: CharacterSummarySource,
): StoryboardPromptInput {
  const characterStylingPrompt = normalizeCharacterStylingPrompt(base.characterStylingPrompt);
  return {
    ...base,
    characterStylingPrompt,
    characterSummaryText: buildStoryboardCharacterSummary(source),
  };
}
