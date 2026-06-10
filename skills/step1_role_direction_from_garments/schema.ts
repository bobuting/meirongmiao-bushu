import { z } from 'zod';

/**
 * Step1 角色方向生成（基于服饰）输入参数 Schema
 *
 * 根据用户服饰信息和性别年龄生成角色方向预设
 */

/** 服装资产 */
export const garmentAssetSchema = z.object({
  name: z.string().max(60),
  category: z.string().max(20).optional(),
  description: z.string().max(200).optional(),
});

/** 用户方向提示（性别年龄必填，不能为空） */
export const userDirectionHintSchema = z.object({
  gender: z.enum(['male', 'female']),  // 必填
  age: z.number().int().min(0).max(30).optional(),  // 可选，由 ageRange 解析（支持新生儿段：0-30岁）
  ageRange: z.string().max(20).describe("年龄段，如 '0-1岁'、'2-6岁'、'6-8岁'、'8-12岁'、'12-16岁'、'16-18岁'、'18-22岁'、'22-30岁'"),  // 必填
});

/** 输入参数 */
export const inputSchema = z.object({
  /** 期望生成的角色预设数量 */
  expectedCount: z.number().int().min(1).max(10),

  /** 用户服饰数据 */
  garmentAssets: z.array(garmentAssetSchema).min(1).max(10),

  /** 用户方向提示（性别、年龄约束） */
  userDirectionHint: userDirectionHintSchema,

  /** 种族/地区字典（按分类分组，从统一字典注入） */
  ethnicityDictionary: z.string().optional(),
});

export type Input = z.infer<typeof inputSchema>;
export type GarmentAsset = z.infer<typeof garmentAssetSchema>;
export type UserDirectionHint = z.infer<typeof userDirectionHintSchema>;