/**
 * Grok 视频生成 API 端点（云雾）
 * 文档：https://yunwu.apifox.cn/api-384123355
 * 创建端点：POST /v1/video/create
 * 查询端点：GET /v1/video/query?id={taskId}
 */

import { ProviderCallMode } from "../contracts/types.js";

/** Grok 支持的模型 */
export const GROK_MODELS = {
  GROK_VIDEO_3: "grok-video-3",
} as const;

/**
 * 判断是否使用 Grok 协议
 */
export function isGrokProvider(callMode: string): boolean {
  return callMode === ProviderCallMode.GROK_VIDEO_YUNWU;
}

/**
 * 构建创建视频端点候选列表
 * Grok 创建端点：POST /v1/video/create
 */
export function buildGrokVideoCreateEndpointCandidates(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const candidates = new Set<string>();

  const createSuffixes = ["/v1/video/create"];

  // 如果 URL 已经是完整端点，直接添加
  if (lowerBase.includes("/video/create")) {
    candidates.add(base);
    return [...candidates];
  }

  // 去除已知的后缀
  const knownSuffixes = [
    "/api/v1/chat/completions",
    "/v1/chat/completions",
    "/chat/completions",
    "/api/v1/videos/generations",
    "/v1/videos/generations",
    "/videos/generations",
    "/kling/v1/videos/omni-video",
    "/kling/v1/videos/multi-image2video",
    "/v1/video/create",
    "/video/create",
    "/api",
  ];

  let root = base;
  for (const suffix of knownSuffixes) {
    if (lowerBase.endsWith(suffix.toLowerCase())) {
      root = base.slice(0, Math.max(0, base.length - suffix.length)).replace(/\/+$/, "");
      break;
    }
  }

  for (const suffix of createSuffixes) {
    candidates.add(`${root}${suffix}`);
  }

  return [...candidates];
}

/**
 * 构建查询视频任务端点候选列表
 * Grok 查询端点：GET /v1/video/query?id={taskId}
 *
 * 注意：Grok 使用 Query 参数而非路径参数
 */
export function buildGrokVideoQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
  const safeTaskId = encodeURIComponent(taskId.trim());
  if (!safeTaskId) {
    return [];
  }

  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const candidates = new Set<string>();

  // 如果 URL 已经包含查询端点，直接返回（保留已有 id 参数或追加）
  if (lowerBase.includes("/video/query")) {
    if (lowerBase.includes("id=")) {
      candidates.add(base);
    } else {
      candidates.add(`${base}?id=${safeTaskId}`);
    }
    return [...candidates];
  }

  // 去除已知的后缀
  const knownSuffixes = [
    "/api/v1/chat/completions",
    "/v1/chat/completions",
    "/chat/completions",
    "/api/v1/videos/generations",
    "/v1/videos/generations",
    "/videos/generations",
    "/kling/v1/videos/omni-video",
    "/kling/v1/videos/multi-image2video",
    "/v1/video/create",
    "/video/create",
    "/v1/video/query",
    "/api",
  ];

  let root = base;
  for (const suffix of knownSuffixes) {
    if (lowerBase.endsWith(suffix.toLowerCase())) {
      root = base.slice(0, Math.max(0, base.length - suffix.length)).replace(/\/+$/, "");
      break;
    }
  }

  // 添加查询端点（Query 参数格式）
  const querySuffixes = [`/v1/video/query?id=${safeTaskId}`];
  for (const suffix of querySuffixes) {
    candidates.add(`${root}${suffix}`);
  }

  return [...candidates];
}

/**
 * 构建 Grok 视频请求体
 *
 * 文档：https://yunwu.apifox.cn/api-384123355
 *
 * 请求体格式：
 * {
 *   "model": "grok-video-3",
 *   "prompt": "...",
 *   "aspect_ratio": "9:16",
 *   "size": "1080P",
 *   "images": ["https://..."]
 * }
 */
export function buildGrokVideoRequestBody(options: {
  model: string;
  prompt: string;
  imageUrl?: string | null;
  referenceImages?: string[];
  /** 宽高比：2:3, 3:2, 1:1 */
  aspectRatio?: string;
  /** 分辨率：720P, 1080P */
  size?: string;
}): string {
  const {
    model,
    prompt,
    imageUrl,
    referenceImages,
    aspectRatio = "9:16",
    size = "1080P",
  } = options;

  // 合并所有图片 URL
  const images: string[] = [];
  if (imageUrl) {
    images.push(imageUrl);
  }
  if (referenceImages && referenceImages.length > 0) {
    images.push(...referenceImages);
  }

  const body: Record<string, unknown> = {
    model: model || "grok-video-3",
    prompt,
    aspect_ratio: aspectRatio,
    size,
    images,
  };

  return JSON.stringify(body);
}
