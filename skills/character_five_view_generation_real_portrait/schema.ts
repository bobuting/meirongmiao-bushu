import { z } from 'zod';

/**
 * 真人肖像五视图生成 Skill 输入参数 Schema
 *
 * 真人五视图仅以照片为唯一身份参考，不传角色文字信息
 */
export const inputSchema = z.object({
  /** 角色头像 URL */
  characterImageUrl: z.string().optional(),
  /** 服饰平铺图 URL（可选） */
  outfitImageUrl: z.string().optional(),
  /** 服饰描述文本（可选） */
  outfitInfo: z.string().optional(),
});

export type Input = z.infer<typeof inputSchema>;
