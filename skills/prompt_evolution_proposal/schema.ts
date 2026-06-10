import { z } from "zod";

/**
 * 输入参数 Schema
 */
export const inputSchema = z.object({
  /** 当前提示词内容 */
  currentPromptContent: z.string(),
  /** 质量信号描述文本 */
  qualitySignals: z.string(),
});

export type Input = z.infer<typeof inputSchema>;
