/**
 * image-callmodes/gemini-image.ts
 *
 * CallMode: GEMINI_IMAGE + GEMINI_IMAGE_INLINE
 * 协议:
 *   - GEMINI_IMAGE: Chat 兼容格式 /v1/chat/completions（支持 HTTP URL 参考图）
 *   - GEMINI_IMAGE_INLINE: Gemini 原生格式（inline_data base64 传输）
 */

import { sanitizeHeaders } from "../../../utils/http-request.js";
import type { ResolvedRouteProvider } from "../../llm/provider-resolver.js";
import { resolveGeminiModelCandidates } from "../../llm/provider-resolver.js";
import {
  parseGeminiApiKey,
  buildGeminiImageParts,
  GEMINI_DEFAULT_SAFETY_SETTINGS,
} from "../../llm/gemini-utils.js";
import { buildGeminiEndpointCandidates } from "../../../modules/gemini-provider-endpoints.js";
import type { ImageCallModeHandler, ImageCallModeOptions, ImageCallModeRequest } from "./types.js";

// ---------------------------------------------------------------------------
// 共享：提示词约束构建
// ---------------------------------------------------------------------------

/** 为 Gemini 图片生成提示词追加比例/分辨率约束 */
function buildGeminiImagePromptWithConstraints(
  prompt: string,
  options?: {
    mode?: "text_to_image" | "image_to_image";
    ratio?: string;
    resolution?: string;
  },
): string {
  const basePrompt = String(prompt ?? "").trim();
  const constraints: string[] = [];
  const ratio = options?.ratio;
  const resolution = options?.resolution;
  if (ratio) {
    constraints.push(`画幅比例必须是 ${ratio}`);
    if (ratio === "9:16") {
      constraints.push("必须为竖构图，宽度明显小于高度");
    } else if (ratio === "16:9") {
      constraints.push("必须为横构图，宽度明显大于高度");
    }
  }
  if (resolution) {
    constraints.push(`目标画质 ${resolution.toUpperCase()}`);
  }
  if (constraints.length < 1) {
    return basePrompt;
  }
  return `${basePrompt}\n\n生成约束：${constraints.join("；")}。`;
}

// ---------------------------------------------------------------------------
// GEMINI_IMAGE: Chat 兼容格式
// ---------------------------------------------------------------------------

function buildGeminiChatCompatibleRequest(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: ImageCallModeOptions,
): ImageCallModeRequest {
  const base = provider.baseUrl.replace(/\/+$/, "");
  const endpoint = `${base}/v1/chat/completions`;

  const mode = options?.mode ?? "text_to_image";
  const constrainedPrompt = buildGeminiImagePromptWithConstraints(prompt, {
    mode,
    ratio: options?.ratio,
    resolution: options?.resolution,
  });

  // 构建 content parts：文本 + 参考图片
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  content.push({ type: "text", text: constrainedPrompt });

  // 图生图：image_url 直接传 HTTP URL（无需 base64）
  if (mode === "image_to_image" && options?.images?.length) {
    for (const imageUrl of options.images.slice(0, 2)) {
      content.push({ type: "image_url", image_url: { url: imageUrl } });
    }
  }

  const temperatureRaw = Number(options?.temperature ?? process.env.GEMINI_IMAGE_TEMPERATURE ?? "0.7");
  const temperature = Number.isFinite(temperatureRaw) ? Math.max(0, Math.min(1, temperatureRaw)) : 0.8;
  const modelCandidates = resolveGeminiModelCandidates(provider, { purpose: "image" });
  const model = modelCandidates[0] ?? provider.model;

  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content }],
    temperature,
  };

  const apiKey = parseGeminiApiKey(provider.secret);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  return { endpoint, headers, body };
}

/** 从 Chat 兼容格式提取图片 URL */
function extractGeminiChatCompatibleImageUrls(data: unknown): string[] {
  const output: string[] = [];
  const root = (data ?? {}) as Record<string, unknown>;

  const choices = Array.isArray(root.choices) ? root.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as Record<string, unknown>).message;
    if (!message || typeof message !== "object") continue;

    const content = (message as Record<string, unknown>).content;

    // 格式 1: content 为数组
    if (Array.isArray(content)) {
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const record = part as Record<string, unknown>;
        if (record.type === "image_url" && record.image_url && typeof record.image_url === "object") {
          const url = (record.image_url as Record<string, unknown>).url;
          if (typeof url === "string" && url.trim() && !output.includes(url.trim())) {
            output.push(url.trim());
          }
        }
      }
    }

    // 格式 2: content 为 Markdown 字符串
    else if (typeof content === "string" && content.trim()) {
      const markdownImageRegex = /!\[.*?\]\(([^)]+)\)/g;
      let match;
      while ((match = markdownImageRegex.exec(content)) !== null) {
        const url = match[1].trim();
        if (url && !output.includes(url)) {
          output.push(url);
        }
      }
    }
  }

  return output;
}

export const geminiImageHandler: ImageCallModeHandler = {
  buildRequest: buildGeminiChatCompatibleRequest,
  extractImageUrls: extractGeminiChatCompatibleImageUrls,
};

// ---------------------------------------------------------------------------
// GEMINI_IMAGE_INLINE: 原生 Gemini 格式
// ---------------------------------------------------------------------------

async function buildGeminiInlineRequest(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: ImageCallModeOptions,
): Promise<ImageCallModeRequest> {
  const mode = options?.mode ?? "text_to_image";
  const constrainedPrompt = buildGeminiImagePromptWithConstraints(prompt, {
    mode,
    ratio: options?.ratio,
    resolution: options?.resolution,
  });

  const inlineImageParts =
    mode === "image_to_image"
      ? await buildGeminiImageParts(
        (options?.images ?? [])
          .map((url, index) => ({ url, label: `edit-source-${index + 1}` }))
          .slice(0, 2),
        provider.timeoutMs,
        { imageTransport: "base64" },
      )
      : [];

  const apiKey = parseGeminiApiKey(provider.secret);
  const temperatureRaw = Number(options?.temperature ?? process.env.GEMINI_IMAGE_TEMPERATURE ?? "0.7");
  const temperature = Number.isFinite(temperatureRaw) ? Math.max(0, Math.min(1, temperatureRaw)) : 0.8;
  const modelCandidates = resolveGeminiModelCandidates(provider, { purpose: "image" });
  const model = modelCandidates[0] ?? provider.model;
  const endpointCandidates = buildGeminiEndpointCandidates(provider, model, apiKey);
  const endpoint = endpointCandidates[0];
  const requestHeaders = sanitizeHeaders(endpoint.headers);

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [...inlineImageParts, { text: constrainedPrompt }] }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"], temperature },
    safetySettings: GEMINI_DEFAULT_SAFETY_SETTINGS,
  };

  return { endpoint: endpoint.url, headers: requestHeaders, body };
}

/** 从 Gemini 原生格式提取 inline_data base64 图片 */
function extractGeminiInlineDataUrls(data: unknown): string[] {
  const output: string[] = [];
  const push = (mimeTypeRaw: unknown, base64Raw: unknown): void => {
    const mimeType = String(mimeTypeRaw ?? "").trim().toLowerCase() || "image/png";
    const base64 = String(base64Raw ?? "").trim();
    if (!base64) return;
    const url = `data:${mimeType};base64,${base64}`;
    if (!output.includes(url)) {
      output.push(url);
    }
  };
  const root = (data ?? {}) as Record<string, unknown>;
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as Record<string, unknown>).content;
    const parts =
      content && typeof content === "object" && Array.isArray((content as Record<string, unknown>).parts)
        ? ((content as Record<string, unknown>).parts as unknown[])
        : [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      const inlineData =
        (record.inlineData as Record<string, unknown> | undefined) ??
        (record.inline_data as Record<string, unknown> | undefined);
      if (inlineData) {
        push(inlineData.mimeType ?? inlineData.mime_type, inlineData.data);
      }
    }
  }
  return output;
}

export const geminiImageInlineHandler: ImageCallModeHandler = {
  buildRequest: buildGeminiInlineRequest,
  extractImageUrls: extractGeminiInlineDataUrls,
};
