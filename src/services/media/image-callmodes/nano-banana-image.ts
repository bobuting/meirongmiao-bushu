/**
 * image-callmodes/nano-banana-image.ts
 *
 * CallMode: NANO_BANANA_IMAGE
 * 协议: Nano Banana /api/{modelPath}
 * 特殊：支持异步任务轮询，额外导出轮询辅助函数供主文件使用
 */

import type { ResolvedRouteProvider } from "../../llm/provider-resolver.js";
import type { ImageCallModeHandler, ImageCallModeOptions, ImageCallModeRequest } from "./types.js";
import { normalizeProviderTransportImageUrls, parseSecretCandidates } from "./shared.js";
import { normalizeNanoBananaModelPath } from "../provider-response-extractors.js";

// ---------------------------------------------------------------------------
// 请求构建
// ---------------------------------------------------------------------------

function buildRequest(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: ImageCallModeOptions,
): ImageCallModeRequest {
  const mode = options?.mode ?? "text_to_image";
  const normalizedImages = normalizeProviderTransportImageUrls(options?.images);
  const modelPath = normalizeNanoBananaModelPath(provider.model, mode);
  const endpoint = `${provider.baseUrl.replace(/\/+$/, "")}/api/${modelPath}`;
  const count = Math.max(1, Math.min(4, Number(options?.count) || 4));

  const secretCandidates = parseSecretCandidates(provider.secret);
  const apiKeys = secretCandidates.length > 0 ? secretCandidates : [provider.secret];
  const rawSecret = apiKeys[0] ?? provider.secret;
  const apiKey = rawSecret.replace(/^Bearer\s+/i, "").trim();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "x-api-key": apiKey,
  };
  const body: Record<string, unknown> = {
    prompt,
    num_images: count,
  };
  if (mode === "image_to_image" && normalizedImages.length) {
    body.image_urls = normalizedImages.slice(0, 4);
  }

  return { endpoint, headers, body };
}

// ---------------------------------------------------------------------------
// 响应提取
// ---------------------------------------------------------------------------

/** 从 Nano Banana 响应中提取图片 URL
 *  格式: 直接返回 URL 字符串，或 { images: [{ url }] } 或 { data: [{ url }] }
 */
function extractImageUrls(data: unknown): string[] {
  const output: string[] = [];

  // 格式 1: 直接返回 URL 字符串
  if (typeof data === "string") {
    const url = data.trim();
    if (url && /^https?:\/\//i.test(url) && !output.includes(url)) {
      output.push(url);
    }
    return output;
  }

  if (!data || typeof data !== "object") return output;

  const root = data as Record<string, unknown>;

  // 格式 2: images[].url
  const images = Array.isArray(root.images) ? root.images : [];
  for (const item of images) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = String(record.url ?? "").trim();
    if (url && /^https?:\/\//i.test(url) && !output.includes(url)) {
      output.push(url);
    }
  }

  // 格式 3: data[].url
  const dataArray = Array.isArray(root.data) ? root.data : [];
  for (const item of dataArray) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = String(record.url ?? "").trim();
    if (url && /^https?:\/\//i.test(url) && !output.includes(url)) {
      output.push(url);
    }
  }

  // 格式 4: result.url
  const resultObj = root.result as Record<string, unknown> | undefined;
  if (resultObj) {
    const url = String(resultObj.url ?? "").trim();
    if (url && /^https?:\/\//i.test(url) && !output.includes(url)) {
      output.push(url);
    }
  }

  return output;
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export const nanoBananaImageHandler: ImageCallModeHandler = {
  buildRequest,
  extractImageUrls,
};
