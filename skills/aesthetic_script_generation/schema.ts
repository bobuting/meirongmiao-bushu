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
 * 生活美学类型（核心分类）
 */
export const aestheticTypeSchema = z.enum([
  'daily_record',      // 日常记录
  'aesthetic_atmosphere', // 唯美氛围
  'life_discovery',    // 生活发现
  'fashion_aesthetic', // 时装美学
  'travel_memory',     // 旅行记录
]);

/**
 * 氛围感主题
 */
export const atmosphereThemeSchema = z.enum([
  'morning_routine',   // 晨间routine
  'weekend_time',      // 周末时光
  'after_work',        // 下班路上
  'night_solitude',    // 夜晚独处
  'seasonal',          // 季节限定
  'rainy_snowy',       // 雨天/雪天
]);

/**
 * 节奏类型
 */
export const rhythmTypeSchema = z.enum([
  'slow',    // 慢呼吸节奏
  'medium',  // 中叙事节奏
  'fast',    // 快卡点节奏
]);

/**
 * 时间段
 */
export const timeOfDaySchema = z.enum([
  'morning',    // 清晨
  'afternoon',  // 午后
  'dusk',       // 黄昏
  'night',      // 夜晚
]);

/**
 * aesthetic_script_generation 输入参数 Schema
 */
export const inputSchema = z.object({
  // ========== 生活美学类型与风格 ==========
  /** 生活美学类型（核心分类，决定脚本结构） */
  aestheticType: aestheticTypeSchema.optional(),

  /** 氛围感主题 */
  atmosphereTheme: atmosphereThemeSchema.optional(),

  /** 节奏类型偏好 */
  rhythmType: rhythmTypeSchema.optional(),

  /** 时间段偏好 */
  timeOfDay: timeOfDaySchema.optional(),

  /** 场景类型偏好（如咖啡馆、书店、公园等） */
  sceneTypeHint: z.string().optional(),

  /** 情感基调偏好 */
  moodHint: z.string().optional(),

  // ========== 情感触发点 ==========
  /** 情感触发点描述（核心是"发现生活的美好"） */
  emotionTrigger: z.string().optional(),

  // ========== 角色信息 ==========
  /** 角色列表 */
  characters: z.array(characterInfoSchema).optional(),

  /** 角色性别（显式传递，避免文本解析误判） */
  characterGender: z.enum(['male', 'female', 'uncertain']).optional(),

  /** 角色综合描述（包含性别、年龄段、风格、气质等） */
  characterDescription: z.string().optional(),

  // ========== 服饰信息 ==========
  /** 服饰资产列表（作为美好生活的组成元素） */
  assets: z.array(outfitAssetSchema).optional(),

  /** 服饰搭配描述 */
  outfitDescription: z.string().optional(),

  /** 服饰风格列表 */
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

  // ========== 场景推荐 ==========
  /** 场景库推荐场景文本 */
  recommendedScenes: z.string().optional(),
});

export type Input = z.infer<typeof inputSchema>;
export type RoleDirection = z.infer<typeof roleDirectionSchema>;
export type OutfitAsset = z.infer<typeof outfitAssetSchema>;
export type CharacterInfo = z.infer<typeof characterInfoSchema>;
export type AestheticType = z.infer<typeof aestheticTypeSchema>;
export type AtmosphereTheme = z.infer<typeof atmosphereThemeSchema>;
export type RhythmType = z.infer<typeof rhythmTypeSchema>;
export type TimeOfDay = z.infer<typeof timeOfDaySchema>;