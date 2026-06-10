/**
 * 图片格式枚举 - 前后端共用
 *
 * 用于图片上传/持久化时的格式指定
 */

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