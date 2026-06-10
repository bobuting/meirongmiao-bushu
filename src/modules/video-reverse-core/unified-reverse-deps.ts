/**
 * 统一依赖接口定义
 * 核心管道通过此接口接收外部依赖，实现依赖注入模式
 */

import type { ProviderRouteKey } from "../../contracts/provider-route-policy-contract.js";
import type { VideoHotTrendResolvedProvider, VideoHotTrendLlmPlainTextResult } from "../../contracts/video-hot-trend-sync-contract.js";

// ============================================================================
// 统一依赖接口
// ============================================================================

/**
 * 统一依赖接口（约 10 个核心方法）
 * 适配器将现有入口点的依赖接口包装为统一接口
 *
 * 简化说明：视频下载和 OSS 上传由调用方负责，核心管道只负责 LLM 调用
 */
export interface UnifiedReverseDeps {
  // ---- LLM ----

  /** 解析 Provider（使用调用方传入的 routeKeys fallback chain） */
  resolveProvider: (routeKeys: ProviderRouteKey[]) => Promise<VideoHotTrendResolvedProvider | null>;

  /** 调用 LLM（统一方法，优先使用 ossUrl 远程视频，回退到 base64 inline） */
  callLlm: (
    provider: VideoHotTrendResolvedProvider,
    systemPrompt: string,
    userPrompt: string,
    video: { base64: string; mimeType: string; ossUrl?: string | null },
    timeoutMs: number
  ) => Promise<VideoHotTrendLlmPlainTextResult>;

  // ---- 审计 ----

  /** 创建审计记录 */
  createAuditRecord: (input: {
    routeKey: ProviderRouteKey;
    businessContext: string;
    projectId?: string;
    userId?: string;
    messages: Array<{ role: string; content: string }>;
    modelParams: { temperature?: number; max_tokens?: number; top_p?: number };
    provider: VideoHotTrendResolvedProvider;
    /** 是否有媒体输入 */
    hasMedia?: "image" | "video";
    /** 实际调用的 API 地址（预构建） */
    actualEndpoint?: string;
    /** 请求头 JSON（预构建） */
    requestHeadersJson?: string;
    /** 请求体摘要 JSON（预构建） */
    requestBodyJson?: string;
  }) => { auditId: string; startedAt: number };

  /** 完成审计记录（成功） */
  finalizeAuditSuccess: (input: {
    auditId: string;
    startedAt: number;
    actualModel: string;
    responseText: string;
    /** 实际调用的 API 地址 */
    actualEndpoint?: string | null;
    /** 请求头 JSON */
    requestHeadersJson?: string | null;
    /** 请求体 JSON */
    requestBodyJson?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    ttftMs?: number;
  }) => void;

  /** 完成审计记录（失败） */
  finalizeAuditError: (input: {
    auditId: string;
    startedAt: number;
    errorCode: string;
    errorMessage: string;
    /** 实际调用的 API 地址 */
    actualEndpoint?: string | null;
    /** 请求头 JSON */
    requestHeadersJson?: string | null;
    /** 请求体 JSON */
    requestBodyJson?: string | null;
  }) => void;

  // ---- 工具方法 ----

  /** 从文本中提取 JSON */
  extractJsonValue: (text: string) => unknown | null;

  /** 日志 */
  log: {
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };

  /** 生成唯一 ID */
  generateId: () => string;

  /** 获取当前时间戳（毫秒） */
  now: () => number;
}