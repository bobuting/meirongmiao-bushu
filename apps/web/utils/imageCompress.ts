/**
 * 图片压缩工具
 * 用于上传前压缩图片，减少存储空间和上传时间
 */

/** 压缩配置选项 */
export interface CompressOptions {
  /** 最大宽度，默认 1200 */
  maxWidth?: number;
  /** 最大高度，默认 1200 */
  maxHeight?: number;
  /** JPEG 质量 (0-1)，默认 0.85 */
  quality?: number;
  /** 输出格式，默认 jpeg */
  format?: "jpeg" | "png" | "webp";
}

/** 默认压缩配置 */
const DEFAULT_OPTIONS: Required<CompressOptions> = {
  maxWidth: 1200,
  maxHeight: 1200,
  quality: 0.85,
  format: "jpeg",
};

/**
 * 压缩图片文件
 * @param file 原始图片文件
 * @param options 压缩配置
 * @returns 压缩后的 File 对象
 */
export async function compressImageFile(
  file: File,
  options?: CompressOptions
): Promise<File> {
  const { maxWidth, maxHeight, quality, format } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // 计算缩放比例（保持宽高比）
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // 创建 canvas 绘制压缩后的图片
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法创建 canvas 上下文"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // 转换为指定格式
      const mimeType = `image/${format}`;
      const dataUrl = canvas.toDataURL(mimeType, quality);

      // dataURL 转 File
      const compressedFile = dataUrlToFile(dataUrl, file.name, mimeType);
      resolve(compressedFile);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片加载失败"));
    };

    img.src = url;
  });
}

/**
 * 压缩图片并返回 dataURL（用于 API 请求等场景）
 * @param file 原始图片文件
 * @param options 压缩配置
 * @returns 压缩后的 dataURL 字符串
 */
export async function compressImageToDataUrl(
  file: File,
  options?: CompressOptions
): Promise<string> {
  const { maxWidth, maxHeight, quality, format } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法创建 canvas 上下文"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const mimeType = `image/${format}`;
      const dataUrl = canvas.toDataURL(mimeType, quality);
      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片加载失败"));
    };

    img.src = url;
  });
}

/**
 * 将 dataURL 转换为 File 对象
 * @param dataUrl dataURL 字符串
 * @param filename 文件名
 * @param mimeType MIME 类型（可选，从 dataURL 解析）
 * @returns File 对象
 */
export function dataUrlToFile(
  dataUrl: string,
  filename: string,
  mimeType?: string
): File {
  const arr = dataUrl.split(",");
  const mime = mimeType || arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new File([u8arr], filename, { type: mime });
}

/**
 * 将 File 转换为 dataURL
 * @param file 文件对象
 * @returns dataURL 字符串
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

/** 常用压缩配置预设 */
export const COMPRESS_PRESETS = {
  /** 缩略图：适合角色/素材缩略图 */
  thumbnail: { maxWidth: 1200, maxHeight: 1200, quality: 0.85 },
  /** API 请求：适合发送给 AI 分析的图片 */
  apiRequest: { maxWidth: 800, maxHeight: 800, quality: 0.8 },
  /** 高清：适合需要保留细节的图片 */
  highQuality: { maxWidth: 1920, maxHeight: 1920, quality: 0.9 },
} as const;