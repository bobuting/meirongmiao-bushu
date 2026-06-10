import { z } from 'zod';

/**
 * script_planner_strict 输入参数 Schema
 */
export const inputSchema = z.object({
  // ========== 角色信息（关键：性别锚定） ==========
  /** 角色性别（显式传递，避免文本解析误判） */
  characterGender: z.enum(['male', 'female', 'uncertain']).optional(),

  /** 角色描述 */
  characterDescription: z.string().optional(),

  // ========== 服饰信息 ==========
  /** 服饰描述 */
  outfitDescription: z.string().optional(),

  /** 服饰风格列表 */
  clothingStyles: z.array(z.string()).optional(),

  // ========== 场景信息 ==========
  /** 场景描述 */
  sceneDescription: z.string().optional(),

  // ========== 热点数据 ==========
  /** 热点文本 */
  hotTrendText: z.string().optional(),

  // ========== 生成配置 ==========
  /** 脚本数量 */
  scriptCount: z.number().min(1).max(5).default(2),

  /** 视频时长（秒） */
  duration: z.number().min(15).max(30).default(20),
});

export type Input = z.infer<typeof inputSchema>;
