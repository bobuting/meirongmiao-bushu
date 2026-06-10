/**
 * AnimateAnyone 动作迁移响应提取器
 * 适用 callMode:
 * - animate-anyone-detect-bailian (图片检测，同步)
 * - animate-anyone-template-bailian (模板生成，异步)
 * - animate-anyone-video-bailian (视频生成，异步)
 *
 * 响应格式（阿里云百炼 DashScope）：
 *
 * 图片检测（同步）：
 * { output: { valid: true/false, reason?: string, suggestions?: string[] } }
 *
 * 模板生成（异步）：
 * - 创建: { output: { task_id: "...", task_status: "PENDING" }, request_id: "..." }
 * - 查询: { output: { task_status: "SUCCEEDED", template_id: "...", duration: number } }
 *
 * 视频生成（异步）：
 * - 创建: { output: { task_id: "...", task_status: "PENDING" }, request_id: "..." }
 * - 查询: { output: { task_status: "SUCCEEDED", video_url: "...", duration: number, width: number, height: number } }
 *
 * 状态枚举：PENDING / RUNNING / SUCCEEDED / FAILED / CANCELED / UNKNOWN
 */

import type {
  VideoTaskStatus,
  VideoTaskResponse,
  VideoResponseExtractor,
} from "../services/video/types.js";

/** 状态映射表（DashScope 使用大写状态） */
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
 * AnimateAnyone 图片检测响应提取器
 * 同步 API，无 taskId
 */
export const animateAnyoneDetectExtractor: VideoResponseExtractor = {
  extractTaskId(_response: unknown): string | null {
    // 同步 API 无 taskId
    return null;
  },

  extractTaskStatus(response: unknown): VideoTaskStatus | null {
    // 图片检测是同步 API，没有 task_status 字段
    // 根据 output.valid 判断是否成功
    const valid = safeGet<boolean>(response, "output", "valid");
    if (valid === true) return "succeeded";
    if (valid === false) return "failed";
    return null;
  },

  extractVideoUrls(_response: unknown): string[] {
    // 图片检测不返回视频 URL
    return [];
  },

  extractError(response: unknown): { code: string; message: string } | null {
    // { output: { valid: false, reason?: "...", suggestions?: [...] } }
    const valid = safeGet<boolean>(response, "output", "valid");
    if (valid === false) {
      const reason = safeGet<string>(response, "output", "reason") || "图片不合规";
      const suggestions = safeGet<string[]>(response, "output", "suggestions");
      const message = suggestions && suggestions.length > 0
        ? `${reason}; 建议: ${suggestions.join(", ")}`
        : reason;
      return { code: "IMAGE_INVALID", message };
    }

    // 顶层错误
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

    // 图片检测特有字段
    const valid = safeGet<boolean>(response, "output", "valid");
    const reason = safeGet<string>(response, "output", "reason");
    const suggestions = safeGet<string[]>(response, "output", "suggestions");

    return {
      taskId: null,
      status: status ?? (error ? "failed" : "pending"),
      videoUrls: [],
      error: error ?? undefined,
      metadata: {
        valid,
        reason,
        suggestions,
      },
    };
  },
};

/**
 * AnimateAnyone 模板生成响应提取器
 * 异步 API，支持 taskId 和 task_status
 */
export const animateAnyoneTemplateExtractor: VideoResponseExtractor = {
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

  extractVideoUrls(_response: unknown): string[] {
    // 模板生成不返回视频 URL，返回 template_id
    return [];
  },

  extractError(response: unknown): { code: string; message: string } | null {
    // { output: { task_status: "FAILED", code: "...", message: "..." } }
    const taskStatus = safeGet<string>(response, "output", "task_status");
    if (taskStatus?.toUpperCase() === "FAILED") {
      const code = safeGet<string>(response, "output", "code") || "TEMPLATE_FAILED";
      const message = safeGet<string>(response, "output", "message") ||
        safeGet<string>(response, "output", "msg") || "模板生成失败";
      return { code, message };
    }

    // 顶层错误
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
    const taskId = this.extractTaskId(response);

    // 模板生成特有字段
    const templateId = safeGet<string>(response, "output", "template_id");
    const duration = safeGet<number>(response, "output", "duration");

    // 有 templateId 时状态为成功
    let finalStatus = status;
    if (templateId && !error) {
      finalStatus = "succeeded";
    } else if (error) {
      finalStatus = "failed";
    }

    return {
      taskId,
      status: finalStatus ?? "pending",
      videoUrls: [],
      error: error ?? undefined,
      metadata: {
        templateId,
        duration,
      },
    };
  },
};

/**
 * AnimateAnyone 视频生成响应提取器
 * 异步 API，支持 taskId 和 task_status
 */
export const animateAnyoneVideoExtractor: VideoResponseExtractor = {
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
    // { output: { video_url: "..." } }
    const videoUrl = safeGet<string>(response, "output", "video_url");
    if (videoUrl) return [videoUrl];
    return [];
  },

  extractError(response: unknown): { code: string; message: string } | null {
    // { output: { task_status: "FAILED", code: "...", message: "..." } }
    const taskStatus = safeGet<string>(response, "output", "task_status");
    if (taskStatus?.toUpperCase() === "FAILED") {
      const code = safeGet<string>(response, "output", "code") || "VIDEO_FAILED";
      const message = safeGet<string>(response, "output", "message") ||
        safeGet<string>(response, "output", "msg") || "视频生成失败";
      return { code, message };
    }

    // 顶层错误
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

    // 视频生成特有字段
    const duration = safeGet<number>(response, "output", "duration");
    const width = safeGet<number>(response, "output", "width");
    const height = safeGet<number>(response, "output", "height");

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
      metadata: {
        videoDuration: duration,
        videoWidth: width,
        videoHeight: height,
      },
    };
  },
};