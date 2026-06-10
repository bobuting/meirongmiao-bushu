import { z } from 'zod';

/**
 * 情感原型-详细分镜生成输入参数 Schema
 */

/** 大纲镜头 */
export const shotOutlineSchema = z.object({
  shot_number: z.number().int(),
  duration_seconds: z.number(),
  emotion: z.string(),
  action: z.string(),
});

export const inputSchema = z.object({
  /** 故事大纲JSON */
  outlineJson: z.string().max(5000),

  /** 情感原型ID */
  archetypeId: z.string(),

  /** 情感原型名称 */
  archetypeName: z.string().max(30),

  /** 情感核心 */
  emotionCore: z.string().max(50),

  /** 情感弧线 */
  emotionArc: z.string().max(50),

  /** 冲突描述 */
  conflictDescription: z.string().max(100),

  /** 服饰角色 */
  clothingRole: z.string().max(100),

  /** 同步模式 */
  syncMode: z.enum(['情绪同步', '动作同步', '环境同步']),

  /** 角色描述 */
  characterDescription: z.string().max(500),

  /** 服饰描述 */
  outfitDescription: z.string().max(500),

  /** 大纲镜头列表 */
  shotsOutline: z.array(shotOutlineSchema),

  /** 服饰视觉变化列表 */
  visualChanges: z.array(z.string()).optional(),

  /** 禁用场景（可选） */
  mustNotUseScenes: z.string().max(200).optional(),

  /** 禁用情绪（可选） */
  mustNotUseEmotions: z.string().max(200).optional(),

  /** 禁用短语（可选） */
  mustNotUsePhrases: z.string().max(200).optional(),
});

export type Input = z.infer<typeof inputSchema>;
export type ShotOutline = z.infer<typeof shotOutlineSchema>;