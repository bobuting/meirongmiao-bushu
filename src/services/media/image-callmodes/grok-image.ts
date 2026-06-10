/**
 * image-callmodes/grok-image.ts
 *
 * CallMode: GROK_IMAGE
 * 协议: Grok 图片生成 /v1/chat/completions（JSON 格式）
 */

import { AppError } from "../../../core/errors.js";
import type { ResolvedRouteProvider } from "../../llm/provider-resolver.js";
import type { ImageCallModeHandler, ImageCallModeOptions, ImageCallModeRequest } from "./types.js";
import { normalizeProviderTransportImageUrls, parseSecretCandidates } from "./shared.js";

// ---------------------------------------------------------------------------
// 请求构建
// ---------------------------------------------------------------------------

function buildRequest(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: ImageCallModeOptions,
): ImageCallModeRequest {
  const base = provider.baseUrl.replace(/\/+$/, "");
  const endpoint = `${base}/v1/chat/completions`;

  if (!provider.model) {
    throw new AppError(500, "GROK_MODEL_MISSING", "Grok 图片生成需要 provider.model 配置");
  }

  const secretCandidates = parseSecretCandidates(provider.secret);
  const apiKey = (secretCandidates.length > 0 ? secretCandidates[0] : provider.secret).replace(/^Bearer\s+/i, "").trim();
  if (!apiKey) {
    throw new AppError(500, "GROK_API_KEY_MISSING", "Grok 图片生成需要有效的 API Key");
  }

  // 构建 content 数组：参考图 + 提示词（先图后文）
  const contentParts: Array<Record<string, unknown>> = [];

  const normalizedImages = normalizeProviderTransportImageUrls(options?.images);
  const imageUrls = normalizedImages.slice(0, 3);
  for (const url of imageUrls) {
    contentParts.push({
      type: "image_url",
      image_url: { url },
    });
  }

  // 宽高比嵌入到文本提示词中（云雾 API 约定格式：尺寸[比例]）
  const ratioText = options?.ratio ? ` 尺寸[${options.ratio}]` : "";
  contentParts.push({ type: "text", text: `${prompt}${ratioText}` });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };

  const body: Record<string, unknown> = {
    model: provider.model,
    messages: [
      {
        role: "user",
        content: contentParts,
      },
    ],
  };

  return { endpoint, headers, body };
}

// ---------------------------------------------------------------------------
// 响应提取
// ---------------------------------------------------------------------------

/** 从 Grok 图片生成响应中提取 URL（Chat Completions 格式）
 *  响应格式: { choices: [{ message: { content: "..." 或含 image_url 的数组 } }] }
 */
function extractImageUrls(data: unknown): string[] {
  const output: string[] = [];
  const root = (data ?? {}) as Record<string, unknown>;

  const choices = Array.isArray(root.choices) ? root.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as Record<string, unknown>).message;
    if (!message || typeof message !== "object") continue;

    const content = (message as Record<string, unknown>).content;

    // 格式 1: content 为数组（标准 Chat Completions 格式）
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
        if (url && /^https?:\/\//i.test(url) && !output.includes(url)) {
          output.push(url);
        }
      }
    }
  }

  return output;
}

// ---------------------------------------------------------------------------
// 导出 Handler
// ---------------------------------------------------------------------------

export const grokImageHandler: ImageCallModeHandler = {
  buildRequest,
  extractImageUrls,
};
