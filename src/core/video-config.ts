/**
 * 视频生成统一配置模块
 *
 * 将分散在多个文件中的视频相关配置集中管理，提供：
 * 1. 类型安全的配置访问
 * 2. 合理的默认值
 * 3. 配置验证
 * 4. 环境变量覆盖
 */

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 视频分辨率类型 */
export type VideoResolution = "540p" | "720p" | "1080p";

/** 视频时长类型 */
export type VideoDuration = 5 | 10;

/** 视频协议类型 */
export type VideoProtocol = "jimeng" | "doubao-volc" | "veo" | "dashscope";

/** 轮询配置 */
export interface VideoPollingConfig {
  /** 最大轮询次数 */
  maxAttempts: number;
  /** 轮询间隔（毫秒） */
  intervalMs: number;
  /** 最小间隔（渐进式轮询时使用） */
  minIntervalMs: number;
  /** 最大间隔（渐进式轮询时使用） */
  maxIntervalMs: number;
  /** 总超时时间（毫秒） */
  timeoutMs: number;
  /** 每次轮询请求的超时时间（毫秒） */
  requestTimeoutMs: number;
}

/** 重试配置 */
export interface VideoRetryConfig {
  /** 创建任务最大重试次数 */
  createMaxRetries: number;
  /** 创建任务重试延迟（毫秒） */
  createRetryDelayMs: number;
  /** 过载重试延迟（毫秒） */
  overloadRetryDelayMs: number;
  /** Pending 状态重试延迟（毫秒） */
  pendingRetryDelayMs: number;
  /** 任务级最大重试次数 */
  jobMaxRetries: number;
  /** 任务超时时间（分钟） */
  jobTimeoutMinutes: number;
  /** 任务级重试基础延迟（毫秒） */
  jobRetryBaseDelayMs: number;
  /** 任务级重试最大延迟（毫秒） */
  jobRetryMaxDelayMs: number;
  /** 任务级重试抖动范围（毫秒） */
  jobRetryJitterMs: number;
}

/** 视频生成配置 */
export interface VideoGenerationConfig {
  /** 默认视频时长（秒） */
  duration: VideoDuration;
  /** 默认分辨率 */
  resolution: VideoResolution;
  /** 默认宽高比 */
  aspectRatio: "9:16" | "16:9" | "1:1" | "3:4";
}

/** 模型优先级配置 */
export interface VideoModelConfig {
  /** 按优先级排序的模型候选列表 */
  candidates: string[];
  /** 默认模型 */
  defaultModel: string;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 解析整数环境变量，带范围约束 */
function parseIntEnv(key: string, defaultValue: number, min: number, max: number): number {
  const raw = process.env[key];
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

/** 解析字符串环境变量，带可选值约束 */
function parseStringEnv<T extends string>(key: string, defaultValue: T, allowed: T[]): T {
  const raw = process.env[key];
  if (!raw) {
    return defaultValue;
  }
  const trimmed = raw.trim().toLowerCase() as T;
  return allowed.includes(trimmed) ? trimmed : defaultValue;
}

/** 解析布尔环境变量 */
function parseBoolEnv(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (!raw) {
    return defaultValue;
  }
  return raw.trim().toLowerCase() === "true";
}

// ---------------------------------------------------------------------------
// 模型配置
// ---------------------------------------------------------------------------

/** 支持的视频生成模型 */
export const VIDEO_MODELS = {
  /** VEO 模型（最高优先级） */
  VEO_3_1: "veo3.1",
  VEO_3_1_4K: "veo3.1-4k",
  VEO_3_1_FAST: "veo3.1-fast",
  VEO_3_1_PRO: "veo3.1-pro",

  /** 豆包模型 */
  DOUBAO_SEEDANCE: "doubao-seedance-1-5-pro-251215",

  /** 可灵 Omni-Video 模型（推荐，效果更好） */
  KLING_OMNI_VIDEO_O1: "kling-video-o1",
  KLING_OMNI_VIDEO_V3: "kling-v3-omni",

  /** 可灵普通模型 */
  KLING_V1_5: "kling-v1-5",
  KLING_V1_PRO: "kling-v1-pro",
  KLING_MULTI_IMAGE: "kling-multi-image-to-video-v1",

  /** 即梦模型 */
  JIMENG_VIDEO_3_0: "jimeng-video-3.0",
  JIMENG_VIDEO_3_1: "jimeng-video-3.1",

  /** 万相模型（阿里云百炼 DashScope） */
  WANX_2_7_I2V: "wan2.7-i2v",
  WANX_2_7_T2V: "wan2.7-t2v",
  WANX_2_6_I2V_FLASH: "wan2.6-i2v-flash",
  WANX_2_6_T2V: "wan2.6-t2v",
} as const;

/** 默认模型候选列表（按优先级排序） */
const DEFAULT_MODEL_CANDIDATES = [
  VIDEO_MODELS.VEO_3_1,
  VIDEO_MODELS.VEO_3_1_FAST,
  VIDEO_MODELS.VEO_3_1_PRO,
  VIDEO_MODELS.KLING_OMNI_VIDEO_O1,  // Omni-Video 效果更好
  VIDEO_MODELS.KLING_OMNI_VIDEO_V3,
  VIDEO_MODELS.DOUBAO_SEEDANCE,
  VIDEO_MODELS.JIMENG_VIDEO_3_1,
  VIDEO_MODELS.JIMENG_VIDEO_3_0,
  VIDEO_MODELS.WANX_2_7_I2V,          // 万相 2.7 图生视频
  VIDEO_MODELS.WANX_2_7_T2V,          // 万相 2.7 文生视频
];

/** 获取模型配置 */
export function getVideoModelConfig(): VideoModelConfig {
  const envCandidates = process.env.VIDEO_MODEL_CANDIDATES;
  const candidates = envCandidates
    ? envCandidates.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_MODEL_CANDIDATES;

  return {
    candidates,
    defaultModel: candidates[0] ?? VIDEO_MODELS.JIMENG_VIDEO_3_1,
  };
}

// ---------------------------------------------------------------------------
// 轮询配置
// ---------------------------------------------------------------------------

/** 获取轮询配置 */
export function getVideoPollingConfig(): VideoPollingConfig {
  return {
    maxAttempts: parseIntEnv("VIDEO_POLL_MAX_ATTEMPTS", 60, 10, 120),
    intervalMs: parseIntEnv("VIDEO_POLL_INTERVAL_MS", 5000, 1000, 30000),
    minIntervalMs: parseIntEnv("VIDEO_POLL_MIN_INTERVAL_MS", 2000, 500, 5000),
    maxIntervalMs: parseIntEnv("VIDEO_POLL_MAX_INTERVAL_MS", 10000, 5000, 30000),
    timeoutMs: parseIntEnv("VIDEO_POLL_TIMEOUT_MS", 600000, 60000, 1200000),
    requestTimeoutMs: parseIntEnv("VIDEO_POLL_REQUEST_TIMEOUT_MS", 30000, 5000, 120000),
  };
}

/** 计算渐进式轮询间隔 */
export function computeProgressivePollInterval(
  attempt: number,
  config: VideoPollingConfig,
): number {
  // 前 10 次使用最小间隔
  if (attempt < 10) {
    return config.minIntervalMs;
  }

  // 之后渐进增长
  const progress = (attempt - 10) / (config.maxAttempts - 10);
  const interval =
    config.minIntervalMs + progress * (config.maxIntervalMs - config.minIntervalMs);

  return Math.floor(interval);
}

// ---------------------------------------------------------------------------
// 重试配置
// ---------------------------------------------------------------------------

/** 获取重试配置 */
export function getVideoRetryConfig(): VideoRetryConfig {
  return {
    createMaxRetries: parseIntEnv("VIDEO_CREATE_MAX_RETRIES", 2, 0, 5),
    createRetryDelayMs: parseIntEnv("VIDEO_CREATE_RETRY_DELAY_MS", 3000, 1000, 15000),
    overloadRetryDelayMs: parseIntEnv("VIDEO_OVERLOAD_RETRY_DELAY_MS", 30000, 5000, 120000),
    pendingRetryDelayMs: parseIntEnv("VIDEO_PENDING_RETRY_DELAY_MS", 3000, 1000, 30000),
    jobMaxRetries: parseIntEnv("VIDEO_JOB_RETRIES", 3, 0, 10),
    jobTimeoutMinutes: parseIntEnv("VIDEO_JOB_TIMEOUT_MINUTES", 10, 1, 60),
    jobRetryBaseDelayMs: parseIntEnv("VIDEO_JOB_RETRY_BASE_DELAY_MS", 30000, 5000, 60000),
    jobRetryMaxDelayMs: parseIntEnv("VIDEO_JOB_RETRY_MAX_DELAY_MS", 300000, 60000, 600000),
    jobRetryJitterMs: parseIntEnv("VIDEO_JOB_RETRY_JITTER_MS", 10000, 0, 30000),
  };
}

/** 计算指数退避延迟（带抖动） */
export function computeExponentialBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterMs: number = 5000,
): number {
  // 指数退避
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // 添加随机抖动，使用 Math.floor 确保返回整数值
  const jitter = Math.floor(Math.random() * jitterMs);

  return cappedDelay + jitter;
}

// ---------------------------------------------------------------------------
// 视频生成配置
// ---------------------------------------------------------------------------

/** 获取视频生成配置 */
export function getVideoGenerationConfig(): VideoGenerationConfig {
  // 时长需要特殊处理，因为值是数字
  const durationRaw = process.env.VIDEO_DURATION;
  let duration: VideoDuration = 5;
  if (durationRaw === "10") {
    duration = 10;
  }

  return {
    duration,
    resolution: parseStringEnv("VIDEO_RESOLUTION", "1080p", [
      "540p",
      "720p",
      "1080p",
    ]) as VideoResolution,
    aspectRatio: parseStringEnv("VIDEO_ASPECT_RATIO", "9:16", [
      "9:16",
      "16:9",
      "1:1",
      "3:4",
    ]) as VideoGenerationConfig["aspectRatio"],
  };
}

// ---------------------------------------------------------------------------
// 执行器配置
// ---------------------------------------------------------------------------

/** 获取视频任务执行器配置 */
export function getVideoJobExecutorConfig(): {
  enabled: boolean;
  intervalMs: number;
} {
  return {
    enabled: parseBoolEnv("VIDEO_JOB_EXECUTOR_ENABLED", true),
    intervalMs: parseIntEnv("VIDEO_JOB_EXECUTOR_INTERVAL_MS", 200, 50, 10000),
  };
}

// ---------------------------------------------------------------------------
// 错误分类
// ---------------------------------------------------------------------------

/** 错误分类类型 */
export type VideoErrorCategory = "permanent" | "transient" | "service";

/** 错误分类结果 */
export interface VideoErrorClassification {
  category: VideoErrorCategory;
  shouldRetry: boolean;
  shouldAlert: boolean;
  suggestedDelayMs: number;
}

/** 不应重试的 HTTP 状态码 */
const PERMANENT_ERROR_STATUS_CODES = new Set([400, 401, 403, 404, 422]);

/** 服务错误状态码（应该重试） */
const SERVICE_ERROR_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** 不应重试的错误消息模式 */
const PERMANENT_ERROR_PATTERNS = [
  /invalid\s+(prompt|parameter|request|input)/i,
  /unsupported\s+(model|format)/i,
  /not\s+(supported|available|found)/i,
  /authentication\s+failed/i,
  /unauthorized/i,
  /forbidden/i,
  /quota\s+exceeded/i,
  /insufficient\s+(credit|balance)/i,
];

/** 应该重试的错误消息模式 */
const TRANSIENT_ERROR_PATTERNS = [
  /timeout/i,
  /timed?\s*out/i,
  /connection\s+(reset|closed|refused)/i,
  /econnreset/i,
  /econnrefused/i,
  /etimedout/i,
];

/** 服务过载模式 */
const OVERLOAD_PATTERNS = [
  /overload/i,
  /overloaded/i,
  /负载已饱和/i,
  /try\s+again\s+later/i,
  /rate\s*limit/i,
  /too\s+many\s+requests/i,
];

/** 分类视频生成错误 */
export function classifyVideoError(
  error: unknown,
  config: VideoRetryConfig = getVideoRetryConfig(),
): VideoErrorClassification {
  if (!(error instanceof Error)) {
    return {
      category: "transient",
      shouldRetry: true,
      shouldAlert: false,
      suggestedDelayMs: config.pendingRetryDelayMs,
    };
  }

  const message = error.message.toLowerCase();
  const status = (error as any).status ?? (error as any).statusCode ?? 0;

  // 检查永久错误状态码
  if (PERMANENT_ERROR_STATUS_CODES.has(status)) {
    return {
      category: "permanent",
      shouldRetry: false,
      shouldAlert: false,
      suggestedDelayMs: 0,
    };
  }

  // 检查永久错误消息
  for (const pattern of PERMANENT_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return {
        category: "permanent",
        shouldRetry: false,
        shouldAlert: false,
        suggestedDelayMs: 0,
      };
    }
  }

  // 检查服务过载
  for (const pattern of OVERLOAD_PATTERNS) {
    if (pattern.test(message)) {
      return {
        category: "service",
        shouldRetry: true,
        shouldAlert: true,
        suggestedDelayMs: config.overloadRetryDelayMs,
      };
    }
  }

  // 检查服务错误状态码
  if (SERVICE_ERROR_STATUS_CODES.has(status)) {
    return {
      category: "service",
      shouldRetry: true,
      shouldAlert: status >= 500,
      suggestedDelayMs: config.overloadRetryDelayMs,
    };
  }

  // 检查临时错误
  for (const pattern of TRANSIENT_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return {
        category: "transient",
        shouldRetry: true,
        shouldAlert: false,
        suggestedDelayMs: config.pendingRetryDelayMs,
      };
    }
  }

  // 默认临时错误
  return {
    category: "transient",
    shouldRetry: true,
    shouldAlert: false,
    suggestedDelayMs: config.pendingRetryDelayMs,
  };
}

// ---------------------------------------------------------------------------
// 导出默认配置（便于测试）
// ---------------------------------------------------------------------------

/** 默认视频配置（不读取环境变量，用于测试） */
export const DEFAULT_VIDEO_CONFIG = {
  polling: {
    maxAttempts: 60,
    intervalMs: 5000,
    minIntervalMs: 2000,
    maxIntervalMs: 10000,
    timeoutMs: 600000,
  },
  retry: {
    createMaxRetries: 2,
    createRetryDelayMs: 3000,
    overloadRetryDelayMs: 30000,
    pendingRetryDelayMs: 3000,
    jobMaxRetries: 3,
    jobTimeoutMinutes: 10,
    jobRetryBaseDelayMs: 30000,
    jobRetryMaxDelayMs: 300000,
    jobRetryJitterMs: 10000,
  },
  generation: {
    duration: 5 as VideoDuration,
    resolution: "1080p" as VideoResolution,
    aspectRatio: "9:16" as const,
  },
  models: {
    candidates: DEFAULT_MODEL_CANDIDATES,
    defaultModel: VIDEO_MODELS.VEO_3_1,
  },
};

/** 换装视频编辑模型 */
export const OUTFIT_CHANGE_VIDEO_EDIT_MODELS = {
  /** 可灵视频编辑 Pro 模型（推荐） */
  KLING_VIDEO_O3_PRO: "kling-video-o3-pro",
} as const;