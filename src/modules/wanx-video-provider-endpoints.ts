/**
 * 万相视频生成 API 端点（阿里云百炼 DashScope）
 * 文档：https://help.aliyun.com/zh/model-studio/image-to-video-api-reference/
 * 支持模型：
 *   - wan2.7-i2v（图生视频，最新）
 *   - wan2.7-t2v（文生视频，最新）
 *   - wan2.6-i2v-flash（图生视频，快速）
 *   - wan2.6-t2v（文生视频）
 */

/** 万相 DashScope 视频生成 API 路径 */
const WANX_CREATE_PATH = "/api/v1/services/aigc/video-generation/video-synthesis";
const WANX_QUERY_PATH_PREFIX = "/api/v1/tasks/";

/**
 * 判断是否使用万相 DashScope 协议
 * 基于模型名称前缀判断（wanx / wan2 / wan.）
 */
export function isWanxProvider(
  provider: { vendor?: string; baseUrl: string },
  model: string,
): boolean {
  const normalizedModel = model.trim().toLowerCase();
  // wanx2.1 / wan2.x 系列模型
  return normalizedModel.startsWith("wanx") || normalizedModel.startsWith("wan2");
}

/**
 * 构建创建视频端点候选列表
 * DashScope 端点：POST {base}/api/v1/services/aigc/video-generation/video-synthesis
 */
export function buildWanxVideoCreateEndpointCandidates(baseUrl: string): string[] {
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

  candidates.add(`${root}${WANX_CREATE_PATH}`);
  return [...candidates];
}

/**
 * 构建查询视频任务端点候选列表
 * DashScope 端点：GET {base}/api/v1/tasks/{taskId}
 */
export function buildWanxVideoQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
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

  candidates.add(`${root}${WANX_QUERY_PATH_PREFIX}${safeTaskId}`);
  return [...candidates];
}

/**
 * 万相视频请求参数
 */
interface WanxVideoRequestOptions {
  /** 模型名称 */
  model: string;
  /** 文本提示词 */
  prompt: string;
  /** 首帧图片 URL（图生视频时必填） */
  imageUrl?: string | null;
  /** 参考图片数组（多图参考时使用） */
  referenceImages?: string[];
  /** 视频时长（秒） */
  duration?: number;
  /** 分辨率：720P / 1080P */
  resolution?: string;
  /** 宽高比：16:9 / 9:16 / 1:1 / 4:3 / 3:4 */
  ratio?: string;
  /** 是否开启 prompt 智能改写 */
  promptExtend?: boolean;
  /** 镜头类型：single（单镜头）/ multi（多镜头），仅 wan2.6 R2V 生效 */
  shotType?: "single" | "multi";
  /** 是否生成有声视频，仅 wan2.6 R2V 生效 */
  audio?: boolean;
}

/**
 * 构建万相视频请求体（DashScope 格式）
 *
 * 三种格式：
 * - R2V wan2.7：使用 media 数组格式（{ type: "reference_image"/"reference_video", url: "..." }）
 * - R2V wan2.6：使用 reference_urls 数组格式
 * - 非 R2V（i2v/t2v）：使用 img_url 单图格式（向后兼容）
 */
export function buildWanxVideoRequestBody(options: WanxVideoRequestOptions): string {
  const {
    model,
    prompt,
    imageUrl,
    referenceImages,
    duration = 5,
    resolution = "720P",
    ratio = "9:16",
    promptExtend = true,
    shotType,
    audio,
  } = options;

  const is27OrLater = model.startsWith("wan2.7");
  const isR2v = model.includes("-r2v");

  // ===========================================================================
  // R2V 模型：支持多图多参考
  // ===========================================================================

  if (isR2v) {
    // 过滤有效的参考图和视频
    const validReferenceImages = (referenceImages ?? []).filter(Boolean);
    // 目前调用方没有传 referenceVideos，暂不支持参考视频

    if (is27OrLater) {
      // wan2.7-r2v：使用 media 数组格式
      const media: Array<{ type: string; url: string }> = [];

      // 参考图（必须优先添加，万相 R2V 要求必须有 reference_image）
      for (const url of validReferenceImages) {
        media.push({ type: "reference_image", url });
      }

      // 首帧图（可选）
      // 注意：万相 R2V 要求 media 必须有 reference_image
      // 如果没有参考图，就不能传 first_frame，否则报错 "Only first frame provided is not allowed"
      if (imageUrl && validReferenceImages.length > 0) {
        media.push({ type: "first_frame", url: imageUrl });
      }

      // 无参考素材时报错（不允许降级）
      if (validReferenceImages.length === 0) {
        throw new Error(
          "R2V 模型要求必须有参考图（reference_image），请确保项目已生成角色五视图或服饰平铺图",
        );
      }

      const body: Record<string, unknown> = {
        model,
        input: { prompt, media },
        parameters: {
          resolution,
          duration,
          prompt_extend: promptExtend,
          watermark: false,
        },
      };
      return JSON.stringify(body);
    } else {
      // wan2.6-r2v：使用 reference_urls 数组格式
      // 无参考素材时报错（不允许降级）
      if (validReferenceImages.length === 0) {
        throw new Error(
          "R2V 模型要求必须有参考图（reference_image），请确保项目已生成角色五视图或服饰平铺图",
        );
      }

      // 有参考图时，合并首帧图和参考图
      const referenceUrls: string[] = [];
      // 先加参考图
      for (const url of validReferenceImages) {
        referenceUrls.push(url);
      }
      // 再加首帧图（如果有）
      if (imageUrl) {
        referenceUrls.push(imageUrl);
      }

      const input: Record<string, unknown> = { prompt };
      if (referenceUrls.length > 0) {
        input.reference_urls = referenceUrls;
      }

      const parameters: Record<string, unknown> = {
        duration,
        prompt_extend: promptExtend,
        watermark: false,
      };

      // wan2.6 使用 size 参数（宽*高格式）
      const sizeMap: Record<string, string> = {
        "720P_9:16": "720*1280",
        "720P_16:9": "1280*720",
        "720P_1:1": "960*960",
        "720P_4:3": "1088*832",
        "720P_3:4": "832*1088",
        "1080P_9:16": "1080*1920",
        "1080P_16:9": "1920*1080",
        "1080P_1:1": "1440*1440",
        "1080P_4:3": "1632*1248",
        "1080P_3:4": "1248*1632",
      };
      parameters.size = sizeMap[`${resolution}_${ratio}`] ?? "720*1280";

      if (shotType) {
        parameters.shot_type = shotType;
      }
      if (audio !== undefined) {
        parameters.audio = audio;
      }

      const body = { model, input, parameters };
      return JSON.stringify(body);
    }
  }

  // ===========================================================================
  // 非 R2V 模型（i2v/t2v）：保持原有单图逻辑
  // ===========================================================================

  // 图生视频（i2v）：需要 img_url
  const isI2v = model.includes("-i2v") || model.includes("_i2v");

  const input: Record<string, unknown> = {
    prompt,
  };

  // 图生视频时传入首帧图片
  if (isI2v && imageUrl) {
    input.img_url = imageUrl;
  }

  const parameters: Record<string, unknown> = {
    duration,
    prompt_extend: promptExtend,
    watermark: false,
  };

  // wan2.7 使用 resolution + ratio；wan2.6 及更早使用 resolution（图生）或 size（文生）
  if (is27OrLater) {
    parameters.resolution = resolution;
    parameters.ratio = ratio;
  } else if (isI2v) {
    // wan2.6/2.5/2.2/wanx2.1 图生视频使用 resolution
    parameters.resolution = resolution;
  } else {
    // wan2.6/2.5/2.2/wanx2.1 文生视频使用 size
    const sizeMap: Record<string, string> = {
      "720P_9:16": "720*1280",
      "720P_16:9": "1280*720",
      "1080P_9:16": "1080*1920",
      "1080P_16:9": "1920*1080",
      "480P_9:16": "480*832",
      "480P_16:9": "832*480",
    };
    parameters.size = sizeMap[`${resolution}_${ratio}`] ?? "720*1280";
  }

  const body = {
    model,
    input,
    parameters,
  };

  return JSON.stringify(body);
}

/**
 * 从万相 DashScope 响应中提取视频 URL
 * 响应格式：{ output: { task_status: "SUCCEEDED", video_url: "https://..." } }
 */
export function extractVideoUrlsFromWanxResponse(data: unknown): string[] {
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

/**
 * 从万相 DashScope 响应中提取任务 ID
 * 响应格式：{ output: { task_id: "xxx", task_status: "PENDING" } }
 */
export function extractTaskIdFromWanxResponse(data: unknown): string | null {
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
 * 从万相 DashScope 响应中提取任务状态
 * 响应格式：{ output: { task_status: "SUCCEEDED" } }
 * 状态枚举：PENDING / RUNNING / SUCCEEDED / FAILED / CANCELED / UNKNOWN
 */
export function extractTaskStatusFromWanxResponse(data: unknown): string | null {
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
