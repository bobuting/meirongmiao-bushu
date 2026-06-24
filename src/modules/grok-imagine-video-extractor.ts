/**
 * Grok Imagine 视频响应提取器
 * 适用 callMode: grok-imagine-video-yunwu
 *
 * 端点：POST /v1/videos/generations（创建），GET /v1/videos/{request_id}（查询）
 * 基于 xAI 官方 API 格式（通过云雾中转）
 *
 * 创建响应格式：
 * { "request_id": "db9db969-39fe-96b6-9161-bb1269ac8b40" }
 *
 * 查询响应格式：
 * { "model": "grok-imagine-video", "status": "done", "video": { "url": "https://...", "duration": 4 }, "progress": 100 }
 *
 * 失败响应：
 * { "status": "failed", "error": { "code": "...", "message": "..." } }
 */

import type {
  VideoTaskStatus,
  VideoTaskResponse,
  VideoResponseExtractor,
} from "../services/video/types.js";

/** 从响应对象中安全获取字段 */
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

/** 状态映射：xAI 状态字符串 → 通用状态 */
function mapStatus(status: string | undefined): VideoTaskStatus | null {
  if (!status) return null;
  const normalized = status.toLowerCase();

  if (normalized === "done" || normalized === "completed" || normalized === "succeeded" || normalized === "success") {
    return "succeeded";
  }
  if (normalized === "failed" || normalized === "error" || normalized === "expired") {
    return "failed";
  }
  if (normalized === "pending" || normalized === "queued" || normalized === "processing" || normalized === "generating" || normalized === "running") {
    return "processing";
  }
  return null;
}

/**
 * Grok Imagine 视频响应提取器
 * 仅处理 xAI 官方格式
 */
export const grokImagineVideoExtractor: VideoResponseExtractor = {
  extractTaskId(response: unknown): string | null {
    return safeGet<string>(response, "request_id") ?? null;
  },

  extractTaskStatus(response: unknown): VideoTaskStatus | null {
    const status = safeGet<string>(response, "status");
    return mapStatus(status);
  },

  extractVideoUrls(response: unknown): string[] {
    // xAI 格式：video 永远是对象，url 在 video.url
    const videoUrl = safeGet<string>(response, "video", "url");
    return videoUrl ? [videoUrl] : [];
  },

  extractError(response: unknown): { code: string; message: string } | null {
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
    return null;
  },

  parse(response: unknown): VideoTaskResponse {
    const error = this.extractError(response);
    const status = this.extractTaskStatus(response);
    const videoUrls = this.extractVideoUrls(response);
    const taskId = this.extractTaskId(response);

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
