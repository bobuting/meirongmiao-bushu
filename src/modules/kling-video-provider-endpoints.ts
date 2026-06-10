import { ProviderCallMode } from "../contracts/types.js";

/**
 * 可灵视频生成 API 端点（Omni-Video）
 * 云雾文档：https://yunwu.apifox.cn/api-393296337
 * 支持模型：
 *   - kling-video-o1 (Omni-Video，推荐)
 *   - kling-v3-omni (Omni-Video V3)
 */

/** 可灵支持的模型 */
export const KLING_MODELS = {
  /** Omni-Video 标准版（推荐，效果更好） */
  OMNI_VIDEO_O1: "kling-video-o1",
  /** Omni-Video V3 版 */
  OMNI_VIDEO_V3: "kling-v3-omni",
} as const;

/**
 * 判断是否使用可灵协议
 * 基于 callMode 枚举值判断
 */
export function isKlingProvider(callMode: string): boolean {
  return callMode === ProviderCallMode.KLING_VIDEO_YUNWU;
}

/**
 * 构建创建视频端点候选列表
 * 云雾 API Omni-Video 端点：POST /kling/v1/videos/omni-video
 */
export function buildKlingVideoCreateEndpointCandidates(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const candidates = new Set<string>();

  // Omni-Video 端点
  const createSuffixes = [
    "/kling/v1/videos/omni-video",
  ];

  // 如果 URL 已经是完整端点，直接添加
  if (lowerBase.includes("/videos/")) {
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
    "/volc/v1/contents/generations/tasks",
    "/v1/video/create",
    "/video/create",
    "/kling/v1/videos/omni-video",
  ];

  let root = base;
  for (const suffix of knownSuffixes) {
    if (lowerBase.endsWith(suffix.toLowerCase())) {
      root = base.slice(0, Math.max(0, base.length - suffix.length)).replace(/\/+$/, "");
      break;
    }
  }

  // 添加创建端点
  for (const suffix of createSuffixes) {
    candidates.add(`${root}${suffix}`);
  }

  return [...candidates];
}

/**
 * 构建查询视频任务端点候选列表
 * 云雾 API 查询端点格式：GET /kling/v1/videos/omni-video/{taskId}
 */
export function buildKlingVideoQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
  const safeTaskId = encodeURIComponent(taskId.trim());
  if (!safeTaskId) {
    return [];
  }

  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const candidates = new Set<string>();

  // Omni-Video 查询端点
  const querySuffixes = [
    `/kling/v1/videos/omni-video/${safeTaskId}`,
  ];

  // 如果 URL 已经是查询端点格式，直接返回
  if (lowerBase.includes("/videos/") && lowerBase.includes(safeTaskId.toLowerCase())) {
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
    "/volc/v1/contents/generations/tasks",
    "/v1/video/create",
    "/video/create",
    "/kling/v1/videos/omni-video",
  ];

  let root = base;
  for (const suffix of knownSuffixes) {
    if (lowerBase.endsWith(suffix.toLowerCase())) {
      root = base.slice(0, Math.max(0, base.length - suffix.length)).replace(/\/+$/, "");
      break;
    }
  }

  // 添加查询端点
  for (const suffix of querySuffixes) {
    candidates.add(`${root}${suffix}`);
  }

  return [...candidates];
}

/**
 * 从可灵响应中提取视频 URL
 * 可灵响应格式：{ code: 0, data: { task_result: { videos: [{ url: "..." }] } } }
 */
export function extractVideoUrlsFromKlingResponse(data: unknown): string[] {
  const urls: string[] = [];
  if (!data || typeof data !== "object") {
    return urls;
  }
  const obj = data as Record<string, unknown>;

  // 格式1: { data: { task_result: { videos: [{ url: "..." }] } } }
  if (obj.data && typeof obj.data === "object") {
    const dataObj = obj.data as Record<string, unknown>;
    if (dataObj.task_result && typeof dataObj.task_result === "object") {
      const taskResult = dataObj.task_result as Record<string, unknown>;
      if (Array.isArray(taskResult.videos)) {
        for (const video of taskResult.videos) {
          if (typeof video === "object" && video !== null) {
            const videoObj = video as Record<string, unknown>;
            if (typeof videoObj.url === "string" && videoObj.url) {
              urls.push(videoObj.url);
            }
          }
        }
      }
    }
  }

  // 格式2: { task_result: { videos: [{ url: "..." }] } }
  if (obj.task_result && typeof obj.task_result === "object") {
    const taskResult = obj.task_result as Record<string, unknown>;
    if (Array.isArray(taskResult.videos)) {
      for (const video of taskResult.videos) {
        if (typeof video === "object" && video !== null) {
          const videoObj = video as Record<string, unknown>;
          if (typeof videoObj.url === "string" && videoObj.url) {
            urls.push(videoObj.url);
          }
        }
      }
    }
  }

  return [...new Set(urls)];
}

/**
 * 从可灵响应中提取任务 ID
 * 可灵响应格式：{ code: 0, data: { task_id: "..." } }
 */
export function extractTaskIdFromKlingResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const obj = data as Record<string, unknown>;

  // 格式1: { data: { task_id: "..." } }
  if (obj.data && typeof obj.data === "object") {
    const dataObj = obj.data as Record<string, unknown>;
    if (typeof dataObj.task_id === "string" && dataObj.task_id) {
      return dataObj.task_id;
    }
  }

  // 格式2: { task_id: "..." }
  if (typeof obj.task_id === "string" && obj.task_id) {
    return obj.task_id;
  }

  return null;
}

/**
 * 从可灵响应中提取任务状态
 * 可灵状态：pending | processing | success | failed
 */
export function extractTaskStatusFromKlingResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const obj = data as Record<string, unknown>;

  // 格式1: { data: { task_status: "..." } }
  if (obj.data && typeof obj.data === "object") {
    const dataObj = obj.data as Record<string, unknown>;
    if (typeof dataObj.task_status === "string") {
      return dataObj.task_status;
    }
  }

  // 格式2: { task_status: "..." }
  if (typeof obj.task_status === "string") {
    return obj.task_status;
  }

  return null;
}

// ---------------------------------------------------------------------------
// 可灵官方视频生成 API（直连，OpenAI 兼容格式）
// ---------------------------------------------------------------------------

/**
 * 判断是否使用可灵官方协议
 * 基于 callMode 枚举值判断
 */
export function isKlingOfficialProvider(callMode: string): boolean {
  return callMode === "kling-video-official";
}

/**
 * 构建可灵官方创建视频端点
 * 官方端点格式（Omni-Video）：POST /v1/videos/omni-video
 * 支持两种 base URL：
 * - https://api.klingai.com（全球）
 * - https://api-beijing.klingai.com（中国）
 */
export function buildKlingOfficialVideoCreateEndpointCandidates(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const candidates = new Set<string>();

  // 如果 base_url 已经是完整端点，直接使用
  const lowerBase = base.toLowerCase();
  if (lowerBase.includes("/v1/videos/omni-video")) {
    candidates.add(base);
    return [...candidates];
  }

  // 否则追加 Omni-Video 端点
  candidates.add(`${base}/v1/videos/omni-video`);
  return [...candidates];
}

/**
 * 构建可灵官方查询视频任务端点
 * 官方端点格式（Omni-Video）：GET /v1/videos/omni-video/{task_id}
 */
export function buildKlingOfficialVideoQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
  const safeTaskId = encodeURIComponent(taskId.trim());
  if (!safeTaskId) {
    return [];
  }

  const base = baseUrl.replace(/\/+$/, "");

  // 查询端点格式：GET /v1/videos/omni-video/{task_id}
  return [`${base}/v1/videos/omni-video/${safeTaskId}`];
}

/**
 * 构建可灵官方视频请求体（Omni-Video 格式）
 *
 * 官方 API 文档：https://klingai.com/document-api/apiReference/model/OmniVideo
 *
 * 注意：可灵官方 Omni-Video API 只支持单图输入（首帧图）
 * 参考图（用于角色一致性）应通过 prompt 文字描述，而非图片形式
 *
 * 正确格式：
 * {
 *   "model_name": "kling-video-o1",
 *   "prompt": "...",
 *   "image_list": [{ "image": "https://..." }],
 *   "duration": "5",
 *   "mode": "pro",
 *   "aspect_ratio": "16:9"
 * }
 */
export function buildKlingOfficialVideoRequestBody(options: {
  model: string;
  prompt: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  duration?: number;
  aspectRatio?: string;
  /** 是否生成音频，"on" | "off"，需要 V2.6+ 模型 */
  sound?: string;
}): string {
  const { model, prompt, imageUrl, duration = 5, aspectRatio = "9:16", sound } = options;

  // 可灵 API 要求 duration 必须是 5 或 10，其他值默认 5
  const safeDuration = duration === 10 ? 10 : 5;

  // 可灵官方 API 使用 model_name 字段
  const body: Record<string, unknown> = {
    model_name: model,
    prompt,
    mode: "pro",
    duration: String(safeDuration),
    aspect_ratio: aspectRatio,
  };

  if (sound) {
    body.sound = sound;
  }

  // 【重要】可灵官方 API 只支持单图输入（首帧图）
  // 忽略 imageUrls（参考图），只使用 imageUrl（场景图）
  if (imageUrl) {
    body.image_list = [{ image_url: imageUrl }];
  }

  return JSON.stringify(body);
}

/**
 * 从可灵官方响应中提取视频 URL
 *
 * Omni-Video API 响应格式：
 * 创建成功: { code: 0, data: { task_id: "..." } }
 * 查询成功: { code: 0, data: { task_status: "success", videos: [{ url: "..." }] } }
 * 查询失败: { code: 1200, message: "..." }
 */
export function extractVideoUrlsFromKlingOfficialResponse(data: unknown): string[] {
  const urls: string[] = [];
  if (!data || typeof data !== "object") {
    return urls;
  }
  const obj = data as Record<string, unknown>;

  // 格式1: { data: { videos: [{ url: "..." }] } }
  if (obj.data && typeof obj.data === "object") {
    const dataObj = obj.data as Record<string, unknown>;
    if (Array.isArray(dataObj.videos)) {
      for (const video of dataObj.videos) {
        if (video && typeof video === "object") {
          const videoObj = video as Record<string, unknown>;
          if (typeof videoObj.url === "string" && videoObj.url) {
            urls.push(videoObj.url);
          }
        }
      }
    }
  }

  // 格式2: { videos: [{ url: "..." }] }
  if (Array.isArray(obj.videos)) {
    for (const video of obj.videos) {
      if (video && typeof video === "object") {
        const videoObj = video as Record<string, unknown>;
        if (typeof videoObj.url === "string" && videoObj.url) {
          urls.push(videoObj.url);
        }
      }
    }
  }

  return [...new Set(urls)];
}

/**
 * 从可灵官方响应中提取任务 ID
 * 旧版 API 响应格式：{ code: 0, data: { task_id: "..." } }
 */
export function extractTaskIdFromKlingOfficialResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const obj = data as Record<string, unknown>;

  // 格式1: { data: { task_id: "..." } }（旧版）
  if (obj.data && typeof obj.data === "object") {
    const dataObj = obj.data as Record<string, unknown>;
    if (typeof dataObj.task_id === "string" && dataObj.task_id) {
      return dataObj.task_id;
    }
  }

  // 格式2: { task_id: "..." }（新版）
  if (typeof obj.task_id === "string" && obj.task_id) {
    return obj.task_id;
  }

  // 格式3: { id: "..." }（OpenAI 兼容）
  if (typeof obj.id === "string" && obj.id) {
    return obj.id;
  }

  return null;
}

/**
 * 从可灵官方响应中提取任务状态
 * 官方状态：processing | succeeded | failed | pending
 */
export function extractTaskStatusFromKlingOfficialResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const obj = data as Record<string, unknown>;

  // 格式1: { data: { task_status: "..." } }
  if (obj.data && typeof obj.data === "object") {
    const dataObj = obj.data as Record<string, unknown>;
    if (typeof dataObj.task_status === "string") {
      return dataObj.task_status;
    }
  }

  // 格式2: { task_status: "..." }
  if (typeof obj.task_status === "string") {
    return obj.task_status;
  }

  // 格式3: { status: "..." }（兼容其他格式）
  if (typeof obj.status === "string") {
    return obj.status;
  }

  // 格式4: { data: { status: "..." } }（兼容其他格式）
  if (obj.data && typeof obj.data === "object") {
    const dataObj = obj.data as Record<string, unknown>;
    if (typeof dataObj.status === "string") {
      return dataObj.status;
    }
  }

  return null;
}

/**
 * 构建可灵视频请求体（多图参考生视频格式）
 * 统一使用 multi-image2video 端点，支持单图和多图
 * 端点：POST /kling/v1/videos/multi-image2video
 * 文档：https://yunwu.apifox.cn/api-386179083.md
 */
export function buildKlingVideoRequestBody(options: {
  model: string;
  prompt: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  duration?: number;
  aspectRatio?: string;
  /** 是否生成音频，"on" | "off"，需要 V2.6+ 模型 */
  sound?: string;
}): string {
  const { model, prompt, imageUrl, imageUrls, duration = 5, aspectRatio = "9:16", sound } = options;

  // 可灵多图端点要求 duration 必须是 5 或 10，其他值默认 5
  const safeDuration = duration === 10 ? 10 : 5;

  // 合并所有图片：主图 + 参考图，统一使用 { image: "url" } 格式
  const allImageUrls: string[] = [];
  if (imageUrl) {
    allImageUrls.push(imageUrl);
  }
  if (imageUrls && imageUrls.length > 0) {
    for (const refUrl of imageUrls) {
      allImageUrls.push(refUrl);
    }
  }

  const body: Record<string, unknown> = {
    model_name: model,
    prompt,
    mode: "std",
    aspect_ratio: aspectRatio,
    duration: String(safeDuration),
  };

  if (sound) {
    body.sound = sound;
  }

  if (allImageUrls.length > 0) {
    // Kling multi-image2video 要求 imageList size 在 1-4 之间
    const limitedUrls = allImageUrls.slice(0, 4);
    body.image_list = limitedUrls.map((url) => ({ image: url }));
  }

  return JSON.stringify(body);
}

// ---------------------------------------------------------------------------
// 可灵云雾 Omni-Video 编辑 API（单步提交，替代 multi-elements 多步工作流）
// 文档：https://yunwu.apifox.cn/api-393296337
// 端点：POST /kling/v1/videos/omni-video
// 查询：GET /kling/v1/videos/omni-video/{taskId}
// ---------------------------------------------------------------------------

/**
 * 判断是否使用可灵 Omni-Video 协议
 */
export function isKlingOmniVideoProvider(callMode: string): boolean {
  return callMode === "kling-omni-video-yunwu";
}

/** Omni-Video 请求参数 */
export interface KlingOmniVideoParams {
  /** 模型名（kling-video-o1 或 kling-v3-omni） */
  modelName: string;
  /** 正向提示词 */
  prompt?: string;
  /** 负向提示词 */
  negativePrompt?: string;
  /** 模式 std | high */
  mode?: string;
  /** 时长 "3"~"10" 整数字符串 */
  duration?: string;
  /** 宽高比 */
  aspectRatio?: string;
  /** 图片列表：参考图、换装结果图等 */
  imageList?: Array<{ image_url: string; type?: string }>;
  /** 视频列表：源视频 */
  videoList?: Array<{ video_url: string; refer_type?: string; keep_original_sound?: string }>;
}

/**
 * 构建 Omni-Video 请求体
 * 文档：https://yunwu.apifox.cn/api-393296337
 */
export function buildKlingOmniVideoRequestBody(params: KlingOmniVideoParams): string {
  const body: Record<string, unknown> = {
    model_name: params.modelName,
    mode: params.mode ?? "std",
    duration: params.duration ?? "5",
  };

  if (params.aspectRatio) {
    body.aspect_ratio = params.aspectRatio;
  }

  if (params.prompt) {
    body.prompt = params.prompt;
  }

  if (params.negativePrompt) {
    body.negative_prompt = params.negativePrompt;
  }

  if (params.imageList && params.imageList.length > 0) {
    body.image_list = params.imageList;
  }

  if (params.videoList && params.videoList.length > 0) {
    body.video_list = params.videoList;
  }

  return JSON.stringify(body);
}

// ---------------------------------------------------------------------------
// 可灵云雾 多图参考生视频 API
// ---------------------------------------------------------------------------


/**
 * 构建多图参考生视频创建端点
 * 端点格式：POST /kling/v1/videos/multi-image2video
 */
export function buildKlingMultiImageVideoCreateEndpointCandidates(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const candidates = new Set<string>();

  // 如果 URL 已经包含多图端点路径，直接使用
  if (lowerBase.includes("/videos/multi-image2video")) {
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
    "/v1/videos/omni-video",
    "/v1/videos/multi-image2video",
  ];

  let root = base;
  for (const suffix of knownSuffixes) {
    if (lowerBase.endsWith(suffix.toLowerCase())) {
      root = base.slice(0, Math.max(0, base.length - suffix.length)).replace(/\/+$/, "");
      break;
    }
  }

  candidates.add(`${root}/kling/v1/videos/multi-image2video`);
  return [...candidates];
}

/**
 * 构建多图参考生视频查询端点
 * 查询格式：GET /kling/v1/videos/multi-image2video/{taskId}
 */
export function buildKlingMultiImageVideoQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
  const safeTaskId = encodeURIComponent(taskId.trim());
  if (!safeTaskId) {
    return [];
  }

  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();

  // 如果 URL 已包含多图端点，直接替换为查询格式
  const knownSuffixes = [
    "/api/v1/chat/completions",
    "/v1/chat/completions",
    "/chat/completions",
    "/api/v1/videos/generations",
    "/v1/videos/generations",
    "/videos/generations",
    "/kling/v1/videos/omni-video",
    "/kling/v1/videos/multi-image2video",
    "/v1/videos/omni-video",
    "/v1/videos/multi-image2video",
  ];

  let root = base;
  for (const suffix of knownSuffixes) {
    if (lowerBase.endsWith(suffix.toLowerCase())) {
      root = base.slice(0, Math.max(0, base.length - suffix.length)).replace(/\/+$/, "");
      break;
    }
  }

  return [`${root}/kling/v1/videos/multi-image2video/${safeTaskId}`];
}

// ---------------------------------------------------------------------------
// 可灵视频编辑 API（多模态视频编辑）
// 云雾文档：https://yunwu.apifox.cn/api-389936303.md
// 端点格式：POST /kling/v1/videos/video-edit
// ---------------------------------------------------------------------------

/**
 * 判断是否使用可灵视频编辑协议
 */
export function isKlingVideoEditProvider(callMode: string): boolean {
  return callMode === "kling-video-edit-yunwu";
}

/**
 * 构建可灵视频编辑创建端点
 * 端点格式：POST /kling/v1/videos/video-edit
 */
export function buildKlingVideoEditCreateEndpointCandidates(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const candidates = new Set<string>();

  // 如果 URL 已包含视频编辑端点，直接使用
  if (lowerBase.includes("/videos/video-edit")) {
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
    "/kling/v1/videos/video-edit",
  ];

  let root = base;
  for (const suffix of knownSuffixes) {
    if (lowerBase.endsWith(suffix.toLowerCase())) {
      root = base.slice(0, Math.max(0, base.length - suffix.length)).replace(/\/+$/, "");
      break;
    }
  }

  candidates.add(`${root}/kling/v1/videos/video-edit`);
  return [...candidates];
}

/**
 * 构建可灵视频编辑查询端点
 * 查询格式：GET /kling/v1/videos/video-edit/{taskId}
 */
export function buildKlingVideoEditQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
  const safeTaskId = encodeURIComponent(taskId.trim());
  if (!safeTaskId) {
    return [];
  }

  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();

  // 如果 URL 已包含视频编辑端点，替换为查询格式
  const knownSuffixes = [
    "/api/v1/chat/completions",
    "/v1/chat/completions",
    "/chat/completions",
    "/api/v1/videos/generations",
    "/v1/videos/generations",
    "/videos/generations",
    "/kling/v1/videos/omni-video",
    "/kling/v1/videos/multi-image2video",
    "/kling/v1/videos/video-edit",
  ];

  let root = base;
  for (const suffix of knownSuffixes) {
    if (lowerBase.endsWith(suffix.toLowerCase())) {
      root = base.slice(0, Math.max(0, base.length - suffix.length)).replace(/\/+$/, "");
      break;
    }
  }

  return [`${root}/kling/v1/videos/video-edit/${safeTaskId}`];
}

/**
 * 构建可灵视频编辑请求体
 *
 * 云雾文档：https://yunwu.apifox.cn/api-389936303.md
 *
 * 请求体格式：
 * {
 *   "model": "kling-video-o3-pro",
 *   "video_url": "https://...",
 *   "reference_images": ["https://...", "https://..."],
 *   "prompt": "更换角色服装为白色衬衫黑色西裤",
 *   "negative_prompt": "...",
 *   "duration": 10
 * }
 */
export function buildKlingVideoEditRequestBody(options: {
  model: string;
  videoUrl: string;
  referenceImages?: string[];
  prompt: string;
  negativePrompt?: string;
  duration?: number;
}): string {
  const { model, videoUrl, referenceImages, prompt, negativePrompt, duration } = options;

  const body: Record<string, unknown> = {
    model,
    video_url: videoUrl,
    prompt,
  };

  // 参考图片（最多4张）
  if (referenceImages && referenceImages.length > 0) {
    body.reference_images = referenceImages.slice(0, 4);
  }

  // 负向提示词
  if (negativePrompt) {
    body.negative_prompt = negativePrompt;
  }

  // 视频时长
  if (duration) {
    body.duration = duration;
  }

  return JSON.stringify(body);
}

/**
 * 从可灵视频编辑响应中提取视频 URL
 * 响应格式：{ code: 0, data: { task_result: { videos: [{ url: "..." }] } } }
 */
export function extractVideoUrlsFromKlingVideoEditResponse(data: unknown): string[] {
  // 与 Omni-Video 响应格式相同，复用现有提取器
  return extractVideoUrlsFromKlingResponse(data);
}

/**
 * 从可灵视频编辑响应中提取任务 ID
 * 响应格式：{ code: 0, data: { task_id: "..." } }
 */
export function extractTaskIdFromKlingVideoEditResponse(data: unknown): string | null {
  // 与 Omni-Video 响应格式相同，复用现有提取器
  return extractTaskIdFromKlingResponse(data);
}

/**
 * 从可灵视频编辑响应中提取任务状态
 * 状态值：pending | processing | success | failed
 */
export function extractTaskStatusFromKlingVideoEditResponse(data: unknown): string | null {
  // 与 Omni-Video 响应格式相同，复用现有提取器
  return extractTaskStatusFromKlingResponse(data);
}
