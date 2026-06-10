/**
 * 万相视频换人 API 端点（阿里云百炼 DashScope）
 * 模型：wan2.2-animate-mix
 * 文档：docs/万相-视频换人API参考.md
 *
 * 端点：
 *   - 创建任务：POST /api/v1/services/aigc/image2video/video-synthesis
 *   - 查询任务：GET /api/v1/tasks/{taskId}
 *
 * 异步流程：
 *   1. 创建任务（带 X-DashScope-Async: enable header）→ 返回 task_id
 *   2. 轮询查询状态 → PENDING → RUNNING → SUCCEEDED/FAILED
 *   3. SUCCEEDED 时返回 video_url（有效期 24 小时）
 *
 * 服务模式：
 *   - wan-std：标准模式，生成速度快、性价比高
 *   - wan-pro：专业模式，动画更流畅、画质更优
 */

/** 万相视频换人 DashScope API 路径 */
const WANXIANG_MIX_CREATE_PATH = "/api/v1/services/aigc/image2video/video-synthesis";
const WANXIANG_MIX_QUERY_PATH_PREFIX = "/api/v1/tasks/";

/**
 * 构建创建视频换人任务端点候选列表
 * DashScope 端点：POST {base}/api/v1/services/aigc/image2video/video-synthesis
 */
export function buildWanxiangVideoMixCreateEndpointCandidates(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const candidates = new Set<string>();

  // 如果 URL 已经包含完整端点路径，直接添加
  if (lowerBase.includes("/image2video/video-synthesis")) {
    candidates.add(base);
    return [...candidates];
  }

  // 去除已知的后缀，找到根 URL
  const knownSuffixes = [
    "/api/v1/services/aigc/image2video/video-synthesis",
    "/api/v1/services/aigc/video-generation/video-synthesis",
    "/api/v1/chat/completions",
    "/v1/chat/completions",
    "/chat/completions",
    "/compatible-mode/v1",
    "/api/v1",
    "/v1",
  ];

  let root = base;
  for (const suffix of knownSuffixes) {
    if (lowerBase.endsWith(suffix.toLowerCase())) {
      root = base.slice(0, Math.max(0, base.length - suffix.length)).replace(/\/+$/, "");
      break;
    }
  }

  candidates.add(`${root}${WANXIANG_MIX_CREATE_PATH}`);
  return [...candidates];
}

/**
 * 构建查询视频换人任务端点候选列表
 * DashScope 端点：GET {base}/api/v1/tasks/{taskId}
 */
export function buildWanxiangVideoMixQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
  const safeTaskId = encodeURIComponent(taskId.trim());
  if (!safeTaskId) {
    return [];
  }

  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const candidates = new Set<string>();

  // 如果 URL 已经是查询端点格式，直接返回
  if (lowerBase.includes("/tasks/") && lowerBase.includes(safeTaskId.toLowerCase())) {
    candidates.add(base);
    return [...candidates];
  }

  // 去除已知的后缀
  const knownSuffixes = [
    "/api/v1/services/aigc/image2video/video-synthesis",
    "/api/v1/services/aigc/video-generation/video-synthesis",
    "/api/v1/chat/completions",
    "/v1/chat/completions",
    "/chat/completions",
    "/compatible-mode/v1",
    "/api/v1",
    "/v1",
  ];

  let root = base;
  for (const suffix of knownSuffixes) {
    if (lowerBase.endsWith(suffix.toLowerCase())) {
      root = base.slice(0, Math.max(0, base.length - suffix.length)).replace(/\/+$/, "");
      break;
    }
  }

  candidates.add(`${root}${WANXIANG_MIX_QUERY_PATH_PREFIX}${safeTaskId}`);
  return [...candidates];
}

/**
 * 万相视频换人请求参数
 */
interface WanxiangVideoMixRequestOptions {
  /** 人物图片 URL（必填） */
  imageUrl: string;
  /** 参考视频 URL（必填） */
  videoUrl: string;
  /** 服务模式：wan-std（标准）或 wan-pro（专业） */
  mode: "wan-std" | "wan-pro";
  /** 是否添加水印 */
  watermark?: boolean;
  /** 是否检查输入图片 */
  checkImage?: boolean;
}

/**
 * 构建万相视频换人请求体（DashScope 格式）
 *
 * 请求格式：
 * {
 *   "model": "wan2.2-animate-mix",
 *   "input": {
 *     "image_url": "https://...",
 *     "video_url": "https://...",
 *     "watermark": true
 *   },
 *   "parameters": {
 *     "mode": "wan-std"
 *   }
 * }
 */
export function buildWanxiangVideoMixRequestBody(options: WanxiangVideoMixRequestOptions): string {
  const {
    imageUrl,
    videoUrl,
    mode = "wan-std",
    watermark = false,
    checkImage = true,
  } = options;

  // 必填参数校验
  if (!imageUrl?.trim()) {
    throw new Error("万相视频换人要求必填参数：image_url（人物图片 URL）");
  }
  if (!videoUrl?.trim()) {
    throw new Error("万相视频换人要求必填参数：video_url（参考视频 URL）");
  }

  const body = {
    model: "wan2.2-animate-mix",
    input: {
      image_url: imageUrl.trim(),
      video_url: videoUrl.trim(),
      watermark,
    },
    parameters: {
      mode,
      check_image: checkImage,
    },
  };

  return JSON.stringify(body);
}

/**
 * 从万相视频换人 DashScope 响应中提取视频 URL
 * 响应格式：{ output: { task_status: "SUCCEEDED", results: { video_url: "https://..." } } }
 */
export function extractVideoUrlsFromWanxiangVideoMixResponse(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;

  // { output: { results: { video_url: "..." } } }
  if (obj.output && typeof obj.output === "object") {
    const output = obj.output as Record<string, unknown>;
    if (output.results && typeof output.results === "object") {
      const results = output.results as Record<string, unknown>;
      if (typeof results.video_url === "string" && results.video_url) {
        return [results.video_url];
      }
    }
    // 备选：{ output: { video_url: "..." } }
    if (typeof output.video_url === "string" && output.video_url) {
      return [output.video_url];
    }
  }

  return [];
}

/**
 * 从万相视频换人 DashScope 响应中提取任务 ID
 * 响应格式：{ output: { task_id: "xxx", task_status: "PENDING" } }
 */
export function extractTaskIdFromWanxiangVideoMixResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  // { output: { task_id: "..." } }
  if (obj.output && typeof obj.output === "object") {
    const output = obj.output as Record<string, unknown>;
    if (typeof output.task_id === "string" && output.task_id) {
      return output.task_id;
    }
  }

  return null;
}

/**
 * 从万相视频换人 DashScope 响应中提取任务状态
 * 响应格式：{ output: { task_status: "SUCCEEDED" } }
 * 状态枚举：PENDING / RUNNING / SUCCEEDED / FAILED / CANCELED / UNKNOWN
 */
export function extractTaskStatusFromWanxiangVideoMixResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  // { output: { task_status: "..." } }
  if (obj.output && typeof obj.output === "object") {
    const output = obj.output as Record<string, unknown>;
    if (typeof output.task_status === "string") {
      return output.task_status;
    }
  }

  return null;
}

/**
 * 从万相视频换人 DashScope 响应中提取视频时长
 * 响应格式：{ usage: { video_duration: 5.2, video_ratio: "standard" } }
 */
export function extractVideoDurationFromWanxiangVideoMixResponse(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  // { usage: { video_duration: 5.2 } }
  if (obj.usage && typeof obj.usage === "object") {
    const usage = obj.usage as Record<string, unknown>;
    if (typeof usage.video_duration === "number") {
      return usage.video_duration;
    }
  }

  return null;
}

/**
 * 从万相视频换人 DashScope 响应中提取服务模式
 * 响应格式：{ usage: { video_ratio: "standard" 或 "pro" } }
 * wan-std → standard，wan-pro → pro
 */
export function extractVideoRatioFromWanxiangVideoMixResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  // { usage: { video_ratio: "standard" } }
  if (obj.usage && typeof obj.usage === "object") {
    const usage = obj.usage as Record<string, unknown>;
    if (typeof usage.video_ratio === "string") {
      return usage.video_ratio;
    }
  }

  return null;
}