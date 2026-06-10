/**
 * LLM Request Body Summarize 函数
 * 用于简化请求 body 日志输出（隐藏大型 base64 数据）
 */

import { compactUnknownText } from "../../utils/text.js";

/**
 * 总结 Gemini request body（隐藏 inline_data base64 数据）
 */
export function summarizeGeminiRequestBody(body: Record<string, unknown>): string {
  try {
    const cloned = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
    const contents = Array.isArray(cloned.contents) ? cloned.contents : [];
    for (const content of contents) {
      if (!content || typeof content !== "object") {
        continue;
      }
      const record = content as Record<string, unknown>;
      const parts = Array.isArray(record.parts) ? record.parts : [];
      for (const part of parts) {
        if (!part || typeof part !== "object") {
          continue;
        }
        const partRecord = part as Record<string, unknown>;
        const inlineData =
          (partRecord.inline_data as Record<string, unknown> | undefined) ??
          (partRecord.inlineData as Record<string, unknown> | undefined);
        if (!inlineData) {
          continue;
        }
        const raw = inlineData.data;
        if (typeof raw === "string") {
          inlineData.data = `[base64:${raw.length}]`;
        }
      }
    }
    return compactUnknownText(cloned, 2000);
  } catch {
    return compactUnknownText(body, 2000);
  }
}

/**
 * 总结 OpenAI request body（隐藏 data URL 数据）
 */
export function summarizeOpenAiRequestBody(body: Record<string, unknown>): string {
  try {
    const cloned = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
    const messages = Array.isArray(cloned.messages) ? cloned.messages : [];
    for (const message of messages) {
      if (!message || typeof message !== "object") {
        continue;
      }
      const messageRecord = message as Record<string, unknown>;
      const content = messageRecord.content;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const part of content) {
        if (!part || typeof part !== "object") {
          continue;
        }
        const partRecord = part as Record<string, unknown>;
        const imageUrl = partRecord.image_url as Record<string, unknown> | undefined;
        if (imageUrl && typeof imageUrl.url === "string" && imageUrl.url.startsWith("data:")) {
          imageUrl.url = `[data-url:${imageUrl.url.length}]`;
        }
        const videoUrl = partRecord.video_url as Record<string, unknown> | string | undefined;
        if (typeof videoUrl === "string" && videoUrl.startsWith("data:")) {
          partRecord.video_url = `[data-url:${videoUrl.length}]`;
        } else if (
          videoUrl &&
          typeof videoUrl === "object" &&
          typeof (videoUrl as Record<string, unknown>).url === "string" &&
          String((videoUrl as Record<string, unknown>).url).startsWith("data:")
        ) {
          (videoUrl as Record<string, unknown>).url = `[data-url:${String((videoUrl as Record<string, unknown>).url).length}]`;
        }
      }
    }
    return compactUnknownText(cloned, 2000);
  } catch {
    return compactUnknownText(body, 2000);
  }
}