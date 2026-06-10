import { z } from "zod";

export const schema = z.object({
  hotspotCount: z.number().int().positive(),
  hotspotDetails: z.string().min(1)
});

export type Input = z.infer<typeof schema>;