import { z } from 'zod';

/**
 * 输入参数 Schema
 */
export const inputSchema = z.object({
  topicLabel: z.string().optional(),
  sourceUrl: z.string().optional(),
  criteria: z.string().optional(),
});

export type Input = z.infer<typeof inputSchema>;
