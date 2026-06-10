/**
 * 后端 OSS 图片/视频 URL 工具
 * 与前端 apps/web/utils/ossImage.ts 保持一致
 */

/** 阿里云 OSS 域名 */
const OSS_DOMAIN = "bbt-neirongmiao-v1.oss-cn-hangzhou.aliyuncs.com";

/**
 * 生成阿里云 OSS 视频截图 URL
 * @param videoUrl - 视频 OSS URL
 * @param width - 截图宽度（默认 800）
 * @returns 带截图参数的 URL，非 OSS 视频返回 null
 */
export function generateOssVideoSnapshotUrl(
  videoUrl: string | null,
  width = 800
): string | null {
  if (!videoUrl || !videoUrl.includes(OSS_DOMAIN)) return null;
  if (videoUrl.includes("x-oss-process=")) return videoUrl;
  const sep = videoUrl.includes("?") ? "&" : "?";
  return `${videoUrl}${sep}x-oss-process=video/snapshot,t_0,f_jpg,w_${width},h_0,m_fast`;
}
