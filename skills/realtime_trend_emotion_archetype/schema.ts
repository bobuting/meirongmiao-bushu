import { z } from "zod";

/**
 * 实时热点情感原型提取 Skill 输入参数
 */
export const schema = z.object({
  hotspotCount: z.number().int().min(1).describe("热点话题数量"),
  hotspotList: z.string().describe("热点话题列表，每行一条"),
  extraInstruction: z.string().optional().describe("额外指示"),
});

export type RealtimeTrendEmotionArchetypeInput = z.infer<typeof schema>;
