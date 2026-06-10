/**
 * 阿里云 OSS 图片缩略图工具
 * 利用 OSS 原生图片处理参数，在 URL 层面实时生成缩略图，无需后端处理
 */

/** 阿里云 OSS 域名 */
const OSS_DOMAIN = "bbt-neirongmiao-v1.oss-cn-hangzhou.aliyuncs.com";

/**
 * 生成阿里云 OSS 缩略图 URL
 * @param url - 原图 URL
 * @param width - 目标宽度（默认 400）
 * @param quality - 图片质量 1-100（默认 85）
 * @returns 带缩略图参数的 URL，非 OSS 图片原样返回
 */
export function getOssThumbnailUrl(url: string, width = 400, quality = 85): string {
  if (!url || !url.includes(OSS_DOMAIN)) return url;
  // 避免重复追加 x-oss-process 参数
  if (url.includes("x-oss-process=")) return url;

  const params = `x-oss-process=image/resize,w_${width}/quality,q_${quality}/format,webp`;
  const separator = url.includes("?") ? "&" : "?";

  return `${url}${separator}${params}`;
}

/** 判断 URL 是否为 OSS 图片 */
export function isOssImageUrl(url: string): boolean {
  return !!url && url.includes(OSS_DOMAIN);
}

/**
 * 生成阿里云 OSS 视频截图 URL
 * @param url - 视频 URL
 * @param timeMs - 截图时间点（毫秒，默认 0 即首帧）
 * @param width - 截图宽度（默认 300）
 * @returns 带截图参数的 URL，非 OSS 视频原样返回
 */
export function getOssVideoSnapshotUrl(url: string, timeMs = 0, width = 300): string {
  if (!url || !url.includes(OSS_DOMAIN)) return url;
  // 避免重复追加 x-oss-process 参数
  if (url.includes("x-oss-process=")) return url;

  // video/snapshot,t_时间,f_jpg,w_宽,h_0,m_fast
  const params = `x-oss-process=video/snapshot,t_${timeMs},f_jpg,w_${width},h_0,m_fast`;
  const separator = url.includes("?") ? "&" : "?";

  return `${url}${separator}${params}`;
}
