/**
 * image-callmodes/grok-image-edit.ts
 *
 * CallMode: GROK_IMAGE_EDIT
 * 协议: Grok 图片编辑 /v1/images/edits（multipart/form-data）
 * 特殊：需要下载参考图到内存再上传，使用 FormData 而非 JSON
 */

import { AppError } from "../../../core/errors.js";
import type { ResolvedRouteProvider } from "../../llm/provider-resolver.js";
import type { ImageCallModeHandler, ImageCallModeOptions, ImageCallModeRequest } from "./types.js";
import { normalizeProviderTransportImageUrls, parseSecretCandidates } from "./shared.js";

// ---------------------------------------------------------------------------
// 下载辅助
// ---------------------------------------------------------------------------

async function downloadImageToBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new AppError(502, "IMAGE_DOWNLOAD_FAILED", `下载参考图失败: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ---------------------------------------------------------------------------
// 请求构建
// ---------------------------------------------------------------------------

async function buildRequest(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: ImageCallModeOptions,
): Promise<ImageCallModeRequest> {
  const base = provider.baseUrl.replace(/\/+$/, "");
  const endpoint = `${base}/v1/images/edits`;

  if (!provider.model) {
    throw new AppError(500, "GROK_MODEL_MISSING", "Grok 图片编辑需要 provider.model 配置");
  }

  const secretCandidates = parseSecretCandidates(provider.secret);
  const apiKey = (secretCandidates.length > 0 ? secretCandidates[0] : provider.secret).replace(/^Bearer\s+/i, "").trim();
  if (!apiKey) {
    throw new AppError(500, "GROK_API_KEY_MISSING", "Grok 图片编辑需要有效的 API Key");
  }

  // 下载参考图到内存
  const normalizedImages = normalizeProviderTransportImageUrls(options?.images);
  const imageUrl = normalizedImages[0];
  if (!imageUrl) {
    throw new AppError(400, "IMAGE_URL_REQUIRED", "Grok 图片编辑需要至少一张参考图");
  }
  const imageBuffer = await downloadImageToBuffer(imageUrl);

  const resolution = "2k";
  const quality = "high";

  // 构建 multipart/form-data
  const formData = new FormData();
  formData.append("model", provider.model);
  formData.append("prompt", prompt);
  formData.append("image", new Blob([new Uint8Array(imageBuffer)]), "reference.png");
  if (options?.ratio) {
    formData.append("aspect_ratio", options.ratio);
  }
  formData.append("resolution", resolution);
  formData.append("quality", quality);
  formData.append("response_format", "url");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  return { endpoint, headers, body: {}, isMultipart: true, formData };
}

// ---------------------------------------------------------------------------
// 响应提取
// ---------------------------------------------------------------------------

/** 从 Grok Image Edit 响应中提取 URL
 *  响应格式: { data: [{ url }] }
 */
function extractImageUrls(data: unknown): string[] {
  const root = (data ?? {}) as Record<string, unknown>;
  const dataArr = Array.isArray(root.data) ? root.data : [];
  const urls: string[] = [];
  for (const item of dataArr) {
    if (!item || typeof item !== "object") continue;
    const url = (item as Record<string, unknown>).url;
    if (typeof url === "string" && url.trim() && !urls.includes(url.trim())) {
      urls.push(url.trim());
    }
  }
  return urls;
}

// ---------------------------------------------------------------------------
// 导出 Handler
// ---------------------------------------------------------------------------

export const grokImageEditHandler: ImageCallModeHandler = {
  buildRequest,
  extractImageUrls,
};
