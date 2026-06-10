import { z } from 'zod';

export const inputSchema = z.object({
  /** 目标服装名称 */
  garmentName: z.string().min(1).describe('目标服装名称'),
  /** 目标服装详细描述（可选） */
  garmentDescription: z.string().optional().describe('目标服装详细描述'),
  /** 分镜序号（从 0 开始） */
  segmentIndex: z.number().int().min(0).describe('分镜序号'),
  /** 动作类型 */
  actionType: z.string().min(1).describe('动作类型，如 walking, sitting, standing 等'),
});

export type Outfit_change_reference_imageInput = z.infer<typeof inputSchema>;