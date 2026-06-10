/**
 * 快乐马视频生成 API 端点（阿里云百炼 DashScope）
 * 文档：docs/快乐马.md
 * 模型：happyhorse-1.0-r2v
 *
 * 特点：
 *   - 多张参考图生成视频（参考生视频）
 *   - prompt 必须用 character1/character2 指代参考图顺序
 *   - 支持 seed 参数控制随机性 [0, 2147483647]
 *   - watermark 默认 true，需显式设 false
 *
 * 完全独立实现，不依赖万相视频模块
 */

/** 快乐马 DashScope 视频生成 API 路径 */
const HAPPYHORSE_CREATE_PATH = "/api/v1/services/aigc/video-generation/video-synthesis";
const HAPPYHORSE_QUERY_PATH_PREFIX = "/api/v1/tasks/";

/**
 * 快乐马视频请求参数
 */
export interface HappyHorseVideoRequestOptions {
  /** 模型名称（默认 happyhorse-1.0-r2v） */
  model?: string;
  /** 文本提示词（需包含 character1/character2 指代标识） */
  prompt: string;
  /** 参考图片 URL 数组（必须至少 1 张，最多 9 张） */
  referenceImages: string[];
  /** 视频时长（秒），范围 3-15，默认 5 */
  duration?: number;
  /** 分辨率：720P / 1080P，默认 720P */
  resolution?: string;
  /** 宽高比：16:9 / 9:16 / 3:4 / 4:3 / 1:1，默认 9:16 */
  ratio?: string;
  /** 是否添加水印（默认 false，显式关闭） */
  watermark?: boolean;
  /** 随机种子 [0, 2147483647]，可选 */
  seed?: number;
}

/**
 * 构建创建视频端点候选列表
 * DashScope 端点：POST {base}/api/v1/services/aigc/video-generation/video-synthesis
 */
export function buildHappyHorseVideoCreateEndpointCandidates(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const candidates = new Set<string>();

  // 如果 URL 已经包含完整端点路径，直接添加
  if (lowerBase.includes("/video-generation/video-synthesis")) {
    candidates.add(base);
    return [...candidates];
  }

  // 去除已知的后缀，找到根 URL
  const knownSuffixes = [
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

  candidates.add(`${root}${HAPPYHORSE_CREATE_PATH}`);
  return [...candidates];
}

/**
 * 构建查询视频任务端点候选列表
 * DashScope 端点：GET {base}/api/v1/tasks/{taskId}
 */
export function buildHappyHorseVideoQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
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

  candidates.add(`${root}${HAPPYHORSE_QUERY_PATH_PREFIX}${safeTaskId}`);
  return [...candidates];
}

/**
 * 构建快乐马视频请求体（DashScope 格式）
 *
 * 关键规则：
 * 1. media 数组：[{ type: "reference_image", url }] 顺序对应 prompt 中 character1/character2
 * 2. prompt 必须包含 character 指代标识
 * 3. watermark 默认 true，需显式设 false
 * 4. seed 可选：[0, 2147483647]
 */
export function buildHappyHorseVideoRequestBody(options: HappyHorseVideoRequestOptions): string {
  const {
    model = "happyhorse-1.0-r2v",
    prompt,
    referenceImages,
    duration = 5,
    resolution = "720P",
    ratio = "9:16",
    watermark = false,
    seed,
  } = options;

  // 参考图必须至少 1 张
  if (!referenceImages || referenceImages.length === 0) {
    throw new Error("快乐马模型要求至少 1 张参考图（referenceImages）");
  }

  // 参考图最多 9 张
  if (referenceImages.length > 9) {
    throw new Error("快乐马模型最多支持 9 张参考图");
  }

  // 视频时长范围校验
  if (duration < 3 || duration > 15) {
    throw new Error("快乐马视频时长必须在 3-15 秒之间");
  }

  // 构建 media 数组
  const media = referenceImages.map(url => ({
    type: "reference_image",
    url,
  }));

  // 构建请求体
  const parameters: Record<string, unknown> = {
    resolution,
    ratio,
    duration,
    watermark,
  };

  // 可选 seed 参数
  if (seed !== undefined) {
    if (seed < 0 || seed > 2147483647) {
      throw new Error("快乐马 seed 参数必须在 [0, 2147483647] 范围内");
    }
    parameters.seed = seed;
  }

  const body: Record<string, unknown> = {
    model,
    input: {
      prompt,
      media,
    },
    parameters,
  };

  return JSON.stringify(body);
}

/**
 * 从快乐马 DashScope 响应中提取任务 ID
 * 响应格式：{ output: { task_id: "xxx", task_status: "PENDING" } }
 */
export function extractTaskIdFromHappyHorseResponse(data: unknown): string | null {
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
 * 从快乐马 DashScope 响应中提取任务状态
 * 响应格式：{ output: { task_status: "SUCCEEDED" } }
 * 状态枚举：PENDING / RUNNING / SUCCEEDED / FAILED / CANCELED / UNKNOWN
 */
export function extractTaskStatusFromHappyHorseResponse(data: unknown): string | null {
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
 * 从快乐马 DashScope 响应中提取视频 URL
 * 响应格式：{ output: { task_status: "SUCCEEDED", video_url: "https://..." } }
 */
export function extractVideoUrlsFromHappyHorseResponse(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;

  // { output: { video_url: "..." } }
  if (obj.output && typeof obj.output === "object") {
    const output = obj.output as Record<string, unknown>;
    if (typeof output.video_url === "string" && output.video_url) {
      return [output.video_url];
    }
  }

  return [];
}

// ========================================
// 快乐马视频编辑（happyhorse-1.0-video-edit）
// ========================================

/**
 * 快乐马视频编辑请求参数
 *
 * 与参考生视频的区别：
 * - media 数组必须包含 1 个 video 类型元素
 * - 可选包含 0-5 个 reference_image 类型元素
 * - 不需要 character1/character2 指代标识
 * - 支持 audio_setting 参数控制声音
 */
export interface HappyHorseVideoEditRequestOptions {
  /** 模型名称（默认 happyhorse-1.0-video-edit） */
  model?: string;
  /** 文本提示词（编辑指令，如"让角色穿上图片中的条纹毛衣"） */
  prompt: string;
  /** 待编辑的视频 URL（必须） */
  videoUrl: string;
  /** 参考图片 URL 数组（可选，最多 5 张） */
  referenceImages?: string[];
  /** 分辨率：720P / 1080P，默认 720P */
  resolution?: string;
  /** 是否添加水印（默认 false，显式关闭） */
  watermark?: boolean;
  /** 声音控制：auto（由模型控制） / origin（保留原声音），默认 auto */
  audioSetting?: "auto" | "origin";
  /** 随机种子 [0, 2147483647]，可选 */
  seed?: number;
}

/**
 * 构建快乐马视频编辑请求体（DashScope 格式）
 *
 * 关键规则：
 * 1. media 数组：[{ type: "video", url }] + 可选 [{ type: "reference_image", url }]
 * 2. 视频时长：输入 3-60 秒，输出 3-15 秒（超 15 秒自动截取前 15 秒）
 * 3. 参考图：可选 0-5 张
 * 4. watermark 默认 true，需显式设 false
 * 5. audio_setting：auto / origin
 * 6. seed 可选：[0, 2147483647]
 */
export function buildHappyHorseVideoEditRequestBody(options: HappyHorseVideoEditRequestOptions): string {
  const {
    model = "happyhorse-1.0-video-edit",
    prompt,
    videoUrl,
    referenceImages = [],
    resolution = "720P",
    watermark = false,
    audioSetting = "auto",
    seed,
  } = options;

  // 视频必须提供
  if (!videoUrl) {
    throw new Error("快乐马视频编辑模型要求必须提供视频 URL（videoUrl）");
  }

  // 参考图最多 5 张
  if (referenceImages.length > 5) {
    throw new Error("快乐马视频编辑模型最多支持 5 张参考图");
  }

  // 构建 media 数组：先放视频，再放参考图
  const media: Array<{ type: string; url: string }> = [
    { type: "video", url: videoUrl },
  ];

  // 添加参考图（可选）
  for (const refImageUrl of referenceImages) {
    media.push({ type: "reference_image", url: refImageUrl });
  }

  // 构建请求体参数
  const parameters: Record<string, unknown> = {
    resolution,
    watermark,
    audio_setting: audioSetting,
  };

  // 可选 seed 参数
  if (seed !== undefined) {
    if (seed < 0 || seed > 2147483647) {
      throw new Error("快乐马 seed 参数必须在 [0, 2147483647] 范围内");
    }
    parameters.seed = seed;
  }

  const body: Record<string, unknown> = {
    model,
    input: {
      prompt,
      media,
    },
    parameters,
  };

  return JSON.stringify(body);
}