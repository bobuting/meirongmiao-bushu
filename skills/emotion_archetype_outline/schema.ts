import { z } from 'zod';

/**
 * 情感原型-故事大纲生成输入参数 Schema
 */

export const inputSchema = z.object({
  /** 情感原型ID */
  archetypeId: z.string(),

  /** 情感原型名称 */
  archetypeName: z.string().max(30),

  /** 情感核心 */
  emotionCore: z.string().max(50),

  /** 时刻描述 */
  moment: z.string().max(100),

  /** 冲突描述 */
  conflict: z.string().max(100),

  /** 服饰角色 */
  clothingRole: z.string().max(100),

  /** 视觉线索 */
  visualCues: z.string().max(200),

  /** 总时长（如"15-20秒"） */
  duration: z.string().max(20),

  /** 镜头数量 */
  shotCount: z.number().int().min(2).max(10),

  /** 同步模式 */
  syncMode: z.enum(['情绪同步', '动作同步', '环境同步']),

  /** 角色描述 */
  characterDescription: z.string().max(500),

  /** 服饰描述 */
  outfitDescription: z.string().max(500),

  /** 禁用场景（可选） */
  mustNotUseScenes: z.string().max(200).optional(),

  /** 禁用情绪（可选） */
  mustNotUseEmotions: z.string().max(200).optional(),

  /** 禁用短语（可选） */
  mustNotUsePhrases: z.string().max(200).optional(),
});

export type Input = z.infer<typeof inputSchema>;