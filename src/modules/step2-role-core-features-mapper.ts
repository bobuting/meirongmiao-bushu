import type { Step1RolePreset } from "../contracts/step1-role-preset-contract.js";

export interface Step2RoleCoreFeaturesResult {
  anchor: string;
  descriptors: string[];
  coreFeatures: string;
}

const STEP2_ROLE_CORE_FEATURES_CLOTHING_DENYLIST = [
  /\b(?:jacket|hoodie|shirt|coat|skirt|pants?|trousers|dress|sneakers?|heels?|shoes?|boots?|uniform|suit|blazer)\b/iu,
  /(?:外套|夹克|裙|裤|鞋|靴|服装|上装|下装|卫衣|西装|风衣)/u,
] as const;

const STEP2_ROLE_CORE_FEATURES_NOISE_DENYLIST = [
  /\b(?:title|json|prompt|return only|optimized prompt|look)\b/iu,
  /(?:标题|提示词|角色预设|方向)/u,
  /\b(?:studio|background|lighting|light)\b/iu,
  /(?:棚拍|白底|光线|背景)/u,
] as const;

const STEP2_ROLE_STYLE_PATTERNS: Array<{ pattern: RegExp; word: string }> = [
  { pattern: /清冷|aloof/iu, word: "aloof" },
  { pattern: /文艺|literary/iu, word: "literary" },
  { pattern: /商务轻熟|smart business-casual/iu, word: "smart business-casual" },
  { pattern: /阳光|sunny/iu, word: "sunny" },
  { pattern: /运动|athletic/iu, word: "athletic" },
  { pattern: /温柔|gentle/iu, word: "gentle" },
  { pattern: /治愈|healing|soothing/iu, word: "soothing" },
  { pattern: /俏皮|playful/iu, word: "playful" },
  { pattern: /鬼马|quirky/iu, word: "quirky" },
  { pattern: /搞怪|mischievous/iu, word: "mischievous" },
  { pattern: /学霸|书卷|studious|scholarly/iu, word: "studious" },
  { pattern: /内敛|reserved/iu, word: "reserved" },
  { pattern: /干练|sharp/iu, word: "sharp" },
  { pattern: /利落|neat/iu, word: "neat" },
  { pattern: /活力|元气|energetic/iu, word: "energetic" },
  { pattern: /清爽|fresh|clean/iu, word: "fresh" },
  { pattern: /自然|natural/iu, word: "natural" },
  { pattern: /通勤|commuter/iu, word: "refined" },
  { pattern: /少年感|youthful/iu, word: "youthful" },
  { pattern: /活泼|lively/iu, word: "lively" },
  { pattern: /自信|confident/iu, word: "confident" },
  { pattern: /街头|street/iu, word: "street-smart" },
] as const;

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function isBlockedToken(value: string): boolean {
  return (
    STEP2_ROLE_CORE_FEATURES_CLOTHING_DENYLIST.some((pattern) => pattern.test(value)) ||
    STEP2_ROLE_CORE_FEATURES_NOISE_DENYLIST.some((pattern) => pattern.test(value))
  );
}

function collectRawSourceText(preset: Step1RolePreset): string {
  return compactText([...preset.styleWords].join(" "));
}

function normalizeRegion(rawValue: string): string {
  const normalized = compactText(rawValue).toLowerCase();
  if (!normalized) {
    return "Asian";
  }
  if (normalized.includes("asia") || /亚洲|东亚|东南亚/u.test(rawValue)) {
    return "Asian";
  }
  if (normalized.includes("europe")) {
    return "European";
  }
  if (normalized.includes("latin")) {
    return "Latina";
  }
  return compactText(rawValue) || "Asian";
}

function resolveRoleNoun(sourceText: string, preset: Step1RolePreset): string {
  const genderedNoun =
    preset.gender === "male"
      ? "boy"
      : preset.gender === "female"
      ? "girl"
      : "youth";
  if (/书店/u.test(sourceText)) {
    return `bookstore ${genderedNoun}`;
  }
  if (/邻家/u.test(sourceText)) {
    return `next-door ${genderedNoun}`;
  }
  if (/学霸|书卷/u.test(sourceText)) {
    return `scholar ${genderedNoun}`;
  }
  if (/运动/u.test(sourceText)) {
    return `athletic ${genderedNoun}`;
  }
  return genderedNoun;
}

function collectAnchorWords(sourceText: string): string[] {
  const words: string[] = [];
  for (const rule of STEP2_ROLE_STYLE_PATTERNS) {
    if (!rule.pattern.test(sourceText)) {
      continue;
    }
    if (!words.includes(rule.word)) {
      words.push(rule.word);
    }
    if (words.length >= 2) {
      break;
    }
  }
  return words;
}

function resolvePhysicalDescriptors(preset: Step1RolePreset): string[] {
  if (preset.gender === "male") {
    return [
      "clear almond eyes",
      "warm neutral fair skin with matte texture and visible pores",
      "oval-to-heart face with a soft jawline",
      "small straight nose with a soft rounded tip",
      "natural thin lips with muted tone",
      "short natural black textured hair",
      "gentle and calm temperament",
      "slim standard build",
      "slight smile",
    ];
  }
  if (preset.gender === "female") {
    return [
      "inner double-fold slender eyes with subtle aegyo-sal",
      "warm white skin with matte texture and visible pores",
      "oval-to-heart face with a soft jawline",
      "small straight nose with a soft rounded tip",
      "natural M-shaped lips with muted tone",
      "long natural black hair, straight or softly wavy",
      "gentle, quiet, bookish temperament",
      "slim standard build",
      "smiling",
    ];
  }
  return [
    "clean almond eyes with subtle lower-lid fullness",
    "warm neutral fair skin with matte texture and visible pores",
    "soft jawline with oval face tendency",
    "small straight nose with natural tip",
    "natural muted lips",
    "black softly layered hair",
    "gentle and composed temperament",
    "slim standard build",
    "soft smile",
  ];
}

function collectFallbackDescriptors(preset: Step1RolePreset): string[] {
  const rawTokens = [...preset.styleWords]
    .flatMap((value) => String(value ?? "").split(/[，,、/|]/u))
    .map((value) => compactText(value))
    .filter((value) => value.length > 0 && !isBlockedToken(value));
  const output: string[] = [];
  for (const token of rawTokens) {
    if (containsCjk(token)) {
      continue;
    }
    const normalized = token.toLowerCase();
    if (!output.includes(normalized)) {
      output.push(normalized);
    }
    if (output.length >= 2) {
      break;
    }
  }
  return output;
}

export function mapStep1RolePresetToEnglishCoreFeatures(
  preset: Step1RolePreset,
): Step2RoleCoreFeaturesResult {
  const sourceText = collectRawSourceText(preset);
  const region = normalizeRegion(preset.ethnicityOrRegion);
  const roleNoun = resolveRoleNoun(sourceText, preset);
  const anchorWords = collectAnchorWords(sourceText);
  const fallbackWords = anchorWords.length > 0 ? [] : collectFallbackDescriptors(preset);
  const anchor = compactText([...anchorWords, ...fallbackWords, region, roleNoun, `age${preset.age}`].join(" "));
  const descriptors = resolvePhysicalDescriptors(preset);
  return {
    anchor,
    descriptors,
    coreFeatures: [anchor, ...descriptors].join(", "),
  };
}
