/**
 * image-callmodes/wanx-image.ts
 *
 * CallMode: WANX_IMAGE_BAILIAN
 * 协议: 万相 DashScope /api/v1/services/aigc/multimodal-generation/generation
 */

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
  const endpoint = `${base}/api/v1/services/aigc/multimodal-generation/generation`;

  const mode = options?.mode ?? "text_to_image";
  const count = Math.max(1, Math.min(4, Number(options?.count) || 1));
  const normalizedImages = normalizeProviderTransportImageUrls(options?.images);

  // 构建 content 数组：图片在前，文字在后（DashScope API 要求）
  const content: Array<{ text?: string; image?: string }> = [];

  if (mode === "image_to_image" && normalizedImages.length > 0) {
    for (const imageUrl of normalizedImages.slice(0, 9)) {
      content.push({ image: imageUrl });
    }
  }

  content.push({ text: prompt });

  // size 参数映射
  const ratioToSize: Record<string, string> = {
    "9:16": "1080*1920",
    "16:9": "1920*1080",
    "1:1": "1024*1024",
    "3:4": "768*1024",
    "4:3": "1024*768",
  };
  const size = ratioToSize[options?.ratio ?? "9:16"] ?? "1080*1920";

  const parameters: Record<string, unknown> = {
    size,
    n: count,
    watermark: false,
    thinking_mode: mode === "text_to_image",
  };

  if (options?.negativePrompt) {
    parameters.negative_prompt = options.negativePrompt;
  }

  const requestBody: Record<string, unknown> = {
    model: provider.model,
    input: {
      messages: [{
        role: "user",
        content,
      }],
    },
    parameters,
  };

  const secretCandidates = parseSecretCandidates(provider.secret);
  const apiKey = (secretCandidates.length > 0 ? secretCandidates[0] : provider.secret).replace(/^Bearer\s+/i, "").trim();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  return { endpoint, headers, body: requestBody };
}

// ---------------------------------------------------------------------------
// 响应提取
// ---------------------------------------------------------------------------

/** 从万相响应中提取图片 URL
 *  格式: output.choices[].message.content[].image 或 output.results[].image_urls[]
 */
function extractImageUrls(data: unknown): string[] {
  const output: string[] = [];
  const root = (data ?? {}) as Record<string, unknown>;

  // 万相 2.7 格式: output.choices[].message.content[].image
  const outputObj = root.output as Record<string, unknown> | undefined;
  if (outputObj) {
    const choices = Array.isArray(outputObj.choices) ? outputObj.choices : [];
    for (const choice of choices) {
      if (!choice || typeof choice !== "object") continue;
      const choiceRecord = choice as Record<string, unknown>;
      const message = choiceRecord.message as Record<string, unknown> | undefined;
      if (!message) continue;
      const contentArray = Array.isArray(message.content) ? message.content : [];
      for (const contentItem of contentArray) {
        if (!contentItem || typeof contentItem !== "object") continue;
        const contentRecord = contentItem as Record<string, unknown>;
        const url = String(contentRecord.image ?? "").trim();
        if (url && /^https?:\/\//i.test(url) && !output.includes(url)) {
          output.push(url);
        }
      }
    }

    // 旧版格式: output.results[].image_urls[]
    const results = Array.isArray(outputObj.results) ? outputObj.results : [];
    for (const result of results) {
      if (!result || typeof result !== "object") continue;
      const resultRecord = result as Record<string, unknown>;
      const imageUrls = Array.isArray(resultRecord.image_urls) ? resultRecord.image_urls : [];
      for (const urlRaw of imageUrls) {
        const url = String(urlRaw ?? "").trim();
        if (url && /^https?:\/\//i.test(url) && !output.includes(url)) {
          output.push(url);
        }
      }
    }
  }

  // 备选: data[].url（OpenAI 兼容格式）
  const dataArray = Array.isArray(root.data) ? root.data : [];
  for (const item of dataArray) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = String(record.url ?? "").trim();
    if (url && /^https?:\/\//i.test(url) && !output.includes(url)) {
      output.push(url);
    }
  }

  return output;
}

// ---------------------------------------------------------------------------
// 导出 Handler
// ---------------------------------------------------------------------------

export const wanxImageHandler: ImageCallModeHandler = {
  buildRequest,
  extractImageUrls,
};
