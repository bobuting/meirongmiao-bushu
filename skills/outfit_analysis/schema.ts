import { z } from 'zod';
import { OUTFIT_ITEM_TYPES } from '../../src/contracts/outfit-plan.dto.js';

/**
 * 穿搭分析 Skill 输入参数 Schema
 *
 * 只包含动态变量参数，规则性内容在 system.md 中定义
 */

/** 服装单品 */
export const clothingItemSchema = z.object({
  category: z.enum(OUTFIT_ITEM_TYPES),
  name: z.string().max(60),
  description: z.string().max(120).optional(),
});

/** 角色预设 */
export const roleContextSchema = z.object({
  gender: z.enum(['male', 'female', 'unknown']).optional(),
  age: z.number().int().min(1).max(100).optional(),
  ethnicityOrRegion: z.string().max(40).optional(),
  styleWords: z.array(z.string().max(20)).max(5).optional(),
});

/** 穿搭分析输入参数 */
export const inputSchema = z.object({
  /** 目标方案数量 */
  targetCardCount: z.number().int().min(1).max(10),

  /** 时间基准（YYYY-MM-DD） */
  timeBaseline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  /** 用户提供的服装单品列表 */
  clothingItems: z.array(clothingItemSchema).min(1).max(4),

  /** 角色预设（必填） */
  roleContext: roleContextSchema,
});

export type Input = z.infer<typeof inputSchema>;
export type ClothingItem = z.infer<typeof clothingItemSchema>;
export type RoleContext = z.infer<typeof roleContextSchema>;