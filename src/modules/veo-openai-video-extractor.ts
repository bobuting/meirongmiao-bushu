/**
 * VEO OpenAI 视频格式响应提取器
 * 适用 callMode: veo-video-yunwu-openai
 * 端点: POST /v1/video/create（统一格式，JSON + URL 传图）
 * 查询: GET /v1/video/query?id={taskId}
 *
 * 创建响应格式：
 * {
 *   "id": "veo3-fast-frames:xxx",
 *   "status": "pending",
 *   "status_update_time": 1762241017286
 * }
 *
 * 查询响应格式：
 * {
 *   "id": "veo3-fast-frames:xxx",
 *   "status": "succeeded",
 *   "done": true,
 *   "response": {
 *     "videos": [{ "url": "https://..." }]
 *   },
 *   "status_update_time": 1762241017286
 * }
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
 * 状态映射：统一格式状态 -> 通用状态
 */
function mapUnifiedStatus(status: string | undefined): VideoTaskStatus | null {
  if (!status) return null;

  const normalized = status.toLowerCase();

  if (normalized === "succeeded" || normalized === "success" || normalized === "completed") {
    return "succeeded";
  }
  if (normalized === "failed" || normalized === "error") {
    return "failed";
  }
  if (
    normalized === "processing" ||
    normalized === "running" ||
    normalized === "queued" ||
    normalized === "pending"
  ) {
    return "processing";
  }

  return null;
}

/**
 * VEO OpenAI 视频格式响应提取器（统一格式端点）
 */
export const veoOpenaiVideoExtractor: VideoResponseExtractor = {
  extractTaskId(response: unknown): string | null {
    // 统一格式使用 id 字段
    const id = safeGet<string>(response, "id");
    if (id) return id;

    return null;
  },

  extractTaskStatus(response: unknown): VideoTaskStatus | null {
    // 统一格式使用 done 布尔值
    const done = safeGet<boolean>(response, "done");
    if (done === true) {
      const error = safeGet<unknown>(response, "error");
      if (error) return "failed";
      return "succeeded";
    }
    if (done === false) {
      return "processing";
    }

    // 备选：status 字符串
    const status = safeGet<string>(response, "status");
    const mapped = mapUnifiedStatus(status);
    if (mapped) return mapped;

    // 有 id 但没有状态，可能还在处理中
    if (safeGet<string>(response, "id")) {
      return "processing";
    }

    return null;
  },

  extractVideoUrls(response: unknown): string[] {
    const urls: string[] = [];

    // 从 response.videos 数组提取
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

    // 从顶层 video_url 提取
    const topLevelUrl = safeGet<string>(response, "video_url");
    if (topLevelUrl) urls.push(topLevelUrl);

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

    // { detail: "..." } 字符串格式
    const detailStr = safeGet<string>(response, "detail");
    if (detailStr && typeof detailStr === "string") {
      return { code: "DETAIL_ERROR", message: detailStr };
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
