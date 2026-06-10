/**
 * VEO 视频响应提取器
 * 适用 callMode: veo-video-yunwu-tongyi
 *
 * 响应格式：
 * - 创建: { id: "..." } 或 { name: "..." }
 * - 查询: { name: "...", done: true, response: { videos: [{ url: "..." }] } }
 * - 处理中: { name: "...", done: false }
 * - 错误: { error: { code: ..., message: "..." } } 或 { detail: "..." }
 */

import type {
  VideoTaskStatus,
  VideoTaskResponse,
  VideoResponseExtractor,
} from "../services/video/types.js";

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
 * VEO 视频响应提取器
 */
export const veoVideoExtractor: VideoResponseExtractor = {
  extractTaskId(response: unknown): string | null {
    // VEO 使用 name 字段作为任务 ID
    const name = safeGet<string>(response, "name");
    if (name) return name;

    // 备选：id 字段
    const id = safeGet<string>(response, "id");
    if (id) return id;

    return null;
  },

  extractTaskStatus(response: unknown): VideoTaskStatus | null {
    // VEO 使用 done 字段判断状态
    const done = safeGet<boolean>(response, "done");

    if (done === true) {
      // 检查是否有错误
      const error = safeGet<unknown>(response, "error");
      if (error) return "failed";
      return "succeeded";
    }

    if (done === false) {
      return "processing";
    }

    // 检查 status 字段
    const status = safeGet<string>(response, "status");
    if (status) {
      const normalized = status.toLowerCase();
      if (normalized === "succeeded" || normalized === "success" || normalized === "completed") return "succeeded";
      if (normalized === "failed" || normalized === "error") return "failed";
      if (normalized === "processing" || normalized === "running" || normalized === "pending") return "processing";
    }

    // 有 video_url 字段，说明已完成
    const topLevelVideoUrl = safeGet<string>(response, "video_url");
    if (topLevelVideoUrl) {
      return "succeeded";
    }

    // 有 id 或 name 但没有 done，可能还在处理中
    if (safeGet<string>(response, "name") || safeGet<string>(response, "id")) {
      return "processing";
    }

    return null;
  },

  extractVideoUrls(response: unknown): string[] {
    const urls: string[] = [];

    // 从顶层 video_url 提取（云雾 VEO 响应格式）
    const topLevelVideoUrl = safeGet<string>(response, "video_url");
    if (topLevelVideoUrl) urls.push(topLevelVideoUrl);

    // 从 response.videos 提取
    const videos = safeGet<unknown[]>(response, "response", "videos");
    if (Array.isArray(videos)) {
      for (const video of videos) {
        if (video && typeof video === "object") {
          const url = safeGet<string>(video, "url");
          if (url) urls.push(url);
        }
      }
    }

    // 从 response.video_url 提取（单个视频）
    const videoUrl = safeGet<string>(response, "response", "video_url");
    if (videoUrl) urls.push(videoUrl);

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

    // { detail: "..." }
    const detail = safeGet<string>(response, "detail");
    if (detail) {
      return { code: "DETAIL_ERROR", message: detail };
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
