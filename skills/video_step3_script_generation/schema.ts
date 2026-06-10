import { z } from 'zod';

/**
 * 角色方向信息 Schema
 */
export const roleDirectionSchema = z.object({
  styleWords: z.array(z.string()),
});

/**
 * video_step3_script_generation 输入参数 Schema
 */
export const inputSchema = z.object({
  // ========== 角色信息（关键：性别锚定） ==========
  /** 角色标签，如"25岁都市女生"、"30岁职场男性" */
  characterLabel: z.string().optional(),

  /** 角色性别（显式传递，避免文本解析误判） */
  characterGender: z.enum(['male', 'female', 'uncertain']).optional(),

  /** 角色综合描述（包含性别、年龄段、风格、气质等） */
  characterDescription: z.string().optional(),

  // ========== 服饰信息 ==========
  /** 服饰搭配描述 */
  outfitDescription: z.string().optional(),

  /** 服饰风格列表，如["通勤风", "简约风"] */
  clothingStyles: z.array(z.string()).optional(),

  /** 搭配参考描述 */
  matchingReference: z.string().optional(),

  // ========== 角色方向 ==========
  /** 选中的角色方向 */
  selectedRoleDirection: roleDirectionSchema.optional(),

  // ========== 热点数据 ==========
  /** 热点分析报告（原始文本） */
  hotspotReport: z.string().optional(),

  // ========== 生成配置 ==========
  /** 脚本数量，默认 2 条 */
  scriptCount: z.number().min(1).max(5).default(2),
});

export type Input = z.infer<typeof inputSchema>;
export type RoleDirection = z.infer<typeof roleDirectionSchema>;
