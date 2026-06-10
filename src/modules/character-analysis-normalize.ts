/**
 * 角色分析字段统一归一化
 *
 * 所有角色来源（识图 checkPortraitImage、生成角色、上传角色）的
 * age / gender / ethnicity 都经过此模块归一化，确保格式一致。
 */

// ============================================================================
// Gender 归一化
// ============================================================================

export type NormalizedGender = "male" | "female";

const GENDER_MALE_ALIASES = new Set(["male", "man", "boy", "男性", "男"]);
const GENDER_FEMALE_ALIASES = new Set(["female", "woman", "girl", "女性", "女"]);

export function normalizeGender(value: unknown): NormalizedGender | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase().trim();
  if (GENDER_MALE_ALIASES.has(lower)) return "male";
  if (GENDER_FEMALE_ALIASES.has(lower)) return "female";
  return null;
}

// ============================================================================
// Age 归一化 → number | null
// ============================================================================

const AGE_TEXT_MAP: Record<string, number> = {
  // 中文
  "新生儿": 1,
  "婴儿": 1,
  "婴童": 2,
  "幼童": 5,
  "幼儿": 5,
  "儿童": 10,
  "少年": 14,
  "青少年": 15,
  "青年": 20,
  "成年": 25,
  "成人": 25,
  "中年": 35,
  "老年": 60,
  // 英文
  "newborn": 1,
  "infant": 2,
  "baby": 2,
  "toddler": 4,
  "kid": 9,
  "child": 9,
  "teen": 15,
  "teenager": 15,
  "adolescent": 15,
  "young": 20,
  "young adult": 22,
  "adult": 25,
  "middle-aged": 40,
  "elderly": 60,
  "senior": 65,
  "old": 60,
};

export function normalizeAge(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return clampAge(Math.round(value));
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // 纯数字
  const num = Number(trimmed);
  if (Number.isFinite(num)) return clampAge(Math.round(num));
  // 文本描述（中文含"儿童/青少年"等）
  const lower = trimmed.toLowerCase();
  for (const [key, val] of Object.entries(AGE_TEXT_MAP)) {
    if (lower.includes(key.toLowerCase())) return clampAge(val);
  }
  return null;
}

function clampAge(age: number): number | null {
  if (age < 0 || age > 100) return null;
  return age;
}

// ============================================================================
// Ethnicity 归一化
// ============================================================================

export type NormalizedEthnicity = "Asian" | "East Asian" | "Southeast Asian" | "South Asian" | "Chinese" | "Japanese" | "Korean" | "European" | "North European" | "Western" | "Latino" | "Middle Eastern" | "African" | "Mixed";

// 精确匹配优先：长词在前，避免 "east asian" 误匹配 "southeast asian"
const ETHNICITY_MAP: Array<{ keywords: string[]; normalized: NormalizedEthnicity }> = [
  // 精确枚举值（prompt 已引导 LLM 直接返回这些值）
  { keywords: ["southeast asian"], normalized: "Southeast Asian" },
  { keywords: ["south asian"], normalized: "South Asian" },
  { keywords: ["east asian"], normalized: "East Asian" },
  { keywords: ["north european"], normalized: "North European" },
  { keywords: ["middle eastern"], normalized: "Middle Eastern" },
  // 中文别名 + 精确值
  { keywords: ["中国", "chinese"], normalized: "Chinese" },
  { keywords: ["日本", "japanese"], normalized: "Japanese" },
  { keywords: ["韩国", "korean"], normalized: "Korean" },
  { keywords: ["东南亚"], normalized: "Southeast Asian" },
  { keywords: ["南亚", "indian", "印度"], normalized: "South Asian" },
  { keywords: ["东亚"], normalized: "East Asian" },
  { keywords: ["北欧", "nordic", "scandinavian"], normalized: "North European" },
  { keywords: ["中东", "arab"], normalized: "Middle Eastern" },
  // 较短/宽泛的词放后面
  { keywords: ["欧美", "western", "american", "美国", "西方"], normalized: "Western" },
  { keywords: ["欧洲", "european", "白人", "white", "caucasian", "白种"], normalized: "European" },
  { keywords: ["拉丁", "latin", "latino", "latina", "hispanic"], normalized: "Latino" },
  { keywords: ["亚洲", "asian", "黄种"], normalized: "Asian" },
  { keywords: ["非洲", "african", "black", "黑人"], normalized: "African" },
  { keywords: ["混血", "mixed"], normalized: "Mixed" },
];

export function normalizeEthnicity(value: unknown): NormalizedEthnicity | null {
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase().trim();
  if (!lower) return null;
  for (const { keywords, normalized } of ETHNICITY_MAP) {
    if (keywords.some((kw) => lower.includes(kw))) return normalized;
  }
  return null;
}
