/**
 * image-callmodes/openai-image.ts
 *
 * CallMode: OPENAI_IMAGE
 * 协议: OpenAI 图片生成 /v1/images/generations（gpt-image-2 等）
 */

import type { ResolvedRouteProvider } from "../../llm/provider-resolver.js";
import type { ImageCallModeHandler, ImageCallModeOptions, ImageCallModeRequest } from "./types.js";
import { normalizeProviderTransportImageUrls, parseSecretCandidates } from "./shared.js";

// ---------------------------------------------------------------------------
// 尺寸映射
// ---------------------------------------------------------------------------

const OPENAI_IMAGE_PRESETS = ["1024x1024", "1536x1024", "1024x1536", "864x1536", "1536x864"] as const;

/** 将业务 ratio 映射为 OpenAI 图片生成 size 参数 */
function mapOpenaiImageSize(ratio?: string): string {
  if (!ratio) return "1024x1024";
  const normalized = ratio.replace(/\s/g, "");
  if (normalized === "1:1" || normalized === "square") return "1024x1024";
  if (normalized === "16:9" || normalized === "landscape" || normalized === "4:3") return "1536x1024";
  if (normalized === "9:16" || normalized === "portrait") return "864x1536";
  if (normalized === "3:4") return "1024x1536";
  if (OPENAI_IMAGE_PRESETS.includes(normalized as typeof OPENAI_IMAGE_PRESETS[number])) {
    return normalized;
  }
  return "1024x1024";
}

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

  const size = mapOpenaiImageSize(options?.ratio);
  const n = Math.max(1, Math.min(4, Number(options?.count) || 1));
  const normalizedImages = normalizeProviderTransportImageUrls(options?.images);

  const body: Record<string, unknown> = {
    model: provider.model,
    prompt,
    n,
    size,
    response_format: "url",
  };

  // image_to_image 模式：传入参考图（始终数组格式）
  if (options?.mode === "image_to_image" && normalizedImages.length > 0) {
    body.image = normalizedImages.slice(0, 4);
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

/** 从 OpenAI 图片生成响应中提取 URL
 *  响应格式: { data: [{ url }] } 或 { data: [{ url: "data:image/..." }] } 或 { data: [{ b64_json }] }
 */
function extractImageUrls(data: unknown): string[] {
  const output: string[] = [];
  const root = (data ?? {}) as Record<string, unknown>;

  if (!Array.isArray(root.data)) return output;

  for (const item of root.data) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;

    // HTTP URL 或 data: URL
    const url = String(record.url ?? "").trim();
    if (url && (/^https?:\/\//i.test(url) || /^data:image\//i.test(url)) && !output.includes(url)) {
      output.push(url);
    }

    // Base64 → data URL
    const b64 = String(record.b64_json ?? "").trim();
    if (b64 && !output.some((u) => u.includes(b64.substring(0, 32)))) {
      output.push(`data:image/png;base64,${b64}`);
    }
  }

  return output;
}

// ---------------------------------------------------------------------------
// 导出 Handler
// ---------------------------------------------------------------------------

export const openaiImageHandler: ImageCallModeHandler = {
  buildRequest,
  extractImageUrls,
};
