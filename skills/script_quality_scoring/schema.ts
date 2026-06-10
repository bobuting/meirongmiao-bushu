import { z } from "zod";

/**
 * 输入参数 Schema
 */
export const inputSchema = z.object({
  /** 评估视角：viewer=观众, director=编导, strategist=策略师 */
  perspective: z.enum(["viewer", "director", "strategist"]),
  /** 脚本标题 */
  scriptTitle: z.string(),
  /** 脚本内容 */
  scriptContent: z.string(),
  /** 脚本摘要（可选） */
  scriptSummary: z.string().optional(),
  /** 视频风格（可选） */
  videoStyle: z.string().optional(),
  /** 视频类型/目标受众（可选） */
  videoType: z.string().optional(),
});

export type Input = z.infer<typeof inputSchema>;
