/**
 * image-callmodes/openai-image-edit.ts
 *
 * CallMode: OPENAI_IMAGE_EDIT
 * 协议: OpenAI 图片编辑 /v1/images/edits（multipart/form-data）
 * 支持：多图编辑（最多16张），远程图片 URL 直接传递
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
// 尺寸映射
// ---------------------------------------------------------------------------

const OPENAI_EDIT_SIZES = [
  "1024x1024", "1536x1024", "1024x1536",
  "2048x2048", "2048x1152", "3840x2160", "2160x3840",
] as const;

/** 将业务 ratio 映射为 OpenAI 图片编辑 size 参数 */
function mapOpenaiEditSize(ratio?: string): string {
  if (!ratio) return "auto";
  const normalized = ratio.replace(/\s/g, "");

  if (normalized === "1:1" || normalized === "square") return "2048x2048";
  if (normalized === "16:9" || normalized === "landscape") return "1536x1024";
  if (normalized === "9:16" || normalized === "portrait") return "2160x3840";
  if (normalized === "2k" || normalized === "2K") return "2048x2048";
  if (normalized === "2k横版" || normalized === "2K横版") return "2048x1152";
  if (normalized === "4k横版" || normalized === "4K横版") return "3840x2160";
  if (normalized === "4k竖版" || normalized === "4K竖版") return "2160x3840";

  if (OPENAI_EDIT_SIZES.includes(normalized as typeof OPENAI_EDIT_SIZES[number])) {
    return normalized;
  }

  return "auto";
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

  const size = mapOpenaiEditSize(options?.ratio);
  if (size !== "auto") {
    formData.append("size", size);
  }

  if (options?.resolution) {
    formData.append("quality", options.resolution);
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
