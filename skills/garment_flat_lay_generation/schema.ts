import { z } from 'zod';

/**
 * 服饰平铺图生成输入参数 Schema
 *
 * 图片通过 images 参数传递给图生图 API，不在此 schema 中
 */

export const inputSchema = z.object({
  /** 图片数量提示（可选，自动生成"用户提供了X张不同角度的服饰图片"） */
  imageCount: z.number().int().min(1).optional(),

  /** 用户额外指令（可选，覆盖默认生成要求） */
  additionalInstructions: z.string().max(500).optional(),

  // ===== 新增：服饰信息 =====
  /** 服饰名称 */
  garmentName: z.string().optional(),

  /** 服饰描述 */
  garmentDescription: z.string().optional(),

  /** 主色 */
  mainColor: z.string().optional(),

  /** 材质 */
  material: z.string().optional(),

  /** 图案 */
  pattern: z.string().optional(),

  /** 版型 */
  fit: z.string().optional(),

  /** 领型 */
  neckline: z.string().optional(),

  /** 袖型 */
  sleeve: z.string().optional(),

  /** 风格 */
  style: z.string().optional(),

  /** 场合 */
  occasion: z.string().optional(),
});

export type Input = z.infer<typeof inputSchema>;