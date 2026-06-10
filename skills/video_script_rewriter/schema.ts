import { z } from 'zod';

/**
 * 输入参数 Schema
 */
export const inputSchema = z.object({
  /** 用户提示词（包含脚本内容和改写指令） */
  userPrompt: z.string(),
});

export type Input = z.infer<typeof inputSchema>;
