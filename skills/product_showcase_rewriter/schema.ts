import { z } from 'zod';

/**
 * 镜头分类结果 Schema
 */
export const shotClassificationSchema = z.object({
  /** 分镜 ID */
  shotId: z.number(),
  /** 分类结果：full_model / partial_model / no_model */
  classification: z.enum(['full_model', 'partial_model', 'no_model']),
  /** 分类原因说明 */
  reason: z.string(),
});

/**
 * 角色方向信息 Schema
 */
export const roleDirectionSchema = z.object({
  styleWords: z.array(z.string()),
});

/**
 * product_showcase_rewriter 输入参数 Schema
 */
export const inputSchema = z.object({
  // ========== 分镜脚本 ==========
  /** 原始分镜脚本 JSON（字符串形式） */
  scriptJson: z.string(),

  /** 预分类的镜头类型标注（可选，帮助 LLM 按类型执行改写） */
  shotClassifications: z.array(shotClassificationSchema).optional(),

  // ========== 角色信息 ==========
  /** 角色性别（显式传递，避免文本解析误判） */
  characterGender: z.enum(['male', 'female']),

  /** 角色综合描述（包含性别、年龄段、风格、气质等） */
  characterDescription: z.string().optional(),

  /** 选中的角色方向 */
  selectedRoleDirection: roleDirectionSchema.optional(),

  // ========== 产品信息 ==========
  /** 服饰搭配描述（新产品） */
  outfitDescription: z.string(),

  /** 搭配参考描述 */
  matchingReference: z.string().optional(),

  /** 服饰风格列表 */
  clothingStyles: z.array(z.string()).optional(),
});

export type Input = z.infer<typeof inputSchema>;
export type ShotClassification = z.infer<typeof shotClassificationSchema>;
export type RoleDirection = z.infer<typeof roleDirectionSchema>;