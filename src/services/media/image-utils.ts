/**
 * 图片工具函数 —— 从 app.ts 提取的图片解析/读取/规范化逻辑
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRuntimeConfig } from "../../core/runtime-config.js";

// ---------------------------------------------------------------------------
// parseImageDataUrl — 解析 data URL 为 mimeType + base64 data
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// guessImageMimeType — 根据文件路径猜测 MIME 类型
// ---------------------------------------------------------------------------
export function guessImageMimeType(url: string): string {
  const lower = url.trim().toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
}

// ---------------------------------------------------------------------------
// resolveServerRelativeImageUrl — 解析服务器相对图片 URL
// ---------------------------------------------------------------------------
export function resolveServerRelativeImageUrl(url: string): string | null {
  const trimmed = url.trim().replace(/\\/g, "/");
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^(localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9.-]+\.[a-z]{2,})(:\d+)?\//i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (trimmed.startsWith("//")) {
    return `http:${trimmed}`;
  }
  if (/^[a-zA-Z]:\//.test(trimmed)) {
    return null;
  }
  const pathLike =
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("storage/") ||
    trimmed.startsWith("media/");
  if (!pathLike) {
    return null;
  }
  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed.replace(/^\.?\//, "")}`;
  const runtime = resolveRuntimeConfig(process.env);
  const origin = runtime.server.hostBaseUrl ?? runtime.server.internalBaseUrl;
  return `${origin}${normalizedPath}`;
}

// ---------------------------------------------------------------------------
// normalizeProviderTransportImageUrls — 规范化 Provider 传输图片 URL 列表
// ---------------------------------------------------------------------------
export function normalizeProviderTransportImageUrls(imageUrls: string[] | undefined): string[] {
  if (!Array.isArray(imageUrls) || imageUrls.length < 1) {
    return [];
  }
  const normalized = imageUrls
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0)
    .map((item) => {
      if (/^https?:\/\//i.test(item) || /^data:image\/[^;]+;base64,/i.test(item)) {
        return item;
      }
      return resolveServerRelativeImageUrl(item) ?? item;
    });
  return [...new Set(normalized)];
}

// ---------------------------------------------------------------------------
// resolveLocalImageFilePath — 解析本地图片文件路径
// ---------------------------------------------------------------------------
export function resolveLocalImageFilePath(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }
  if (/^file:\/\//i.test(trimmed)) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return null;
    }
  }
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return resolve(trimmed);
  }
  return null;
}

// ---------------------------------------------------------------------------
// isSupportedLlmImageUrl — 判断是否为 LLM 支持的图片 URL
// ---------------------------------------------------------------------------
export function isSupportedLlmImageUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return false;
  }
  if (parseImageDataUrl(trimmed)) {
    return true;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }
  if (resolveServerRelativeImageUrl(trimmed)) {
    return true;
  }
  return resolveLocalImageFilePath(trimmed) !== null;
}

// ---------------------------------------------------------------------------
// readLocalImageInlineData — 读取本地图片内联数据
// ---------------------------------------------------------------------------
export async function readLocalImageInlineData(filePathInput: string): Promise<{ mimeType: string; data: string }> {
  const resolvedPath = resolveLocalImageFilePath(filePathInput);
  if (!resolvedPath) {
    throw new Error("local image path is invalid");
  }
  if (!existsSync(resolvedPath)) {
    throw new Error(`local image not found: ${resolvedPath}`);
  }
  const bytes = await readFile(resolvedPath);
  if (bytes.byteLength < 1) {
    throw new Error("local image file is empty");
  }
  return {
    mimeType: guessImageMimeType(resolvedPath),
    data: Buffer.from(bytes).toString("base64"),
  };
}

// ---------------------------------------------------------------------------
// fetchImageInlineData — 获取图片内联数据（远程）
// ---------------------------------------------------------------------------
export async function fetchImageInlineData(
  url: string,
  timeoutMs: number,
): Promise<{ mimeType: string; data: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(6_000, timeoutMs));
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "image/*,*/*;q=0.8",
      },
    });
    if (!response.ok) {
      throw new Error(`image fetch failed with status ${response.status}`);
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 1) {
      throw new Error("image fetch returned empty body");
    }
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    const mimeType = contentType && contentType.startsWith("image/") ? contentType : guessImageMimeType(url);
    return {
      mimeType,
      data: Buffer.from(bytes).toString("base64"),
    };
  } finally {
    clearTimeout(timeout);
  }
}
