import { z } from 'zod';

/**
 * 输入参数 Schema
 */
export const inputSchema = z.object({
  target: z.string().optional(),
  fileName: z.string().optional(),
  hasMainImage: z.boolean().optional(),
  existingOtherViewCount: z.number().optional(),
});

export type Input = z.infer<typeof inputSchema>;
