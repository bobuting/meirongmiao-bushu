import { z } from 'zod';

/**
 * 输入参数 Schema
 */
export const inputSchema = z.object({
  outfitSection: z.string().optional(),
  characterInfo: z.string().optional(),
  labelGuidance: z.string().optional(),
});

export type Input = z.infer<typeof inputSchema>;
