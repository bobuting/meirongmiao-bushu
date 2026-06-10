/**
 * llm-transport.ts
 *
 * LLM 请求核心传输函数集合。
 * 从 app.ts 提取，负责 Gemini/OpenAI 文本请求、脚本载荷请求、分镜帧请求等核心逻辑。
 */

import type { AppContext } from "../../core/app-context.js";
import type { ProviderRouteKey } from "../../contracts/types.js";
import type { ErrorLogService } from "../error-log/error-log-service.js";
import { AppError } from "../../core/errors.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";
import { getLogger } from "../../core/logger/index.js";
import {
  postJsonWithTimeout,
  sanitizeHeaders,
} from "../../utils/http-request.js";
import { compactUnknownText } from "../../utils/text.js";
import { extractJsonObject } from "../utils/json-utils.js";
import { normalizeScriptPayload, assertRealScriptContent } from "../reverse/script-parser.js";
import { buildGeminiEndpointCandidates } from "../../modules/gemini-provider-endpoints.js";
import type { ResolvedRouteProvider, } from "./provider-resolver.js";
import { resolveGeminiModelCandidates } from "./provider-resolver.js";
import {
  extractGeminiTextContent,
  extractGeminiGroundingSources,
  parseGeminiApiKey,
  buildGeminiImageParts,
  summarizeGeminiRequestBody,
  GEMINI_DEFAULT_SAFETY_SETTINGS,
  type LlmPlainTextResult,
  type LlmImageInput,
  type LlmRequestOptions,
} from "./gemini-utils.js";
import { extractUpstreamErrorMessage, extractOpenAiTextContent, buildOpenAiVisionUserContent, summarizeOpenAiRequestBody } from "./openai-utils.js";
import {
  createLlmDebugRecord,
  finalizeLlmDebugRecordSuccess,
  finalizeLlmDebugRecordError,
} from "./llm-debug-recorder.js";
import { skillLoader } from "../skills/index.js";

// 提示词模板代码常量
const PROMPT_CODE_SCRIPT_PLANNER_STRICT = "script_planner_strict";
const PROMPT_CODE_SCRIPT_PLANNER_LENIENT = "script_planner_lenient";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 预构建的 Gemini 请求信息 */
export interface PrebuiltGeminiRequestInfo {
  endpoint: string;
  headers: Record<string, string>;
  headersJson: string;
  bodyJson: string;
  model: string;
}

/** LLM 调试记录选项（用于底层统一记录） */
export interface LlmDebugOptions {
  /** 应用上下文（必须提供才能启用调试记录） */
  ctx?: AppContext;
  /** 错误日志服务（可选，用于记录 LLM 调用失败） */
  errorLogService?: ErrorLogService;
  /** 路由键（用于记录审计，默认 script_generation） */
  routeKey?: ProviderRouteKey;
  /** 业务场景描述 */
  businessContext?: string;
  /** 项目 ID */
  projectId?: string;
  /** 用户 ID */
  userId?: string;
  /** 关联的用户任务 ID（用于追溯成本） */
  asyncJobId?: string;
  /** 是否有媒体输入（图片或视频） */
  hasMedia?: "image" | "video";
  /** 预构建的请求信息（用于创建时立即显示） */
  prebuiltRequestInfo?: PrebuiltGeminiRequestInfo;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 预构建 Gemini 请求信息（用于调试记录创建时立即显示）
 * 只使用第一个候选，不重试
 */
function prebuildGeminiRequestInfo(
  provider: ResolvedRouteProvider,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  requestOptions: LlmRequestOptions = {},
): PrebuiltGeminiRequestInfo {
  const candidates = resolveGeminiModelCandidates(provider);
  const apiKey = parseGeminiApiKey(provider.secret);

  // 只使用第一个候选
  const model = candidates[0] ?? provider.model;
  const endpointCandidates = buildGeminiEndpointCandidates(provider, model, apiKey);
  const endpoint = endpointCandidates[0];

  // 构建请求体（预构建时不加载图片 base64，但保留结构一致）
  const actualUserPrompt = userPrompt.trim() || "你是优秀的分析员";
  const userParts: Array<Record<string, unknown>> = [{ text: actualUserPrompt }];
  if (requestOptions.imageInputs && requestOptions.imageInputs.length > 0) {
    // 添加图片占位符（显示 URL 文本，不加载 base64）
    for (const img of requestOptions.imageInputs) {
      if (img?.url?.trim()) {
        userParts.push({ text: `[image-url: ${img.url.trim()}]` });
      }
    }
  }
  const generationConfig: Record<string, unknown> = { temperature };
  if (requestOptions.maxTokens) {
    generationConfig.maxOutputTokens = requestOptions.maxTokens;
  }

  const requestBody: Record<string, unknown> = {
    contents: [{ role: "user", parts: userParts }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig,
    safetySettings: GEMINI_DEFAULT_SAFETY_SETTINGS,
  };

  const headers = sanitizeHeaders(endpoint.headers);

  return {
    endpoint: endpoint.url,
    headers,
    headersJson: JSON.stringify(headers),
    bodyJson: JSON.stringify(requestBody),
    model,
  };
}

/**
 * 预构建 OpenAI 兼容协议请求信息（用于调试记录创建时立即显示）
 * 构建完整请求体（data URL 脱敏，不截断）
 */
function prebuildOpenAiRequestInfo(
  provider: ResolvedRouteProvider,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  requestOptions: LlmRequestOptions = {},
): PrebuiltGeminiRequestInfo {
  const endpoint = provider.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${provider.secret}`,
    "Content-Type": "application/json",
  };
  const actualUserPrompt = userPrompt.trim() || "你是优秀的分析员";

  // 构建 user message content（支持 vision）
  const visionContent = buildOpenAiVisionUserContent(actualUserPrompt, requestOptions.imageInputs);
  const userMessageContent = visionContent ?? actualUserPrompt;

  // 追加视频输入（与 requestOpenAiPlainText 实际发送的结构一致）
  let finalUserContent: string | Array<Record<string, unknown>> = userMessageContent;
  if (requestOptions.videoInput) {
    let videoUrl: string;
    if (requestOptions.videoInput.videoUrl) {
      videoUrl = requestOptions.videoInput.videoUrl;
    } else if (requestOptions.videoInput.base64) {
      videoUrl = `data:${requestOptions.videoInput.mimeType};base64,${requestOptions.videoInput.base64}`;
    } else {
      videoUrl = "";
    }
    const videoPart = videoUrl ? { type: "video_url", video_url: { url: videoUrl } } : null;
    if (videoPart) {
      if (Array.isArray(userMessageContent)) {
        finalUserContent = [...userMessageContent, videoPart];
      } else {
        finalUserContent = [
          { type: "text", text: userMessageContent },
          videoPart,
        ];
      }
    }
  }

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: finalUserContent },
  ];
  const requestBody: Record<string, unknown> = {
    model: provider.model,
    messages,
    temperature,
  };
  if (requestOptions.maxTokens) {
    requestBody.max_tokens = requestOptions.maxTokens;
  }

  return {
    endpoint,
    headers: sanitizeHeaders(headers),
    headersJson: JSON.stringify(sanitizeHeaders(headers)),
    bodyJson: JSON.stringify(requestBody),
    model: provider.model,
  };
}

/** 在底层统一创建和完成调试记录 */
async function withDebugRecording<T>(
  options: LlmDebugOptions | undefined,
  provider: ResolvedRouteProvider,
  messages: Array<{ role: string; content: string }>,
  executor: () => Promise<T>,
): Promise<T> {
  if (!options?.ctx) {
    return executor();
  }

  // 创建记录时包含预构建的请求信息
  const debugRecord = createLlmDebugRecord(options.ctx, {
    routeKey: options.routeKey ?? "unknown" as ProviderRouteKey,
    businessContext: options.businessContext ?? "LLM 调用",
    projectId: options.projectId,
    userId: options.userId,
    asyncJobId: options.asyncJobId,
    messages,
    provider,
    hasMedia: options.hasMedia,
    actualEndpoint: options.prebuiltRequestInfo?.endpoint,
    requestHeadersJson: options.prebuiltRequestInfo?.headersJson,
    requestBodyJson: options.prebuiltRequestInfo?.bodyJson,
  });

  try {
    const result = await executor();
    const responseText = typeof result === "string" ? result : (result as { text?: string })?.text ?? "";
    const endpoint = options.prebuiltRequestInfo?.endpoint;
    finalizeLlmDebugRecordSuccess(options.ctx, {
      auditId: debugRecord.auditId,
      startedAt: debugRecord.startedAt,
      actualModel: provider.model,
      responseText,
      ...(endpoint ? { actualEndpoint: endpoint } : {}),
      ...(options.prebuiltRequestInfo?.headersJson ? { requestHeadersJson: options.prebuiltRequestInfo.headersJson } : {}),
      ...(options.prebuiltRequestInfo?.bodyJson ? { requestBodyJson: options.prebuiltRequestInfo.bodyJson } : {}),
    });
    return result;
  } catch (error) {
    const errorCode = error instanceof AppError ? error.code : "LLM_ERROR";
    const errorMessage = error instanceof Error ? error.message : String(error);

    const endpoint = options.prebuiltRequestInfo?.endpoint;
    finalizeLlmDebugRecordError(options.ctx, {
      auditId: debugRecord.auditId,
      startedAt: debugRecord.startedAt,
      errorCode,
      errorMessage,
      ...(endpoint ? { actualEndpoint: endpoint } : {}),
      ...(options.prebuiltRequestInfo?.headersJson ? { requestHeadersJson: options.prebuiltRequestInfo.headersJson } : {}),
      ...(options.prebuiltRequestInfo?.bodyJson ? { requestBodyJson: options.prebuiltRequestInfo.bodyJson } : {}),
    });

    // 记录 LLM 错误（可选功能）
    if (options.errorLogService) {
      const llmInput = messages.map(m => `${m.role}: ${m.content}`).join("\n\n");
      options.errorLogService.logLlmError(error as Error, {
        llmModel: provider.model,
        llmInput,
        sourceModule: "llm-transport",
        projectId: options.projectId,
        userId: options.userId,
        apiPath: options.routeKey,
      });
    }

    throw error;
  }
}

// ---------------------------------------------------------------------------
// 函数实现
// ---------------------------------------------------------------------------

/** 追加图片引用到提示词（用于不支持原生 vision 的 Provider） */
export function appendImageReferencesToPrompt(
  userPrompt: string,
  imageInputs: LlmImageInput[] | undefined,
): string {
  const items = (imageInputs ?? []).filter((item) => Boolean(item?.url?.trim())).slice(0, 3);
  if (items.length < 1) {
    return userPrompt;
  }
  const lines = items
    .map((item, index) => {
      const label = item.label?.trim() || `参考图${index + 1}`;
      return `${label}: ${item.url.trim()}`;
    })
    .join("\n");
  return `${userPrompt}\n\n参考图片（仅URL文本，需结合内容理解）：\n${lines}`;
}

/** Gemini 视频请求（单个视频 part + 文本，无重试） */
export async function requestGeminiPlainTextWithVideoPart(
  provider: ResolvedRouteProvider,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  videoPart: Record<string, unknown>,
  requestOptions: LlmRequestOptions & LlmDebugOptions = {},
): Promise<LlmPlainTextResult> {
  // 冻结积分（防止并发白嫖）
  const { freezeId } = await freezeCredit(requestOptions);

  const requestTimeoutMs = Math.max(1_000, Number(provider.timeoutMs ?? requestOptions.timeoutMsOverride));
  const candidates = resolveGeminiModelCandidates(provider);
  const apiKey = parseGeminiApiKey(provider.secret);

  // 只使用第一个候选，不重试
  const model = candidates[0] ?? provider.model;
  const actualUserPrompt = userPrompt.trim() || "你是优秀的分析员";
  const generationConfig: Record<string, unknown> = { temperature };
  if (requestOptions.maxTokens) {
    generationConfig.maxOutputTokens = requestOptions.maxTokens;
  }
  const requestBody: Record<string, unknown> = {
    contents: [{ role: "user", parts: [videoPart, { text: actualUserPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig,
    safetySettings: GEMINI_DEFAULT_SAFETY_SETTINGS,
  };
  if (provider.options?.geminiGroundingEnabled || requestOptions.forceGeminiGrounding) {
    requestBody.tools = [{ googleSearch: {} }];
  }

  const endpointCandidates = buildGeminiEndpointCandidates(provider, model, apiKey);
  const endpoint = endpointCandidates[0];
  const requestHeaders = sanitizeHeaders(endpoint.headers);

  // 调试记录（如果有 ctx）
  const debugRecord = requestOptions.ctx ? createLlmDebugRecord(requestOptions.ctx, {
    routeKey: requestOptions.routeKey ?? "unknown" as ProviderRouteKey,
    businessContext: requestOptions.businessContext ?? "Gemini 视频请求",
    projectId: requestOptions.projectId,
    userId: requestOptions.userId,
    asyncJobId: requestOptions.asyncJobId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: actualUserPrompt },
    ],
    provider,
    hasMedia: "video",
    actualEndpoint: endpoint.url,
    requestHeadersJson: JSON.stringify(requestHeaders),
    requestBodyJson: summarizeGeminiRequestBody(requestBody),
  }) : null;

  try {
    const data = await postJsonWithTimeout(endpoint.url, requestBody, endpoint.headers, requestTimeoutMs);
    const upstreamError = extractUpstreamErrorMessage(data);
    if (upstreamError) {
      throw new AppError(502, "LLM_PROVIDER_ERROR", `upstream error: ${upstreamError}; response=${compactUnknownText(data, 1200)}`);
    }
    const text = extractGeminiTextContent(data).trim();
    if (!text) {
      throw new AppError(502, "LLM_EMPTY_RESPONSE", `empty content; response=${compactUnknownText(data, 1200)}`);
    }

    // 成功时更新调试记录
    if (debugRecord) {
      finalizeLlmDebugRecordSuccess(requestOptions.ctx!, {
        auditId: debugRecord.auditId,
        startedAt: debugRecord.startedAt,
        actualModel: model,
        responseText: text,
      });
    }

    // 成功后扣减冻结积分
    if (freezeId) {
      await deductFrozenCredit(requestOptions, freezeId, "llm_text");
    }

    return {
      text,
      groundingSources: extractGeminiGroundingSources(data),
      debugTrace: {
        endpoint: endpoint.url,
        model,
        requestHeaders,
        requestBody: summarizeGeminiRequestBody(requestBody),
        response: compactUnknownText(data, 1200),
      },
    };
  } catch (error) {
    // 失败后解冻积分
    if (freezeId) {
      await unfreezeCredit(requestOptions, freezeId);
    }
    // 失败时更新调试记录
    if (debugRecord) {
      const errorCode = error instanceof AppError ? error.code : "LLM_ERROR";
      const errorMessage = error instanceof Error ? error.message : String(error);
      finalizeLlmDebugRecordError(requestOptions.ctx!, {
        auditId: debugRecord.auditId,
        startedAt: debugRecord.startedAt,
        errorCode,
        errorMessage,
      });
    }
    throw error;
  }
}


/** Gemini 文本请求（支持图片 parts，无重试） */
export async function requestGeminiPlainText(
  provider: ResolvedRouteProvider,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  requestOptions: LlmRequestOptions = {},
): Promise<LlmPlainTextResult> {
  const requestTimeoutMs = Math.max(1_000, Number(provider.timeoutMs ?? requestOptions.timeoutMsOverride));
  const candidates = resolveGeminiModelCandidates(provider);
  const apiKey = parseGeminiApiKey(provider.secret);
  const imageParts = await buildGeminiImageParts(requestOptions.imageInputs, requestTimeoutMs);

  // 只使用第一个候选，不重试
  const model = candidates[0] ?? provider.model;
  const actualUserPrompt = userPrompt.trim() || "你是优秀的分析员";
  const userParts: Array<Record<string, unknown>> = [{ text: actualUserPrompt }];
  for (const imagePart of imageParts) {
    userParts.push(imagePart);
  }
  const generationConfig: Record<string, unknown> = { temperature };
  if (requestOptions.maxTokens) {
    generationConfig.maxOutputTokens = requestOptions.maxTokens;
  }
  const requestBody: Record<string, unknown> = {
    contents: [{ role: "user", parts: userParts }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig,
    safetySettings: GEMINI_DEFAULT_SAFETY_SETTINGS,
  };
  if (provider.options?.geminiGroundingEnabled || requestOptions.forceGeminiGrounding) {
    requestBody.tools = [{ googleSearch: {} }];
  }

  const endpointCandidates = buildGeminiEndpointCandidates(provider, model, apiKey);
  const endpoint = endpointCandidates[0];
  const requestHeaders = sanitizeHeaders(endpoint.headers);

  const data = await postJsonWithTimeout(endpoint.url, requestBody, endpoint.headers, requestTimeoutMs);
  const upstreamError = extractUpstreamErrorMessage(data);
  if (upstreamError) {
    throw new AppError(502, "LLM_PROVIDER_ERROR", `upstream error: ${upstreamError}; response=${compactUnknownText(data, 1200)}`);
  }
  const text = extractGeminiTextContent(data).trim();
  if (!text) {
    throw new AppError(502, "LLM_EMPTY_RESPONSE", `empty content; response=${compactUnknownText(data, 1200)}`);
  }
  return {
    text,
    groundingSources: extractGeminiGroundingSources(data),
    debugTrace: {
      endpoint: endpoint.url,
      model,
      requestHeaders,
      requestBody: summarizeGeminiRequestBody(requestBody),
      response: compactUnknownText(data, 1200),
    },
  };
}

/** OpenAI 兼容协议文本请求（支持识图 vision + 视频，无重试） */
export async function requestOpenAiPlainText(
  provider: ResolvedRouteProvider,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  requestOptions: LlmRequestOptions = {},
): Promise<LlmPlainTextResult> {
  const requestTimeoutMs = Math.max(1_000, Number(provider.timeoutMs ?? requestOptions.timeoutMsOverride));
  const model = provider.model;
  const actualUserPrompt = userPrompt.trim() || "你是优秀的分析员";

  // 构建消息内容（支持 vision + video）
  let userMessageContent: string | Array<Record<string, unknown>> = actualUserPrompt;
  const visionContent = buildOpenAiVisionUserContent(actualUserPrompt, requestOptions.imageInputs);
  if (visionContent) {
    userMessageContent = visionContent;
  }

  // 追加视频输入（优先使用远程 URL，避免 base64 超限）
  if (requestOptions.videoInput) {
    let videoUrl: string;
    if (requestOptions.videoInput.videoUrl) {
      // 有远程 URL 直接使用
      videoUrl = requestOptions.videoInput.videoUrl;
    } else if (requestOptions.videoInput.base64) {
      // 回退到 base64 data URL
      videoUrl = `data:${requestOptions.videoInput.mimeType};base64,${requestOptions.videoInput.base64}`;
    } else {
      videoUrl = "";
    }
    const videoPart = videoUrl ? { type: "video_url", video_url: { url: videoUrl } } : null;
    if (videoPart) {
      if (Array.isArray(userMessageContent)) {
        userMessageContent.push(videoPart);
      } else {
        userMessageContent = [
          { type: "text", text: userMessageContent },
          videoPart,
        ];
      }
    }
  }

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessageContent },
  ];

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    temperature,
  };
  if (requestOptions.maxTokens) {
    requestBody.max_tokens = requestOptions.maxTokens;
  }

  // OpenAI Chat Completions 标准端点路径
  const endpoint = provider.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${provider.secret}`,
    "Content-Type": "application/json",
  };

  const data = await postJsonWithTimeout(endpoint, requestBody, requestHeaders, requestTimeoutMs);
  const upstreamError = extractUpstreamErrorMessage(data);
  if (upstreamError) {
    throw new AppError(502, "LLM_PROVIDER_ERROR", `upstream error: ${upstreamError}; response=${compactUnknownText(data, 1200)}`);
  }
  const text = extractOpenAiTextContent(data).trim();
  if (!text) {
    throw new AppError(502, "LLM_EMPTY_RESPONSE", `empty content; response=${compactUnknownText(data, 1200)}`);
  }
  return {
    text,
    groundingSources: [],
    debugTrace: {
      endpoint,
      model,
      requestHeaders: sanitizeHeaders(requestHeaders),
      requestBody: summarizeOpenAiRequestBody({ model, messages }),
      response: compactUnknownText(data, 1200),
    },
  };
}

/** OpenAI 兼容协议-视觉理解（图生文，无重试） */
export async function requestOpenAiImageToText(
  provider: ResolvedRouteProvider,
  imageUrl: string,
  userPrompt: string,
  systemPrompt: string,
  requestOptions: LlmRequestOptions = {},
): Promise<LlmPlainTextResult> {
  const requestTimeoutMs = Math.max(1_000, Number(provider.timeoutMs ?? requestOptions.timeoutMsOverride));
  const model = provider.model;
  const actualUserPrompt = userPrompt.trim() || "描述这张图片的内容";

  // 构建 vision 消息内容
  const userMessageContent: Array<Record<string, unknown>> = [
    { type: "text", text: actualUserPrompt },
  ];

  // 添加图片（支持 URL 或 base64 data URL）
  const trimmedImageUrl = imageUrl.trim();
  if (trimmedImageUrl) {
    if (/^https?:\/\//i.test(trimmedImageUrl) || /^data:image\//i.test(trimmedImageUrl)) {
      userMessageContent.push({
        type: "image_url",
        image_url: { url: trimmedImageUrl },
      });
    }
  }

  // 构建消息列表（有 system prompt 时才添加）
  const messages: Array<Record<string, unknown>> = [];
  if (systemPrompt.trim()) {
    messages.push({ role: "system", content: systemPrompt.trim() });
  }
  messages.push({ role: "user", content: userMessageContent });

  const requestBody: Record<string, unknown> = {
    model,
    messages,
  };

  const endpoint = provider.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${provider.secret}`,
    "Content-Type": "application/json",
  };

  const data = await postJsonWithTimeout(endpoint, requestBody, requestHeaders, requestTimeoutMs);
  const upstreamError = extractUpstreamErrorMessage(data);
  if (upstreamError) {
    throw new AppError(502, "LLM_PROVIDER_ERROR", `upstream error: ${upstreamError}; response=${compactUnknownText(data, 1200)}`);
  }
  const text = extractOpenAiTextContent(data).trim();
  if (!text) {
    throw new AppError(502, "LLM_EMPTY_RESPONSE", `empty content; response=${compactUnknownText(data, 1200)}`);
  }
  return {
    text,
    groundingSources: [],
    debugTrace: {
      endpoint,
      model,
      requestHeaders: sanitizeHeaders(requestHeaders),
      requestBody: summarizeOpenAiRequestBody({ model, messages }),
      response: compactUnknownText(data, 1200),
    },
  };
}

/** 提取 DashScope 搜索来源 */
function extractDashScopeGroundingSources(data: unknown): Array<{ title: string; url: string }> {
  const output = (data as { output?: Record<string, unknown> } | undefined)?.output;
  if (!output || typeof output !== "object") return [];

  // DashScope search info can be in two locations:
  // 1. output.choices[0].message.search_info (inside the message)
  // 2. output.search_info (top level, older format)
  const choices = output.choices as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = choices[0]?.message as Record<string, unknown> | undefined;
    if (message) {
      const searchInfo = (message.search_info ?? message.searchInfo) as Record<string, unknown> | undefined;
      if (searchInfo) {
        const results = Array.isArray(searchInfo.search_results) ? searchInfo.search_results : [];
        return extractGroundingResults(results);
      }
    }
  }

  // Fallback: top-level search_info
  const searchInfo = (output.search_info ?? output.searchInfo) as Record<string, unknown> | undefined;
  if (!searchInfo || typeof searchInfo !== "object") return [];
  const results = Array.isArray(searchInfo.search_results) ? searchInfo.search_results : [];
  return extractGroundingResults(results);
}

function extractGroundingResults(results: unknown[]): Array<{ title: string; url: string }> {
  return results
    .filter((r) => r && typeof r === "object")
    .map((r) => ({
      title: String((r as Record<string, unknown>).title ?? "").trim() || "Search Source",
      url: String((r as Record<string, unknown>).url ?? (r as Record<string, unknown>).link ?? "").trim(),
    }))
    .filter((s) => s.url.length > 0);
}

/** 提取 DashScope 原生协议响应中的文本内容 */
function extractDashScopeTextContent(data: unknown): string {
  // DashScope 原生协议：{ output: { choices: [{ message: { content: "..." } }] } }
  const output = (data as { output?: Record<string, unknown> } | undefined)?.output;
  if (!output || typeof output !== "object") return "";
  const choices = (output.choices ?? output.choices) as Array<{ message?: { content?: unknown } }> | undefined;
  if (!Array.isArray(choices)) return "";
  const content = choices[0]?.message?.content ?? "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item === "string" ? item : (item as { text?: string }).text ?? ""))
      .join("\n");
  }
  return "";
}

/** 构建 DashScope 原生 API 端点 URL */
function buildDashScopeEndpointUrl(baseUrl: string): string {
  const origin = new URL(baseUrl).origin;
  return `${origin}/api/v1/services/aigc/text-generation/generation`;
}

/** 预构建 DashScope 原生协议请求信息 */
function prebuildDashScopeRequestInfo(
  provider: ResolvedRouteProvider,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  requestOptions: LlmRequestOptions = {},
): PrebuiltGeminiRequestInfo {
  const endpoint = buildDashScopeEndpointUrl(provider.baseUrl);
  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${provider.secret}`,
    "Content-Type": "application/json",
  };

  // DashScope text-generation 端点的 content 必须是纯字符串，不支持多模态数组
  // 图片 URL 以文本形式拼入 userPrompt
  const actualUserPrompt = userPrompt.trim() || "你是优秀的分析员";
  const userContent = appendImageReferencesToPrompt(actualUserPrompt, requestOptions.imageInputs);

  const requestBody = {
    model: provider.model,
    input: {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    },
    parameters: {
      enable_search: true,
      forced_search: true,
      enable_thinking: false,
      search_options: {
        search_strategy: "agent",
        enable_source: true,
      },
      result_format: "message",
    },
  };

  return {
    endpoint,
    headers: sanitizeHeaders(requestHeaders),
    headersJson: JSON.stringify(sanitizeHeaders(requestHeaders)),
    bodyJson: JSON.stringify(requestBody),
    model: provider.model,
  };
}

/** DashScope 原生协议文本请求（支持联网搜索 + 结构化来源，无重试） */
async function requestDashScopePlainText(
  provider: ResolvedRouteProvider,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  requestOptions: LlmRequestOptions = {},
): Promise<LlmPlainTextResult> {
  const requestTimeoutMs = Math.max(1_000, Number(provider.timeoutMs ?? requestOptions.timeoutMsOverride));
  const model = provider.model;
  const actualUserPrompt = userPrompt.trim() || "你是优秀的分析员";
  // DashScope text-generation 端点的 content 必须是纯字符串，图片 URL 以文本形式拼接
  const userContent = appendImageReferencesToPrompt(actualUserPrompt, requestOptions.imageInputs);

  const parameters: Record<string, unknown> = {
    enable_search: true,
    enable_thinking: false,
    search_options: {
      forced_search: true,
      search_strategy: "agent",
      enable_source: true,
    },
    temperature,
    result_format: "message",
  };
  if (requestOptions.maxTokens) {
    parameters.max_tokens = requestOptions.maxTokens;
  }

  const requestBody: Record<string, unknown> = {
    model,
    input: {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    },
    parameters,
  };

  const endpoint = buildDashScopeEndpointUrl(provider.baseUrl);
  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${provider.secret}`,
    "Content-Type": "application/json",
  };

  const data = await postJsonWithTimeout(endpoint, requestBody, requestHeaders, requestTimeoutMs);
  const upstreamError = extractUpstreamErrorMessage(data);
  if (upstreamError) {
    throw new AppError(502, "LLM_PROVIDER_ERROR", `upstream error: ${upstreamError}; response=${compactUnknownText(data, 1200)}`);
  }
  const text = extractDashScopeTextContent(data).trim();
  if (!text) {
    throw new AppError(502, "LLM_EMPTY_RESPONSE", `empty content; response=${compactUnknownText(data, 1200)}`);
  }
  return {
    text,
    groundingSources: extractDashScopeGroundingSources(data),
    debugTrace: {
      endpoint,
      model,
      requestHeaders: sanitizeHeaders(requestHeaders),
      requestBody: JSON.stringify({ model, messages: requestBody.input }, null, 2).slice(0, 2000),
      response: compactUnknownText(data, 1200),
    },
  };
}

/** DashScope 流式文本请求（SSE，支持 thinking + 联网搜索 + 搜索来源同时返回） */
async function requestDashScopeStreamText(
  provider: ResolvedRouteProvider,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  requestOptions: LlmRequestOptions = {},
): Promise<LlmPlainTextResult> {
  const requestTimeoutMs = Math.max(1_000, Number(provider.timeoutMs ?? requestOptions.timeoutMsOverride));
  const model = provider.model;
  const actualUserPrompt = userPrompt.trim() || "你是优秀的分析员";
  // DashScope 流式端点 content 必须是纯字符串，图片 URL 以文本形式拼接
  const userContent = appendImageReferencesToPrompt(actualUserPrompt, requestOptions.imageInputs);

  const parameters: Record<string, unknown> = {
    enable_search: true,
    enable_thinking: true,
    incremental_output: true,
    search_options: {
      forced_search: true,
      search_strategy: "agent",
      enable_source: true,
    },
    temperature,
    result_format: "message",
  };
  if (requestOptions.maxTokens) {
    parameters.max_tokens = requestOptions.maxTokens;
  }

  const requestBody: Record<string, unknown> = {
    model,
    input: {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    },
    parameters,
  };

  const endpoint = buildDashScopeEndpointUrl(provider.baseUrl);
  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${provider.secret}`,
    "Content-Type": "application/json",
    "X-DashScope-SSE": "enable",
  };

  // 使用 fetch 接收 SSE 流
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

  let fullText = "";
  let searchInfo: unknown = null;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new AppError(
        response.status,
        "LLM_PROVIDER_ERROR",
        `HTTP ${response.status} ${response.statusText}; responseHeaders=${compactUnknownText(Object.fromEntries(response.headers.entries()), 400)}; responseBody=${raw.slice(0, 1200).trim()}`
      );
    }

    if (!response.body) {
      throw new AppError(502, "LLM_PROVIDER_ERROR", "empty response body from DashScope stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 解析 SSE 事件
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // 保留未完成的行

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        if (trimmed.startsWith("data:")) {
          const dataStr = trimmed.slice(5).trim();
          try {
            const event = JSON.parse(dataStr) as Record<string, unknown>;

            // 提取搜索来源（首包或独立 search_info 事件）
            if (event.output && typeof event.output === "object") {
              const output = event.output as Record<string, unknown>;
              if (output.search_info) {
                searchInfo = output.search_info;
              }

              // 提取文本内容
              const choices = output.choices as Array<Record<string, unknown>> | undefined;
              if (Array.isArray(choices) && choices.length > 0) {
                const message = choices[0].message as Record<string, unknown> | undefined;
                if (message?.content && typeof message.content === "string") {
                  fullText += message.content;
                }
              }
            }
          } catch {
            // 忽略非 JSON 行
          }
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }

  if (!fullText.trim()) {
    throw new AppError(502, "LLM_EMPTY_RESPONSE", "empty content from DashScope stream");
  }

  const groundingSources = searchInfo
    ? extractGroundingInfoSources(searchInfo)
    : [];

  return {
    text: fullText.trim(),
    groundingSources,
    debugTrace: {
      endpoint,
      model,
      requestHeaders: sanitizeHeaders(requestHeaders),
      requestBody: JSON.stringify({ model, messages: requestBody.input }, null, 2).slice(0, 2000),
      response: `[stream] ${fullText.trim().slice(0, 200)}`,
    },
  };
}

/** 提取 DashScope 流式 search_info 中的搜索来源 */
function extractGroundingInfoSources(searchInfo: unknown): Array<{ title: string; url: string }> {
  if (!searchInfo || typeof searchInfo !== "object") return [];
  const results = (searchInfo as Record<string, unknown>).search_results;
  if (!Array.isArray(results)) return [];
  return results
    .filter((r) => r && typeof r === "object")
    .map((r) => ({
      title: String((r as Record<string, unknown>).title ?? "").trim() || "Search Source",
      url: String((r as Record<string, unknown>).url ?? (r as Record<string, unknown>).link ?? "").trim(),
    }))
    .filter((s) => s.url.length > 0);
}

/** 根据 callMode 选择传输策略 */
export function resolveCallMode(provider: ResolvedRouteProvider): ResolvedRouteProvider["callMode"] {
  return provider.callMode;
}

/**
 * @deprecated 使用 resolveCallMode() 替代。向后兼容导出。
 * 判断 provider 是否使用 OpenAI 兼容协议
 */
export function isOpenAiCompatibleProvider(provider: ResolvedRouteProvider): boolean {
  const baseUrl = provider.baseUrl.toLowerCase();
  return (
    baseUrl.includes("dashscope.aliyuncs.com") ||
    baseUrl.includes("maas.aliyuncs.com") ||
    baseUrl.includes("api.modelscope.cn")
  );
}

const creditLog = getLogger("credit-transport");

/**
 * 冻结积分（LLM 调用前调用，防止并发白嫖）
 * 返回冻结记录ID，null 表示跳过冻结（未配置成本或免费操作）
 * 余额不足时抛 402
 */
export async function freezeCredit(
  debugOptions: LlmDebugOptions,
): Promise<{ freezeId: string | null }> {
  const { ctx, routeKey, userId } = debugOptions;
  if (!ctx || !routeKey || !userId || userId === "system") return { freezeId: null };

  const creditCost = await ctx.creditPricingService.getCost(routeKey);
  if (creditCost <= 0) return { freezeId: null };

  const freezeId = await ctx.creditService.freeze(userId, creditCost, {
    routeKey,
    operation: "llm_generation",
    projectId: debugOptions.projectId,
  });
  return { freezeId };
}

/**
 * 解冻积分（LLM 调用失败时调用）
 */
export async function unfreezeCredit(
  debugOptions: LlmDebugOptions,
  freezeId: string,
): Promise<void> {
  const { ctx, userId } = debugOptions;
  if (!ctx || !userId) return;

  try {
    await ctx.creditService.unfreeze(userId, freezeId);
  } catch (error) {
    creditLog.error({ err: error, freezeId, userId }, "积分解冻失败");
  }
}

/**
 * 扣减冻结积分（LLM 调用成功后调用）
 * 条件：debugOptions 中必须包含 ctx + userId，且 freezeId 有效
 */
export async function deductFrozenCredit(
  debugOptions: LlmDebugOptions,
  freezeId: string,
  type: "llm_text" | "llm_image",
): Promise<void> {
  const { ctx, routeKey, userId } = debugOptions;
  if (!ctx || !userId) return;

  const creditCost = await ctx.creditPricingService.getCost(routeKey ?? "");
  if (creditCost <= 0) return;

  try {
    await ctx.creditService.deductFrozen(userId, freezeId, creditCost);
  } catch (error) {
    creditLog.error({ err: error, freezeId, userId, routeKey }, "冻结积分扣减失败（LLM 调用已完成）");
  }
}

/** 带元数据的 LLM 文本请求（按 callMode 路由，使用冻结机制防止白嫖） */
export async function requestLlmPlainTextWithMetadata(
  provider: ResolvedRouteProvider,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.3,
  requestOptions: LlmRequestOptions & LlmDebugOptions = {},
): Promise<LlmPlainTextResult> {
  // 冻结积分（防止并发白嫖）
  const { freezeId } = await freezeCredit(requestOptions);

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  // 补充媒体 URL 到 messages 供审计记录使用
  if (requestOptions.imageInputs && requestOptions.imageInputs.length > 0) {
    const imageUrls = requestOptions.imageInputs.map(img => img.url);
    messages.push({ role: "images", content: JSON.stringify(imageUrls) });
  }
  if (requestOptions.videoInput && requestOptions.videoInput.videoUrl) {
    messages.push({ role: "video", content: requestOptions.videoInput.videoUrl });
  } else if (requestOptions.videoInput?.base64 && requestOptions.videoInput?.mimeType) {
    messages.push({ role: "video", content: `data:${requestOptions.videoInput.mimeType};base64,...(base64)` });
  }

  const callMode = resolveCallMode(provider);

  // 根据 callMode 选择预构建函数
  const prebuiltRequestInfo = callMode === "gemini"
    ? prebuildGeminiRequestInfo(provider, systemPrompt, userPrompt, temperature, { ...requestOptions })
    : callMode === "dashscope" || callMode === "dashscope-stream"
      ? prebuildDashScopeRequestInfo(provider, systemPrompt, userPrompt, temperature, requestOptions)
      : prebuildOpenAiRequestInfo(provider, systemPrompt, userPrompt, temperature, { ...requestOptions });

  try {
    const result = await withDebugRecording(
      { ...requestOptions, prebuiltRequestInfo },
      provider,
      messages,
      async () => {
        if (callMode === "gemini") {
          return requestGeminiPlainText(provider, systemPrompt, userPrompt, temperature, requestOptions);
        }
        if (callMode === "dashscope") {
          return requestDashScopePlainText(provider, systemPrompt, userPrompt, temperature, requestOptions);
        }
        if (callMode === "dashscope-stream") {
          return requestDashScopeStreamText(provider, systemPrompt, userPrompt, temperature, requestOptions);
        }
        return requestOpenAiPlainText(provider, systemPrompt, userPrompt, temperature, requestOptions);
      },
    );

    // 成功后扣减冻结积分
    if (freezeId) {
      await deductFrozenCredit(requestOptions, freezeId, "llm_text");
    }

    return result;
  } catch (error) {
    // 失败后解冻积分
    if (freezeId) {
      await unfreezeCredit(requestOptions, freezeId);
    }
    throw error;
  }
}

/** LLM 纯文本请求（统一入口，返回文本字符串） */
export async function requestLlmPlainText(
  provider: ResolvedRouteProvider,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.3,
  requestOptions: LlmRequestOptions & LlmDebugOptions = {},
): Promise<string> {
  const result = await requestLlmPlainTextWithMetadata(
    provider,
    systemPrompt,
    userPrompt,
    temperature,
    requestOptions,
  );
  return result.text;
}

/** LLM 脚本载荷请求（宽松模式，解析失败返回占位符） */
export async function requestLlmScriptPayload(
  provider: ResolvedRouteProvider,
  userPrompt: string,
  debugOptions: LlmDebugOptions = {},
): Promise<{
  basicInfo: string;
  roleTable: string;
  outfitTable: string;
  storyboard: string;
  rawText: string;
}> {
  const { system: systemPrompt, user: renderedUserPrompt } = await skillLoader.render(PROMPT_CODE_SCRIPT_PLANNER_STRICT, { userPrompt });
  const text = await requestLlmPlainText(
    provider,
    systemPrompt,
    renderedUserPrompt,
    0.3,
    debugOptions,
  );
  const payload = normalizeScriptPayload(extractJsonObject(text));
  if (!payload) {
    return {
      basicInfo: text.trim().slice(0, 1000) || "basic:external",
      roleTable: "role-table",
      outfitTable: "outfit-table",
      storyboard: "storyboard-table",
      rawText: text,
    };
  }
  return { ...payload, rawText: text };
}

/** LLM 脚本载荷请求（严格模式，解析失败抛出错误） */
export async function requestLlmScriptPayloadStrict(
  provider: ResolvedRouteProvider,
  userPrompt: string,
  debugOptions: LlmDebugOptions = {},
): Promise<{
  basicInfo: string;
  roleTable: string;
  outfitTable: string;
  storyboard: string;
  rawText: string;
}> {
  const { system: systemPrompt, user: renderedUserPrompt } = await skillLoader.render(PROMPT_CODE_SCRIPT_PLANNER_STRICT, { userPrompt });
  const text = await requestLlmPlainText(
    provider,
    systemPrompt,
    renderedUserPrompt,
    0.3,
    debugOptions,
  );
  const payload = normalizeScriptPayload(extractJsonObject(text));
  if (!payload) {
    throw new AppError(502, "LLM_RESPONSE_INVALID", "LLM script payload is not json");
  }
  return {
    basicInfo: assertRealScriptContent(payload.basicInfo),
    roleTable: payload.roleTable,
    outfitTable: payload.outfitTable,
    storyboard: payload.storyboard,
    rawText: text,
  };
}

/** LLM 脚本载荷请求（宽松模式，解析失败返回模板文本） */
export async function requestLlmScriptPayloadLenient(
  provider: ResolvedRouteProvider,
  userPrompt: string,
  debugOptions: LlmDebugOptions = {},
): Promise<{
  basicInfo: string;
  roleTable: string;
  outfitTable: string;
  storyboard: string;
  rawText: string;
}> {
  const { system: systemPrompt, user: renderedUserPrompt } = await skillLoader.render(PROMPT_CODE_SCRIPT_PLANNER_LENIENT, { userPrompt });
  const text = await requestLlmPlainText(
    provider,
    systemPrompt,
    renderedUserPrompt,
    0.3,
    debugOptions,
  );
  const payload = normalizeScriptPayload(extractJsonObject(text));
  if (payload) {
    return {
      basicInfo: assertRealScriptContent(payload.basicInfo),
      roleTable: payload.roleTable,
      outfitTable: payload.outfitTable,
      storyboard: payload.storyboard,
      rawText: text,
    };
  }
  return {
    basicInfo: assertRealScriptContent(text),
    roleTable: "角色分工：按视频中主要人物与叙事关系补全。",
    outfitTable: "服装建议：延续原视频视觉风格，保留主体识别锚点。",
    storyboard: "分镜建议：按开场钩子-信息展开-结尾引导三段式组织。",
    rawText: text,
  };
}

// ---------------------------------------------------------------------------
// Provider Chain 重试机制
// ---------------------------------------------------------------------------

/** 判断错误是否可重试（尝试下一个 provider） */
export function isRetryableLlmError(error: unknown): boolean {
  if (!(error instanceof AppError)) return false;

  // 不可重试的 HTTP 状态码：认证失败、权限不足、模型不存在
  const nonRetryableStatus = [401, 403, 404];
  if (nonRetryableStatus.includes(error.statusCode)) return false;

  // 可重试的错误码：网络层面、上游错误、限流、超时
  const retryableCodes = [
    "LLM_PROVIDER_ERROR",    // 上游 5xx
    "LLM_TIMEOUT",           // 超时（如果有单独定义）
    "LLM_EMPTY_RESPONSE",    // 空响应（可尝试其他模型）
    "TIMEOUT",               // 通用超时
  ];

  // HTTP 429 限流可重试
  if (error.statusCode === 429) return true;

  // HTTP 5xx 服务器错误可重试
  if (error.statusCode >= 500 && error.statusCode < 600) return true;

  return retryableCodes.includes(error.code);
}

import type { LlmDebugAttempt } from "./llm-debug-recorder.js";
import {
  appendLlmDebugRecordAttempt,
  finalizeLlmDebugRecordChainExhausted,
} from "./llm-debug-recorder.js";
import { resolveRouteProviderChain } from "./provider-resolver.js";

/** 带 Provider Chain 重试的 LLM 文本请求 */
export async function requestLlmPlainTextWithChainRetry(
  providers: ResolvedRouteProvider[],
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.3,
  requestOptions: LlmRequestOptions & LlmDebugOptions = {},
): Promise<LlmPlainTextResult> {
  if (providers.length < 1) {
    throw new AppError(503, "PROVIDER_CHAIN_EMPTY", "No providers available");
  }

  const { freezeId } = await freezeCredit(requestOptions);

  // 创建审计记录（pending 状态）
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const debugRecord = requestOptions.ctx
    ? createLlmDebugRecord(requestOptions.ctx, {
        routeKey: requestOptions.routeKey ?? "unknown" as ProviderRouteKey,
        businessContext: requestOptions.businessContext ?? "LLM Chain Retry",
        projectId: requestOptions.projectId,
        userId: requestOptions.userId,
        asyncJobId: requestOptions.asyncJobId,
        messages,
        provider: providers[0],
        hasMedia: requestOptions.hasMedia,
      })
    : null;

  const attempts: LlmDebugAttempt[] = [];
  const startedAt = requestOptions.ctx?.clock.now() ?? Date.now();

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const attemptStart = requestOptions.ctx?.clock.now() ?? Date.now();

    try {
      const result = await requestLlmPlainTextWithMetadata(
        provider,
        systemPrompt,
        userPrompt,
        temperature,
        { ...requestOptions, ctx: undefined }, // 不让底层创建审计
      );

      // 成功：记录这次尝试，finalize 审计
      attempts.push({
        sequence: i + 1,
        providerId: provider.id,
        model: provider.model,
        paramsSummary: `temp=${temperature}`,
        status: "success",
        latencyMs: (requestOptions.ctx?.clock.now() ?? Date.now()) - attemptStart,
        errorCode: null,
        errorMessage: null,
        fallbackReason: i > 0 ? `retry after previous provider failed` : null,
      });

      if (debugRecord && requestOptions.ctx) {
        finalizeLlmDebugRecordSuccess(requestOptions.ctx, {
          auditId: debugRecord.auditId,
          startedAt,
          actualModel: provider.model,
          responseText: result.text,
          attempts,
        });
      }

      if (freezeId) {
        await deductFrozenCredit(requestOptions, freezeId, "llm_text");
      }

      return result;
    } catch (error) {
      const errorCode = error instanceof AppError ? error.code : "LLM_ERROR";
      const errorMessage = error instanceof Error ? error.message : String(error);
      const latencyMs = (requestOptions.ctx?.clock.now() ?? Date.now()) - attemptStart;

      // 记录失败的尝试
      attempts.push({
        sequence: i + 1,
        providerId: provider.id,
        model: provider.model,
        paramsSummary: `temp=${temperature}`,
        status: "error",
        latencyMs,
        errorCode,
        errorMessage: errorMessage.slice(0, 500),
        fallbackReason: null,
      });

      // 实时追加 attempt（前端可看到尝试链增长）
      if (debugRecord && requestOptions.ctx) {
        appendLlmDebugRecordAttempt(requestOptions.ctx, {
          auditId: debugRecord.auditId,
          attempt: attempts[attempts.length - 1],
        });
      }

      // 判断是否可重试
      const isLastProvider = i === providers.length - 1;
      const shouldRetry = isRetryableLlmError(error) && !isLastProvider;

      if (!shouldRetry) {
        // 不可重试 或 最后一个 provider：finalize 并抛错
        if (debugRecord && requestOptions.ctx) {
          finalizeLlmDebugRecordChainExhausted(requestOptions.ctx, {
            auditId: debugRecord.auditId,
            startedAt,
            attempts,
            lastErrorCode: errorCode,
            lastErrorMessage: errorMessage,
          });
        }

        if (freezeId) {
          await unfreezeCredit(requestOptions, freezeId);
        }

        throw error;
      }

      // 可重试：继续下一个 provider
      continue;
    }
  }

  // 理论上不会到这里（for 循环应该已经处理了所有情况）
  // 但作为兜底，确保 cleanup 完成
  if (debugRecord && requestOptions.ctx) {
    finalizeLlmDebugRecordChainExhausted(requestOptions.ctx, {
      auditId: debugRecord.auditId,
      startedAt,
      attempts,
      lastErrorCode: "CHAIN_EXHAUSTED",
      lastErrorMessage: "Unexpected: loop completed without return or throw",
    });
  }
  if (freezeId) {
    await unfreezeCredit(requestOptions, freezeId);
  }
  throw new AppError(502, "CHAIN_EXHAUSTED", "All providers failed");
}

// ---------------------------------------------------------------------------
// 类型重新导出（供外部模块使用）
// ---------------------------------------------------------------------------
export type { ResolvedRouteProvider } from "./provider-resolver.js";
export type { LlmPlainTextResult, LlmImageInput, LlmRequestOptions } from "./gemini-utils.js";
export { resolveRouteProvider, resolveRouteProviderChain } from "./provider-resolver.js";
