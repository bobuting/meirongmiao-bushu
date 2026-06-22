/**
 * VEO 视频生成 API 端点（才翔AI）
 * 文档：docs/caixiang/veo3.1.md
 * 创建端点：POST /v1/media/generate
 * 查询端点：GET /v1/media/status?task_id={taskId}
 */

import { ProviderCallMode } from "../contracts/types.js";

/** VEO 支持的模型 */
export const VEO_MODELS_CAIXIANG = {
  VEO_3_1: "veo3.1",
} as const;

/**
 * 判断是否使用 VEO 才翔协议
 */
export function isVeoCaixiangProvider(callMode: string): boolean {
  return callMode === ProviderCallMode.VEO_VIDEO_CAIXIANG;
}

/**
 * 构建创建视频端点候选列表（才翔AI）
 * 创建端点：POST /v1/media/generate
 */
export function buildVeoCaixiangVideoCreateEndpointCandidates(baseUrl: string): string[] {
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
export function buildVeoCaixiangVideoQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
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
 * 构建 VEO 视频请求体（才翔AI）
 *
 * 文档：docs/caixiang/veo3.1.md
 *
 * 请求体格式（嵌套 params 结构）：
 * {
 *   "model": "veo3.1",
 *   "prompt": "...",
 *   "params": {
 *     "generation_mode": "fast",
 *     "aspect_ratio": "16:9",
 *     "images": ["https://..."],
 *     "enhance_prompt": true,
 *     "enable_upsample": true,
 *     "duration": "8",
 *     "generation_type": "TEXT",
 *     "quality": "1080p"
 *   }
 * }
 */
export function buildVeoCaixiangVideoRequestBody(options: {
  model: string;
  prompt: string;
  imageUrl?: string | null;
  referenceImages?: string[];
  /** 宽高比：9:16（竖屏）, 16:9（横屏） */
  aspectRatio?: string;
  /** 生成模式：fast / null / pro / components */
  generationMode?: "fast" | "pro" | "components";
  /** 是否优化提示词（veo 仅支持英文，开启后自动翻译中文） */
  enhancePrompt?: boolean;
  /** 是否开启超分（更高分辨率） */
  enableUpsample?: boolean;
  /** 视频时长：8秒 */
  duration?: "8";
  /** 生成方式：TEXT / REFERENCE / FIRST&LAST */
  generationType?: "TEXT" | "REFERENCE" | "FIRST&LAST";
  /** 清晰度：1080p */
  quality?: "1080p";
}): string {
  const {
    model,
    prompt,
    imageUrl,
    referenceImages,
    aspectRatio = "9:16",
    generationMode = "fast",
    enhancePrompt = true,
    enableUpsample = true,
    duration = "8",
    generationType = "TEXT",
    quality = "1080p",
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
    model: model || "veo3.1",
    prompt,
    params: {
      generation_mode: generationMode,
      aspect_ratio: aspectRatio,
      enhance_prompt: enhancePrompt,
      enable_upsample: enableUpsample,
      duration,
      generation_type: images.length > 0 ? "REFERENCE" : generationType,
      quality,
    },
  };

  // 有图片时添加 images 字段
  if (images.length > 0) {
    (body.params as Record<string, unknown>).images = images;
  }

  return JSON.stringify(body);
}
