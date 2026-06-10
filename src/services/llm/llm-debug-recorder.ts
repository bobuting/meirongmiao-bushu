/**
 * llm-debug-recorder.ts
 *
 * LLM 调试记录统一包装函数。
 * 捕获调用位置、入参信息，记录到 provider_call_audits 表。
 */

import type { AppContext } from "../../core/app-context.js";
import type { ProviderRouteKey, ProviderCallAudit, ProviderCallMode } from "../../contracts/types.js";
import type { ResolvedRouteProvider } from "./provider-resolver.js";
import { compactTextLine } from "../../utils/text.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** LLM 调试记录输入参数 */
export interface LlmDebugRecordInput {
  routeKey: ProviderRouteKey;
  businessContext: string;        // 业务场景名称，如 "Step3 脚本生成"
  projectId?: string;
  userId?: string;
  /** 关联的用户任务 ID（用于追溯成本） */
  asyncJobId?: string;
  messages: Array<{ role: string; content: string }>;
  provider: ResolvedRouteProvider;
  /** 调用协议模式 */
  callMode?: ProviderCallMode | string;
  /** 是否有媒体输入（图片或视频） */
  hasMedia?: "image" | "video" | null;
  /** 实际调用的 API 地址 */
  actualEndpoint?: string | null;
  /** 请求头 JSON */
  requestHeadersJson?: string | null;
  /** 请求体摘要 JSON */
  requestBodyJson?: string | null;
  /** 配对标识（Submit + Query 共享同一值，用于前端配对展示） */
  requestId?: string;
}

/** LLM 调试记录结果 */
export interface LlmDebugRecordResult {
  auditId: string;
  startedAt: number;
}

/** 重试尝试记录 */
export interface LlmDebugAttempt {
  sequence: number;
  providerId: string;
  model: string;
  paramsSummary: string;
  status: "success" | "error" | "timeout";
  latencyMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  fallbackReason: string | null;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 捕获调用栈 */
function captureCallStack(): string {
  try {
    const stack = new Error().stack ?? "";
    const lines = stack
      .split("\n")
      .filter((line) => line.includes("src/") && !line.includes("node_modules"))
      .map((line) => line.trim())
      .slice(0, 5);
    return lines.join("\n");
  } catch {
    return "调用栈捕获失败";
  }
}

/** 构建调用上下文 */
function buildCallContext(business: string, stack: string): string {
  const locationMatch = stack.match(/src\/([^:]+):(\d+)/);
  const location = locationMatch
    ? `src/${locationMatch[1]}:${locationMatch[2]}`
    : "unknown";
  return `业务场景: ${business}\n代码位置: ${location}\n调用栈: ${stack}`;
}

/** 从 URL 中提取 query 参数为 Record */
function extractQueryParams(url: string | null | undefined): Record<string, string> {
  if (!url) return {};
  try {
    const { searchParams } = new URL(url);
    const params: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      // 脱敏：key/token 类参数只保留前 4 字符
      if (/key|token|secret|password/i.test(key)) {
        params[key] = value.length > 4 ? `${value.slice(0, 4)}***` : "***";
      } else {
        params[key] = value;
      }
    }
    return params;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

/**
 * 创建 LLM 调试记录
 * 在 LLM 调用发起时调用，返回记录 ID 和开始时间
 */
export function createLlmDebugRecord(
  ctx: AppContext,
  input: LlmDebugRecordInput,
): LlmDebugRecordResult {
  const startedAt = ctx.clock.now();
  const callStack = captureCallStack();
  const callContext = buildCallContext(input.businessContext, callStack);
  const messagesJson = JSON.stringify(input.messages);

  // 从 actualEndpoint 自动提取 query 参数
  const queryParams = extractQueryParams(input.actualEndpoint);
  const queryParamsJson = Object.keys(queryParams).length > 0 ? JSON.stringify(queryParams) : null;

  // 构建 requestSummary：使用 key=value 格式，按 "; " 分隔
  // 前端 parseRequestSummary 通过匹配 "key=" 固定前缀解析，不再用 indexOf 子串匹配
  const requestSummaryParts: string[] = [];
  const systemMsg = input.messages.find(m => m.role === "system");
  const userMsg = input.messages.find(m => m.role === "user");
  const promptMsg = input.messages.find(m => m.role === "prompt");
  const imagesMsg = input.messages.find(m => m.role === "images" || m.role === "reference_images");
  const paramsMsg = input.messages.find(m => m.role === "params");
  if (systemMsg) {
    requestSummaryParts.push(`system=${compactTextLine(systemMsg.content, 280)}`);
  }
  if (userMsg) {
    requestSummaryParts.push(`user=${compactTextLine(userMsg.content, 280)}`);
  }
  if (promptMsg && !systemMsg && !userMsg) {
    // 图片生成场景：prompt 内容可能包含 "system=" 等字样
    // 用 § 作为内部转义符避免和分隔符冲突
    requestSummaryParts.push(`prompt=${compactTextLine(promptMsg.content, 280)}`);
  }
  if (imagesMsg) {
    requestSummaryParts.push(`images=${compactTextLine(imagesMsg.content, 120)}`);
  }
  if (paramsMsg) {
    requestSummaryParts.push(`params=${compactTextLine(paramsMsg.content, 120)}`);
  }
  if (input.hasMedia) {
    requestSummaryParts.push(`hasMedia=${input.hasMedia}`);
  }
  const requestSummary = requestSummaryParts.length > 0 ? requestSummaryParts.join("; ") : null;

  const audit = ctx.providerAdminService.recordCallAudit({
    providerId: input.provider.id,
    routeKey: input.routeKey,
    requestId: input.requestId ?? undefined,
    status: "pending",
    latencyMs: 0,
    cost: 0,
    errorCode: null,
    errorMessage: null,
    requestSummary,
    responseSummary: null,
    createdAt: startedAt,
    // 新增字段
    callContext,
    messagesJson,
    queryParamsJson,
    actualModel: input.provider.model,
    providerVendor: input.provider.vendor,
    providerBaseUrl: input.provider.baseUrl,
    projectId: input.projectId ?? null,
    userId: input.userId ?? null,
    asyncJobId: input.asyncJobId ?? null,
    // 请求信息（创建时就保存）
    actualEndpoint: input.actualEndpoint ?? null,
    requestHeadersJson: input.requestHeadersJson ?? null,
    requestBodyJson: input.requestBodyJson ?? null,
    callMode: (input.callMode ?? input.provider.callMode) as ProviderCallMode,
  });

  return {
    auditId: audit.id,
    startedAt,
  };
}

/**
 * 完成 LLM 调试记录（成功）
 */
export function finalizeLlmDebugRecordSuccess(
  ctx: AppContext,
  input: {
    auditId: string;
    startedAt: number;
    actualModel: string;
    responseText: string;
    actualEndpoint?: string | null;
    requestHeadersJson?: string | null;
    /** 真实请求体（在 HTTP 请求前构建） */
    requestBodyJson?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    ttftMs?: number;
    firstTokenAt?: number;
    /** 重试尝试链（包含所有成功的和失败的尝试） */
    attempts?: LlmDebugAttempt[];
  },
): void {
  const latencyMs = ctx.clock.now() - input.startedAt;
  const ttftMs = input.ttftMs ?? (input.firstTokenAt ? input.firstTokenAt - input.startedAt : null);

  ctx.providerAdminService.updateCallAudit({
    auditId: input.auditId,
    status: "success",
    latencyMs,
    responseSummary: input.responseText,
    actualModel: input.actualModel,
    // 仅在有真实值时传递，避免覆盖已有数据
    ...(input.actualEndpoint ? { actualEndpoint: input.actualEndpoint } : {}),
    ...(input.requestHeadersJson ? { requestHeadersJson: input.requestHeadersJson } : {}),
    ...(input.requestBodyJson ? { requestBodyJson: input.requestBodyJson } : {}),
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    ttftMs,
    // 重试尝试链
    attemptsJson: input.attempts ? JSON.stringify(input.attempts) : undefined,
  });
}

/**
 * 完成 LLM 调试记录（失败）
 */
export function finalizeLlmDebugRecordError(
  ctx: AppContext,
  input: {
    auditId: string;
    startedAt: number;
    errorCode: string;
    errorMessage: string;
    attempts?: LlmDebugAttempt[];
    /** 实际请求的 API 地址（失败时也应记录） */
    actualEndpoint?: string | null;
    /** 请求头 JSON（失败时也应记录） */
    requestHeadersJson?: string | null;
    /** 请求体摘要 JSON（失败时也应记录） */
    requestBodyJson?: string | null;
  },
): void {
  const latencyMs = ctx.clock.now() - input.startedAt;

  ctx.providerAdminService.updateCallAudit({
    auditId: input.auditId,
    status: "error",
    latencyMs,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    attemptsJson: input.attempts ? JSON.stringify(input.attempts) : null,
    // 仅在有真实值时传递，避免覆盖已有数据
    ...(input.actualEndpoint ? { actualEndpoint: input.actualEndpoint } : {}),
    ...(input.requestHeadersJson ? { requestHeadersJson: input.requestHeadersJson } : {}),
    ...(input.requestBodyJson ? { requestBodyJson: input.requestBodyJson } : {}),
  });
}

/**
 * 完成 LLM 调试记录（超时）
 */
export function finalizeLlmDebugRecordTimeout(
  ctx: AppContext,
  input: {
    auditId: string;
    startedAt: number;
    timeoutMs: number;
    attempts?: LlmDebugAttempt[];
  },
): void {
  const latencyMs = ctx.clock.now() - input.startedAt;

  ctx.providerAdminService.updateCallAudit({
    auditId: input.auditId,
    status: "timeout",
    latencyMs,
    errorCode: "TIMEOUT",
    errorMessage: `Request timeout after ${input.timeoutMs}ms`,
    attemptsJson: input.attempts ? JSON.stringify(input.attempts) : null,
  });
}

/**
 * 追加单次尝试记录（用于 Provider Chain 重试过程中实时更新）
 * 每次尝试失败后调用，前端可实时看到尝试链增长
 */
export function appendLlmDebugRecordAttempt(
  ctx: AppContext,
  input: {
    auditId: string;
    attempt: LlmDebugAttempt;
  },
): void {
  ctx.providerAdminService.appendCallAuditAttempt({
    auditId: input.auditId,
    attempt: input.attempt,
  });
}

/**
 * 完成 LLM 调试记录（Provider Chain 全部失败）
 * 所有 provider 都尝试失败后调用
 */
export function finalizeLlmDebugRecordChainExhausted(
  ctx: AppContext,
  input: {
    auditId: string;
    startedAt: number;
    attempts: LlmDebugAttempt[];
    lastErrorCode: string;
    lastErrorMessage: string;
  },
): void {
  const latencyMs = ctx.clock.now() - input.startedAt;
  const totalProviders = input.attempts.length;

  ctx.providerAdminService.updateCallAudit({
    auditId: input.auditId,
    status: "error",
    latencyMs,
    errorCode: "CHAIN_EXHAUSTED",
    errorMessage: `All ${totalProviders} providers failed. Last error: ${input.lastErrorMessage}`,
    attemptsJson: JSON.stringify(input.attempts),
  });
}