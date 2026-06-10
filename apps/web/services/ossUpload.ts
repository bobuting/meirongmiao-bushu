/**
 * 阿里云 OSS 上传服务
 * 使用签名 URL 实现前端直传（无凭证暴露）
 */

import { backendApi } from "./backendApi";

// =========================================================================
// 图片格式枚举（与后端 image-format-contract.ts 保持一致）
// =========================================================================

/** 图片输出格式 */
export enum ImageFormat {
  /** JPEG 格式（默认，兼容性好，体积小，有损压缩） */
  JPEG = "jpeg",
  /** PNG 格式（无损，支持透明，体积大） */
  PNG = "png",
  /** WebP 格式（体积小，部分老浏览器不支持） */
  WEBP = "webp",
}

/** 图片格式对应的 MIME 类型 */
export const ImageFormatMimeType: Record<ImageFormat, string> = {
  [ImageFormat.JPEG]: "image/jpeg",
  [ImageFormat.PNG]: "image/png",
  [ImageFormat.WEBP]: "image/webp",
};

/** 图片格式对应的文件扩展名 */
export const ImageFormatExtension: Record<ImageFormat, string> = {
  [ImageFormat.JPEG]: ".jpg",
  [ImageFormat.PNG]: ".png",
  [ImageFormat.WEBP]: ".webp",
};

// =========================================================================
// 图片上传前自动压缩（即梦 API 限制：≤ 4.7MB，分辨率 ≤ 4096px）
// =========================================================================

/** 即梦 API 最大文件大小 4.7MB */
const JIMENG_MAX_FILE_SIZE = 4.7 * 1024 * 1024;
/** 即梦 API 最大分辨率 4096px */
const JIMENG_MAX_DIMENSION = 4096;
/** 图片压缩质量 */
const COMPRESS_QUALITY = 0.9;

/**
 * 判断文件是否为图片
 */
function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/**
 * 获取图片实际尺寸
 */
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("获取图片尺寸失败"));
    };
    img.src = url;
  });
}

/**
 * 压缩图片文件
 * @param file 原始图片文件
 * @param format 输出格式（默认 JPEG）
 * @returns 压缩后的 File 对象
 */
async function compressImage(file: File, format: ImageFormat = ImageFormat.JPEG): Promise<File> {
  const { width, height } = await getImageDimensions(file);

  // 计算缩放比例
  let targetWidth = width;
  let targetHeight = height;
  if (width > JIMENG_MAX_DIMENSION || height > JIMENG_MAX_DIMENSION) {
    const ratio = JIMENG_MAX_DIMENSION / Math.max(width, height);
    targetWidth = Math.round(width * ratio);
    targetHeight = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建 Canvas 上下文");
  }

  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      URL.revokeObjectURL(url);
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片加载失败"));
    };
    img.src = url;
  });

  // PNG 不支持质量参数，JPEG/WebP 使用压缩质量
  const quality = format === ImageFormat.PNG ? undefined : COMPRESS_QUALITY;

  const mimeType = ImageFormatMimeType[format];
  const dataUrl = quality !== undefined
    ? canvas.toDataURL(mimeType, quality)
    : canvas.toDataURL(mimeType);
  const arr = dataUrl.split(",");
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  // 将文件名后缀改为对应格式
  const originalName = file.name;
  const ext = ImageFormatExtension[format];
  const compressedName = originalName.includes(".")
    ? originalName.replace(/\.[^.]+$/, ext)
    : `${originalName}${ext}`;

  return new File([u8arr], compressedName, { type: mimeType });
}

/**
 * 检查图片是否需要压缩
 * 条件：大小 > 4.7MB 或 任一边 > 4096px
 */
async function shouldCompressImage(file: File): Promise<boolean> {
  if (!isImageFile(file)) return false;
  if (file.size > JIMENG_MAX_FILE_SIZE) return true;
  try {
    const { width, height } = await getImageDimensions(file);
    return width > JIMENG_MAX_DIMENSION || height > JIMENG_MAX_DIMENSION;
  } catch {
    return false;
  }
}

// =========================================================================
// 签名 URL 上传（无凭证暴露）
// =========================================================================

/**
 * 使用 XMLHttpRequest 上传文件（支持进度监控）
 */
function uploadWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-oss-object-acl", "public-read");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`上传失败: ${xhr.status} ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("网络错误，上传失败"));
    };

    xhr.send(file);
  });
}

/** 图片上传选项 */
export interface ImageUploadOptions {
  /** 上传进度回调 */
  onProgress?: (percent: number) => void;
  /** 图片输出格式（默认 JPEG） */
  format?: ImageFormat;
}

/**
 * 上传文件到 OSS（签名 URL 方式）
 * @param token 用户 token
 * @param projectId 项目 ID（资产库模式可传任意值，如 'library'）
 * @param file 要上传的文件
 * @param forLibrary 是否为资产库上传（不关联具体项目）
 * @param options 上传选项（进度回调、格式等）
 * @returns 上传后的文件 URL 和存储路径
 */
export async function uploadFileToOss(
  token: string,
  projectId: string,
  file: File,
  forLibrary?: boolean,
  options?: ImageUploadOptions
): Promise<{ fileUrl: string; storageKey: string }> {
  // 图片转换：默认 JPEG，可通过 format 参数指定其他格式
  let uploadFile = file;
  if (isImageFile(file)) {
    const format = options?.format ?? ImageFormat.JPEG;
    try {
      uploadFile = await compressImage(file, format);
    } catch (compressError) {
      // 转换失败时降级使用原文件，不阻断上传
      console.warn(`[ossUpload] 图片转${format}失败，使用原文件上传`, compressError);
      uploadFile = file;
    }
  }

  // 获取签名上传 URL
  const { uploadUrl, fileUrl, objectKey } = await backendApi.signUploadUrl(token, {
    filename: uploadFile.name,
    contentType: uploadFile.type || "application/octet-stream",
    projectId: forLibrary ? undefined : projectId,
    forLibrary,
  });

  // 使用签名 URL 直接上传
  await uploadWithProgress(uploadUrl, uploadFile, uploadFile.type || "application/octet-stream", options?.onProgress);

  return {
    fileUrl,
    storageKey: objectKey,
  };
}

/**
 * 删除 OSS 文件（服务端代理删除）
 * @param token 用户 token
 * @param projectId 项目 ID（资产库模式可传任意值，如 'library'）
 * @param storageKey 存储路径
 * @param forLibrary 是否为资产库上传（不关联具体项目）
 */
export async function deleteFileFromOss(
  token: string,
  projectId: string,
  storageKey: string,
  forLibrary?: boolean
): Promise<void> {
  await backendApi.deleteOssFile(token, {
    objectKey: storageKey,
    projectId: forLibrary ? undefined : projectId,
    forLibrary,
  });
}

/**
 * 上传 Blob 到 OSS（用于视频合并后的结果上传）
 * @param token 用户 token
 * @param projectId 项目 ID
 * @param blob 要上传的 Blob
 * @param filename 文件名（可选，默认自动生成）
 * @param onProgress 上传进度回调
 * @returns 上传后的文件 URL 和存储路径
 */
export async function uploadBlobToOss(
  token: string,
  projectId: string,
  blob: Blob,
  filename?: string,
  onProgress?: (percent: number) => void
): Promise<{ fileUrl: string; storageKey: string }> {
  // 将 Blob 转换为 File
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const ext = blob.type === 'video/webm' ? '.webm' : '.mp4';
  const fileName = filename || `merged_${timestamp}_${randomSuffix}${ext}`;

  const file = new File([blob], fileName, { type: blob.type || 'video/mp4' });

  // 复用现有的文件上传逻辑（视频文件不转换格式）
  return uploadFileToOss(token, projectId, file, false, { onProgress });
}

