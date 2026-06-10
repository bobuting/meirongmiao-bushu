/**
 * 视频热榜同步处理器
 * 处理视频热榜特有的同步流程
 */

import type { SquareTrendTopic } from "../../contracts/hot-trend-base.js";

// ============================================================================
// 视频URL处理
// ============================================================================

/**
 * 标准化抖音来源URL（支持网页链接和视频直链）
 */
function normalizeHotTrendDouyinSourceUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") {
    return null;
  }
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return null;
  }
  // 抖音网页链接
  if (/^(https?:\/\/)?(www\.)?douyin\.com/.test(trimmed)) {
    return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  }
  // 抖音 CDN 视频直链（douyinvod.com / douyincdn.com 等）
  if (/^https?:\/\/[^/]*douyinvod\.com/i.test(trimmed)) {
    return trimmed;
  }
  if (/^https?:\/\/[^/]*douyincdn\.com/i.test(trimmed)) {
    return trimmed;
  }
  // 其他包含 /video/tos/ 的直链
  if (/^https?:\/\/[^/]*\/video\/tos\//i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * 解析视频来源URL
 */
export function resolveVideoSourceUrl(topic: SquareTrendTopic): string | null {
  // 优先使用topic.url
  const fromUrl = normalizeHotTrendDouyinSourceUrl(topic.url);
  if (fromUrl) {
    return fromUrl;
  }

  // 尝试从itemId构建
  if (topic.itemId && /^\d{10,24}$/.test(topic.itemId)) {
    return `https://www.douyin.com/video/${topic.itemId}`;
  }

  return null;
}