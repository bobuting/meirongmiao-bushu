import { z } from 'zod';

/**
 * 输入参数 Schema
 */
export const inputSchema = z.object({
  /** 角色性别 */
  characterGender: z.enum(['male', 'female', 'uncertain']).optional(),

  /** 角色描述 */
  characterDescription: z.string().optional(),

  /** 完整脚本JSON */
  scriptJson: z.string().optional(),

  /** 服饰描述 */
  outfitDescription: z.string().optional(),

  /** 服饰搭配 */
  matchingReference: z.string().optional(),

  /** 服饰风格 */
  clothingStyles: z.array(z.string()).optional(),

  /** 角色方向 */
  characterDirection: z.object({
    styleWords: z.array(z.string()),
  }).optional(),
});

export type Input = z.infer<typeof inputSchema>;
