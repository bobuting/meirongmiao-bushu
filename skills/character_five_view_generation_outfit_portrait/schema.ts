import { z } from 'zod';

/**
 * 服饰+真人结合五视图生成 Skill 输入参数 Schema
 *
 * 真人+服饰五视图仅以照片为唯一身份参考，服饰信息从项目数据获取
 */
export const inputSchema = z.object({
  /** 角色头像 URL */
  characterImageUrl: z.string().optional(),
  /** 服饰平铺图 URL（多个用逗号分隔） */
  outfitImageUrl: z.string().optional(),
  /** 服饰描述文本 */
  outfitInfo: z.string().optional(),
  /** 已选搭配信息 */
  outfitMatching: z.string().optional(),
});

export type Input = z.infer<typeof inputSchema>;
