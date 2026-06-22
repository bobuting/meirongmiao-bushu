/**
 * VEO 视频响应提取器（才翔AI）
 * 适用 callMode: veo-video-caixiang
 *
 * 响应格式（才翔AI API）：
 * - 创建: { name: "models/veo-3.1-generate-preview/operations/abc123" } 或 { code: 200, data: { task_id: 123456 } }
 * - 查询: { task_id: "123456", state: "success", is_final: true, result_url: "https://..." }
 * - 失败: { task_id: "123456", state: "failed", error: "..." }
 *
 * 文档：docs/caixiang/veo3.1.md
 */

import type {
  VideoTaskStatus,
  VideoTaskResponse,
  VideoResponseExtractor,
} from "../services/video/types.js";

/** 状态映射表（才翔AI 使用 state 字段） */
const STATE_MAP: Record<string, VideoTaskStatus> = {
  pending: "pending",
  queued: "pending",
  running: "processing",
  success: "succeeded",
  completed: "succeeded",
  failed: "failed",
  error: "failed",
};

/**
 * 从响应中提取 data 对象（创建响应可能是嵌套结构）
 */
function extractDataObject(response: unknown): Record<string, unknown> | null {
  if (!response || typeof response !== "object") return null;
  const obj = response as Record<string, unknown>;

  // 创建响应：{ code, data: { task_id, ... }, msg }
  if (obj.data && typeof obj.data === "object") {
    return obj.data as Record<string, unknown>;
  }

  // 查询响应：直接返回根对象
  return obj;
}

/**
 * 从 VEO 创建响应的 name 字段提取操作 ID
 * 格式：models/veo-3.1-generate-preview/operations/abc123-def456
 */
function extractOperationIdFromName(name: string): string | null {
  // 尝试从 name 中提取 operations/ 后面的部分
  const match = name.match(/operations\/([^/]+)$/);
  if (match) {
    return match[1];
  }
  // 如果整个 name 就是 ID，直接返回
  return name;
}

/**
 * VEO 视频响应提取器（才翔AI）
 */
export const veoVideoCaixiangExtractor: VideoResponseExtractor = {
  extractTaskId(response: unknown): string | null {
    if (!response || typeof response !== "object") return null;
    const obj = response as Record<string, unknown>;

    // VEO 创建响应：{ name: "models/veo-3.1.../operations/xxx" }
    if (typeof obj.name === "string" && obj.name) {
      return extractOperationIdFromName(obj.name);
    }

    // 通用才翔AI 格式：{ data: { task_id: xxx } } 或 { task_id: xxx }
    const dataObj = extractDataObject(response);
    if (!dataObj) return null;

    // 才翔AI 返回 task_id 字段（可能是数字或字符串）
    if (dataObj.task_id !== undefined && dataObj.task_id !== null) {
      return String(dataObj.task_id);
    }
    // 创建响应可能返回 id 字段
    if (dataObj.id !== undefined && dataObj.id !== null) {
      return String(dataObj.id);
    }

    return null;
  },

  extractTaskStatus(response: unknown): VideoTaskStatus | null {
    const dataObj = extractDataObject(response);
    if (!dataObj) return null;

    // 才翔AI 使用 state 字段表示状态
    const rawState = dataObj.state;
    if (typeof rawState !== "string") return null;

    return STATE_MAP[rawState.toLowerCase()] ?? null;
  },

  extractVideoUrls(response: unknown): string[] {
    const dataObj = extractDataObject(response);
    if (!dataObj) return [];

    // 才翔AI 返回 result_url 字段（单视频）
    if (typeof dataObj.result_url === "string" && dataObj.result_url) {
      return [dataObj.result_url];
    }

    return [];
  },

  extractError(response: unknown): { code: string; message: string } | null {
    if (!response || typeof response !== "object") return null;
    const obj = response as Record<string, unknown>;

    // 创建响应错误：{ code: xxx, msg: "...", data: { "失败原因": [...] } }
    if (typeof obj.code === "number" && obj.code !== 200) {
      // 尝试提取 data.失败原因
      const dataObj = obj.data && typeof obj.data === "object" ? obj.data as Record<string, unknown> : null;
      const failReasons = dataObj?.["失败原因"];
      let detailMsg = String(obj.msg ?? "请求失败");
      if (Array.isArray(failReasons) && failReasons.length > 0) {
        detailMsg = `${detailMsg}: ${failReasons.join(", ")}`;
      }
      return {
        code: String(obj.code),
        message: detailMsg,
      };
    }

    const dataObj = extractDataObject(response);
    if (!dataObj) return null;

    // 检查 error 字段
    if (dataObj.error) {
      if (typeof dataObj.error === "string") {
        return { code: "ERROR", message: dataObj.error };
      }
      if (typeof dataObj.error === "object" && dataObj.error !== null) {
        const errObj = dataObj.error as Record<string, unknown>;
        return {
          code: String(errObj.code ?? "ERROR"),
          message: String(errObj.message ?? "Unknown error"),
        };
      }
    }

    // state === "failed"
    if (dataObj.state === "failed") {
      return {
        code: "TASK_FAILED",
        message: String(dataObj.message ?? dataObj.status ?? "视频生成失败"),
      };
    }

    return null;
  },

  parse(response: unknown): VideoTaskResponse {
    const error = this.extractError(response);
    const status = this.extractTaskStatus(response);
    const videoUrls = this.extractVideoUrls(response);
    const taskId = this.extractTaskId(response);

    // 才翔AI 用 is_final 判断终态
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
