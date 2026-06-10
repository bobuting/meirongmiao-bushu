import { z } from 'zod';

/**
 * 输入参数 Schema
 */
export const inputSchema = z.object({
  /** 热点分析提示词（包含热点数量和详情） */
  userPrompt: z.string(),
});

export type Input = z.infer<typeof inputSchema>;
