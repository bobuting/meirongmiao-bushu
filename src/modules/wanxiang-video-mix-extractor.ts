/**
 * 万相视频换人响应提取器
 * 适用 callMode: wanxiang-video-mix-bailian
 *
 * 响应格式（阿里云百炼 DashScope 异步任务）：
 * - 创建: { output: { task_id: "...", task_status: "PENDING" }, request_id: "..." }
 * - 查询: { output: { task_status: "SUCCEEDED", results: { video_url: "..." } }, usage: { video_duration, video_ratio } }
 * - 失败: { output: { task_status: "FAILED", code: "...", message: "..." } }
 *
 * 状态枚举：PENDING / RUNNING / SUCCEEDED / FAILED / CANCELED / UNKNOWN
 *
 * 特殊字段：
 * - usage.video_duration: 视频时长（秒）
 * - usage.video_ratio: 服务模式（"standard" 或 "pro"，对应 wan-std 和 wan-pro）
 * - parameters.mode: 服务模式（"wan-std" 标准模式或 "wan-pro" 专业模式）
 */

import type {
  VideoTaskStatus,
  VideoTaskResponse,
  VideoResponseExtractor,
} from "../services/video/types.js";

/** 状态映射表（万相使用大写状态） */
const STATUS_MAP: Record<string, VideoTaskStatus> = {
  pending: "pending",
  running: "processing",
  processing: "processing",
  succeeded: "succeeded",
  success: "succeeded",
  failed: "failed",
  canceled: "failed",
  cancelled: "failed",
  unknown: "failed",
};

/**
 * 从响应对象中安全获取字段
 */
function safeGet<T>(obj: unknown, ...keys: string[]): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  let current: unknown = obj;
  for (const key of keys) {
    if (!current || typeof current !== "object") return undefined;
    const record = current as Record<string, unknown>;
    current = record[key];
  }
  return current as T | undefined;
}

/**
 * 万相视频换人响应提取器
 */
export const wanxiangVideoMixExtractor: VideoResponseExtractor = {
  extractTaskId(response: unknown): string | null {
    // { output: { task_id: "..." } }
    const taskId = safeGet<string>(response, "output", "task_id");
    if (taskId) return taskId;

    return null;
  },

  extractTaskStatus(response: unknown): VideoTaskStatus | null {
    // { output: { task_status: "SUCCEEDED" } }
    const taskStatus = safeGet<string>(response, "output", "task_status");
    if (taskStatus) {
      return STATUS_MAP[taskStatus.toLowerCase()] ?? null;
    }

    return null;
  },

  extractVideoUrls(response: unknown): string[] {
    // { output: { results: { video_url: "..." } } }
    const videoUrl = safeGet<string>(response, "output", "results", "video_url");
    if (videoUrl) return [videoUrl];

    // 备选：直接在 output 下（兼容旧格式）
    const directUrl = safeGet<string>(response, "output", "video_url");
    if (directUrl) return [directUrl];

    return [];
  },

  extractError(response: unknown): { code: string; message: string } | null {
    // { output: { task_status: "FAILED", code: "...", message: "..." } }
    const taskStatus = safeGet<string>(response, "output", "task_status");
    if (taskStatus?.toUpperCase() === "FAILED") {
      const code = safeGet<string>(response, "output", "code") || "TASK_FAILED";
      const message = safeGet<string>(response, "output", "message") ||
        safeGet<string>(response, "output", "msg") || "任务失败";
      return { code, message };
    }

    // { code: "...", message: "..." }（顶层错误）
    const code = safeGet<string | number>(response, "code");
    const message = safeGet<string>(response, "message");
    if (code !== undefined && code !== "Success" && code !== "0") {
      return { code: String(code), message: message || "未知错误" };
    }

    return null;
  },

  parse(response: unknown): VideoTaskResponse {
    const error = this.extractError(response);
    const status = this.extractTaskStatus(response);
    const videoUrls = this.extractVideoUrls(response);
    const taskId = this.extractTaskId(response);

    // 提取视频时长和服务模式
    const videoDuration = safeGet<number>(response, "usage", "video_duration");
    const videoRatio = safeGet<string>(response, "usage", "video_ratio");

    // 有视频 URL 时状态为成功
    let finalStatus = status;
    if (videoUrls.length > 0 && !error) {
      finalStatus = "succeeded";
    } else if (error) {
      finalStatus = "failed";
    }

    return {
      taskId,
      status: finalStatus ?? "pending",
      videoUrls,
      error: error ?? undefined,
      // 扩展字段（万相视频换人特有）
      metadata: {
        videoDuration,
        videoRatio,
      },
    };
  },
};