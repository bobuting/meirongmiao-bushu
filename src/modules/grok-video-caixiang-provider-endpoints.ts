/**
 * Grok 视频生成 API 端点（才翔AI）
 * 文档：docs/caixiang/grok-video-3.md
 * 创建端点：POST /v1/media/generate
 * 查询端点：GET /v1/media/status?task_id={taskId}
 */

import { ProviderCallMode } from "../contracts/types.js";

/** Grok 支持的模型 */
export const GROK_MODELS_CAIXIANG = {
  GROK_VIDEO_3: "grok-video-3",
} as const;

/**
 * 判断是否使用 Grok 才翔协议
 */
export function isGrokCaixiangProvider(callMode: string): boolean {
  return callMode === ProviderCallMode.GROK_VIDEO_CAIXIANG;
}

/**
 * 构建创建视频端点候选列表（才翔AI）
 * 创建端点：POST /v1/media/generate
 */
export function buildGrokCaixiangVideoCreateEndpointCandidates(baseUrl: string): string[] {
  try {
    const url = new URL(baseUrl);
    return [`${url.origin}/v1/media/generate`];
  } catch {
    // URL 解析失败时回退到简单拼接
    return [`${baseUrl.replace(/\/+$/, "")}/v1/media/generate`];
  }
}

/**
 * 构建查询视频任务端点候选列表（才翔AI）
 * 查询端点：GET /v1/media/status?task_id={taskId}
 */
export function buildGrokCaixiangVideoQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
  const safeTaskId = encodeURIComponent(taskId.trim());
  if (!safeTaskId) {
    return [];
  }

  try {
    const url = new URL(baseUrl);
    return [`${url.origin}/v1/media/status?task_id=${safeTaskId}`];
  } catch {
    // URL 解析失败时回退到简单拼接
    return [`${baseUrl.replace(/\/+$/, "")}/v1/media/status?task_id=${safeTaskId}`];
  }
}

/**
 * 构建 Grok 视频请求体（才翔AI）
 *
 * 文档：docs/caixiang/grok-video-3.md
 *
 * 请求体格式（嵌套 params 结构）：
 * {
 *   "model": "grok-video-3",
 *   "prompt": "...",
 *   "params": {
 *     "aspect_ratio": "3:2",
 *     "size": "1080P",
 *     "duration": "6",
 *     "images": ["https://..."]
 *   }
 * }
 */
export function buildGrokCaixiangVideoRequestBody(options: {
  model: string;
  prompt: string;
  imageUrl?: string | null;
  referenceImages?: string[];
  /** 宽高比：2:3（竖屏）, 3:2（横屏）, 1:1（方形） */
  aspectRatio?: string;
  /** 分辨率：720P, 1080P */
  size?: string;
  /** 视频时长：6 或 10（秒） */
  duration?: "6" | "10";
}): string {
  const {
    model,
    prompt,
    imageUrl,
    referenceImages,
    // 才翔AI 只支持 2:3/3:2/1:1，默认用 2:3（竖屏）
    aspectRatio = "2:3",
    size = "1080P",
    duration = "6",
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
    params: {
      aspect_ratio: aspectRatio,
      size,
      duration,
      images,
    },
  };

  return JSON.stringify(body);
}
