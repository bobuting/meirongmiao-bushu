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
 * 直接取 baseUrl 的 origin，拼接固定路径，不做复杂后缀剥离
 */
export function buildGrokVideoCreateEndpointCandidates(baseUrl: string): string[] {
  try {
    const url = new URL(baseUrl);
    return [`${url.origin}/v1/video/create`];
  } catch {
    // URL 解析失败时回退到简单拼接
    return [`${baseUrl.replace(/\/+$/, "")}/v1/video/create`];
  }
}

/**
 * 构建查询视频任务端点候选列表
 * Grok 查询端点：GET /v1/video/query?id={taskId}
 * 直接取 baseUrl 的 origin，拼接固定路径，不做复杂后缀剥离
 */
export function buildGrokVideoQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
  const safeTaskId = encodeURIComponent(taskId.trim());
  if (!safeTaskId) {
    return [];
  }

  try {
    const url = new URL(baseUrl);
    return [`${url.origin}/v1/video/query?id=${safeTaskId}`];
  } catch {
    // URL 解析失败时回退到简单拼接
    return [`${baseUrl.replace(/\/+$/, "")}/v1/video/query?id=${safeTaskId}`];
  }
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
