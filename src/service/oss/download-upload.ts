/**
 * 通用下载上传工具
 * 从远程 URL 下载文件并上传到 OSS
 * 支持 HEIF/HEIC 格式自动转换为 JPEG（浏览器兼容）
 */
import type { IObjectStorageAdapter } from "../../contracts/object-storage.js";
import { getOssService, type OssUploadResult } from "./oss-service.js";
import Sharp from "sharp";
import { execFile } from "node:child_process";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getLogger } from "../../core/logger/index.js";

const log = getLogger("download-upload");

/**
 * 下载上传结果
 */
export interface DownloadUploadResult {
  key: string;   // OSS 存储路径
  url: string;   // 访问 URL
  size: number;  // 文件大小
}

/**
 * 使用 macOS 原生 sips 命令将 HEIF/HEIC 转换为 JPEG
 * sips 支持系统级的 HEVC 解码，比 npm 包（heic-convert）更可靠
 */
async function convertHeifWithSips(heifBytes: Uint8Array): Promise<Uint8Array> {
  const id = randomUUID();
  const heifPath = join(tmpdir(), `heif_input_${id}.heic`);
  const jpegPath = join(tmpdir(), `heif_output_${id}.jpg`);

  try {
    // 写入临时 HEIF 文件
    await writeFile(heifPath, heifBytes);

    // 使用 sips 转换为 JPEG
    await new Promise<void>((resolve, reject) => {
      execFile("sips", ["-s", "format", "jpeg", heifPath, "--out", jpegPath], (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`sips 转换失败: ${stderr || error.message}`));
          return;
        }
        resolve();
      });
    });

    // 读取转换后的 JPEG
    const jpegBuffer = await readFile(jpegPath);
    return new Uint8Array(jpegBuffer);
  } finally {
    // 清理临时文件
    await Promise.allSettled([
      unlink(heifPath).catch((e) => {
        log.warn({ path: heifPath, error: e instanceof Error ? e.message : String(e) }, "清理临时 HEIF 文件失败");
      }),
      unlink(jpegPath).catch((e) => {
        log.warn({ path: jpegPath, error: e instanceof Error ? e.message : String(e) }, "清理临时 JPEG 文件失败");
      }),
    ]);
  }
}

/**
 * 根据 URL 推断图片扩展名
 */
function inferImageExtension(contentType: string, url: string): string {
  // 优先从 Content-Type 推断
  const mimeExt = contentType.split("/")[1]?.toLowerCase();
  if (mimeExt && ["png", "jpeg", "jpg", "gif", "webp"].includes(mimeExt)) {
    return mimeExt === "jpeg" ? "jpg" : mimeExt;
  }
  // 从 URL 路径推断
  const urlExt = url.split(".").pop()?.split("?")[0].toLowerCase();
  if (urlExt && ["png", "jpeg", "jpg", "gif", "webp"].includes(urlExt)) {
    return urlExt === "jpeg" ? "jpg" : urlExt;
  }
  return "png";
}

/**
 * 从远程 URL 下载图片并上传到 OSS
 * @param sourceUrl 远程图片 URL
 * @param storage 存储适配器
 * @param key OSS 存储路径
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @returns 上传结果 { key, url, size }
 */
export async function downloadAndUploadImage(
  sourceUrl: string,
  storage: IObjectStorageAdapter,
  key: string,
  publicBaseUrl?: string,
): Promise<DownloadUploadResult> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`下载图片失败: ${response.status} ${response.statusText}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1) {
    throw new Error("下载的图片为空");
  }

  // 检测图片格式并转换为 JPEG
  let finalBytes: Uint8Array;
  try {
    const meta = await Sharp(bytes).metadata();
    const format = meta.format as string;

    if (format === "heif" || format === "heic") {
      // HEIF/HEIC 格式：Sharp 和 heic-convert 都不支持 HEVC 解码
      // 使用 macOS 原生 sips 命令转换（支持 HEVC）
      finalBytes = await convertHeifWithSips(bytes);
    } else {
      // 其他格式使用 Sharp 转换为 JPEG
      const jpegBuffer = await Sharp(bytes).jpeg({ quality: 90 }).toBuffer();
      finalBytes = new Uint8Array(jpegBuffer);
    }
  } catch {
    // Sharp 解析失败：可能是 HEIF 但无法识别，尝试 sips 转换
    try {
      finalBytes = await convertHeifWithSips(bytes);
    } catch {
      // sips 也失败，保持原样上传
      finalBytes = bytes;
    }
  }

  const finalContentType = "image/jpeg";
  // 强制 key 扩展名为 .jpg
  const finalKey = key.replace(/\.[^.]+$/, ".jpg");

  const ossService = getOssService(storage, { publicBaseUrl });
  const result: OssUploadResult = await ossService.upload(finalKey, finalBytes, finalContentType);

  if (!result.success) {
    throw new Error(`上传图片失败: ${result.message}`);
  }

  return { key: result.key, url: result.url, size: result.size };
}

/**
 * 从远程 URL 下载文件并上传到 OSS（通用版本）
 * @param sourceUrl 远程文件 URL
 * @param storage 存储适配器
 * @param key OSS 存储路径
 * @param options 可选配置
 * @returns 上传结果 { key, url, size }
 */
export async function downloadAndUploadToOss(
  sourceUrl: string,
  storage: IObjectStorageAdapter,
  key: string,
  options?: {
    contentType?: string;
    publicBaseUrl?: string;
  },
): Promise<DownloadUploadResult> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`下载失败: ${response.status} ${response.statusText}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1) {
    throw new Error("下载的文件为空");
  }

  // 推断 MIME 类型：优先使用传入值，其次 response header，最后根据扩展名
  const contentType =
    options?.contentType || response.headers.get("content-type") || inferContentType(key);

  const ossService = getOssService(storage, { publicBaseUrl: options?.publicBaseUrl });
  const result: OssUploadResult = await ossService.upload(key, bytes, contentType);

  if (!result.success) {
    throw new Error(`上传失败: ${result.message}`);
  }

  return { key: result.key, url: result.url, size: result.size };
}

/**
 * 根据文件扩展名推断 MIME 类型
 */
function inferContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
  };
  return mimeMap[ext] || "application/octet-stream";
}

export { inferImageExtension };
