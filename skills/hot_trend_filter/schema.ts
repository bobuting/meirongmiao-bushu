import { z } from "zod";

export const inputSchema = z.object({
  /** 热点标题列表（每行一个，格式为 "- 标题"） */
  trendTitles: z.string(),
});

export type Input = z.infer<typeof inputSchema>;
