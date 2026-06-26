/**
 * image-callmodes/seedream-image-ark-yunwu.ts
 *
 * CallMode: SEEDREAM_IMAGE_ARK_YUNWU
 * 协议: 云雾 Seedream /v1/images/generations（OpenAI 兼容）
 *
 * 与 seedream-image-ark 的区别：
 * - Ark 直连：/api/v3/images/generations（火山方舟原生端点）
 * - Yunwu 中转：/v1/images/generations（云雾 OpenAI 兼容端点）
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
  const endpoint = `${base}/v1/images/generations`;

  const mode = options?.mode ?? "text_to_image";
  const count = Math.max(1, Math.min(4, Number(options?.count) || 4));
  const normalizedImages = normalizeProviderTransportImageUrls(options?.images);

  // resolution + ratio → size 二维映射（与 Ark 版本保持一致）
  const resolutionToRatioSize: Record<string, Record<string, string>> = {
    "2k": {
      "9:16": "1440x2560",
      "16:9": "2560x1440",
      "1:1": "2048x2048",
      "3:4": "1664x2217",
    },
    "4k": {
      "9:16": "2160x3840",
      "16:9": "3840x2160",
      "1:1": "4096x4096",
      "3:4": "3024x4032",
    },
  };

  const resolution = options?.resolution ?? "4k";
  const ratio = options?.ratio ?? "16:9";
  const size = resolutionToRatioSize[resolution]?.[ratio] ?? resolutionToRatioSize["4k"]["16:9"];

  const body: Record<string, unknown> = {
    model: provider.model,
    prompt,
    size,
    response_format: "url",
    watermark: false,
    sequential_image_generation: "disabled",
  };

  // output_format 仅 Seedream 5.0+ 支持
  if (!provider.model.includes("seedream-4")) {
    body.output_format = "jpeg";
  }

  if (mode === "image_to_image" && normalizedImages.length > 0) {
    body.image = normalizedImages.length === 1 ? normalizedImages[0] : normalizedImages.slice(0, 20);
  }

  const secretCandidates = parseSecretCandidates(provider.secret);
  const apiKey = (secretCandidates.length > 0 ? secretCandidates[0] : provider.secret).replace(/^Bearer\s+/i, "").trim();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  return { endpoint, headers, body };
}

// ---------------------------------------------------------------------------
// 响应提取
// ---------------------------------------------------------------------------

/** 从 Seedream 云雾响应中提取图片 URL
 *  响应格式（OpenAI 兼容）: { data: [{ url: "https://...", size: "2K" }] }
 */
function extractImageUrls(data: unknown): string[] {
  const output: string[] = [];
  const root = (data ?? {}) as Record<string, unknown>;

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

export const seedreamImageArkYunwuHandler: ImageCallModeHandler = {
  buildRequest,
  extractImageUrls,
};
