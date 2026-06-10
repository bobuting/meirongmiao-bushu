/**
 * 文件类型检测工具
 * 根据 MIME 类型或文件扩展名判断文件类型
 */

import type { FileType } from "../../contracts/file-registry-contract.js";

/** MIME 类型到文件类型的映射 */
const MIME_TYPE_MAP: Record<string, FileType> = {
  // 图片
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/svg+xml": "image",
  "image/bmp": "image",

  // 视频
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "video/x-m4v": "video",

  // 音频
  "audio/mpeg": "audio",
  "audio/mp3": "audio",
  "audio/wav": "audio",
  "audio/ogg": "audio",
  "audio/aac": "audio",

  // 文档
  "application/pdf": "document",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "text/plain": "document",
  "text/csv": "document",
};

/** 扩展名到文件类型的映射 */
const EXTENSION_MAP: Record<string, FileType> = {
  // 图片
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".gif": "image",
  ".webp": "image",
  ".svg": "image",
  ".bmp": "image",

  // 视频
  ".mp4": "video",
  ".webm": "video",
  ".mov": "video",
  ".m4v": "video",

  // 音频
  ".mp3": "audio",
  ".wav": "audio",
  ".ogg": "audio",
  ".aac": "audio",

  // 文档
  ".pdf": "document",
  ".doc": "document",
  ".docx": "document",
  ".txt": "document",
  ".csv": "document",
};

/**
 * 根据 MIME 类型检测文件类型
 */
export function detectFileTypeByMimeType(mimeType: string | null | undefined): FileType {
  if (!mimeType) return "document";

  const normalized = mimeType.toLowerCase().split(";")[0].trim();
  return MIME_TYPE_MAP[normalized] ?? "document";
}

/**
 * 根据文件名扩展名检测文件类型
 */
export function detectFileTypeByFileName(fileName: string | null | undefined): FileType {
  if (!fileName) return "document";

  const ext = fileName.toLowerCase().split(".").pop();
  if (!ext) return "document";

  return EXTENSION_MAP[`.${ext}`] ?? "document";
}

/**
 * 综合检测文件类型
 * 优先使用 MIME 类型，其次使用文件名
 */
export function detectFileType(
  mimeType: string | null | undefined,
  fileName: string | null | undefined
): FileType {
  const typeByMime = detectFileTypeByMimeType(mimeType);
  if (typeByMime !== "document") {
    return typeByMime;
  }

  return detectFileTypeByFileName(fileName);
}

/**
 * 根据文件类型推断 MIME 类型
 */
export function inferMimeType(fileType: FileType, fileName?: string): string {
  if (fileName) {
    const ext = fileName.toLowerCase().split(".").pop();
    for (const [mime, type] of Object.entries(MIME_TYPE_MAP)) {
      if (type === fileType && mime.includes(ext ?? "")) {
        return mime;
      }
    }
  }

  // 默认 MIME 类型
  const defaults: Record<FileType, string> = {
    image: "image/jpeg",
    video: "video/mp4",
    audio: "audio/mpeg",
    document: "application/octet-stream",
  };

  return defaults[fileType];
}