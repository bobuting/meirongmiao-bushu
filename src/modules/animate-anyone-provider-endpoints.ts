/**
 * AnimateAnyone 动作迁移 API 端点（阿里云百炼 / DashScope）
 * 文档：docs/图生舞蹈视频-舞动人像AnimateAnyone.md
 *
 * 三步流程：
 *   1. animate-anyone-detect-gen2：图片合规检测（同步）
 *   2. animate-anyone-template-gen2：动作模板生成（异步）
 *   3. animate-anyone-gen2：视频生成（异步）
 *
 * 地域：仅支持中国内地（北京）
 * base_url 使用 dashscope.aliyuncs.com，和百炼共用同一套 API Key
 */

/** AnimateAnyone 模型名称 */
export const ANIMATE_ANYONE_MODELS = {
  /** 图片检测（同步） */
  DETECT: "animate-anyone-detect-gen2",
  /** 模板生成（异步） */
  TEMPLATE: "animate-anyone-template-gen2",
  /** 视频生成（异步） */
  VIDEO: "animate-anyone-gen2",
} as const;

/**
 * 构建 AnimateAnyone 图片检测端点
 * 同步调用，POST /api/v1/services/aigc/image2video/aa-detect
 */
export function buildAnimateAnyoneDetectEndpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.includes("/services/") || base.includes("/aa-")) {
    return base;
  }
  return `${base}/api/v1/services/aigc/image2video/aa-detect`;
}

/**
 * 构建 AnimateAnyone 模板生成端点
 * 异步调用，POST /api/v1/services/aigc/image2video/aa-template-generation
 */
export function buildAnimateAnyoneTemplateEndpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.includes("/services/") || base.includes("/aa-")) {
    return base;
  }
  return `${base}/api/v1/services/aigc/image2video/aa-template-generation`;
}

/**
 * 构建 AnimateAnyone 视频生成端点
 * 异步调用，POST /api/v1/services/aigc/image2video/aa-video-generation
 */
export function buildAnimateAnyoneVideoEndpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.includes("/services/") || base.includes("/aa-")) {
    return base;
  }
  return `${base}/api/v1/services/aigc/image2video/aa-video-generation`;
}

/**
 * 构建图片检测请求体
 */
export function buildAnimateAnyoneDetectRequestBody(imageUrl: string): string {
  return JSON.stringify({
    model: ANIMATE_ANYONE_MODELS.DETECT,
    input: {
      image_url: imageUrl,
    },
  });
}

/**
 * 构建模板生成请求体
 */
export function buildAnimateAnyoneTemplateRequestBody(videoUrl: string): string {
  return JSON.stringify({
    model: ANIMATE_ANYONE_MODELS.TEMPLATE,
    input: {
      video_url: videoUrl,
    },
  });
}

/**
 * 构建视频生成请求体
 */
export function buildAnimateAnyoneVideoRequestBody(options: {
  imageUrl: string;
  templateId: string;
  prompt?: string;
  duration?: number;
  backgroundMode?: "image" | "video";
}): string {
  const { imageUrl, templateId, prompt, duration, backgroundMode } = options;
  return JSON.stringify({
    model: ANIMATE_ANYONE_MODELS.VIDEO,
    input: {
      image_url: imageUrl,
      template_id: templateId,
      prompt: prompt || "",
      second: duration || 10,
      background: backgroundMode || "image",
    },
  });
}

/**
 * 从图片检测响应中提取结果
 * 响应格式：{ output: { valid: true/false, reason?: string, suggestions?: string[] } }
 */
export function extractDetectResult(response: unknown): {
  valid: boolean;
  reason?: string;
  suggestions?: string[];
} {
  if (!response || typeof response !== "object") {
    return { valid: false, reason: "响应格式错误" };
  }
  const obj = response as Record<string, unknown>;
  const output = obj.output as Record<string, unknown> | undefined;
  if (!output) {
    return { valid: false, reason: "缺少 output 字段" };
  }
  return {
    valid: output.valid === true,
    reason: typeof output.reason === "string" ? output.reason : undefined,
    suggestions: Array.isArray(output.suggestions) ? output.suggestions as string[] : undefined,
  };
}

/**
 * 从模板生成响应中提取模板 ID
 * 响应格式：{ output: { template_id: string, duration: number } }
 */
export function extractTemplateResult(response: unknown): {
  templateId: string | null;
  duration: number;
} {
  if (!response || typeof response !== "object") {
    return { templateId: null, duration: 0 };
  }
  const obj = response as Record<string, unknown>;
  const output = obj.output as Record<string, unknown> | undefined;
  if (!output) {
    return { templateId: null, duration: 0 };
  }
  return {
    templateId: typeof output.template_id === "string" ? output.template_id : null,
    duration: typeof output.duration === "number" ? output.duration : 0,
  };
}

/**
 * 从视频生成响应中提取视频 URL
 * 响应格式：{ output: { video_url: string, duration: number, width: number, height: number } }
 */
export function extractVideoResult(response: unknown): {
  videoUrl: string | null;
  duration: number;
  width: number;
  height: number;
} {
  if (!response || typeof response !== "object") {
    return { videoUrl: null, duration: 0, width: 0, height: 0 };
  }
  const obj = response as Record<string, unknown>;
  const output = obj.output as Record<string, unknown> | undefined;
  if (!output) {
    return { videoUrl: null, duration: 0, width: 0, height: 0 };
  }
  return {
    videoUrl: typeof output.video_url === "string" ? output.video_url : null,
    duration: typeof output.duration === "number" ? output.duration : 0,
    width: typeof output.width === "number" ? output.width : 0,
    height: typeof output.height === "number" ? output.height : 0,
  };
}