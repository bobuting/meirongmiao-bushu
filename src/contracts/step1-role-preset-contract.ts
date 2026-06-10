import {
  normalizeStep1RolePresetAge,
  normalizeStep1RolePresetRegion,
  STEP1_ROLE_PRESET_ALLOWED_REGION_LABELS,
  STEP1_ROLE_PRESET_GOVERNANCE_CONTRACT_VERSION,
  STEP1_ROLE_PRESET_MAX_AGE,
  STEP1_ROLE_PRESET_MIN_AGE,
  type Step1RolePresetAllowedRegion,
} from "./step1-role-preset-governance-contract.js";
import {
  type RoleStyleCategory,
  isValidRoleStyle,
  parseRoleStyleFromText,
  normalizeRoleStyleWords,
} from "../contant-config/role-style-dict.js";

export type Gender = "male" | "female" | "unknown";
export const STEP1_ROLE_PRESET_STEP2_FIXED_TEMPLATE_SLOT_FIELDS = [
  "ethnicityOrRegion",
  "gender",
  "age",
  "styleWords",
] as const;

export interface Step1RolePreset {
  presetId: string;
  ethnicityOrRegion: Step1RolePresetAllowedRegion;
  gender: Gender;
  age: number; // 0-30 inclusive（支持新生儿段）
  /** 角色风格词（独立字典：70+种角色风格） */
  styleWords: RoleStyleCategory[];
}

export interface Step1RolePresetBundle {
  sourceTaskId: string;
  rolePresets: Step1RolePreset[];
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  const arr = value.map((v, i) => {
    if (typeof v !== "string" || v.trim().length === 0) {
      throw new Error(`${field}[${i}] must be a non-empty string`);
    }
    return v.trim();
  });
  return arr;
}

/** 验证角色风格数组（柔性解析，自动映射自由文本） */
function assertRoleStyleArray(value: unknown, field: string): RoleStyleCategory[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }

  const result: RoleStyleCategory[] = [];
  for (let i = 0; i < value.length; i++) {
    const v = value[i];
    const str = typeof v === "string" ? v.trim() : "";
    if (str.length === 0) {
      continue; // 跳过空字符串，不报错
    }

    // 验证是否为有效枚举值
    if (isValidRoleStyle(str)) {
      result.push(str as RoleStyleCategory);
      continue;
    }

    // 尝试从自由文本中解析（兼容未严格遵循的输出）
    const parsed = parseRoleStyleFromText(str);
    if (parsed) {
      result.push(parsed);
      continue;
    }

    // 无法解析时跳过，不报错（柔性处理）
  }

  // 如果没有解析出任何有效风格，使用默认值
  if (result.length === 0) {
    return ["清新", "活泼"] as RoleStyleCategory[];
  }

  return result.slice(0, 4); // 最多 4 个风格词
}

function assertGender(value: unknown, field: string): Gender {
  const g = String(value ?? "").toLowerCase();
  if (g !== "male" && g !== "female" && g !== "unknown") {
    throw new Error(`${field} must be one of male|female|unknown`);
  }
  return g as Gender;
}

function assertAsianRegion(value: unknown, field: string): Step1RolePresetAllowedRegion {
  try {
    return normalizeStep1RolePresetRegion(value);
  } catch (error) {
    throw new Error(`${field} ${(error as Error).message}`);
  }
}

function assertAgeBand(value: unknown, field: string): number {
  try {
    return normalizeStep1RolePresetAge(value);
  } catch (error) {
    throw new Error(`${field} ${(error as Error).message}`);
  }
}

export function normalizeStep1RolePresetBundle(input: unknown): Step1RolePresetBundle {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("role preset bundle must be an object");
  }
  const rec = input as Record<string, unknown>;
  const sourceTaskId = assertString(rec.sourceTaskId, "sourceTaskId");
  const presets = normalizeStep1RolePresetList(rec.rolePresets);
  return { sourceTaskId, rolePresets: presets };
}

export function normalizeStep1RolePresetList(value: unknown, expectedCount?: number): Step1RolePreset[] {
  if (!Array.isArray(value)) {
    throw new Error("rolePresets must be an array");
  }
  const arr = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`rolePresets[${index}] must be an object`);
    }
    const it = item as Record<string, unknown>;
    const presetId = assertString(it.presetId, `rolePresets[${index}].presetId`);
    const ethnicityOrRegion = assertAsianRegion(it.ethnicityOrRegion, `rolePresets[${index}].ethnicityOrRegion`);
    const gender = assertGender(it.gender, `rolePresets[${index}].gender`);
    const age = assertAgeBand(it.age, `rolePresets[${index}].age`);
    const styleWords = assertRoleStyleArray(it.styleWords, `rolePresets[${index}].styleWords`);
    return { presetId, ethnicityOrRegion, gender, age, styleWords };
  });

  if (typeof expectedCount === "number" && Number.isFinite(expectedCount) && expectedCount > 0) {
    if (arr.length > expectedCount) {
      // Do not truncate silently; backend contract should not overshoot.
      throw new Error(`rolePresets length ${arr.length} exceeds expected ${expectedCount}`);
    }
    // IMPORTANT: do not pad the list. Frontend must not fabricate placeholders.
  }

  return arr;
}

export function assertStep1RolePresetContract(): {
  version: string;
  fields: number;
  minAge: number;
  maxAge: number;
  allowedRegions: number;
} {
  // Freeze basic expectations for contract tests
  const sample: Step1RolePreset = {
    presetId: "id",
    ethnicityOrRegion: "Asian",
    gender: "female",
    age: 16,
    styleWords: ["活泼", "清新"] as RoleStyleCategory[],
  };
  const keys = Object.keys(sample);
  if (keys.length !== 5) {
    throw new Error("role preset must keep exactly 5 fields");
  }
  return {
    version: STEP1_ROLE_PRESET_GOVERNANCE_CONTRACT_VERSION,
    fields: 5,
    minAge: STEP1_ROLE_PRESET_MIN_AGE,
    maxAge: STEP1_ROLE_PRESET_MAX_AGE,
    allowedRegions: STEP1_ROLE_PRESET_ALLOWED_REGION_LABELS.length,
  };
}