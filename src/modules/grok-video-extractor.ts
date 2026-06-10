/**
 * Grok 视频响应提取器
 * 适用 callMode: grok-video-yunwu
 *
 * 响应格式（云雾 API）：
 * - 创建: { id: "grok:xxx", status: "processing", status_update_time: 123 }
 * - 查询: { id: "xxx", status: "succeeded", video_url: "https://...", enhanced_prompt: "..." }
 * - 失败: { id: "xxx", status: "failed", error: "..." }
 *
 * 文档：https://yunwu.apifox.cn/api-384123355
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
  succeeded: "succeeded",
  success: "succeeded",
  completed: "succeeded",
  failed: "failed",
  error: "failed",
};

/**
 * Grok 视频响应提取器
 */
export const grokVideoExtractor: VideoResponseExtractor = {
  extractTaskId(response: unknown): string | null {
    if (!response || typeof response !== "object") return null;
    const obj = response as Record<string, unknown>;

    // Grok 返回 id 字段（可能带 "grok:" 前缀）
    if (typeof obj.id === "string" && obj.id) {
      return obj.id;
    }

    return null;
  },

  extractTaskStatus(response: unknown): VideoTaskStatus | null {
    if (!response || typeof response !== "object") return null;
    const obj = response as Record<string, unknown>;

    const rawStatus = obj.status;
    if (typeof rawStatus !== "string") return null;

    return STATUS_MAP[rawStatus.toLowerCase()] ?? null;
  },

  extractVideoUrls(response: unknown): string[] {
    if (!response || typeof response !== "object") return [];
    const obj = response as Record<string, unknown>;

    // Grok 直接返回 video_url 字段（单视频）
    if (typeof obj.video_url === "string" && obj.video_url) {
      return [obj.video_url];
    }

    return [];
  },

  extractError(response: unknown): { code: string; message: string } | null {
    if (!response || typeof response !== "object") return null;
    const obj = response as Record<string, unknown>;

    // 检查 error 字段
    if (obj.error) {
      if (typeof obj.error === "string") {
        return { code: "ERROR", message: obj.error };
      }
      if (typeof obj.error === "object" && obj.error !== null) {
        const errObj = obj.error as Record<string, unknown>;
        return {
          code: String(errObj.code ?? "ERROR"),
          message: String(errObj.message ?? "Unknown error"),
        };
      }
    }

    // status === "failed"
    if (obj.status === "failed") {
      return {
        code: "TASK_FAILED",
        message: String(obj.message ?? "视频生成失败"),
      };
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
