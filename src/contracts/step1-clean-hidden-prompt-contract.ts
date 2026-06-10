export const STEP1_CLEAN_HIDDEN_PROMPT_CONTRACT_VERSION = "AT32-13.v1";

export const STEP1_CLEAN_HIDDEN_PROMPT_ALLOWED_LABELS = [
  "后续定妆整体提示词",
  "Step1搭配参考",
] as const;

export const STEP1_CLEAN_HIDDEN_PROMPT_FORBIDDEN_LABELS = [
  "角色方向ID",
  "角色方向标题",
  "角色方向摘要",
  "Step1已选搭配方案",
  "Step1搭配来源",
] as const;

export interface Step1CleanHiddenPromptInput {
  ethnicityOrRegion?: string | null;
  gender?: string | null;
  age?: number | null;
  styleWords?: string[] | null;
  directionTitle?: string | null;
  directionSummary?: string | null;
  outfitSummary?: string | null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeStep1CleanHiddenPromptInput(input: Step1CleanHiddenPromptInput): Step1CleanHiddenPromptInput {
  const normalizedStyleWords = Array.isArray(input.styleWords)
    ? input.styleWords
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item, index, arr) => item.length > 0 && arr.indexOf(item) === index)
    : null;
  const normalizedAge =
    typeof input.age === "number" && Number.isFinite(input.age) && input.age >= 0 ? Math.floor(input.age) : null;

  return {
    ethnicityOrRegion: normalizeOptionalString(input.ethnicityOrRegion),
    gender: normalizeOptionalString(input.gender),
    age: normalizedAge,
    styleWords: normalizedStyleWords,
    directionTitle: normalizeOptionalString(input.directionTitle),
    directionSummary: normalizeOptionalString(input.directionSummary),
    outfitSummary: normalizeOptionalString(input.outfitSummary),
  };
}

export function assertStep1CleanHiddenPromptContract(): {
  version: string;
  allowedLabels: number;
  forbiddenLabels: number;
} {
  return {
    version: STEP1_CLEAN_HIDDEN_PROMPT_CONTRACT_VERSION,
    allowedLabels: STEP1_CLEAN_HIDDEN_PROMPT_ALLOWED_LABELS.length,
    forbiddenLabels: STEP1_CLEAN_HIDDEN_PROMPT_FORBIDDEN_LABELS.length,
  };
}
