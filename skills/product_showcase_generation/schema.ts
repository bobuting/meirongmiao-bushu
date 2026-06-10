import { z } from 'zod';

/**
 * 角色方向信息 Schema
 */
export const roleDirectionSchema = z.object({
  styleWords: z.array(z.string()),
});

/**
 * 视觉概念 Schema（阶段1输出）
 */
export const productConceptSchema = z.object({
  title: z.string(),
  colorTone: z.string(),
  productFocus: z.array(z.string()),
  keyVisual: z.string(),
  endingVisual: z.string(),
  scenePlan: z.array(z.object({
    scene: z.string(),
    purpose: z.string(),
    keyShots: z.array(z.string()),
  })).optional(),
  modelActions: z.array(z.string()).optional(),
});

/**
 * 导演人格 Schema
 */
export const directorPersonaSchema = z.object({
  name: z.string(),
  specialty: z.string(),
  styleSignature: z.string(),
  cameraPreference: z.string(),
  editingRhythm: z.string(),
});

/**
 * 多样化维度 Schema
 */
export const diversitySchema = z.object({
  scene: z.string(),
  showcaseStyle: z.string(),
  cameraMovement: z.string(),
  mood: z.string(),
  openingStyle: z.string(),
  endingStyle: z.string(),
  musicRhythm: z.string(),
});

/**
 * product_showcase_generation 输入参数 Schema
 */
export const inputSchema = z.object({
  // ========== 角色信息（关键：性别锚定） ==========
  /** 角色性别（显式传递，避免文本解析误判） */
  characterGender: z.enum(['male', 'female', 'uncertain']).optional(),

  /** 角色综合描述（包含性别、年龄段、风格、气质等） */
  characterDescription: z.string().optional(),

  // ========== 服饰信息 ==========
  /** 服饰搭配描述 */
  outfitDescription: z.string().optional(),

  /** 服饰风格列表，如["通勤风", "简约风"] */
  clothingStyles: z.array(z.string()).optional(),

  /** 搭配参考描述 */
  matchingReference: z.string().optional(),

  // ========== 角色方向 ==========
  /** 选中的角色方向 */
  selectedRoleDirection: roleDirectionSchema.optional(),

  // ========== 视觉概念（阶段1输出） ==========
  /** 产品展示视觉概念 */
  concept: productConceptSchema.optional(),

  // ========== 导演人格 ==========
  /** 导演人格 */
  directorPersona: directorPersonaSchema.optional(),

  // ========== 金标样本 ==========
  /** 金标样本文本 */
  goldenExamplesText: z.string().optional(),

  // ========== 多样化维度 ==========
  /** 多样化维度配置 */
  diversity: diversitySchema.optional(),

  // ========== 场景推荐 ==========
  /** 场景库推荐场景文本 */
  recommendedScenes: z.string().optional(),
});

export type Input = z.infer<typeof inputSchema>;
export type RoleDirection = z.infer<typeof roleDirectionSchema>;
export type ProductConcept = z.infer<typeof productConceptSchema>;
export type DirectorPersona = z.infer<typeof directorPersonaSchema>;
export type Diversity = z.infer<typeof diversitySchema>;
