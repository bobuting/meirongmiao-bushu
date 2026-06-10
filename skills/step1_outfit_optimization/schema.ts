import { z } from 'zod';

/**
 * 服饰搭配提示词优化输入参数 Schema
 *
 * 将搭配分析重写为生图提示词
 */

/** 输入参数 */
export const inputSchema = z.object({
  /** 搭配分析文本（中文） */
  analysis: z.string().min(10).max(2000),
});

export type Input = z.infer<typeof inputSchema>;