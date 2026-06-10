import { z } from 'zod';

/**
 * 输入参数 Schema
 */
export const inputSchema = z.object({
  /** 话题 ID */
  topicId: z.string().optional(),
  /** 话题标签 */
  topicLabel: z.string().optional(),
  /** 视频 URL */
  videoUrl: z.string().optional(),
  /** OSS 公开链接 */
  ossUrl: z.string().optional(),
});

export type Input = z.infer<typeof inputSchema>;
