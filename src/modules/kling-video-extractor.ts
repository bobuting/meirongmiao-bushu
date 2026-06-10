/**
 * 可灵云雾视频响应提取器
 * 适用 callMode: kling-video-yunwu
 *
 * 响应格式：
 * - 创建: { code: 0, data: { task_id: "..." } }
 * - 查询: { code: 0, data: { task_status: "succeed", task_result: { videos: [{ url: "..." }] } } }
 * - 失败: { code: 1200, message: "..." }
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
  success: "succeeded",
  succeed: "succeeded",
  succeeded: "succeeded",
  failed: "failed",
  fail: "failed",
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
 * 可灵视频响应提取器
 */
export const klingVideoExtractor: VideoResponseExtractor = {
  extractTaskId(response: unknown): string | null {
    // { data: { task_id: "..." } }
    const taskIdFromData = safeGet<string>(response, "data", "task_id");
    if (taskIdFromData) return taskIdFromData;

    // { task_id: "..." }
    const taskIdFromRoot = safeGet<string>(response, "task_id");
    if (taskIdFromRoot) return taskIdFromRoot;

    return null;
  },

  extractTaskStatus(response: unknown): VideoTaskStatus | null {
    // 从 data.task_status 或 task_status 提取
    let rawStatus = safeGet<string>(response, "data", "task_status");
    if (!rawStatus) {
      rawStatus = safeGet<string>(response, "task_status");
    }

    if (!rawStatus) return null;

    // 映射为统一状态
    return STATUS_MAP[rawStatus.toLowerCase()] ?? null;
  },

  extractVideoUrls(response: unknown): string[] {
    const urls: string[] = [];

    // 从 task_result.videos 提取
    const extractFromTaskResult = (taskResult: unknown) => {
      const videos = safeGet<unknown[]>(taskResult, "videos");
      if (!Array.isArray(videos)) return;

      for (const video of videos) {
        if (video && typeof video === "object") {
          const url = safeGet<string>(video, "url");
          if (url) urls.push(url);
        }
      }
    };

    // { data: { task_result: { videos: [...] } } }
    const taskResultFromData = safeGet<unknown>(response, "data", "task_result");
    extractFromTaskResult(taskResultFromData);

    // { task_result: { videos: [...] } }
    const taskResultFromRoot = safeGet<unknown>(response, "task_result");
    extractFromTaskResult(taskResultFromRoot);

    return [...new Set(urls)];
  },

  extractError(response: unknown): { code: string; message: string } | null {
    if (!response || typeof response !== "object") return null;
    const obj = response as Record<string, unknown>;

    // code 非 0 表示错误
    const code = obj.code;
    if (code !== undefined && code !== 0 && code !== "0") {
      const message = (obj.message as string) || `错误码: ${code}`;
      return { code: String(code), message };
    }

    // 检查 data 中的错误状态消息
    const taskStatusMsg = safeGet<string>(response, "data", "task_status_msg");
    const taskStatus = safeGet<string>(response, "data", "task_status");
    if (taskStatus === "failed" && taskStatusMsg) {
      return { code: "TASK_FAILED", message: taskStatusMsg };
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
