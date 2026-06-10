/**
 * content-type 工具函数
 *
 * 根据文件扩展名或字节前缀检测 MIME 类型，以及读取布尔环境变量。
 * 从 app.ts 提取的纯函数，无跨模块依赖。
 */

import { extname } from "node:path";

/** 根据文件扩展名返回 MIME 类型 */
export function contentTypeByExtension(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".map") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

/** 根据字节前缀检测 MIME 类型 */
export function sniffContentTypeFromBytes(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }
  return null;
}

/** 组合扩展名 + 字节检测确定二进制文件的 Content-Type */
export function resolveBinaryContentType(filePath: string, bytes: Uint8Array): string {
  const byExtension = contentTypeByExtension(filePath);
  if (byExtension !== "application/octet-stream") {
    return byExtension;
  }
  return sniffContentTypeFromBytes(bytes) ?? byExtension;
}

/** 专门检测图片类型 */
export function resolveImageContentType(contentType: string | null, bytes: Uint8Array): string | null {
  const normalized = String(contentType ?? "").trim().toLowerCase();
  if (normalized.startsWith("image/")) {
    return normalized;
  }
  return sniffContentTypeFromBytes(bytes);
}

/** 读取布尔环境变量，支持多种真/假值表示 */
export function readBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}
