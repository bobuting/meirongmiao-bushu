import { z } from "zod";

export const inputSchema = z.object({
  /** 图片 URL（由调用方通过 imageInputs 传入，此处仅做文档标记） */
});

export type Input = z.infer<typeof inputSchema>;
