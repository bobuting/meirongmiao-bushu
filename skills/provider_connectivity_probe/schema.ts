import { z } from "zod";

/**
 * 输入参数 Schema
 */
export const inputSchema = z.object({}).passthrough();

export type Input = z.infer<typeof inputSchema>;
