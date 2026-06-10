/**
 * 统一年龄段定义（0-30岁）
 * 所有模块必须引用此定义，确保年龄段一致性
 */

/** 年龄段配置 */
export const AGE_GROUPS = {
  NEWBORN: {
    key: "NEWBORN",
    label: "新生儿",
    labelEn: "Newborn",
    range: "0-1",
    min: 0,
    max: 1,
    description: "极细腻、婴儿肥、粉嫩透亮、站不稳",
  },
  INFANT: {
    key: "INFANT",
    label: "婴童",
    labelEn: "Infant",
    range: "2-3",
    min: 2,
    max: 3,
    description: "极细腻、婴儿肥、粉嫩透亮",
  },
  TODDLER: {
    key: "TODDLER",
    label: "幼童",
    labelEn: "Toddler",
    range: "4-6",
    min: 4,
    max: 6,
    description: "极细腻、圆润脸型、自然光泽",
  },
  KID: {
    key: "KID",
    label: "儿童",
    labelEn: "Kid",
    range: "7-12",
    min: 7,
    max: 12,
    description: "细腻、均匀透亮、开始有轮廓",
  },
  TEEN: {
    key: "TEEN",
    label: "青少年",
    labelEn: "Teen",
    range: "13-17",
    min: 13,
    max: 17,
    description: "细腻、青春感、轻微油脂",
  },
  YOUNG_ADULT: {
    key: "YOUNG_ADULT",
    label: "年轻成人",
    labelEn: "Young Adult",
    range: "18-25",
    min: 18,
    max: 25,
    description: "毛孔开始可见、光泽感",
  },
  ADULT: {
    key: "ADULT",
    label: "成人",
    labelEn: "Adult",
    range: "26-30",
    min: 26,
    max: 30,
    description: "毛孔可见、肤理微妙变化",
  },
} as const;

/** 年龄段键类型 */
export type AgeGroupKey = keyof typeof AGE_GROUPS;

/** 年龄段范围字符串类型（用于 API 和数据库） */
export type AgeGroupRange =
  | "0-1"
  | "2-3"
  | "4-6"
  | "7-12"
  | "13-17"
  | "18-25"
  | "26-30";

/** 年龄段配置类型 */
export type AgeGroupConfig = (typeof AGE_GROUPS)[AgeGroupKey];

/** 年龄段列表（按年龄升序） */
export const AGE_GROUP_LIST: AgeGroupKey[] = [
  "NEWBORN",
  "INFANT",
  "TODDLER",
  "KID",
  "TEEN",
  "YOUNG_ADULT",
  "ADULT",
];

/** 年龄段范围字符串列表 */
export const AGE_GROUP_RANGES: AgeGroupRange[] = [
  "0-1",
  "2-3",
  "4-6",
  "7-12",
  "13-17",
  "18-25",
  "26-30",
];

/** 儿童年龄段范围列表（0-17岁） */
export const CHILD_AGE_RANGES: AgeGroupRange[] = [
  "0-1",
  "2-3",
  "4-6",
  "7-12",
  "13-17",
];

/** 成人年龄段范围列表（18-30岁） */
export const ADULT_AGE_RANGES: AgeGroupRange[] = [
  "18-25",
  "26-30",
];

/** 常用年龄段组合（用于情感原型库等场景） */
// 成人组合
export const YOUNG_ADULT_AGE_RANGES: AgeGroupRange[] = ["18-25"];
export const MATURE_ADULT_AGE_RANGES: AgeGroupRange[] = ["26-30"];
export const ALL_ADULT_AGE_RANGES: AgeGroupRange[] = ["18-25", "26-30"];

// 儿童/青少年组合
export const TEEN_AGE_RANGES: AgeGroupRange[] = ["13-17"];
export const CHILD_AGE_RANGES_7_12: AgeGroupRange[] = ["7-12"];
export const CHILD_AGE_RANGES_4_6: AgeGroupRange[] = ["4-6"];
export const CHILD_AGE_RANGES_2_3: AgeGroupRange[] = ["2-3"];
export const INFANT_TO_TODDLER_AGE_RANGES: AgeGroupRange[] = ["2-3", "4-6"];
export const CHILD_AND_TEEN_AGE_RANGES: AgeGroupRange[] = ["7-12", "13-17"];
export const TODDLER_AND_CHILD_AGE_RANGES: AgeGroupRange[] = ["4-6", "7-12"];
export const INFANT_TO_CHILD_AGE_RANGES: AgeGroupRange[] = ["2-3", "4-6", "7-12"];
export const INFANT_TO_TEEN_AGE_RANGES: AgeGroupRange[] = ["2-3", "4-6", "7-12", "13-17"];
export const TODDLER_TO_TEEN_AGE_RANGES: AgeGroupRange[] = ["4-6", "7-12", "13-17"];

/** 最小年龄 */
export const MIN_AGE = 0;

/** 最大年龄 */
export const MAX_AGE = 30;

/** 儿童年龄上限（不含，即 <= 17 为儿童） */
export const CHILD_AGE_THRESHOLD = 18;

/**
 * 根据年龄数字判断年龄段
 * @param age 年龄数字（0-30）
 * @returns 年龄段键
 * @throws Error 年龄超出支持范围
 */
export function getAgeGroupByAge(age: number): AgeGroupKey {
  if (age < MIN_AGE || age > MAX_AGE) {
    throw new Error(`年龄 ${age} 超出支持范围（${MIN_AGE}-${MAX_AGE}岁）`);
  }

  if (age >= 0 && age <= 1) return "NEWBORN";
  if (age >= 2 && age <= 3) return "INFANT";
  if (age >= 4 && age <= 6) return "TODDLER";
  if (age >= 7 && age <= 12) return "KID";
  if (age >= 13 && age <= 17) return "TEEN";
  if (age >= 18 && age <= 25) return "YOUNG_ADULT";
  if (age >= 26 && age <= 30) return "ADULT";

  // 理论上不会到达这里，但 TypeScript 需要返回值
  throw new Error(`年龄 ${age} 无法匹配年龄段`);
}

/**
 * 根据年龄段范围字符串获取年龄段键
 * @param range 年龄段范围字符串（如 "2-3"）
 * @returns 年龄段键
 */
export function getAgeGroupByRange(range: AgeGroupRange): AgeGroupKey {
  const entry = Object.entries(AGE_GROUPS).find(
    ([_, config]) => config.range === range
  );
  if (!entry) {
    throw new Error(`年龄段范围 "${range}" 无效`);
  }
  return entry[0] as AgeGroupKey;
}

/**
 * 获取年龄段配置
 * @param key 年龄段键
 * @returns 年龄段配置
 */
export function getAgeGroupConfig(key: AgeGroupKey): AgeGroupConfig {
  return AGE_GROUPS[key];
}

/**
 * 判断年龄段是否为儿童组（0-17岁）
 * @param key 年龄段键
 * @returns 是否为儿童组
 */
export function isChildAgeGroup(key: AgeGroupKey): boolean {
  return key === "NEWBORN" || key === "INFANT" || key === "TODDLER" || key === "KID" || key === "TEEN";
}

/**
 * 判断年龄段是否为成人组（18-30岁）
 * @param key 年龄段键
 * @returns 是否为成人组
 */
export function isAdultAgeGroup(key: AgeGroupKey): boolean {
  return key === "YOUNG_ADULT" || key === "ADULT";
}

/**
 * 判断年龄是否为儿童（0-17岁）
 * @param age 年龄数字
 * @returns 是否为儿童
 */
export function isChildAge(age: number | null | undefined): boolean {
  if (age == null) return false;
  return age < CHILD_AGE_THRESHOLD;
}

/**
 * 判断年龄范围字符串是否为儿童组
 * @param range 年龄范围字符串
 * @returns 是否为儿童组
 */
export function isChildAgeRange(range: AgeGroupRange): boolean {
  return CHILD_AGE_RANGES.includes(range);
}

/**
 * 验证年龄是否在有效范围内
 * @param age 年龄数字
 * @returns 是否有效
 */
export function isValidAge(age: number): boolean {
  return age >= MIN_AGE && age <= MAX_AGE && Number.isInteger(age);
}

/**
 * 获取相邻年龄段
 * @param key 当前年龄段键
 * @returns 上一个和下一个年龄段键（可能为 null）
 */
export function getAdjacentAgeGroups(
  key: AgeGroupKey
): { prev: AgeGroupKey | null; next: AgeGroupKey | null } {
  const index = AGE_GROUP_LIST.indexOf(key);
  return {
    prev: index > 0 ? AGE_GROUP_LIST[index - 1] : null,
    next: index < AGE_GROUP_LIST.length - 1 ? AGE_GROUP_LIST[index + 1] : null,
  };
}

/**
 * 根据年龄选择对应的分组
 * @param age 年龄数字
 * @returns 'child' 或 'adult'
 */
export function getAgeGroupCategory(age: number | null | undefined): 'child' | 'adult' {
  return isChildAge(age) ? 'child' : 'adult';
}