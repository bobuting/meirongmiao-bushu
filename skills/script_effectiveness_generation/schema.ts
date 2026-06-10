import { z } from 'zod';

/**
 * 角色方向信息 Schema
 */
export const roleDirectionSchema = z.object({
  styleWords: z.array(z.string()),
});

/**
 * 服饰资产 Schema
 */
export const outfitAssetSchema = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string(),
  imageUrl: z.string().optional(),
});

/**
 * 角色信息 Schema
 */
export const characterInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string()),
  gender: z.enum(['male', 'female', 'uncertain']).optional(),
  age: z.string().optional(),
  description: z.string().optional(),
});

/**
 * 展示类型（效果导向脚本的核心分类）
 */
export const showcaseTypeSchema = z.enum([
  'ootd',           // 穿搭展示/OOTD
  'lifestyle',      // 生活随拍氛围感
  'lookbook',       // Lookbook 多套切换
  'travel',         // 旅游探店
  'comparison',     // 风格对比/一衣多穿
  'transform',      // 换装变装
]);

/**
 * 氛围感主题（仅 lifestyle 类型使用）
 */
export const atmosphereThemeSchema = z.enum([
  'solitary_diary',     // 独居日记
  'weekend_time',       // 周末时光
  'after_work',         // 下班路上
  'morning_routine',    // 早间 routine
  'night_solitude',     // 夜晚独处
  'rainy_snowy',        // 雨天/雪天
  'seasonal',           // 季节限定
]);

/**
 * 节奏类型
 */
export const rhythmTypeSchema = z.enum([
  'fast',       // 快节奏卡点
  'medium',     // 中节奏展示
  'slow',       // 慢节奏氛围
]);

/**
 * script_effectiveness_generation 输入参数 Schema
 */
export const inputSchema = z.object({
  // ========== 展示类型与风格 ==========
  /** 展示类型（核心分类，决定脚本结构） */
  showcaseType: showcaseTypeSchema.optional(),

  /** 氛围感主题（仅 lifestyle 类型使用） */
  atmosphereTheme: atmosphereThemeSchema.optional(),

  /** 节奏类型偏好 */
  rhythmType: rhythmTypeSchema.optional(),

  /** 场景类型偏好（如城市街景、自然风光、居家等） */
  sceneTypeHint: z.string().optional(),

  /** 情绪基调偏好 */
  moodHint: z.string().optional(),

  // ========== 角色信息（关键：性别锚定） ==========
  /** 角色列表 */
  characters: z.array(characterInfoSchema).optional(),

  /** 角色性别（显式传递，避免文本解析误判） */
  characterGender: z.enum(['male', 'female', 'uncertain']).optional(),

  /** 角色综合描述（包含性别、年龄段、风格、气质等） */
  characterDescription: z.string().optional(),

  // ========== 服饰信息 ==========
  /** 服饰资产列表 */
  assets: z.array(outfitAssetSchema).optional(),

  /** 服饰搭配描述 */
  outfitDescription: z.string().optional(),

  /** 服饰风格列表，如["通勤风", "简约风"] */
  clothingStyles: z.array(z.string()).optional(),

  /** 搭配参考描述 */
  matchingReference: z.string().optional(),

  // ========== 角色方向 ==========
  /** 选中的角色方向 */
  selectedRoleDirection: roleDirectionSchema.optional(),

  // ========== 热点数据 ==========
  /** 热点描述 */
  trendDescription: z.string().optional(),

  // ========== 反思笔记（迭代优化用） ==========
  /** 反思笔记 */
  reflectionNotes: z.array(z.string()).optional(),
});

export type Input = z.infer<typeof inputSchema>;
export type RoleDirection = z.infer<typeof roleDirectionSchema>;
export type OutfitAsset = z.infer<typeof outfitAssetSchema>;
export type CharacterInfo = z.infer<typeof characterInfoSchema>;
export type ShowcaseType = z.infer<typeof showcaseTypeSchema>;
export type AtmosphereTheme = z.infer<typeof atmosphereThemeSchema>;
export type RhythmType = z.infer<typeof rhythmTypeSchema>;
