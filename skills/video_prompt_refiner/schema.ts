import { z } from 'zod';

/**
 * 视频提示词优化器输入参数 Schema
 */

export const inputSchema = z.object({
  originalPrompt: z.string()
    .describe('当前视频提示词（clip_prompt）'),

  errorMessage: z.string()
    .describe('上次生成失败的错误信息'),

  sceneDescription: z.string()
    .optional()
    .describe('该镜头的场景描述（从 shot_breakdown 获取，提供上下文）'),

  retryCount: z.number()
    .optional()
    .describe('当前是第几次重试（从 1 开始）'),
});

export type Input = z.infer<typeof inputSchema>;
