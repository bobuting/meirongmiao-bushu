import { z } from "zod";

/** 主题叙事-主题构思输入参数 Schema */
export const inputSchema = z.object({
  /** 热点日报核心趋势 */
  coreTrends: z.array(z.string()),

  /** 热点日报情感氛围 */
  emotionAtmosphere: z.array(z.string()),

  /** 热点日报创意建议 */
  creativeSuggestions: z.array(z.string()),

  /** 热点日报原始分析文本 */
  rawReportText: z.string().max(3000),

  /** 情感原型ID */
  archetypeId: z.string(),

  /** 情感原型名称 */
  archetypeName: z.string().max(100),

  /** 情感原型核心 */
  archetypeEmotionCore: z.string().max(50),

  /** 情感原型冲突 */
  archetypeConflict: z.string().max(100),

  /** 角色描述 */
  characterDescription: z.string().max(500),

  /** 服饰描述 */
  outfitDescription: z.string().max(500),

  /** 服饰风格 */
  clothingStyles: z.array(z.string()).optional(),

  /** 视频时长（如"15-20秒"） */
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
