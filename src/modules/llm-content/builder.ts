/**
 * LLM Content Builder 函数
 * 用于构建 Gemini/OpenAI 请求的 content parts
 */

import type { LlmImageInput, OpenAiVideoContentVariant } from "../../contracts/llm-types.js";

/**
 * 解析 Gemini API Key（去除 Bearer 前缀）
 */
export function parseGeminiApiKey(secret: string): string {
  return secret.replace(/^Bearer\s+/i, "").trim();
}

/**
 * 解析图像 data URL（base64 格式）
 */
export function parseImageDataUrl(url: string): { mimeType: string; data: string } | null {
  const match = url
    .trim()
    .match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    return null;
  }
  const mimeType = match[1].trim().toLowerCase();
  const data = match[2].replace(/\s+/g, "");
  if (!mimeType || !data) {
    return null;
  }
  return { mimeType, data };
}

/**
 * 构建 Gemini remote video part
 */
export function buildGeminiRemoteVideoPart(videoUrl: string, mimeType: string): Record<string, unknown> {
  return {
    file_data: {
      mime_type: mimeType,
      file_uri: videoUrl,
    },
  };
}

/**
 * 构建 Gemini inline video part（base64 格式）
 */
export function buildGeminiInlineVideoPart(videoBase64: string, mimeType: string): Record<string, unknown> {
  return {
    inline_data: {
      mime_type: mimeType,
      data: videoBase64,
    },
  };
}

/**
 * 构建 OpenAI vision user content（包含文本和图像）
 */
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

/**
 * 构建 OpenAI remote video content variants
 */
export function buildOpenAiRemoteVideoContentVariants(
  userPrompt: string,
  videoUrl: string,
): OpenAiVideoContentVariant[] {
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

/**
 * 构建 OpenAI inline video content variants（base64 格式）
 */
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