import { z } from 'zod';

/**
 * 输入参数 Schema
 */
export const inputSchema = z.object({
  viewLabel: z.string().optional(),
  viewPromptSuffix: z.string().optional(),
});

export type Input = z.infer<typeof inputSchema>;
