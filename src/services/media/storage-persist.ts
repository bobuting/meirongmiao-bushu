/**
 * 存储/持久化工具函数 —— 从 app.ts 提取的图片/视频持久化到对象存储的逻辑
 */
import { createHash } from "node:crypto";
import { extname } from "node:path";
import type { AppContext } from "../../core/app-context.js";
import { getLogger } from "../../core/logger/index.js";
import { ImageFormat, ImageFormatExtension, ImageFormatMimeType } from "../../contracts/image-format-contract.js";
import {
  isDataImageUrl,
  isDataVideoUrl,
  isHttpUrl,
  resolveVideoStorageFileName,
} from "../../utils/url.js";

// 重新导出 ImageFormat 供其他模块使用
export { ImageFormat } from "../../contracts/image-format-contract.js";

const log = getLogger("storage-persist");

// ---------------------------------------------------------------------------
// optimizeImageBuffer — 优化图片 Buffer：限制尺寸 + 格式转换
// 解决 OSS 图片处理服务 20MB 限制问题 + Gemini 不支持 WebP
// ---------------------------------------------------------------------------
export interface OptimizeImageOptions {
  /** 长边最大像素，默认 4096（4K） */
  maxLongEdge?: number;
  /** 图片质量，默认 90（PNG 无损不使用此参数） */
  quality?: number;
  /** 输出格式，默认 JPEG */
  format?: ImageFormat;
}

export async function optimizeImageBuffer(
  inputBuffer: Buffer,
  options?: OptimizeImageOptions,
): Promise<{ buffer: Buffer; contentType: string }> {
  const { maxLongEdge = 4096, quality = 90, format = ImageFormat.JPEG } = options ?? {};

  const sharp = (await import("sharp")).default;

  // PNG 无损不使用 quality 参数
  // quality 100 时 WebP 使用无损模式，避免有损压缩导致长图变模糊
  let sharpChain = sharp(inputBuffer)
    .resize(maxLongEdge, maxLongEdge, {
      fit: "inside",
      withoutEnlargement: true,
    });

  // 根据格式选择不同的输出方法
  if (format === ImageFormat.JPEG) {
    sharpChain = sharpChain.jpeg({ quality });
  } else if (format === ImageFormat.WEBP) {
    sharpChain = sharpChain.webp(quality >= 100 ? { lossless: true, effort: 6 } : { quality });
  } else if (format === ImageFormat.PNG) {
    sharpChain = sharpChain.png({ compressionLevel: 6 });
  }

  const optimized = await sharpChain.toBuffer();

  return { buffer: optimized, contentType: ImageFormatMimeType[format] };
}

// ---------------------------------------------------------------------------
// normalizeObjectStoragePublicBase — 规范化对象存储公共路径前缀
// ---------------------------------------------------------------------------
export function normalizeObjectStoragePublicBase(): string {
  // S3/OSS 公共地址优先（完整 URL）
  const s3PublicBase = process.env.OBJECT_STORAGE_S3_PUBLIC_BASE?.trim();
  if (s3PublicBase) {
    return s3PublicBase.replace(/\/+$/, "");
  }
  // 本地存储代理路径（默认）
  const raw = (process.env.OBJECT_STORAGE_PUBLIC_BASE ?? "/storage/objects").trim();
  const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
  return prefixed.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// guessImageExtension — 根据 content-type 或 URL 猜测图片扩展名
// ---------------------------------------------------------------------------
export function guessImageExtension(contentType: string | null, url: string): string {
  const lowerContentType = (contentType ?? "").toLowerCase();
  if (lowerContentType.includes("png")) return ".png";
  if (lowerContentType.includes("webp")) return ".webp";
  if (lowerContentType.includes("gif")) return ".gif";
  if (lowerContentType.includes("bmp")) return ".bmp";
  if (lowerContentType.includes("svg")) return ".svg";
  if (lowerContentType.includes("jpeg") || lowerContentType.includes("jpg")) return ".jpg";
  const cleanUrl = url.split("?")[0] ?? "";
  const ext = extname(cleanUrl).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"].includes(ext)) {
    return ext === ".jpeg" ? ".jpg" : ext;
  }
  return ".jpg";
}

// ---------------------------------------------------------------------------
// guessVideoExtension — 根据 content-type 或 URL 猜测视频扩展名
// ---------------------------------------------------------------------------
export function guessVideoExtension(contentType: string | null, url: string): string {
  const lowerContentType = (contentType ?? "").toLowerCase();
  if (lowerContentType.includes("webm")) return ".webm";
  if (lowerContentType.includes("quicktime")) return ".mov";
  if (lowerContentType.includes("x-m4v")) return ".m4v";
  if (lowerContentType.includes("mp4") || lowerContentType.startsWith("video/")) return ".mp4";
  const cleanUrl = url.split("?")[0] ?? "";
  const ext = extname(cleanUrl).toLowerCase();
  if ([".mp4", ".webm", ".mov", ".m4v"].includes(ext)) {
    return ext;
  }
  return ".mp4";
}

// ---------------------------------------------------------------------------
// resolveVideoContentType — 推断视频 content-type
// ---------------------------------------------------------------------------
export function resolveVideoContentType(contentType: string | null, ext: string): string {
  const normalized = String(contentType ?? "").trim().toLowerCase();
  if (normalized.startsWith("video/")) {
    return normalized.split(";")[0].trim();
  }
  if (ext === ".webm") {
    return "video/webm";
  }
  if (ext === ".mov") {
    return "video/quicktime";
  }
  if (ext === ".m4v") {
    return "video/x-m4v";
  }
  return "video/mp4";
}

// ---------------------------------------------------------------------------
// isObjectStoragePublicUrl — 判断是否为对象存储公共 URL
// ---------------------------------------------------------------------------
export function isObjectStoragePublicUrl(value: string, publicBase: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith(`${publicBase}/`)) {
    return true;
  }
  if (!isHttpUrl(trimmed)) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.pathname.startsWith(`${publicBase}/`);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// readImageBytesFromSource — 从源读取图片字节（带重试机制）
// ---------------------------------------------------------------------------
export interface ReadImageBytesOptions {
  /** 超时时间（毫秒），默认使用配置值 */
  timeoutMs?: number;
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 重试间隔（毫秒），默认 1000 */
  retryDelayMs?: number;
}

export async function readImageBytesFromSource(
  sourceUrl: string,
  timeoutMs: number,
  options?: ReadImageBytesOptions,
): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  // Data URL 不需要重试
  const dataUrlMatch = sourceUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/i);
  if (dataUrlMatch) {
    const mime = dataUrlMatch[1]?.trim() || "image/png";
    const isBase64 = Boolean(dataUrlMatch[2]);
    const payload = dataUrlMatch[3] ?? "";
    const bytes = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    return { bytes, contentType: mime };
  }

  const maxRetries = options?.maxRetries ?? 3;
  const retryDelayMs = options?.retryDelayMs ?? 1000;
  const timeoutValue = Math.max(2_000, options?.timeoutMs ?? timeoutMs);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutValue);

    try {
      const response = await fetch(sourceUrl, { method: "GET", signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();

      // 成功：记录重试情况（如果重试过）
      if (attempt > 1) {
        log.info({ url: sourceUrl.slice(0, 80), attempt, maxRetries }, "图片下载重试成功");
      }

      return {
        bytes: new Uint8Array(arrayBuffer),
        contentType: response.headers.get("content-type"),
      };
    } catch (err) {
      clearTimeout(timer);

      const errName = err instanceof Error ? err.name : "Unknown";
      const errMessage = err instanceof Error ? err.message : String(err);

      // 超时错误特殊处理
      if (errName === "AbortError") {
        lastError = new Error(`IMAGE_DOWNLOAD_TIMEOUT: 图片下载超时 (${timeoutValue}ms)，URL: ${sourceUrl.slice(0, 100)}...`);
      } else {
        lastError = new Error(`IMAGE_DOWNLOAD_FAILED (${errName}): ${errMessage}，URL: ${sourceUrl.slice(0, 100)}...`);
      }

      // 最后一次失败：不再重试，直接抛出
      if (attempt === maxRetries) {
        log.error({ url: sourceUrl.slice(0, 80), attempt, maxRetries, error: errMessage }, "图片下载最终失败");
        throw lastError;
      }

      // 记录重试情况
      log.warn({ url: sourceUrl.slice(0, 80), attempt, maxRetries, error: errMessage, retryDelayMs }, "图片下载失败，准备重试");

      // 等待后重试
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    } finally {
      clearTimeout(timer);
    }
  }

  // 所有重试都失败（理论上不会走到这里，因为上面已经 throw）
  throw lastError ?? new Error("IMAGE_DOWNLOAD_FAILED: 未知错误");
}

// ---------------------------------------------------------------------------
// persistImageSourceToStorage — 持久化图片到对象存储
// ---------------------------------------------------------------------------
export interface PersistImageOptions {
  /** 是否持久化远程 URL（非 data: URL） */
  persistRemote?: boolean;
  /** 是否按内容去重（默认 true） */
  dedupeByContent?: boolean;
  /** 是否优化图片：限制尺寸 + 格式转换（默认 true） */
  optimize?: boolean;
  /** 优化时的长边最大像素（默认 4096，即 4K） */
  optimizeMaxLongEdge?: number;
  /** 优化时的图片质量（默认 90，PNG 无损不使用此参数） */
  optimizeQuality?: number;
  /** 优化时的输出格式，默认 JPEG */
  optimizeFormat?: ImageFormat;
  /** 业务域（用于文件注册） */
  businessDomain?: string;
  /** 业务子域（用于文件注册） */
  businessSubdomain?: string;
  /** 上传者 ID（用于文件注册） */
  uploaderId?: string;
}

export async function persistImageSourceToStorage(
  ctx: AppContext,
  sourceUrl: string,
  keyPrefix: string,
  options?: PersistImageOptions,
): Promise<string> {
  const trimmed = sourceUrl.trim();
  if (!trimmed) {
    return sourceUrl;
  }
  if (!ctx.storage) {
    throw new Error("STORAGE_NOT_INITIALIZED: 对象存储未初始化，无法持久化图片");
  }
  const publicBase = normalizeObjectStoragePublicBase();
  if (isObjectStoragePublicUrl(trimmed, publicBase)) {
    return trimmed;
  }
  const persistRemote = Boolean(options?.persistRemote);
  if (!isDataImageUrl(trimmed) && !(persistRemote && isHttpUrl(trimmed))) {
    return sourceUrl;
  }
  let { bytes, contentType } = await readImageBytesFromSource(trimmed, ctx.configService.get().imageDownloadTimeoutMs);
  if (bytes.length < 1) {
    throw new Error("EMPTY_IMAGE_BYTES");
  }

  // 图片优化：限制尺寸 + 格式转换（默认启用，默认 JPEG）
  let finalExt: string;
  if (options?.optimize ?? true) {
    const format = options?.optimizeFormat ?? ImageFormat.JPEG;
    const optimized = await optimizeImageBuffer(Buffer.from(bytes) as Buffer, {
      maxLongEdge: options?.optimizeMaxLongEdge,
      quality: options?.optimizeQuality,
      format,
    });
    bytes = optimized.buffer;
    contentType = optimized.contentType;
    finalExt = ImageFormatExtension[format];
  } else {
    finalExt = guessImageExtension(contentType, trimmed);
  }

  const dedupeByContent = options?.dedupeByContent ?? true;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = (() => {
    if (dedupeByContent) {
      // Global content-addressed key to avoid duplicated binary writes across modules/features.
      return `media/sha256/${sha256.slice(0, 2)}/${sha256}${finalExt}`;
    }
    const normalizedPrefix = keyPrefix.replace(/^\/+|\/+$/g, "");
    const sourceDigest = createHash("sha256").update(trimmed).digest("hex");
    const scopedPrefix = normalizedPrefix.length > 0 ? normalizedPrefix : "media/generated";
    return `${scopedPrefix}/${sourceDigest.slice(0, 2)}/${sourceDigest}${finalExt}`;
  })();
  await ctx.storage.putObject(key, bytes, contentType ?? undefined);
  const publicUrl = ctx.storage.getSignedUrl(key);

  // 注册文件到 FileService（用于引用追踪和统计）
  if (options?.uploaderId && ctx.fileService) {
    try {
      await ctx.fileService.upload(options.uploaderId, bytes, {
        fileName: trimmed.split("/").pop() ?? "image",
        contentType: contentType ?? "image/jpeg",
        businessDomain: (options.businessDomain as any) ?? "project",
        businessSubdomain: (options.businessSubdomain as any) ?? "media_persist",
        businessTags: { sha256 },
      });
    } catch {
      // 注册失败不影响主流程
    }
  }

  return publicUrl;
}

// ---------------------------------------------------------------------------
// persistVideoSourceToStorage — 持久化视频到对象存储
// ---------------------------------------------------------------------------
export async function persistVideoSourceToStorage(
  ctx: AppContext,
  sourceUrl: string,
  keyPrefix: string,
): Promise<string> {
  const trimmed = sourceUrl.trim();
  if (!trimmed) {
    return sourceUrl;
  }
  if (!ctx.storage) {
    throw new Error("STORAGE_NOT_INITIALIZED: 对象存储未初始化，无法持久化视频");
  }
  const publicBase = normalizeObjectStoragePublicBase();
  if (isObjectStoragePublicUrl(trimmed, publicBase)) {
    return trimmed;
  }
  if (!isDataVideoUrl(trimmed) && !isHttpUrl(trimmed)) {
    return sourceUrl;
  }
  const { bytes, contentType } = await readImageBytesFromSource(trimmed, 120_000);
  if (bytes.length < 1) {
    throw new Error("EMPTY_VIDEO_BYTES");
  }
  const ext = guessVideoExtension(contentType, trimmed);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const normalizedPrefix = keyPrefix.replace(/^\/+|\/+$/g, "");
  const scopedPrefix = normalizedPrefix.length > 0 ? normalizedPrefix : "media/video";
  const fileName = resolveVideoStorageFileName(trimmed, ext);
  const key = `${scopedPrefix}/${digest.slice(0, 2)}/${digest.slice(0, 16)}-${fileName}`;
  await ctx.storage.putObject(key, bytes, resolveVideoContentType(contentType, ext));
  return ctx.storage.getSignedUrl(key);
}
