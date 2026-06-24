/**
 * Grok Imagine 视频生成 API 端点（云雾）
 * 文档：https://yunwu.apifox.cn/api-472718623
 * 创建端点：POST /v1/videos/generations
 * 查询端点：GET /v1/videos/{request_id}
 *
 * 请求体格式（OpenAI 视频格式）：
 * {
 *   "model": "grok-imagine-video",
 *   "prompt": "...",
 *   "resolution": "720p",
 *   "aspect_ratio": "16:9",
 *   "duration": 4,
 *   "image": { "url": "https://..." },
 *   "reference_images": [{ "url": "https://..." }]
 * }
 */

import { ProviderCallMode } from "../contracts/types.js";

/** Grok Imagine 支持的模型 */
export const GROK_IMAGINE_MODELS = {
  GROK_IMAGINE_VIDEO: "grok-imagine-video",
  GROK_IMAGINE_VIDEO_1_5_PREVIEW: "grok-imagine-video-1.5-preview",
} as const;

/**
 * 判断是否使用 Grok Imagine 协议
 */
export function isGrokImagineProvider(callMode: string): boolean {
  return callMode === ProviderCallMode.GROK_IMAGINE_VIDEO_YUNWU;
}

/**
 * 构建创建视频端点候选列表
 * 创建端点：POST /v1/videos/generations
 */
export function buildGrokImagineVideoCreateEndpointCandidates(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();

  // 如果 URL 已经包含 /videos/generations，直接返回
  if (lowerBase.endsWith("/v1/videos/generations") || lowerBase.endsWith("/videos/generations")) {
    return [base];
  }

  // 去除已知的后缀
  const knownSuffixes = [
    "/api/v1/chat/completions",
    "/v1/chat/completions",
    "/chat/completions",
    "/v1/video/create",
    "/video/create",
    "/v1/video/query",
    "/video/query",
    "/volc/v1/contents/generations/tasks",
  ];

  let root = base;
  for (const suffix of knownSuffixes) {
    if (lowerBase.endsWith(suffix.toLowerCase())) {
      root = base.slice(0, Math.max(0, base.length - suffix.length)).replace(/\/+$/, "");
      break;
    }
  }

  return [`${root}/v1/videos/generations`];
}

/**
 * 构建查询视频任务端点候选列表
 * 查询端点：GET /v1/videos/{request_id}
 */
export function buildGrokImagineVideoQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
  const safeTaskId = encodeURIComponent(taskId.trim());
  if (!safeTaskId) {
    return [];
  }

  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();

  // 去除已知的后缀
  const knownSuffixes = [
    "/api/v1/chat/completions",
    "/v1/chat/completions",
    "/chat/completions",
    "/v1/videos/generations",
    "/videos/generations",
    "/v1/video/create",
    "/video/create",
    "/volc/v1/contents/generations/tasks",
  ];

  let root = base;
  for (const suffix of knownSuffixes) {
    if (lowerBase.endsWith(suffix.toLowerCase())) {
      root = base.slice(0, Math.max(0, base.length - suffix.length)).replace(/\/+$/, "");
      break;
    }
  }

  return [`${root}/v1/videos/${safeTaskId}`];
}

/**
 * 构建 Grok Imagine 视频请求体
 *
 * 文档：https://yunwu.apifox.cn/api-472718623
 *
 * 请求体格式：
 * {
 *   "model": "grok-imagine-video",
 *   "prompt": "...",
 *   "resolution": "720p",
 *   "aspect_ratio": "16:9",
 *   "duration": 4,
 *   "image": { "url": "https://..." },
 *   "reference_images": [{ "url": "https://..." }, { "url": "https://..." }]
 * }
 *
 * 注意：image（主参考图）和 reference_images（辅助参考图）可以同时使用
 */
export function buildGrokImagineVideoRequestBody(options: {
  model: string;
  prompt: string;
  imageUrl?: string | null;
  referenceImages?: string[];
  /** 宽高比：1:1, 16:9, 9:16 */
  aspectRatio?: string;
  /** 分辨率：480p, 720p */
  resolution?: string;
  /** 视频时长：1-15（秒） */
  duration?: number;
}): string {
  const {
    model,
    prompt,
    imageUrl,
    referenceImages,
    aspectRatio = "9:16",
    resolution = "720p",
    duration = 4,
  } = options;

  const body: Record<string, unknown> = {
    model: model || "grok-imagine-video",
    prompt,
    resolution,
    aspect_ratio: aspectRatio,
    duration,
  };

  // 合并所有图片 URL
  const allImages: string[] = [];
  if (imageUrl) {
    allImages.push(imageUrl);
  }
  if (referenceImages && referenceImages.length > 0) {
    allImages.push(...referenceImages);
  }

  // image 和 reference_images 互斥：
  // - 单张用 image: { url }
  // - 多张用 reference_images: [{ url }, ...]
  if (allImages.length === 1) {
    body.image = { url: allImages[0] };
  } else if (allImages.length > 1) {
    body.reference_images = allImages.map((url) => ({ url }));
  }

  return JSON.stringify(body);
}
