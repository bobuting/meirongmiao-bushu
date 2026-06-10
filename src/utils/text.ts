/**
 * 文本处理工具函数
 */

import type { LlmRequestDebugTrace } from "../contracts/llm-types.js";

/**
 * 压缩文本为单行，截断到指定长度
 */
export function compactTextLine(value: string, maxLength = 1000): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * 压缩未知值为文本，截断到指定长度
 */
export function compactUnknownText(value: unknown, maxLength = 1000): string {
  if (typeof value === "string") {
    return value.trim().slice(0, maxLength);
  }
  try {
    return JSON.stringify(value).slice(0, maxLength);
  } catch {
    return String(value).slice(0, maxLength);
  }
}

/**
 * 格式化 LLM 调试追踪信息
 */
export function formatLlmDebugTrace(trace: LlmRequestDebugTrace | undefined): string {
  if (!trace) {
    return "none";
  }
  return [
    `endpoint=${trace.endpoint}`,
    `model=${trace.model}`,
    `requestHeaders=${compactUnknownText(trace.requestHeaders, 400)}`,
    `requestBody=${trace.requestBody}`,
    `response=${trace.response}`,
  ].join("; ");
}