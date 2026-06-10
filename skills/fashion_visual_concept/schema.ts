import { z } from 'zod';

/**
 * 时尚视觉概念生成输入参数 Schema
 */

export const inputSchema = z.object({
  /** 用户提示词（视觉命题和创作素材） */
  userPrompt: z.string().max(2000),
});

export type Input = z.infer<typeof inputSchema>;