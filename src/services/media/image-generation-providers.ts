/**
 * image-generation-providers.ts
 *
 * 图像生成 Provider 调度入口。
 * 各 CallMode 的请求构建和响应提取封装在 image-callmodes/ 目录中。
 */

import type { AppContext } from "../../core/app-context.js";
import type { ProviderRouteKey } from "../../contracts/types.js";
import { ProviderCallMode } from "../../contracts/types.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";
import { AppError } from "../../core/errors.js";
import { getLogger } from "../../core/logger/index.js";
import {
  postJsonWithTimeout,
  toBearerToken,
  buildAuthHeaderCandidates,
} from "../../utils/http-request.js";
import { compactUnknownText } from "../../utils/text.js";
import { freezeCredit, unfreezeCredit, deductFrozenCredit } from "../llm/llm-transport.js";
import type { ResolvedRouteProvider } from "../llm/provider-resolver.js";
import { extractUpstreamErrorMessage } from "../llm/openai-utils.js";
import {
  createLlmDebugRecord,
  finalizeLlmDebugRecordSuccess,
  finalizeLlmDebugRecordError,
} from "../llm/llm-debug-recorder.js";
import {
  normalizeNanoBananaModelPath,
  extractProviderErrorMessage,
  extractNanoBananaRequestId,
  extractNanoBananaStatus,
  padImageUrls,
  shouldTreatProviderMessageAsFailure,
} from "./provider-response-extractors.js";
import { normalizeProviderTransportImageUrls } from "./image-utils.js";
import {
  getImageCallModeHandler,
  isSupportedImageCallMode,
} from "./image-callmodes/index.js";
import type { ImageCallModeOptions } from "./image-callmodes/index.js";
import {
  type JimengImageRatio,
  type JimengImageResolution,
  normalizeJimengImageRatio,
  normalizeJimengImageResolution,
} from "../../service/llm/llm-video.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 图像生成调试记录选项 */
export interface ImageGenerationDebugOptions {
  ctx?: AppContext;
  routeKey?: ProviderRouteKey;
  businessContext?: string;
  userId?: string;
  projectId?: string;
  messages?: Array<{ role: string; content: string }>;
}

// ---------------------------------------------------------------------------
// 调试记录辅助函数
// ---------------------------------------------------------------------------

function createImageDebugRecord(
  options: ImageGenerationDebugOptions | undefined,
  provider: ResolvedRouteProvider,
  prompt: string,
  prebuiltEndpoint?: string,
  requestHeaders?: Record<string, string>,
  requestBody?: Record<string, unknown>,
  referenceImages?: string[],
): { auditId: string; startedAt: number } | null {
  if (!options?.ctx) return null;

  let messages: Array<{ role: string; content: string }>;
  if (options.messages) {
    messages = options.messages;
  } else {
    messages = [{ role: "prompt", content: prompt }];
    if (referenceImages && referenceImages.length > 0) {
      messages.push({ role: "reference_images", content: referenceImages.join("\n") });
    }
  }

  return createLlmDebugRecord(options.ctx, {
    routeKey: options.routeKey ?? ProviderRouteKeys.IMAGE_GENERATION,
    businessContext: options.businessContext ?? "图像生成",
    userId: options.userId,
    projectId: options.projectId,
    messages,
    provider,
    actualEndpoint: prebuiltEndpoint ?? provider.baseUrl,
    requestHeadersJson: requestHeaders ? JSON.stringify(requestHeaders) : undefined,
    requestBodyJson: requestBody ? JSON.stringify(requestBody, null, 2) : undefined,
  });
}

function finalizeImageDebugSuccess(
  options: ImageGenerationDebugOptions | undefined,
  debugRecord: { auditId: string; startedAt: number } | null,
  provider: ResolvedRouteProvider,
  result: string[],
  actualEndpoint: string | null,
  requestBody: Record<string, unknown> | null,
): void {
  if (!options?.ctx || !debugRecord) return;
  finalizeLlmDebugRecordSuccess(options.ctx, {
    auditId: debugRecord.auditId,
    startedAt: debugRecord.startedAt,
    actualModel: provider.model,
    responseText: result.join("\n"),
    ...(actualEndpoint ? { actualEndpoint } : {}),
    ...(requestBody ? { requestBodyJson: JSON.stringify(requestBody, null, 2) } : {}),
  });
}

function finalizeImageDebugError(
  options: ImageGenerationDebugOptions | undefined,
  debugRecord: { auditId: string; startedAt: number } | null,
  provider: ResolvedRouteProvider,
  errorCode: string,
  errorMessage: string,
  actualEndpoint: string | null,
  requestBody: Record<string, unknown> | null,
): void {
  if (!options?.ctx || !debugRecord) return;
  finalizeLlmDebugRecordError(options.ctx, {
    auditId: debugRecord.auditId,
    startedAt: debugRecord.startedAt,
    errorCode,
    errorMessage,
    ...(actualEndpoint ? { actualEndpoint } : {}),
    ...(requestBody ? { requestBodyJson: JSON.stringify(requestBody, null, 2) } : {}),
  });
}

// ---------------------------------------------------------------------------
// HTTP 辅助
// ---------------------------------------------------------------------------

async function getJsonWithTimeout(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const response = await fetch(url, { method: "GET", headers, signal: controller.signal });
    const rawText = await response.text();
    let data: unknown = {};
    if (rawText.trim().length > 0) {
      try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${rawText.slice(0, 300)}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function postMultipartWithTimeout(
  url: string,
  formData: FormData,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "POST", headers, body: formData, signal: controller.signal });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new AppError(502, "IMAGE_PROVIDER_ERROR", `Grok Image Edit API 错误: ${response.status} ${errorText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// OpenAI 兼容格式响应提取（即梦等通用协议用，非 CallMode Handler 管理）
// ---------------------------------------------------------------------------

function extractOpenaiCompatibleImageUrls(data: unknown): string[] {
  const output: string[] = [];
  const root = (data ?? {}) as Record<string, unknown>;
  const dataArray = Array.isArray(root.data) ? root.data : [];
  for (const item of dataArray) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = String(record.url ?? "").trim();
    if (url && /^https?:\/\//i.test(url) && !output.includes(url)) {
      output.push(url);
    }
    const b64 = String(record.b64_json ?? "").trim();
    if (b64 && /^[A-Za-z0-9+/=\r\n]+$/.test(b64) && !output.includes(`data:image/png;base64,${b64}`)) {
      output.push(`data:image/png;base64,${b64}`);
    }
  }
  return output;
}

// ---------------------------------------------------------------------------
// Nano Banana 独立入口（含异步轮询）
// ---------------------------------------------------------------------------

const nanoBananaHandler = getImageCallModeHandler(ProviderCallMode.NANO_BANANA_IMAGE);

export async function requestNanoBananaImageUrls(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: {
    mode?: "text_to_image" | "image_to_image";
    images?: string[];
    count?: number;
  },
): Promise<{ urls: string[]; endpoint: string; requestBody: Record<string, unknown> }> {
  const { endpoint, headers, body } = await nanoBananaHandler.buildRequest(provider, prompt, options);

  const data = await postJsonWithTimeout(endpoint, body, headers, provider.timeoutMs);
  const providerMessage = extractProviderErrorMessage(data);
  const immediate = nanoBananaHandler.extractImageUrls(data);
  if (immediate.length > 0) {
    return { urls: padImageUrls(immediate, body.num_images as number), endpoint, requestBody: body };
  }

  // 异步轮询
  const requestId = extractNanoBananaRequestId(data);
  if (!requestId) {
    throw new AppError(502, "IMAGE_PROVIDER_ERROR", providerMessage ?? "NANO_BANANA_REQUEST_ID_MISSING");
  }

  const mode = options?.mode ?? "text_to_image";
  const modelPath = normalizeNanoBananaModelPath(provider.model, mode);
  const statusEndpoint = `${provider.baseUrl.replace(/\/+$/, "")}/api/${modelPath}/requests/${encodeURIComponent(requestId)}`;
  const deadline = Date.now() + Math.max(20_000, Math.min(180_000, provider.timeoutMs * 2));
  let attempt = 0;

  while (Date.now() < deadline) {
    if (attempt > 0) {
      const waitMs = Math.min(1500 + attempt * 350, 4000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    attempt += 1;

    const statusData = await getJsonWithTimeout(statusEndpoint, headers, provider.timeoutMs);
    const statusMessage = extractProviderErrorMessage(statusData);
    const urls = nanoBananaHandler.extractImageUrls(statusData);

    if (urls.length > 0) {
      return { urls: padImageUrls(urls, body.num_images as number), endpoint, requestBody: body };
    }

    const status = (extractNanoBananaStatus(statusData) ?? "").trim().toLowerCase();
    if (["error", "failed", "cancelled", "canceled", "timeout"].includes(status)) {
      throw new AppError(502, "IMAGE_PROVIDER_ERROR", statusMessage ?? `NANO_BANANA_${status.toUpperCase()}`);
    }
  }

  throw new AppError(502, "IMAGE_PROVIDER_ERROR", providerMessage ?? "NANO_BANANA_RESULT_TIMEOUT");
}

// ---------------------------------------------------------------------------
// Gemini 独立入口
// ---------------------------------------------------------------------------

const geminiHandler = getImageCallModeHandler(ProviderCallMode.GEMINI_IMAGE);
const geminiInlineHandler = getImageCallModeHandler(ProviderCallMode.GEMINI_IMAGE_INLINE);

export async function requestGeminiImageUrls(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: {
    mode?: "text_to_image" | "image_to_image";
    images?: string[];
    ratio?: JimengImageRatio;
    resolution?: JimengImageResolution;
    count?: number;
    temperature?: number;
    negativePrompt?: string;
  },
): Promise<{ urls: string[]; endpoint: string; requestBody: Record<string, unknown> }> {
  const mode = options?.mode ?? "text_to_image";
  if (mode === "image_to_image" && (!options?.images || options.images.length === 0)) {
    throw new AppError(400, "IMAGE_URL_REQUIRED", "image_to_image mode requires at least one imageUrl");
  }
  const count = Math.max(1, Math.min(4, Number(options?.count) || 1));

  const handler = provider.callMode === ProviderCallMode.GEMINI_IMAGE ? geminiHandler : geminiInlineHandler;
  const { endpoint, headers, body } = await handler.buildRequest(provider, prompt, options);

  const data = await postJsonWithTimeout(endpoint, body, headers, provider.timeoutMs);

  const upstreamError = extractUpstreamErrorMessage(data);
  if (upstreamError) {
    throw new AppError(502, "IMAGE_PROVIDER_ERROR", `upstream error: ${upstreamError}; response=${compactUnknownText(data, 1200)}`);
  }

  const urls = handler.extractImageUrls(data);
  if (urls.length > 0) {
    return { urls: padImageUrls(urls, count), endpoint, requestBody: body };
  }

  throw new AppError(502, "IMAGE_PROVIDER_ERROR", `Gemini image provider call failed: empty result; response=${compactUnknownText(data, 1200)}`);
}

// ---------------------------------------------------------------------------
// Seedream 独立入口
// ---------------------------------------------------------------------------

const seedreamHandler = getImageCallModeHandler(ProviderCallMode.SEEDREAM_IMAGE_ARK);

export async function requestSeedreamImageUrls(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: {
    mode?: "text_to_image" | "image_to_image";
    images?: string[];
    ratio?: JimengImageRatio;
    count?: number;
  },
): Promise<{ urls: string[]; endpoint: string; requestBody: Record<string, unknown> }> {
  const { endpoint, headers, body } = await seedreamHandler.buildRequest(provider, prompt, options);

  const data = await postJsonWithTimeout(endpoint, body, headers, provider.timeoutMs);
  const providerMessage = extractProviderErrorMessage(data);

  if (shouldTreatProviderMessageAsFailure(providerMessage)) {
    throw new AppError(502, "SEEDREAM_PROVIDER_ERROR", `${providerMessage}; endpoint=${endpoint}`);
  }

  const urls = seedreamHandler.extractImageUrls(data);
  if (urls.length > 0) {
    const count = Math.max(1, Math.min(4, Number(options?.count) || 4));
    return { urls: padImageUrls(urls, count), endpoint, requestBody: body };
  }

  throw new AppError(502, "SEEDREAM_EMPTY_RESULT", `Seedream 返回空结果; endpoint=${endpoint}; response=${compactUnknownText(data, 1200)}`);
}

// ---------------------------------------------------------------------------
// 通用即梦协议（无 callMode 的旧 provider 兼容）
// ---------------------------------------------------------------------------

async function requestGenericJimengImageUrlsInternal(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: {
    mode?: "text_to_image" | "image_to_image";
    images?: string[];
    ratio?: JimengImageRatio;
    resolution?: JimengImageResolution;
    count?: number;
  },
): Promise<{ urls: string[]; endpoint: string; requestBody: Record<string, unknown> }> {
  const mode = options?.mode ?? "text_to_image";
  const base = provider.baseUrl.replace(/\/+$/, "");

  const endpoint = (() => {
    const textSuffixes = ["/v1/images/generations", "/api/v1/images/generations", "/images/generations"];
    const editSuffixes = ["/v1/images/compositions", "/v1/images/edits", "/api/v1/images/compositions", "/images/edits"];
    const suffixes = mode === "image_to_image" ? editSuffixes : textSuffixes;
    for (const suffix of suffixes) {
      if (!base.toLowerCase().endsWith(suffix.toLowerCase())) {
        return `${base}${suffix}`;
      }
    }
    if (/\/images\/(generations|compositions|edits)$/i.test(base)) return base;
    return `${base}${suffixes[0]}`;
  })();

  const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor);
  const auth = authCandidates[0] ?? `Bearer ${provider.secret}`;
  const apiKey = auth.replace(/^Bearer\s+/i, "").trim();

  const ratio = normalizeJimengImageRatio(options?.ratio ?? process.env.JIMENG_IMAGE_RATIO, "16:9");
  const resolution = normalizeJimengImageResolution(options?.resolution ?? process.env.JIMENG_IMAGE_RESOLUTION, "1k");
  const normalizedImages = normalizeProviderTransportImageUrls(options?.images);
  const count = Math.max(1, Math.min(4, Number(options?.count) || 4));

  const body: Record<string, unknown> = {
    model: provider.model || "jimeng-4.5",
    prompt,
    ratio,
    resolution,
    negative_prompt: "no lowres, no blurry, no text, no watermark, without lowres, without blurry, without text, without watermark",
  };
  if (mode === "image_to_image" && normalizedImages.length) {
    body.images = normalizedImages;
  }

  const headers: Record<string, string> = { Authorization: auth };
  if (apiKey) headers["x-api-key"] = apiKey;

  const data = await postJsonWithTimeout(endpoint, body, headers, provider.timeoutMs);
  const providerMessage = extractProviderErrorMessage(data);

  if (shouldTreatProviderMessageAsFailure(providerMessage)) {
    throw new AppError(502, "IMAGE_PROVIDER_ERROR", `${providerMessage}; endpoint=${endpoint}`);
  }

  const urls = extractOpenaiCompatibleImageUrls(data);
  if (urls.length > 0) {
    return { urls: padImageUrls(urls, count), endpoint, requestBody: body };
  }

  throw new AppError(502, "IMAGE_PROVIDER_ERROR", providerMessage ?? `EMPTY_IMAGE_RESULT; endpoint=${endpoint}; response=${compactUnknownText(data, 1200)}`);
}

// ---------------------------------------------------------------------------
// 主调度入口（带积分冻结）
// ---------------------------------------------------------------------------

export async function requestLlmImageGenerationUrls(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: {
    mode?: "text_to_image" | "image_to_image";
    images?: string[];
    ratio?: string;
    resolution?: string;
    count?: number;
    temperature?: number;
    negativePrompt?: string;
    debugOptions?: ImageGenerationDebugOptions;
  },
): Promise<{ urls: string[]; endpoint: string; requestBody: Record<string, unknown> }> {
  const debug = options?.debugOptions;
  const { freezeId } = debug?.ctx && debug.routeKey && debug.userId
    ? await freezeCredit({ ctx: debug.ctx, routeKey: debug.routeKey, userId: debug.userId, projectId: debug.projectId })
    : { freezeId: null };

  try {
    const result = await requestLlmImageGenerationUrlsInner(provider, prompt, options);

    if (freezeId && debug?.ctx && debug.userId) {
      await deductFrozenCredit({ ctx: debug.ctx, routeKey: debug.routeKey, userId: debug.userId, projectId: debug.projectId }, freezeId, "llm_image");
    }

    return result;
  } catch (error) {
    if (freezeId && debug?.ctx && debug.userId) {
      await unfreezeCredit({ ctx: debug.ctx, routeKey: debug.routeKey, userId: debug.userId, projectId: debug.projectId }, freezeId);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 内部调度实现
// ---------------------------------------------------------------------------

async function requestLlmImageGenerationUrlsInner(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: {
    mode?: "text_to_image" | "image_to_image";
    images?: string[];
    ratio?: string;
    resolution?: string;
    count?: number;
    temperature?: number;
    negativePrompt?: string;
    debugOptions?: ImageGenerationDebugOptions;
  },
): Promise<{ urls: string[]; endpoint: string; requestBody: Record<string, unknown> }> {
  const callMode = provider.callMode;

  // negativePrompt 处理：WanX 支持原生，其他模型拼接到 prompt
  const finalPrompt = (() => {
    if (!options?.negativePrompt) return prompt;
    if (callMode === ProviderCallMode.WANX_IMAGE_BAILIAN) return prompt;
    return `${prompt}\n\n[Negative constraints] ${options.negativePrompt}`;
  })();

  // --- CallMode Handler 调度 ---

  // GROK_IMAGE_EDIT 特殊处理：multipart + 内联发送
  if (callMode === ProviderCallMode.GROK_IMAGE_EDIT) {
    return await handleGrokImageEdit(provider, finalPrompt, options);
  }

  // NANO_BANANA 特殊处理：异步轮询
  if (callMode === ProviderCallMode.NANO_BANANA_IMAGE) {
    return await handleNanoBanana(provider, finalPrompt, options);
  }

  // 通用 Handler 调度：已注册的 CallMode 统一走 Handler
  if (isSupportedImageCallMode(callMode)) {
    return await handleWithCallMode(provider, finalPrompt, options);
  }

  // 未注册的 callMode：走即梦通用协议（兼容旧 provider）
  return await requestGenericJimengImageUrlsInternal(provider, finalPrompt, {
    mode: options?.mode,
    images: options?.images,
    ratio: options?.ratio as JimengImageRatio | undefined,
    resolution: options?.resolution as JimengImageResolution | undefined,
    count: options?.count,
  });
}

// ---------------------------------------------------------------------------
// 通用 Handler 调度
// ---------------------------------------------------------------------------

async function handleWithCallMode(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: {
    mode?: "text_to_image" | "image_to_image";
    images?: string[];
    ratio?: string;
    resolution?: string;
    count?: number;
    temperature?: number;
    negativePrompt?: string;
    debugOptions?: ImageGenerationDebugOptions;
  },
): Promise<{ urls: string[]; endpoint: string; requestBody: Record<string, unknown> }> {
  const callMode = provider.callMode;
  const handler = getImageCallModeHandler(callMode);

  // Gemini 图生图模式校验（原始 switch-case 中存在）
  if (
    (callMode === ProviderCallMode.GEMINI_IMAGE || callMode === ProviderCallMode.GEMINI_IMAGE_INLINE) &&
    options?.mode === "image_to_image" && (!options?.images || options.images.length === 0)
  ) {
    throw new AppError(400, "IMAGE_URL_REQUIRED", "image_to_image mode requires at least one imageUrl");
  }

  const callModeOptions: ImageCallModeOptions = {
    mode: options?.mode,
    images: options?.images,
    ratio: options?.ratio,
    resolution: options?.resolution,
    count: options?.count,
    temperature: options?.temperature,
    negativePrompt: options?.negativePrompt,
  };

  const request = await handler.buildRequest(provider, prompt, callModeOptions);
  const returnableBody = { ...request.body };
  if (!returnableBody.model) returnableBody.model = provider.model;

  const debugRecord = createImageDebugRecord(
    options?.debugOptions,
    provider,
    prompt,
    request.endpoint,
    request.headers,
    returnableBody,
    options?.images,
  );

  try {
    const data = await postJsonWithTimeout(request.endpoint, request.body, request.headers, provider.timeoutMs);
    const urls = handler.extractImageUrls(data);

    // 各 CallMode 的默认 count（与原始 switch-case 一致）
    const defaultCounts: Partial<Record<ProviderCallMode, number>> = {
      [ProviderCallMode.OPENAI_IMAGE]: 1,
      [ProviderCallMode.GEMINI_IMAGE]: 1,
      [ProviderCallMode.GEMINI_IMAGE_INLINE]: 1,
      [ProviderCallMode.GROK_IMAGE]: 1,
      [ProviderCallMode.SEEDREAM_IMAGE_ARK]: 4,
      [ProviderCallMode.WANX_IMAGE_BAILIAN]: 4,
    };
    const defaultCount = defaultCounts[callMode] ?? 1;
    const count = Math.max(1, Math.min(4, Number(options?.count) || defaultCount));

    // OPENAI / GEMINI 始终 pad 到 1（不复制单张图），其他 pad 到 count
    const singleImageModes: Set<ProviderCallMode> = new Set([
      ProviderCallMode.OPENAI_IMAGE,
      ProviderCallMode.GEMINI_IMAGE,
      ProviderCallMode.GEMINI_IMAGE_INLINE,
    ]);
    const padCount = singleImageModes.has(callMode) ? 1 : count;

    if (urls.length > 0) {
      finalizeImageDebugSuccess(options?.debugOptions, debugRecord, provider, urls, request.endpoint, returnableBody);
      return { urls: padImageUrls(urls, padCount), endpoint: request.endpoint, requestBody: returnableBody };
    }

    // 空结果 → 检查错误信息
    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      finalizeImageDebugError(options?.debugOptions, debugRecord, provider, "IMAGE_PROVIDER_ERROR", providerMessage ?? "Provider returned error", request.endpoint, returnableBody);
      throw new AppError(502, "IMAGE_PROVIDER_ERROR", `${providerMessage}; endpoint=${request.endpoint}`);
    }

    finalizeImageDebugError(options?.debugOptions, debugRecord, provider, "EMPTY_IMAGE_RESULT", `Empty result; endpoint=${request.endpoint}; response=${compactUnknownText(data, 1200)}`, request.endpoint, returnableBody);
    throw new AppError(502, "IMAGE_PROVIDER_ERROR", `EMPTY_IMAGE_RESULT; endpoint=${request.endpoint}; response=${compactUnknownText(data, 1200)}`);
  } catch (error) {
    const errorCode = error instanceof AppError ? error.code : "IMAGE_PROVIDER_ERROR";
    const errorMessage = error instanceof Error ? error.message : String(error);

    const log = getLogger("image-generation");
    log.error({
      callMode,
      providerModel: provider.model,
      endpoint: request.endpoint,
      requestBody: returnableBody,
      errorCode,
      errorMessage,
    }, "[ImageGeneration] 图片生成失败");

    finalizeImageDebugError(options?.debugOptions, debugRecord, provider, errorCode, errorMessage, request.endpoint, returnableBody);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// NANO_BANANA 特殊调度（含异步轮询）
// ---------------------------------------------------------------------------

async function handleNanoBanana(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: {
    mode?: "text_to_image" | "image_to_image";
    images?: string[];
    ratio?: string;
    resolution?: string;
    count?: number;
    temperature?: number;
    negativePrompt?: string;
    debugOptions?: ImageGenerationDebugOptions;
  },
): Promise<{ urls: string[]; endpoint: string; requestBody: Record<string, unknown> }> {
  const count = Math.max(1, Math.min(4, Number(options?.count) || 4));
  const callModeOptions: ImageCallModeOptions = {
    mode: options?.mode,
    images: options?.images,
    count: options?.count,
  };

  const request = await nanoBananaHandler.buildRequest(provider, prompt, callModeOptions);
  const returnableBody = { ...request.body };

  const debugRecord = createImageDebugRecord(
    options?.debugOptions,
    provider,
    prompt,
    request.endpoint,
    request.headers,
    returnableBody,
    options?.images,
  );

  try {
    const data = await postJsonWithTimeout(request.endpoint, request.body, request.headers, provider.timeoutMs);

    // 即时响应
    const immediateUrls = nanoBananaHandler.extractImageUrls(data);
    if (immediateUrls.length > 0) {
      finalizeImageDebugSuccess(options?.debugOptions, debugRecord, provider, immediateUrls, request.endpoint, returnableBody);
      return { urls: padImageUrls(immediateUrls, count), endpoint: request.endpoint, requestBody: returnableBody };
    }

    // 异步轮询
    const requestId = extractNanoBananaRequestId(data);
    if (requestId) {
      const mode = options?.mode ?? "text_to_image";
      const modelPath = normalizeNanoBananaModelPath(provider.model, mode);
      const statusEndpoint = `${provider.baseUrl.replace(/\/+$/, "")}/api/${modelPath}/requests/${encodeURIComponent(requestId)}`;
      const deadline = Date.now() + Math.max(20_000, Math.min(180_000, provider.timeoutMs * 2));
      let attempt = 0;

      while (Date.now() < deadline) {
        if (attempt > 0) {
          const waitMs = Math.min(1500 + attempt * 350, 4000);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        attempt += 1;

        const statusData = await getJsonWithTimeout(statusEndpoint, request.headers, provider.timeoutMs);
        const statusUrls = nanoBananaHandler.extractImageUrls(statusData);

        if (statusUrls.length > 0) {
          finalizeImageDebugSuccess(options?.debugOptions, debugRecord, provider, statusUrls, request.endpoint, returnableBody);
          return { urls: padImageUrls(statusUrls, count), endpoint: request.endpoint, requestBody: returnableBody };
        }

        const status = (extractNanoBananaStatus(statusData) ?? "").trim().toLowerCase();
        if (["error", "failed", "cancelled", "canceled", "timeout"].includes(status)) {
          const statusMessage = extractProviderErrorMessage(statusData);
          finalizeImageDebugError(options?.debugOptions, debugRecord, provider, "IMAGE_PROVIDER_ERROR", statusMessage ?? `NANO_BANANA_${status.toUpperCase()}`, request.endpoint, returnableBody);
          throw new AppError(502, "IMAGE_PROVIDER_ERROR", statusMessage ?? `NANO_BANANA_${status.toUpperCase()}`);
        }
      }

      finalizeImageDebugError(options?.debugOptions, debugRecord, provider, "IMAGE_PROVIDER_ERROR", "NANO_BANANA_RESULT_TIMEOUT", request.endpoint, returnableBody);
      throw new AppError(502, "IMAGE_PROVIDER_ERROR", "NANO_BANANA_RESULT_TIMEOUT");
    }

    // 无 requestId 也无即时结果 → 检查是否为明确错误
    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      finalizeImageDebugError(options?.debugOptions, debugRecord, provider, "IMAGE_PROVIDER_ERROR", providerMessage ?? "Provider returned error", request.endpoint, returnableBody);
      throw new AppError(502, "IMAGE_PROVIDER_ERROR", `${providerMessage}; endpoint=${request.endpoint}`);
    }

    finalizeImageDebugError(options?.debugOptions, debugRecord, provider, "EMPTY_IMAGE_RESULT", `Empty result; endpoint=${request.endpoint}; response=${compactUnknownText(data, 1200)}`, request.endpoint, returnableBody);
    throw new AppError(502, "IMAGE_PROVIDER_ERROR", `EMPTY_IMAGE_RESULT; endpoint=${request.endpoint}; response=${compactUnknownText(data, 1200)}`);
  } catch (error) {
    const errorCode = error instanceof AppError ? error.code : "IMAGE_PROVIDER_ERROR";
    const errorMessage = error instanceof Error ? error.message : String(error);
    const log = getLogger("image-generation");
    log.error({ callMode: ProviderCallMode.NANO_BANANA_IMAGE, providerModel: provider.model, endpoint: request.endpoint, requestBody: returnableBody, errorCode, errorMessage }, "[ImageGeneration] Nano Banana 失败");
    finalizeImageDebugError(options?.debugOptions, debugRecord, provider, errorCode, errorMessage, request.endpoint, returnableBody);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// GROK_IMAGE_EDIT 特殊调度（multipart/form-data）
// ---------------------------------------------------------------------------

async function handleGrokImageEdit(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: {
    mode?: "text_to_image" | "image_to_image";
    images?: string[];
    ratio?: string;
    resolution?: string;
    count?: number;
    temperature?: number;
    negativePrompt?: string;
    debugOptions?: ImageGenerationDebugOptions;
  },
): Promise<{ urls: string[]; endpoint: string; requestBody: Record<string, unknown> }> {
  const grokEditHandler = getImageCallModeHandler(ProviderCallMode.GROK_IMAGE_EDIT);
  const callModeOptions: ImageCallModeOptions = {
    images: options?.images,
    ratio: options?.ratio,
  };

  const request = await grokEditHandler.buildRequest(provider, prompt, callModeOptions);
  if (!request.formData) {
    throw new AppError(500, "GROK_EDIT_NO_FORMDATA", "Grok Image Edit handler 返回了空的 formData");
  }
  const returnableBody: Record<string, unknown> = {
    model: provider.model,
    prompt,
    aspect_ratio: options?.ratio ?? null,
    resolution: "2k",
    quality: "high",
  };

  const debugRecord = createImageDebugRecord(
    options?.debugOptions,
    provider,
    prompt,
    request.endpoint,
    request.headers,
    returnableBody,
    options?.images,
  );

  try {
    const data = await postMultipartWithTimeout(request.endpoint, request.formData, request.headers, provider.timeoutMs);
    const urls = grokEditHandler.extractImageUrls(data);

    if (urls.length > 0) {
      finalizeImageDebugSuccess(options?.debugOptions, debugRecord, provider, urls, request.endpoint, returnableBody);
      return { urls: padImageUrls(urls, 1), endpoint: request.endpoint, requestBody: returnableBody };
    }

    finalizeImageDebugError(options?.debugOptions, debugRecord, provider, "EMPTY_IMAGE_RESULT", `Empty result; endpoint=${request.endpoint}; response=${compactUnknownText(data, 1200)}`, request.endpoint, returnableBody);
    throw new AppError(502, "IMAGE_PROVIDER_ERROR", `EMPTY_IMAGE_RESULT; endpoint=${request.endpoint}; response=${compactUnknownText(data, 1200)}`);
  } catch (error) {
    const errorCode = error instanceof AppError ? error.code : "IMAGE_PROVIDER_ERROR";
    const errorMessage = error instanceof Error ? error.message : String(error);
    const log = getLogger("image-generation");
    log.error({ callMode: ProviderCallMode.GROK_IMAGE_EDIT, providerModel: provider.model, endpoint: request.endpoint, errorCode, errorMessage }, "[ImageGeneration] Grok Image Edit 失败");
    finalizeImageDebugError(options?.debugOptions, debugRecord, provider, errorCode, errorMessage, request.endpoint, returnableBody);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 单张图片生成便捷封装
// ---------------------------------------------------------------------------

export async function requestLlmImageGenerationUrl(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: {
    mode?: "text_to_image" | "image_to_image";
    images?: string[];
    ratio?: string;
    resolution?: string;
    temperature?: number;
    negativePrompt?: string;
    debugOptions?: ImageGenerationDebugOptions;
  },
): Promise<{ url: string; endpoint: string; requestBody: Record<string, unknown> }> {
  const result = await requestLlmImageGenerationUrls(provider, prompt, {
    ...options,
    count: 1,
  });
  const first = result.urls[0];
  if (!first) {
    throw new AppError(502, "IMAGE_PROVIDER_ERROR", "Image provider call failed: EMPTY_IMAGE_RESULT");
  }

  // 检测占位图：data: URL 且 base64 解码后极小（< 5KB）
  const dataUrlMatch = first.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (dataUrlMatch) {
    const decodedSize = Buffer.from(dataUrlMatch[1], "base64").length;
    if (decodedSize < 5 * 1024) {
      throw new AppError(
        502,
        "IMAGE_PROVIDER_PLACEHOLDER",
        `Provider returned a placeholder image (${decodedSize} bytes), likely content moderation or model failure. endpoint=${result.endpoint}`,
      );
    }
  }

  return { url: first, endpoint: result.endpoint, requestBody: result.requestBody };
}

// ---------------------------------------------------------------------------
// 第三方 Provider 连通性探测
// ---------------------------------------------------------------------------

export async function requestThirdPartyConnectivityProbe(provider: ResolvedRouteProvider): Promise<string> {
  const endpoint = provider.baseUrl.replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, provider.timeoutMs));
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: toBearerToken(provider.secret, provider.vendor, provider.baseUrl),
        Accept: "application/json,text/plain,*/*",
      },
      signal: controller.signal,
    });
    const rawText = (await response.text()).trim();
    if (!response.ok) {
      throw new AppError(
        502,
        "THIRD_PARTY_PROVIDER_ERROR",
        `Third-party probe failed: HTTP ${response.status} ${response.statusText}`,
      );
    }
    const snippet = rawText.length > 0 ? ` ${rawText.slice(0, 80)}` : "";
    return `HTTP ${response.status}${snippet}`;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError(504, "PROVIDER_TIMEOUT", "Third-party provider request timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
