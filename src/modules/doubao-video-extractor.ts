/**
 * 豆包视频响应提取器
 * 适用 callMode: doubao-seedance-video-yunwu
 *
 * 响应格式：
 * - 创建: { id: "..." }
 * - 查询: { status: "succeeded", output: { videos: [{ url: "..." }] } }
 * - 失败: { status: "failed", error: { code: ..., message: "..." } }
 */

import type {
  VideoTaskStatus,
  VideoTaskResponse,
  VideoResponseExtractor,
} from "../services/video/types.js";

/** 状态映射表 */
const STATUS_MAP: Record<string, VideoTaskStatus> = {
  pending: "pending",
  processing: "processing",
  running: "processing",
  succeeded: "succeeded",
  success: "succeeded",
  completed: "succeeded",
  failed: "failed",
  error: "failed",
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
 * 豆包视频响应提取器
 */
export const doubaoVideoExtractor: VideoResponseExtractor = {
  extractTaskId(response: unknown): string | null {
    // { id: "..." }
    const id = safeGet<string>(response, "id");
    if (id) return id;

    // { data: { id: "..." } }
    const idFromData = safeGet<string>(response, "data", "id");
    if (idFromData) return idFromData;

    return null;
  },

  extractTaskStatus(response: unknown): VideoTaskStatus | null {
    // 从 status 字段提取
    const status = safeGet<string>(response, "status");
    if (status) {
      return STATUS_MAP[status.toLowerCase()] ?? null;
    }

    // 从 data.status 提取
    const statusFromData = safeGet<string>(response, "data", "status");
    if (statusFromData) {
      return STATUS_MAP[statusFromData.toLowerCase()] ?? null;
    }

    return null;
  },

  extractVideoUrls(response: unknown): string[] {
    const urls: string[] = [];

    // 从 output.videos 提取
    const videos = safeGet<unknown[]>(response, "output", "videos");
    if (Array.isArray(videos)) {
      for (const video of videos) {
        if (video && typeof video === "object") {
          const url = safeGet<string>(video, "url");
          if (url) urls.push(url);
        }
      }
    }

    // 从 data.videos 提取
    const videosFromData = safeGet<unknown[]>(response, "data", "videos");
    if (Array.isArray(videosFromData)) {
      for (const video of videosFromData) {
        if (video && typeof video === "object") {
          const url = safeGet<string>(video, "url");
          if (url) urls.push(url);
        }
      }
    }

    return [...new Set(urls)];
  },

  extractError(response: unknown): { code: string; message: string } | null {
    // { error: { code: ..., message: "..." } }
    const errorObj = safeGet<unknown>(response, "error");
    if (errorObj && typeof errorObj === "object") {
      const code = safeGet<string | number>(errorObj, "code");
      const message = safeGet<string>(errorObj, "message");
      if (code !== undefined || message) {
        return {
          code: code !== undefined ? String(code) : "UNKNOWN_ERROR",
          message: message || "未知错误",
        };
      }
    }

    // 状态为 failed
    const status = safeGet<string>(response, "status");
    if (status?.toLowerCase() === "failed") {
      const errorMessage = safeGet<string>(response, "error_message") ||
        safeGet<string>(response, "message") || "任务失败";
      return { code: "TASK_FAILED", message: errorMessage };
    }

    return null;
  },

  parse(response: unknown): VideoTaskResponse {
    const error = this.extractError(response);
    const status = this.extractTaskStatus(response);
    const videoUrls = this.extractVideoUrls(response);
    const taskId = this.extractTaskId(response);

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
    };
  },
};
