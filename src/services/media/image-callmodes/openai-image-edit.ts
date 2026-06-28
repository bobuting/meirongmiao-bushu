/**
 * image-callmodes/openai-image-edit.ts
 *
 * CallMode: OPENAI_IMAGE_EDIT
 * 协议: OpenAI 图片编辑 /v1/images/edits（multipart/form-data）
 * 支持：多图编辑（最多16张），远程图片 URL 直接传递
 */

import { AppError } from "../../../core/errors.js";
import { getLogger } from "../../../core/logger/index.js";
import type { ResolvedRouteProvider } from "../../llm/provider-resolver.js";
import type { ImageCallModeHandler, ImageCallModeOptions, ImageCallModeRequest } from "./types.js";
import {
  normalizeProviderTransportImageUrls,
  parseSecretCandidates,
  resolveOpenaiImageSize,
  resolveOpenaiImageQuality,
} from "./shared.js";

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

  // 校验必需参数
  const normalizedImages = normalizeProviderTransportImageUrls(options?.images);
  if (normalizedImages.length === 0) {
    throw new AppError(400, "IMAGE_URL_REQUIRED", "OpenAI 图片编辑需要至少一张参考图");
  }
  if (normalizedImages.length > 16) {
    throw new AppError(400, "IMAGE_COUNT_EXCEEDED", "OpenAI 图片编辑最多支持 16 张图片");
  }

  const secretCandidates = parseSecretCandidates(provider.secret);
  const apiKey = (secretCandidates.length > 0 ? secretCandidates[0] : provider.secret).replace(/^Bearer\s+/i, "").trim();

  // 下载所有图片到内存
  const imageBuffers = await Promise.all(
    normalizedImages.map(async (url, index) => {
      const buffer = await downloadImageToBuffer(url);
      return { buffer, filename: `image_${index}.png` };
    })
  );

  // 构建 multipart/form-data
  const formData = new FormData();

  // 模型（必需）
  formData.append("model", provider.model || "gpt-image-2");

  // 提示词（必需）
  formData.append("prompt", prompt);

  // 图片（必需）- 下载后作为 Blob 上传
  for (const { buffer, filename } of imageBuffers) {
    formData.append("image", new Blob([new Uint8Array(buffer)]), filename);
  }

  // 可选参数
  const n = Math.max(1, Math.min(10, Number(options?.count) || 1));
  if (n > 1) {
    formData.append("n", String(n));
  }

  // resolution + ratio 联合决定输出尺寸（与 openai-image 共用同一套映射）
  const size = resolveOpenaiImageSize(options?.resolution, options?.ratio);
  const log = getLogger("openai-image-edit");
  log.info({ ratio: options?.ratio, resolution: options?.resolution, size }, "OpenAI Image Edit 尺寸映射");
  if (size !== "auto") {
    formData.append("size", size);
  }

  // quality：根据分辨率等级映射（gpt-image-2 合法值: low / medium / high / auto）
  const quality = resolveOpenaiImageQuality(options?.resolution);
  if (quality) {
    formData.append("quality", quality);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  return { endpoint, headers, body: {}, isMultipart: true, formData };
}

// ---------------------------------------------------------------------------
// 响应提取
// ---------------------------------------------------------------------------

/** 从 OpenAI 图片编辑响应中提取图片
 *  响应格式: { data: { b64_json: "..." } } 或 { data: [{ b64_json: "..." }] }
 */
function extractImageUrls(data: unknown): string[] {
  const output: string[] = [];
  const root = (data ?? {}) as Record<string, unknown>;

  if (!root.data) return output;

  // 单张格式：{ data: { b64_json } }
  if (!Array.isArray(root.data) && typeof root.data === "object") {
    const record = root.data as Record<string, unknown>;
    const b64 = String(record.b64_json ?? "").trim();
    if (b64 && /^[A-Za-z0-9+/=\r\n]+$/.test(b64)) {
      output.push(`data:image/png;base64,${b64}`);
    }
    return output;
  }

  // 多张格式：{ data: [{ b64_json }] }
  if (Array.isArray(root.data)) {
    for (const item of root.data) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const b64 = String(record.b64_json ?? "").trim();
      if (b64 && /^[A-Za-z0-9+/=\r\n]+$/.test(b64)) {
        output.push(`data:image/png;base64,${b64}`);
      }
    }
  }

  return output;
}

// ---------------------------------------------------------------------------
// 导出 Handler
// ---------------------------------------------------------------------------

export const openaiImageEditHandler: ImageCallModeHandler = {
  buildRequest,
  extractImageUrls,
};
