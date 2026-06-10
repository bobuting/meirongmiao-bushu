import { z } from "zod";

/** 主题叙事-故事大纲输入参数 Schema */

/** 剧情事件（来自第一段 plot_events，LLM 输出字段名不固定） */
const plotEventSchema = z.record(z.unknown());

export const inputSchema = z.object({
  /** 故事主题JSON（来自第一段输出） */
  themeJson: z.string().max(8000),

  /** 主题标题 */
  themeTitle: z.string().max(50),

  /** 核心冲突 */
  conflictCore: z.string().max(200),

  /** 情感锚点 */
  targetEmotion: z.string().max(50),

  /** 情感弧线 */
  emotionalArc: z.string().max(100),

  /** 剧情事件链 */
  plotEvents: z.array(plotEventSchema).default([]),

  /** 角色造型定位 */
  clothingStylingRole: z.string().max(50),

  /** 造型转变前含义 */
  clothingStylingBefore: z.string().max(100),

  /** 造型转变后含义 */
  clothingStylingAfter: z.string().max(100),

  /** 角色描述 */
  characterDescription: z.string().max(500),

  /** 服饰描述 */
  outfitDescription: z.string().max(500),

  /** 建议场景 */
  sceneSuggestions: z.array(z.string()).default([]),

  /** 总时长 */
  duration: z.string().max(20),

  /** 镜头数量 */
  shotCount: z.number().int().min(2).max(12),

  /** 禁用场景 */
  mustNotUseScenes: z.string().max(200).optional(),

  /** 禁用情绪 */
  mustNotUseEmotions: z.string().max(200).optional(),

  /** 禁用短语 */
  mustNotUsePhrases: z.string().max(200).optional(),
});

export type Input = z.infer<typeof inputSchema>;
