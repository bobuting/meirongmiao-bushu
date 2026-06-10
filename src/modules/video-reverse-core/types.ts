/**
 * 视频反推核心管道类型定义
 */

import type { ProviderRouteKey } from "../../contracts/provider-route-policy-contract.js";

// ============================================================================
// 错误码常量
// ============================================================================

/**
 * 核心管道错误码
 * 注意：VIDEO_DOWNLOAD_FAILED 已移除，下载由调用方负责
 */
export const CORE_REVERSE_ERROR_CODES = {
  NO_PROVIDER: "NO_PROVIDER",
  LLM_RESPONSE_INVALID: "LLM_RESPONSE_INVALID",
  LLM_CALL_FAILED: "LLM_CALL_FAILED",
} as const;

export type CoreReverseErrorCode = (typeof CORE_REVERSE_ERROR_CODES)[keyof typeof CORE_REVERSE_ERROR_CODES];

// ============================================================================
// 输入类型
// ============================================================================

/**
 * 审计上下文信息
 */
export interface CoreReverseAuditContext {
  routeKey: ProviderRouteKey;
  businessContext: string;
  projectId?: string;
  userId?: string;
}

/**
 * 核心管道输入
 * 调用方负责：下载视频、上传 OSS、传入 base64 和 ossUrl
 */
export interface CoreReverseInput {
  /** 视频原始 URL（可能需要解析，用于审计记录） */
  videoUrl: string;
  /** 已下载的视频 base64（由调用方提供） */
  videoBase64: string;
  /** 视频 MIME 类型 */
  videoMimeType: string;
  /** OSS 公开链接（由调用方上传后提供，用于 prompt） */
  ossUrl: string | null;
  /** 话题标签（可选，用于 prompt 构建） */
  topicLabel?: string;
  /** 话题 ID（可选，用于 prompt 构建） */
  topicId?: string;
  /** Provider fallback chain，由调用方传入 */
  routeKeys: ProviderRouteKey[];
  /** 审计上下文 */
  auditContext: CoreReverseAuditContext;
}

// ============================================================================
// 输出类型（结构化结果）
// ============================================================================

/**
 * 核心管道输出（结构化结果，包含 success/errorCode/errorMessage）
 * 设计原则：不抛异常，返回结构化结果，由调用方决定错误处理策略（per D-04）
 */
export interface CoreReverseOutput {
  /** 标准化后的 LLM 输出（成功时有效） */
  rawLlmOutput: unknown | null;
  /** 解析后的视频 URL */
  resolvedVideoUrl: string;
  /** 是否成功 */
  success: boolean;
  /** 错误码（失败时有效） */
  errorCode: CoreReverseErrorCode | null;
  /** 错误信息（失败时有效） */
  errorMessage: string | null;
}

// ============================================================================
// 错误处理策略接口
// ============================================================================

/**
 * LLM 反推错误处理策略接口
 * 调用方通过此接口定义错误处理语义（per D-05）
 */
export interface LlmReverseErrorPolicy {
  /** 批量入口：静默处理，不抛异常 */
  onBatchError: (output: CoreReverseOutput) => void;
  /** 用户入口：可抛异常或返回错误响应 */
  onUserError: (output: CoreReverseOutput) => void;
}