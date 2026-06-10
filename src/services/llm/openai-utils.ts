/**
 * openai-utils.ts
 *
 * OpenAI 专用辅助函数集合。
 * 从 app.ts 提取，负责 OpenAI 响应解析、请求摘要、vision/视频内容构建等逻辑。
 */

import type { OpenAiVideoContentVariant } from "../../contracts/llm-types.js";
import { compactUnknownText } from "../../utils/text.js";
import type { LlmImageInput } from "./gemini-utils.js";

// ---------------------------------------------------------------------------
// 函数实现
// ---------------------------------------------------------------------------

/** 提取 OpenAI 响应中的文本内容 */
export function extractOpenAiTextContent(data: unknown): string {
  const content = ((data as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message
    ?.content ?? "") as unknown;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item === "string" ? item : (item as { text?: string }).text ?? ""))
      .join("\n");
  }
  return "";
}

/** 提取上游错误消息（支持 OpenAI / Gemini 错误格式） */
export function extractUpstreamErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const root = data as Record<string, unknown>;
  const error = root.error;
  if (!error) {
    return null;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    const code = String(record.code ?? "").trim();
    const message = String(record.message ?? "").trim();
    if (code && message) {
      return `${code}: ${message}`;
    }
    if (message) {
      return message;
    }
    if (code) {
      return code;
    }
  }
  return null;
}

/** 摘要 OpenAI 请求体（将 data URL 图片/视频替换为占位符） */
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
    return compactUnknownText(cloned, 100000);
  } catch {
    return compactUnknownText(body, 100000);
  }
}

/** 构建 OpenAI vision 用户内容（文本 + 图片 URL） */
export function buildOpenAiVisionUserContent(
  userPrompt: string,
  imageInputs: LlmImageInput[] | undefined,
): Array<Record<string, unknown>> | null {
  const parts: Array<Record<string, unknown>> = [{ type: "text", text: userPrompt }];
  const inputs = (imageInputs ?? [])
    .map((item) => String(item?.url ?? "").trim())
    .filter((item) => item.length > 0)
    .slice(0, 2);
  for (const source of inputs) {
    if (!/^https?:\/\//i.test(source) && !/^data:image\//i.test(source)) {
      continue;
    }
    parts.push({
      type: "image_url",
      image_url: {
        url: source,
      },
    });
  }
  return parts.length > 1 ? parts : null;
}

/** 构建 OpenAI 远程视频内容变体（video_url / input_video） */
export function buildOpenAiRemoteVideoContentVariants(userPrompt: string, videoUrl: string): OpenAiVideoContentVariant[] {
  return [
    {
      label: "video_url",
      content: [
        { type: "text", text: userPrompt },
        { type: "video_url", video_url: { url: videoUrl } },
      ],
    },
    {
      label: "input_video",
      content: [
        { type: "input_text", text: userPrompt },
        { type: "input_video", video_url: videoUrl },
      ],
    },
  ];
}

/** 构建 OpenAI 内联视频内容变体（base64 data URL） */
export function buildOpenAiInlineVideoContentVariants(
  userPrompt: string,
  videoBase64: string,
  mimeType: string,
): OpenAiVideoContentVariant[] {
  const dataUrl = `data:${mimeType};base64,${videoBase64}`;
  return [
    {
      label: "video_url_data_url",
      content: [
        { type: "text", text: userPrompt },
        { type: "video_url", video_url: { url: dataUrl } },
      ],
    },
    {
      label: "input_video_data_url",
      content: [
        { type: "input_text", text: userPrompt },
        { type: "input_video", video_url: dataUrl },
      ],
    },
  ];
}
