import { z } from "zod";

/** 主题叙事-分镜展开输入参数 Schema */

/** 大纲镜头（LLM 输出字段名不固定，宽松校验） */
export const outlineShotSchema = z.record(z.unknown());

/** 事件因果链（LLM 输出字段名不固定，宽松校验） */
const eventChainSchema = z.record(z.unknown());

export const inputSchema = z.object({
  /** 故事大纲JSON */
  outlineJson: z.string().max(16000),

  /** 主题标题 */
  themeTitle: z.string().max(50),

  /** 核心冲突 */
  conflictCore: z.string().max(200),

  /** 情感弧线 */
  emotionArc: z.string().max(100),

  /** 事件因果链 */
  eventChain: z.array(eventChainSchema).default([]),

  /** 角色造型定位 */
  clothingStylingRole: z.string().max(50),

  /** 造型转变前 */
  clothingStylingBefore: z.string().max(100),

  /** 造型转变后 */
  clothingStylingAfter: z.string().max(100),

  /** 角色描述 */
  characterDescription: z.string().max(500),

  /** 服饰描述 */
  outfitDescription: z.string().max(500),

  /** 大纲镜头列表 */
  shotsOutline: z.array(outlineShotSchema).default([]),

  /** 禁用场景 */
  mustNotUseScenes: z.string().max(200).optional(),

  /** 禁用情绪 */
  mustNotUseEmotions: z.string().max(200).optional(),

  /** 禁用短语 */
  mustNotUsePhrases: z.string().max(200).optional(),
});

export type Input = z.infer<typeof inputSchema>;
export type OutlineShot = z.infer<typeof outlineShotSchema>;
