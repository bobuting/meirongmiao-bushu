/**
 * AnimateAnyone 动作迁移 LLM 服务
 *
 * 独立的动作迁移服务，对应 callMode:
 * - animate-anyone-detect-bailian: 图片合规检测（同步）
 * - animate-anyone-template-bailian: 动作模板生成（异步）
 * - animate-anyone-video-bailian: 视频生成（异步）
 *
 * 模型:
 * - animate-anyone-detect-gen2: 图片检测
 * - animate-anyone-template-gen2: 模板生成
 * - animate-anyone-gen2: 视频生成
 *
 * 协议: 阿里云百炼 DashScope（北京地域）
 * - detect: 同步调用
 * - template/video: 异步任务（创建 → 轮询）
 *
 * 遵循"视频编辑类 CallMode 用独立函数"的标准，
 * 不在 llm-video.ts 的 createVideoTask/queryVideoTask 中添加 switch case。
 */

import { AppError } from "../../core/errors.js";
import { buildAuthHeaderCandidates } from "../../utils/http-request.js";
import { compactUnknownText } from "../../utils/text.js";
import { ProviderCallMode } from "../../contracts/types.js";
import {
  buildAnimateAnyoneDetectEndpoint,
  buildAnimateAnyoneTemplateEndpoint,
  buildAnimateAnyoneVideoEndpoint,
  buildAnimateAnyoneDetectRequestBody,
  buildAnimateAnyoneTemplateRequestBody,
  buildAnimateAnyoneVideoRequestBody,
  extractDetectResult,
  extractTemplateResult,
  extractVideoResult,
} from "../../modules/animate-anyone-provider-endpoints.js";
import type { ResolvedRouteProvider } from "../../services/llm/provider-resolver.js";
import { getVideoPollingConfig } from "../../core/video-config.js";
import { videoGenerationLogger as log } from "../../core/logger/index.js";

// ---------------------------------------------------------------------------
// 共享工具函数
// ---------------------------------------------------------------------------

/** 解析响应 payload */
function parseResponsePayload(rawText: string): unknown {
  if (rawText.trim().length < 1) return {};
  try {
    return JSON.parse(rawText);
  } catch {
    return { raw: rawText };
  }
}

/** 提取 provider 错误消息 */
function extractProviderErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  // DashScope 格式: { message: "xxx", code: "xxx" }
  if (typeof obj.message === "string" && obj.message) {
    return obj.message;
  }

  // 嵌套 output 格式
  if (obj.output && typeof obj.output === "object") {
    const output = obj.output as Record<string, unknown>;
    if (typeof output.message === "string" && output.message) {
      return output.message;
    }
  }

  return null;
}

/** 判断 provider 消息是否代表失败 */
function shouldTreatProviderMessageAsFailure(message: string | null): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("fail") || lower.includes("error") || lower.includes("invalid");
}

// ---------------------------------------------------------------------------
// 状态映射（DashScope 大写 → 标准小写）
// ---------------------------------------------------------------------------

/** DashScope 任务状态 → 标准状态 */
const DASHSCOPE_STATUS_MAP: Record<string, "pending" | "processing" | "succeeded" | "failed"> = {
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

/** 规范化 DashScope 状态 */
function normalizeDashScopeStatus(raw: string | null): "pending" | "succeeded" | "failed" {
  if (!raw) return "pending";
  const mapped = DASHSCOPE_STATUS_MAP[raw.toLowerCase()];
  if (mapped === "succeeded") return "succeeded";
  if (mapped === "failed") return "failed";
  return "pending";
}

// ---------------------------------------------------------------------------
// 审计信息类型
// ---------------------------------------------------------------------------

interface VideoRequestAuditInfo {
  actualEndpoint: string;
  requestBodySummary: Record<string, unknown>;
  effectivePrompt: string;
  requestHeadersJson: string;
  requestBodyJson: string;
}

// ---------------------------------------------------------------------------
// Step 1: 图片合规检测（同步）
// ---------------------------------------------------------------------------

/**
 * AnimateAnyone 图片合规检测
 *
 * @param provider 提供商配置
 * @param imageUrl 人物图片 URL（必填）
 * @returns 检测结果（valid, reason, suggestions）
 */
export async function animateAnyoneDetectImage(
  provider: ResolvedRouteProvider,
  imageUrl: string,
): Promise<{
  valid: boolean;
  reason?: string;
  suggestions?: string[];
  auditInfo?: VideoRequestAuditInfo;
}> {
  log.debug({ providerId: provider.id, model: provider.model, imageUrl }, "animateAnyoneDetectImage 开始");

  const callMode = provider.callMode;
  if (callMode !== ProviderCallMode.ANIMATE_ANYONE_DETECT_BAILIAN) {
    throw new AppError(400, "INVALID_CALL_MODE", `animateAnyoneDetectImage 需要 callMode=animate-anyone-detect-bailian，当前为 ${callMode}`);
  }

  if (!imageUrl?.trim()) {
    throw new AppError(400, "MISSING_IMAGE_URL", "AnimateAnyone 图片检测必须提供 imageUrl");
  }

  // 认证
  const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
  const auth = authCandidates[0] ?? `Bearer ${provider.secret}`;

  // 端点
  const endpoint = buildAnimateAnyoneDetectEndpoint(provider.baseUrl);

  // 请求头
  const headers: Record<string, string> = {
    Authorization: auth,
    "Content-Type": "application/json",
  };

  // 请求体
  const requestBody = buildAnimateAnyoneDetectRequestBody(imageUrl);

  const requestBodySummary: Record<string, unknown> = {
    model: "animate-anyone-detect-gen2",
    imageUrl,
  };

  // 审计头信息（脱敏）
  const sanitizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization") {
      sanitizedHeaders[key] = "Bearer ***";
    } else {
      sanitizedHeaders[key] = value;
    }
  }

  log.debug({ endpoint, imageUrl }, "AnimateAnyone 图片检测 POST");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, provider.timeoutMs));

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: requestBody,
      signal: controller.signal,
    });

    const rawText = await response.text();
    const data = parseResponsePayload(rawText);
    const responseSummary = compactUnknownText(data, 1200);

    if (!response.ok) {
      throw new AppError(502, "ANIMATE_ANYONE_DETECT_PROVIDER_ERROR", `HTTP ${response.status} ${response.statusText}; endpoint=${endpoint}; response=${responseSummary}`);
    }

    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      throw new AppError(502, "ANIMATE_ANYONE_DETECT_PROVIDER_ERROR", `${providerMessage}; endpoint=${endpoint}`);
    }

    // 提取检测结果
    const result = extractDetectResult(data);

    log.info({ imageUrl, valid: result.valid }, "AnimateAnyone 图片检测完成");

    return {
      valid: result.valid,
      reason: result.reason,
      suggestions: result.suggestions,
      auditInfo: {
        actualEndpoint: endpoint,
        requestBodySummary,
        effectivePrompt: `image_url=${imageUrl}`,
        requestHeadersJson: JSON.stringify(sanitizedHeaders),
        requestBodyJson: requestBody,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Step 2: 动作模板生成（异步）
// ---------------------------------------------------------------------------

/**
 * 创建 AnimateAnyone 动作模板生成任务
 *
 * @param provider 提供商配置
 * @param videoUrl 参考视频 URL（必填）
 * @returns 任务信息（taskId + queryUrl）
 */
export async function createAnimateAnyoneTemplateTask(
  provider: ResolvedRouteProvider,
  videoUrl: string,
): Promise<{
  taskId: string;
  templateId: string | null;
  queryUrl: string | null;
  auditInfo?: VideoRequestAuditInfo;
}> {
  log.debug({ providerId: provider.id, model: provider.model, videoUrl }, "createAnimateAnyoneTemplateTask 开始");

  const callMode = provider.callMode;
  if (callMode !== ProviderCallMode.ANIMATE_ANYONE_TEMPLATE_BAILIAN) {
    throw new AppError(400, "INVALID_CALL_MODE", `createAnimateAnyoneTemplateTask 需要 callMode=animate-anyone-template-bailian，当前为 ${callMode}`);
  }

  if (!videoUrl?.trim()) {
    throw new AppError(400, "MISSING_VIDEO_URL", "AnimateAnyone 模板生成必须提供 videoUrl（参考视频 URL）");
  }

  // 认证
  const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
  const auth = authCandidates[0] ?? `Bearer ${provider.secret}`;

  // 端点
  const endpoint = buildAnimateAnyoneTemplateEndpoint(provider.baseUrl);

  // 请求头：DashScope 异步需要 X-DashScope-Async
  const headers: Record<string, string> = {
    Authorization: auth,
    "Content-Type": "application/json",
    "X-DashScope-Async": "enable",
  };

  // 请求体
  const requestBody = buildAnimateAnyoneTemplateRequestBody(videoUrl);

  const requestBodySummary: Record<string, unknown> = {
    model: "animate-anyone-template-gen2",
    videoUrl,
  };

  // 审计头信息（脱敏）
  const sanitizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization") {
      sanitizedHeaders[key] = "Bearer ***";
    } else {
      sanitizedHeaders[key] = value;
    }
  }

  log.debug({ endpoint, videoUrl }, "创建 AnimateAnyone 模板任务 POST");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, provider.timeoutMs));

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: requestBody,
      signal: controller.signal,
    });

    const rawText = await response.text();
    const data = parseResponsePayload(rawText);
    const responseSummary = compactUnknownText(data, 1200);

    if (!response.ok) {
      throw new AppError(502, "ANIMATE_ANYONE_TEMPLATE_PROVIDER_ERROR", `HTTP ${response.status} ${response.statusText}; endpoint=${endpoint}; response=${responseSummary}`);
    }

    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      throw new AppError(502, "ANIMATE_ANYONE_TEMPLATE_PROVIDER_ERROR", `${providerMessage}; endpoint=${endpoint}`);
    }

    // 提取任务 ID
    const taskId = (data as { output?: { task_id?: string } }).output?.task_id;
    if (!taskId) {
      throw new AppError(502, "ANIMATE_ANYONE_TEMPLATE_NO_TASK_ID", `未返回 taskId; endpoint=${endpoint}; response=${responseSummary}`);
    }

    log.info({ taskId, videoUrl }, "AnimateAnyone 模板任务创建成功");

    // 查询端点（DashScope 格式）
    const queryUrl = `${provider.baseUrl.replace(/\/+$/, "")}/api/v1/tasks/${taskId}`;

    return {
      taskId,
      templateId: null,
      queryUrl,
      auditInfo: {
        actualEndpoint: endpoint,
        requestBodySummary,
        effectivePrompt: `video_url=${videoUrl}`,
        requestHeadersJson: JSON.stringify(sanitizedHeaders),
        requestBodyJson: requestBody,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 查询 AnimateAnyone 模板生成任务状态（单次查询，不轮询）
 *
 * @param provider 提供商配置
 * @param taskId 任务 ID
 * @returns 任务状态和模板 ID（如果已完成）
 */
export async function queryAnimateAnyoneTemplateTask(
  provider: ResolvedRouteProvider,
  taskId: string,
): Promise<{
  status: "pending" | "succeeded" | "failed";
  templateId?: string;
  duration?: number;
  error?: { code: string; message: string };
}> {
  log.debug({ providerId: provider.id, taskId }, "queryAnimateAnyoneTemplateTask 开始");

  if (!taskId || !taskId.trim()) {
    return { status: "failed", error: { code: "INVALID_TASK_ID", message: "taskId 为空" } };
  }

  const callMode = provider.callMode;
  if (callMode !== ProviderCallMode.ANIMATE_ANYONE_TEMPLATE_BAILIAN) {
    return { status: "failed", error: { code: "INVALID_CALL_MODE", message: `需要 callMode=animate-anyone-template-bailian，当前为 ${callMode}` } };
  }

  const pollingConfig = getVideoPollingConfig();

  // 认证
  const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
  const auth = authCandidates[0] ?? `Bearer ${provider.secret}`;

  // 查询端点
  const queryEndpoint = `${provider.baseUrl.replace(/\/+$/, "")}/api/v1/tasks/${taskId}`;

  const headers: Record<string, string> = { Authorization: auth };

  log.debug({ queryEndpoint, taskId }, "查询 AnimateAnyone 模板任务状态 GET");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), pollingConfig.requestTimeoutMs);

  try {
    const response = await fetch(queryEndpoint, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    const rawText = await response.text();

    // 跳过 HTML 响应
    if (rawText.trim().startsWith("<!DOCTYPE") || rawText.trim().startsWith("<html")) {
      return { status: "pending" };
    }

    const data = parseResponsePayload(rawText);

    if (!response.ok) {
      const responseSummary = compactUnknownText(data, 1200);
      return {
        status: "failed",
        error: { code: "QUERY_HTTP_ERROR", message: `HTTP ${response.status} ${response.statusText}; response=${responseSummary}` },
      };
    }

    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      return { status: "failed", error: { code: "PROVIDER_ERROR", message: providerMessage ?? "Unknown provider error" } };
    }

    // 提取模板结果
    const result = extractTemplateResult(data);
    if (result.templateId) {
      log.info({ templateId: result.templateId, taskId, duration: result.duration }, "AnimateAnyone 模板查询成功，返回模板ID");
      return {
        status: "succeeded",
        templateId: result.templateId,
        duration: result.duration,
      };
    }

    // 检查状态
    const rawStatus = (data as { output?: { task_status?: string } }).output?.task_status ?? null;
    const status = normalizeDashScopeStatus(rawStatus);
    if (status === "failed") {
      // 提取阿里云返回的具体错误信息
      const outputObj = (data as { output?: Record<string, unknown> }).output;
      const topLevelCode = (data as { code?: string }).code;
      const topLevelMessage = (data as { message?: string }).message;
      const outputMessage = outputObj?.message as string | undefined;
      const outputCode = outputObj?.code as string | undefined;

      // 优先使用 output 中的错误信息，其次使用顶层 code/message
      const errorDetails = outputMessage || topLevelMessage || "任务失败（无详细错误信息）";
      const errorCode = outputCode || topLevelCode || "TASK_FAILED";

      log.error({
        taskId,
        rawStatus,
        errorCode,
        errorDetails,
        fullResponse: JSON.stringify(data).slice(0, 500)
      }, "AnimateAnyone 模板任务失败");

      return { status: "failed", error: { code: errorCode, message: `${errorDetails}; taskId=${taskId}` } };
    }

    return { status: "pending" };
  } catch (error) {
    if (error instanceof AppError) {
      return { status: "failed", error: { code: error.code, message: error.message } };
    }
    return { status: "failed", error: { code: "QUERY_ERROR", message: String(error) } };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Step 3: 视频生成（异步）
// ---------------------------------------------------------------------------

/**
 * 创建 AnimateAnyone 视频生成任务
 *
 * @param provider 提供商配置
 * @param imageUrl 目标图片 URL（必填）
 * @param templateId 动作模板 ID（必填）
 * @param options 可选参数
 * @returns 任务信息（taskId + queryUrl）
 */
export async function createAnimateAnyoneVideoTask(
  provider: ResolvedRouteProvider,
  imageUrl: string,
  templateId: string,
  options?: {
    prompt?: string;
    duration?: number;
    backgroundMode?: "image" | "video";
  },
): Promise<{
  taskId: string;
  videoUrl: string | null;
  queryUrl: string | null;
  auditInfo?: VideoRequestAuditInfo;
}> {
  log.debug({ providerId: provider.id, model: provider.model, imageUrl, templateId }, "createAnimateAnyoneVideoTask 开始");

  const callMode = provider.callMode;
  if (callMode !== ProviderCallMode.ANIMATE_ANYONE_VIDEO_BAILIAN) {
    throw new AppError(400, "INVALID_CALL_MODE", `createAnimateAnyoneVideoTask 需要 callMode=animate-anyone-video-bailian，当前为 ${callMode}`);
  }

  if (!imageUrl?.trim()) {
    throw new AppError(400, "MISSING_IMAGE_URL", "AnimateAnyone 视频生成必须提供 imageUrl（目标图片 URL）");
  }

  if (!templateId?.trim()) {
    throw new AppError(400, "MISSING_TEMPLATE_ID", "AnimateAnyone 视频生成必须提供 templateId（动作模板 ID）");
  }

  // 认证
  const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
  const auth = authCandidates[0] ?? `Bearer ${provider.secret}`;

  // 端点
  const endpoint = buildAnimateAnyoneVideoEndpoint(provider.baseUrl);

  // 请求头：DashScope 异步需要 X-DashScope-Async
  const headers: Record<string, string> = {
    Authorization: auth,
    "Content-Type": "application/json",
    "X-DashScope-Async": "enable",
  };

  // 请求体
  const requestBody = buildAnimateAnyoneVideoRequestBody({
    imageUrl,
    templateId,
    prompt: options?.prompt,
    duration: options?.duration,
    backgroundMode: options?.backgroundMode,
  });

  const requestBodySummary: Record<string, unknown> = {
    model: "animate-anyone-gen2",
    imageUrl,
    templateId,
    prompt: options?.prompt,
    duration: options?.duration,
  };

  // 审计头信息（脱敏）
  const sanitizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization") {
      sanitizedHeaders[key] = "Bearer ***";
    } else {
      sanitizedHeaders[key] = value;
    }
  }

  log.debug({ endpoint, imageUrl, templateId }, "创建 AnimateAnyone 视频任务 POST");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, provider.timeoutMs));

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: requestBody,
      signal: controller.signal,
    });

    const rawText = await response.text();
    const data = parseResponsePayload(rawText);
    const responseSummary = compactUnknownText(data, 1200);

    if (!response.ok) {
      throw new AppError(502, "ANIMATE_ANYONE_VIDEO_PROVIDER_ERROR", `HTTP ${response.status} ${response.statusText}; endpoint=${endpoint}; response=${responseSummary}`);
    }

    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      throw new AppError(502, "ANIMATE_ANYONE_VIDEO_PROVIDER_ERROR", `${providerMessage}; endpoint=${endpoint}`);
    }

    // 提取任务 ID
    const taskId = (data as { output?: { task_id?: string } }).output?.task_id;
    if (!taskId) {
      throw new AppError(502, "ANIMATE_ANYONE_VIDEO_NO_TASK_ID", `未返回 taskId; endpoint=${endpoint}; response=${responseSummary}`);
    }

    log.info({ taskId, imageUrl, templateId }, "AnimateAnyone 视频任务创建成功");

    // 查询端点
    const queryUrl = `${provider.baseUrl.replace(/\/+$/, "")}/api/v1/tasks/${taskId}`;

    return {
      taskId,
      videoUrl: null,
      queryUrl,
      auditInfo: {
        actualEndpoint: endpoint,
        requestBodySummary,
        effectivePrompt: `image_url=${imageUrl}, template_id=${templateId}`,
        requestHeadersJson: JSON.stringify(sanitizedHeaders),
        requestBodyJson: requestBody,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 查询 AnimateAnyone 视频生成任务状态（单次查询，不轮询）
 *
 * @param provider 提供商配置
 * @param taskId 任务 ID
 * @returns 任务状态和视频 URL（如果已完成）
 */
export async function queryAnimateAnyoneVideoTask(
  provider: ResolvedRouteProvider,
  taskId: string,
): Promise<{
  status: "pending" | "succeeded" | "failed";
  videoUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
  error?: { code: string; message: string };
}> {
  log.debug({ providerId: provider.id, taskId }, "queryAnimateAnyoneVideoTask 开始");

  if (!taskId || !taskId.trim()) {
    return { status: "failed", error: { code: "INVALID_TASK_ID", message: "taskId 为空" } };
  }

  const callMode = provider.callMode;
  if (callMode !== ProviderCallMode.ANIMATE_ANYONE_VIDEO_BAILIAN) {
    return { status: "failed", error: { code: "INVALID_CALL_MODE", message: `需要 callMode=animate-anyone-video-bailian，当前为 ${callMode}` } };
  }

  const pollingConfig = getVideoPollingConfig();

  // 认证
  const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
  const auth = authCandidates[0] ?? `Bearer ${provider.secret}`;

  // 查询端点
  const queryEndpoint = `${provider.baseUrl.replace(/\/+$/, "")}/api/v1/tasks/${taskId}`;

  const headers: Record<string, string> = { Authorization: auth };

  log.debug({ queryEndpoint, taskId }, "查询 AnimateAnyone 视频任务状态 GET");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), pollingConfig.requestTimeoutMs);

  try {
    const response = await fetch(queryEndpoint, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    const rawText = await response.text();

    // 跳过 HTML 响应
    if (rawText.trim().startsWith("<!DOCTYPE") || rawText.trim().startsWith("<html")) {
      return { status: "pending" };
    }

    const data = parseResponsePayload(rawText);

    if (!response.ok) {
      const responseSummary = compactUnknownText(data, 1200);
      return {
        status: "failed",
        error: { code: "QUERY_HTTP_ERROR", message: `HTTP ${response.status} ${response.statusText}; response=${responseSummary}` },
      };
    }

    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      return { status: "failed", error: { code: "PROVIDER_ERROR", message: providerMessage ?? "Unknown provider error" } };
    }

    // 提取视频结果
    const result = extractVideoResult(data);
    if (result.videoUrl) {
      log.info({ videoUrl: result.videoUrl, taskId, duration: result.duration }, "AnimateAnyone 视频查询成功，返回视频URL");
      return {
        status: "succeeded",
        videoUrl: result.videoUrl,
        duration: result.duration,
        width: result.width,
        height: result.height,
      };
    }

    // 检查状态
    const rawStatus = (data as { output?: { task_status?: string } }).output?.task_status ?? null;
    const status = normalizeDashScopeStatus(rawStatus);
    if (status === "failed") {
      return { status: "failed", error: { code: "TASK_FAILED", message: `任务失败; taskId=${taskId}` } };
    }

    return { status: "pending" };
  } catch (error) {
    if (error instanceof AppError) {
      return { status: "failed", error: { code: error.code, message: error.message } };
    }
    return { status: "failed", error: { code: "QUERY_ERROR", message: String(error) } };
  } finally {
    clearTimeout(timer);
  }
}