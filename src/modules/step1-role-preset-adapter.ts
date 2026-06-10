import type { Step1CleanHiddenPromptInput } from "../contracts/step1-clean-hidden-prompt-contract.js";
import type { Step1RoleDirectionCard } from "../contracts/step1-joint-reverse-contract.js";
import {
  normalizeStep1RolePresetBundle,
  type Gender,
  type Step1RolePreset,
} from "../contracts/step1-role-preset-contract.js";
import {
  normalizeStep1RolePresetRegion,
  type Step1RolePresetAllowedRegion,
} from "../contracts/step1-role-preset-governance-contract.js";
import { mapRolePresetBundleToCards } from "../contracts/step1-role-preset-mapper.js";
import { parseEmotionToneFromText, type EmotionToneCategory } from "../contant-config/style-atmosphere-dict.js";

const DEFAULT_ROLE_PRESET_REGION = "Asian";
const DEFAULT_ROLE_PRESET_AGE = 16;
const DEFAULT_ROLE_PRESET_STYLE_WORDS: EmotionToneCategory[] = ["欢快", "阳光"];
export const STEP1_ROLE_PRESET_READY_SUMMARY = "人物预设数据已同步，可进入 Step2。";

const ROLE_PRESET_FALLBACK_TEMPLATES: Array<{
  ethnicityOrRegion: Step1RolePresetAllowedRegion;
  gender: Gender;
  age: number;
  styleWords: EmotionToneCategory[];
}> = [
  {
    ethnicityOrRegion: DEFAULT_ROLE_PRESET_REGION,
    gender: "female",
    age: 16,
    styleWords: ["欢快", "阳光"],
  },
  {
    ethnicityOrRegion: DEFAULT_ROLE_PRESET_REGION,
    gender: "male",
    age: 17,
    styleWords: ["动感", "自信"],
  },
  {
    ethnicityOrRegion: DEFAULT_ROLE_PRESET_REGION,
    gender: "female",
    age: 17,
    styleWords: ["轻松", "温暖"],
  },
  {
    ethnicityOrRegion: DEFAULT_ROLE_PRESET_REGION,
    gender: "male",
    age: 16,
    styleWords: ["阳光", "动感"],
  },
  {
    ethnicityOrRegion: DEFAULT_ROLE_PRESET_REGION,
    gender: "female",
    age: 15,
    styleWords: ["温暖", "自信"],
  },
  {
    ethnicityOrRegion: DEFAULT_ROLE_PRESET_REGION,
    gender: "male",
    age: 18,
    styleWords: ["轻松", "自信"],
  },
];

function clampConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0.7;
  }
  return Math.max(0, Math.min(1, parsed));
}

function normalizeGender(value: unknown): Gender {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "male" || normalized === "female" || normalized === "unknown") {
    return normalized;
  }
  return "unknown";
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePortraitUrl(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "string" ? value : null;
}

function normalizeStyleWords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_ROLE_PRESET_STYLE_WORDS];
  }
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index);
  return normalized.length > 0 ? normalized : [...DEFAULT_ROLE_PRESET_STYLE_WORDS];
}

/**
 * 将 styleWords 转换为有效的情绪基调数组
 * 如果值不在 18 种允许的情绪基调中，尝试解析或使用默认值
 */
function normalizeStyleWordsToEmotionTones(value: unknown): EmotionToneCategory[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_ROLE_PRESET_STYLE_WORDS] as EmotionToneCategory[];
  }
  const validTones: EmotionToneCategory[] = [];
  for (const item of value) {
    const str = typeof item === "string" ? item.trim() : "";
    if (str.length === 0) continue;
    // 尝试解析为有效的情绪基调
    const parsed = parseEmotionToneFromText(str);
    if (parsed && !validTones.includes(parsed)) {
      validTones.push(parsed);
    }
  }
  return validTones.length > 0 ? validTones : [...DEFAULT_ROLE_PRESET_STYLE_WORDS] as EmotionToneCategory[];
}

function normalizeOptionalRegion(value: unknown): Step1RolePresetAllowedRegion | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }
  try {
    return normalizeStep1RolePresetRegion(normalized);
  } catch {
    return DEFAULT_ROLE_PRESET_REGION;
  }
}

function isPendingSummary(summary: string | null): boolean {
  return typeof summary === "string" && /生成中|稍候|刷新/u.test(summary);
}

function normalizeRawRoleDirectionCards(input: unknown): Step1RoleDirectionCard[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    const directionId = normalizeOptionalString(record.directionId) || `role-preset-${index + 1}`;
    return [
      {
        directionId,
        styleSummary: normalizeOptionalString(record.styleSummary) || STEP1_ROLE_PRESET_READY_SUMMARY,
        portraitUrl: normalizePortraitUrl(record.portraitUrl),
        confidence: clampConfidence(record.confidence),
        ethnicityOrRegion: normalizeOptionalRegion(record.ethnicityOrRegion),
        gender:
          typeof record.gender === "string" && record.gender.trim().length > 0
            ? normalizeGender(record.gender)
            : null,
        age: typeof record.age === "number" && Number.isFinite(record.age) ? Math.floor(record.age) : null,
        styleWords: Array.isArray(record.styleWords) ? normalizeStyleWords(record.styleWords) : null,
      },
    ];
  });
}

function hasExplicitRolePresetSignal(direction: Partial<Step1RoleDirectionCard>): boolean {
  return Boolean(
    normalizeOptionalString(direction.ethnicityOrRegion) ||
      normalizeOptionalString(direction.gender) ||
      typeof direction.age === "number" ||
      (Array.isArray(direction.styleWords) && direction.styleWords.length > 0),
  );
}

function hashRolePresetIdentity(direction: Partial<Step1RoleDirectionCard> & { directionId: string }, index: number): number {
  const seed = `${direction.directionId}|${index}`;
  let hash = 0;
  for (let cursor = 0; cursor < seed.length; cursor += 1) {
    hash = (hash * 33 + seed.charCodeAt(cursor)) >>> 0;
  }
  return hash;
}

function resolveFallbackRolePresetTemplate(
  direction: Partial<Step1RoleDirectionCard> & { directionId: string },
  index: number,
) {
  return ROLE_PRESET_FALLBACK_TEMPLATES[hashRolePresetIdentity(direction, index) % ROLE_PRESET_FALLBACK_TEMPLATES.length]!;
}

export function buildControlledRolePresetFromDirection(
  direction: Partial<Step1RoleDirectionCard> & { directionId: string },
  index = 0,
): Step1RolePreset {
  const fallbackTemplate = resolveFallbackRolePresetTemplate(direction, index);
  const hasExplicitSignal = hasExplicitRolePresetSignal(direction);
  const normalizedBundle = normalizeStep1RolePresetBundle({
    sourceTaskId: `step1-role-preset-adapter-${index + 1}`,
    rolePresets: [
      {
        presetId: direction.directionId,
        ethnicityOrRegion:
          normalizeOptionalString(direction.ethnicityOrRegion) ||
          (hasExplicitSignal ? DEFAULT_ROLE_PRESET_REGION : fallbackTemplate.ethnicityOrRegion),
        gender:
          normalizeOptionalString(direction.gender) || hasExplicitSignal
            ? normalizeGender(direction.gender)
            : fallbackTemplate.gender,
        age:
          typeof direction.age === "number" && Number.isFinite(direction.age)
            ? Math.floor(direction.age)
            : hasExplicitSignal
              ? DEFAULT_ROLE_PRESET_AGE
              : fallbackTemplate.age,
        styleWords:
          Array.isArray(direction.styleWords) && direction.styleWords.length > 0
            ? normalizeStyleWordsToEmotionTones(direction.styleWords)
            : [...fallbackTemplate.styleWords],
      },
    ],
  });
  return mapRolePresetBundleToCards(normalizedBundle)[0];
}

export function buildStep1RoleDirectionCardsFromPresetBundle(input: unknown): Step1RoleDirectionCard[] {
  const bundle = normalizeStep1RolePresetBundle(input);
  return mapRolePresetBundleToCards(bundle).map((preset, index) => ({
    directionId: preset.presetId,
    styleSummary: STEP1_ROLE_PRESET_READY_SUMMARY,
    portraitUrl: null,
    confidence: clampConfidence(0.92 - index * 0.07),
    ethnicityOrRegion: preset.ethnicityOrRegion,
    gender: preset.gender,
    age: preset.age,
    styleWords: preset.styleWords,
  }));
}

export function adaptStep1RolePresetCards(
  input: unknown,
  sourceTaskId = "step1-role-preset-adapter",
): Step1RoleDirectionCard[] {
  const rawCards = normalizeRawRoleDirectionCards(input);
  return rawCards.map((card, index) => {
    const preset = buildControlledRolePresetFromDirection(card, index);
    const summary = isPendingSummary(card.styleSummary) ? card.styleSummary : STEP1_ROLE_PRESET_READY_SUMMARY;
    // 保留原始 styleWords（服饰风格），不做情绪基调转换
    // preset.styleWords 是情绪基调，card.styleWords 是服饰风格，显示时应使用服饰风格
    const displayStyleWords = Array.isArray(card.styleWords) && card.styleWords.length > 0
      ? card.styleWords
      : preset.styleWords;
    return {
      directionId: card.directionId,
      styleSummary: summary,
      portraitUrl: card.portraitUrl ?? null,
      confidence: card.confidence,
      ethnicityOrRegion: preset.ethnicityOrRegion,
      gender: preset.gender,
      age: preset.age,
      styleWords: displayStyleWords,
    };
  });
}

export function resolveStep1RolePresetCardById(
  input: unknown,
  selectedDirectionId: string | null | undefined,
): Step1RoleDirectionCard | null {
  const cards = adaptStep1RolePresetCards(input);
  if (!selectedDirectionId) {
    return null;
  }
  return cards.find((item) => item.directionId === selectedDirectionId) ?? null;
}

export function buildStep1RolePromptInputFromCard(
  direction: Step1RoleDirectionCard,
  outfitSummary: string | null | undefined,
): Step1CleanHiddenPromptInput {
  return {
    ethnicityOrRegion: direction.ethnicityOrRegion ?? DEFAULT_ROLE_PRESET_REGION,
    gender: direction.gender ?? "unknown",
    age: typeof direction.age === "number" ? direction.age : DEFAULT_ROLE_PRESET_AGE,
    styleWords: Array.isArray(direction.styleWords) && direction.styleWords.length > 0
      ? [...direction.styleWords]
      : [...DEFAULT_ROLE_PRESET_STYLE_WORDS],
    directionTitle: null,
    directionSummary: null,
    outfitSummary: typeof outfitSummary === "string" && outfitSummary.trim().length > 0 ? outfitSummary.trim() : null,
  };
}
