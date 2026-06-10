export const STEP1_ROLE_PRESET_GOVERNANCE_CONTRACT_VERSION = "AT35-08.v1";

export const STEP1_ROLE_PRESET_ALLOWED_REGION_LABELS = [
  "Asian",
  "East Asian",
  "Southeast Asian",
  "European",
  "North European",
  "Latin",
  "Middle Eastern",
  "South Asian",
] as const;
export type Step1RolePresetAllowedRegion = string;

// 导入统一年龄常量
import { MIN_AGE, MAX_AGE } from "../constants/age-groups.js";

export const STEP1_ROLE_PRESET_MIN_AGE = MIN_AGE;  // 支持新生儿段（0-30岁）
export const STEP1_ROLE_PRESET_MAX_AGE = MAX_AGE; // 统一最大年龄

export const STEP1_ROLE_PRESET_PANEL_ALLOWED_FIELDS = [
  "ethnicityOrRegion",
  "gender",
  "age",
  "styleWords",
] as const;

export const STEP1_ROLE_PRESET_PANEL_FORBIDDEN_FALLBACK_FIELDS = [
  "title",
  "styleSummary",
  "directionId",
  "confidence",
  "portraitUrl",
] as const;

export const STEP1_ROLE_PRESET_STYLEWORD_TITLE_DENYLIST = [
  "title",
  "标题",
  "look",
  "outfit",
  "preset",
  "direction",
  "风格标题",
  "角色预设",
] as const;

function compactToken(value: string, maxLength = 40): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return compact.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
}

export function normalizeStep1RolePresetRegion(value: unknown): Step1RolePresetAllowedRegion {
  const source = compactToken(String(value ?? ""), 40);
  if (!source) {
    return "Asian";
  }
  const lower = source.toLowerCase();
  if (/(southeast asia|southeast asian|东南亚|东南亚裔)/u.test(lower)) {
    return "Southeast Asian";
  }
  if (/(east asia|east asian|东亚|东亚裔)/u.test(lower)) {
    return "East Asian";
  }
  if (/(north europe|北欧|nordic|scandinavian)/u.test(lower)) {
    return "North European";
  }
  if (/(europe|european|欧洲|欧裔|白人|caucasian)/u.test(lower)) {
    return "European";
  }
  if (/(latin|拉美|拉丁|latino|hispanic)/u.test(lower)) {
    return "Latin";
  }
  if (/(middle east|中东|arab|阿拉伯)/u.test(lower)) {
    return "Middle Eastern";
  }
  if (/(south asia|南亚|indian|印度)/u.test(lower)) {
    return "South Asian";
  }
  if (/(asian|asia|亚洲|亚裔)/u.test(lower)) {
    return "Asian";
  }
  // LLM 返回其他地区描述时保留原文
  return source;
}

export function normalizeStep1RolePresetAge(value: unknown): number {
  const raw = String(value ?? "").trim();
  const rangeMatch = raw.match(/(\d+)\s*[-~–—]\s*\d+/);
  if (rangeMatch) {
    const parsed = Number(rangeMatch[1]);
    if (Number.isFinite(parsed)) {
      return Math.max(STEP1_ROLE_PRESET_MIN_AGE, Math.min(STEP1_ROLE_PRESET_MAX_AGE, Math.floor(parsed)));
    }
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return 18; // 默认值
  }
  // clamp 到合法范围，不抛错
  return Math.max(STEP1_ROLE_PRESET_MIN_AGE, Math.min(STEP1_ROLE_PRESET_MAX_AGE, Math.floor(numeric)));
}

export function isStep1RolePresetTitleLike(value: string): boolean {
  const source = compactToken(value, 60).toLowerCase();
  if (!source) {
    return false;
  }
  if (/[：:|｜]/u.test(source)) {
    return true;
  }
  if (STEP1_ROLE_PRESET_STYLEWORD_TITLE_DENYLIST.some((token) => source.includes(token))) {
    return true;
  }
  const words = source.split(/\s+/u).filter((item) => item.length > 0);
  return words.length > 4;
}

export function assertStep1RolePresetGovernanceContract(): {
  version: string;
  allowedRegionCount: number;
  ageBand: string;
  panelFieldCount: number;
  forbiddenFallbackCount: number;
} {
  return {
    version: STEP1_ROLE_PRESET_GOVERNANCE_CONTRACT_VERSION,
    allowedRegionCount: STEP1_ROLE_PRESET_ALLOWED_REGION_LABELS.length,
    ageBand: `${STEP1_ROLE_PRESET_MIN_AGE}-${STEP1_ROLE_PRESET_MAX_AGE}`,
    panelFieldCount: STEP1_ROLE_PRESET_PANEL_ALLOWED_FIELDS.length,
    forbiddenFallbackCount: STEP1_ROLE_PRESET_PANEL_FORBIDDEN_FALLBACK_FIELDS.length,
  };
}
