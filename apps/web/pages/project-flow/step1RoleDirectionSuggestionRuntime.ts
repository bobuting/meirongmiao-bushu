import type { Step1RoleDirectionCard } from "../../../../src/contracts/step1-joint-reverse-contract";
import type { Gender } from "../../../../src/contracts/step1-role-preset-contract";

export interface Step1RoleDirectionSuggestion {
  suggestionId: string;
  title: string;
  summary: string;
  /** 目标性别 */
  gender: Gender;
  /** 目标年龄（代表值） */
  age: number;
  /** 年龄段显示文本 */
  ageRange: string;
}

const STEP1_ROLE_DIRECTION_SUGGESTION_LIMIT = 6;

/** 具象的年龄段+性别方向 */
const STEP1_ROLE_DIRECTION_SUGGESTIONS: Step1RoleDirectionSuggestion[] = [
  // ===== 新生儿段（0-1岁） =====
  {
    suggestionId: "newborn-0-1-female",
    title: "",
    summary: "软糯可爱小宝宝",
    gender: "female",
    age: 1,
    ageRange: "0-1岁",
  },
  {
    suggestionId: "newborn-0-1-male",
    title: "",
    summary: "萌萌呆呆小宝宝",
    gender: "male",
    age: 1,
    ageRange: "0-1岁",
  },

  // ===== 婴幼儿+学龄前段（2-6岁） =====
  {
    suggestionId: "infant-2-6-female",
    title: "",
    summary: "萌萌可爱小宝贝",
    gender: "female",
    age: 4,
    ageRange: "2-6岁",
  },
  {
    suggestionId: "infant-2-6-male",
    title: "",
    summary: "活泼好动小宝贝",
    gender: "male",
    age: 4,
    ageRange: "2-6岁",
  },

  // ===== 低龄儿童段（6-8岁） =====
  {
    suggestionId: "child-6-8-female",
    title: "",
    summary: "活泼可爱小女孩",
    gender: "female",
    age: 7,
    ageRange: "6-8岁",
  },
  {
    suggestionId: "child-6-8-male",
    title: "",
    summary: "活泼机灵小男孩",
    gender: "male",
    age: 7,
    ageRange: "6-8岁",
  },

  // ===== 儿童段（8-12岁） =====
  {
    suggestionId: "kid-8-12-female",
    title: "",
    summary: "清新可爱小少女",
    gender: "female",
    age: 10,
    ageRange: "8-12岁",
  },
  {
    suggestionId: "kid-8-12-male",
    title: "",
    summary: "阳光帅气小少年",
    gender: "male",
    age: 10,
    ageRange: "8-12岁",
  },

  // ===== 青少年段（12-16岁） =====
  {
    suggestionId: "teen-12-16-female",
    title: "",
    summary: "青涩校园少女感",
    gender: "female",
    age: 14,
    ageRange: "12-16岁",
  },
  {
    suggestionId: "teen-12-16-male",
    title: "",
    summary: "阳光清爽少年感",
    gender: "male",
    age: 14,
    ageRange: "12-16岁",
  },

  // ===== 青年早期段（16-18岁） =====
  {
    suggestionId: "young-16-18-female",
    title: "",
    summary: "清新甜美少女",
    gender: "female",
    age: 17,
    ageRange: "16-18岁",
  },
  {
    suggestionId: "young-16-18-male",
    title: "",
    summary: "阳光帅气少年",
    gender: "male",
    age: 17,
    ageRange: "16-18岁",
  },

  // ===== 年轻成人段（18-22岁） =====
  {
    suggestionId: "adult-18-22-female",
    title: "",
    summary: "清新自然年轻女性",
    gender: "female",
    age: 20,
    ageRange: "18-22岁",
  },
  {
    suggestionId: "adult-18-22-male",
    title: "",
    summary: "干净利落年轻男性",
    gender: "male",
    age: 20,
    ageRange: "18-22岁",
  },

  // ===== 青壮年+轻熟龄段（22-30岁） =====
  {
    suggestionId: "mature-22-30-female",
    title: "",
    summary: "时尚靓丽都市女性",
    gender: "female",
    age: 26,
    ageRange: "22-30岁",
  },
  {
    suggestionId: "mature-22-30-male",
    title: "",
    summary: "时尚干练都市男性",
    gender: "male",
    age: 26,
    ageRange: "22-30岁",
  },
];

function inferGenderMode(roleDirections: Step1RoleDirectionCard[]): "female" | "male" | "mixed" {
  const genders = new Set(
    roleDirections
      .map((item) => item.gender)
      .filter((item): item is Gender => item === "female" || item === "male"),
  );
  if (genders.size === 1) {
    return genders.has("female") ? "female" : "male";
  }
  return "mixed";
}

export function buildStep1RoleDirectionSuggestions(params: {
  roleDirections: Step1RoleDirectionCard[];
  refreshIndex: number;
}): Step1RoleDirectionSuggestion[] {
  return STEP1_ROLE_DIRECTION_SUGGESTIONS;
}

export function resolveStep1RoleDirectionAdjustmentRemainingCount(appliedCount: number): number {
  return Math.max(0, STEP1_ROLE_DIRECTION_SUGGESTION_LIMIT - Math.max(0, appliedCount));
}
