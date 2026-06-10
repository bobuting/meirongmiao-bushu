/**
 * 统一种族/地区字典
 *
 * 从 LLM 生成到前端显示、后端特征映射，全链路复用此字典
 *
 * ## 设计原则
 * 1. LLM 提示词枚举值 = 前端显示 key = 后端处理 key
 * 2. 每个种族项包含：中文标签、特征描述、别名映射
 * 3. 新增种族必须同时更新此字典，禁止分散定义
 *
 * ## 使用场景
 * - LLM 提示词生成：使用 ethnicityOrRegion 枚举值
 * - 前端显示：使用 label 中文映射
 * - 后端特征提取：使用 baseline 特征描述
 */

// ============================================================================
// 核心种族字典（LLM 枚举值 = 前端 key = 后端 key）
// ============================================================================

/**
 * 种族/地区项定义
 */
export interface EthnicityItem {
  /** 英文 key（LLM 枚举值、前端 key、后端 key） */
  key: string;
  /** 中文标签（前端显示） */
  label: string;
  /** 特征描述（后端特征提取，注入 LLM 提示词） */
  baseline: string;
  /** 别名列表（兼容用户输入、旧数据） */
  aliases: string[];
  /** 分类：asian/european/other */
  category: "asian" | "european" | "other";
}

/**
 * 统一种族字典
 *
 * LLM 提示词枚举值必须从此列表选择
 * 前端 REGION_LABEL 从此映射
 * 后端 ETHNICITY_BASELINES 从此映射
 */
export const ETHNICITY_DICTIONARY: EthnicityItem[] = [
  // ========== 亚洲类（80% 概率）==========
  {
    key: "Asian",
    label: "亚洲",
    baseline: "Oval face, soft jawline, single/inner double eyelid, slender eyes, small straight nose, thin lips, black/dark brown hair",
    aliases: ["asian"],
    category: "asian",
  },
  {
    key: "East Asian",
    label: "东亚",
    baseline: "Oval face, soft jawline, single/inner double eyelid, slender eyes, small straight nose, thin lips, black/dark brown hair",
    aliases: ["east asian"],
    category: "asian",
  },
  {
    key: "Southeast Asian",
    label: "东南亚",
    baseline: "Oval face, warm skin tone, dark hair, expressive eyes, defined features",
    aliases: ["southeast asian"],
    category: "asian",
  },
  {
    key: "South Asian",
    label: "南亚",
    baseline: "Oval face, warm to medium skin, dark hair/eyes, defined features",
    aliases: ["south asian", "indian"],
    category: "asian",
  },
  {
    key: "Chinese",
    label: "中国",
    baseline: "Oval face, soft jawline, single/inner double eyelid, slender eyes, small straight nose, thin lips, black/dark brown hair",
    aliases: ["chinese"],
    category: "asian",
  },
  {
    key: "Japanese",
    label: "日本",
    baseline: "Oval face, soft jawline, varied eye shapes, refined features, dark hair",
    aliases: ["japanese"],
    category: "asian",
  },
  {
    key: "Korean",
    label: "韩国",
    baseline: "Oval face, soft jawline, varied eyelid types, refined features, dark hair",
    aliases: ["korean"],
    category: "asian",
  },

  // ========== 欧洲类（15% 概率）==========
  {
    key: "European",
    label: "欧洲",
    baseline: "Defined facial structure, varied eye colors, prominent nose bridge, fair to medium skin",
    aliases: ["european", "white", "caucasian"],
    category: "european",
  },
  {
    key: "North European",
    label: "北欧",
    baseline: "Defined facial structure, light eye colors (blue/green), prominent nose bridge, fair skin, blonde to light brown hair",
    aliases: ["north european", "nordic"],
    category: "european",
  },
  {
    key: "Western",
    label: "西方",
    baseline: "Defined facial structure, varied eye colors, prominent nose bridge, fair to medium skin",
    aliases: ["western", "american", "北美"], // 美国主流人口特征接近欧洲裔
    category: "european",
  },

  // ========== 其他类（5% 概率）==========
  {
    key: "Latino",
    label: "拉丁",
    baseline: "Oval face, warm skin, dark hair, defined cheekbones, expressive eyes",
    aliases: ["latino", "latin", "hispanic"],
    category: "other",
  },
  {
    key: "Middle Eastern",
    label: "中东",
    baseline: "Oval face, olive skin, dark hair/eyes, defined features, prominent nose",
    aliases: ["middle eastern", "arab", "persian", "turkish"],
    category: "other",
  },
  {
    key: "African",
    label: "非洲",
    baseline: "Round/oval face, dark skin, curly hair, full lips, broad nose",
    aliases: ["african", "black"],
    category: "other",
  },
  {
    key: "Mixed",
    label: "混血",
    baseline: "Blended facial features from multiple ethnicities, varied skin tones and features",
    aliases: ["mixed"],
    category: "other",
  },
];

// ============================================================================
// 便捷映射（从字典自动生成）
// ============================================================================

/** 前端显示：英文 key → 中文 label */
export const REGION_LABEL: Record<string, string> = Object.fromEntries(
  ETHNICITY_DICTIONARY.map((item) => [item.key, item.label])
);

/** 后端特征提取：标准化 key → baseline */
export const ETHNICITY_BASELINES: Record<string, string> = Object.fromEntries(
  ETHNICITY_DICTIONARY.map((item) => [item.key.toLowerCase(), item.baseline])
);

/** 后端别名映射：别名 → 标准化 key */
export const ETHNICITY_ALIASES: Record<string, string> = Object.fromEntries(
  ETHNICITY_DICTIONARY.flatMap((item) =>
    item.aliases.map((alias) => [alias.toLowerCase(), item.key.toLowerCase()])
  )
);

/** LLM 提示词枚举值列表 */
export const ETHNICITY_ENUMS = ETHNICITY_DICTIONARY.map((item) => item.key);

/** 按分类分组 */
export const ETHNICITY_BY_CATEGORY = {
  asian: ETHNICITY_DICTIONARY.filter((item) => item.category === "asian").map((item) => item.key),
  european: ETHNICITY_DICTIONARY.filter((item) => item.category === "european").map((item) => item.key),
  other: ETHNICITY_DICTIONARY.filter((item) => item.category === "other").map((item) => item.key),
};

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 根据种族名称获取特征描述
 *
 * @param ethnicity 种族名称（可能是标准 key、别名、或混合值）
 * @returns 特征描述，不匹配时返回 null
 */
export function getEthnicityBaseline(ethnicity: string | null): string | null {
  if (!ethnicity) return null;
  const normalized = ethnicity.toLowerCase().trim();

  // 精确匹配
  if (ETHNICITY_BASELINES[normalized]) return ETHNICITY_BASELINES[normalized];

  // 别名匹配
  if (ETHNICITY_ALIASES[normalized]) return ETHNICITY_BASELINES[ETHNICITY_ALIASES[normalized]];

  // 模糊匹配（如 "East Asian" 包含 "asian"）
  for (const [key, desc] of Object.entries(ETHNICITY_BASELINES)) {
    if (normalized.includes(key)) return desc;
  }

  // 别名模糊匹配
  for (const [alias, key] of Object.entries(ETHNICITY_ALIASES)) {
    if (normalized.includes(alias)) return ETHNICITY_BASELINES[key];
  }

  return null;
}

/**
 * 验证种族值是否有效
 *
 * @param ethnicity 种族名称
 * @returns 是否在字典中定义
 */
export function isValidEthnicity(ethnicity: string): boolean {
  const normalized = ethnicity.toLowerCase().trim();
  return (
    ETHNICITY_BASELINES[normalized] !== undefined ||
    ETHNICITY_ALIASES[normalized] !== undefined
  );
}