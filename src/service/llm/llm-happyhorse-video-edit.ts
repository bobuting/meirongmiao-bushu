/**
 * 快乐马视频编辑 LLM 服务
 *
 * 独立的视频编辑服务，对应 callMode: happyhorse-video-edit-bailian
 * 模型: happyhorse-1.0-video-edit
 * 协议: 阿里云百炼 DashScope 异步任务（创建 → 轮询）
 *
 * 遵循"视频编辑类 CallMode 用独立函数"的标准，
 * 不在 llm-video.ts 的 createVideoTask/queryVideoTask 中添加 switch case。
 */

import { AppError } from "../../core/errors.js";
import {
  buildAuthHeaderCandidates,
  parseModelCandidates,
} from "../../utils/http-request.js";
import { compactUnknownText } from "../../utils/text.js";
import { ProviderCallMode } from "../../contracts/types.js";
import {
  buildHappyHorseVideoCreateEndpointCandidates,
  buildHappyHorseVideoQueryEndpointCandidates,
  buildHappyHorseVideoEditRequestBody,
  extractTaskIdFromHappyHorseResponse,
  extractTaskStatusFromHappyHorseResponse,
  extractVideoUrlsFromHappyHorseResponse,
} from "../../modules/happyhorse-video-provider-endpoints.js";
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
// 创建视频编辑任务
// ---------------------------------------------------------------------------

/**
 * 创建快乐马视频编辑任务
 *
 * @param provider 提供商配置
 * @param prompt 编辑指令
 * @param videoUrl 待编辑的视频 URL（必须）
 * @param options 可选参数
 * @returns 任务信息（taskId + queryUrl）
 */
export async function createHappyHorseVideoEditTask(
  provider: ResolvedRouteProvider,
  prompt: string,
  videoUrl: string,
  options?: {
    referenceImages?: string[];
    resolution?: string;
    watermark?: boolean;
    audioSetting?: "auto" | "origin";
    seed?: number;
  },
): Promise<{
  taskId: string;
  videoUrl: string | null;
  queryUrl: string | null;
  auditInfo?: VideoRequestAuditInfo;
}> {
  log.debug({ providerId: provider.id, model: provider.model, videoUrl }, "createHappyHorseVideoEditTask 开始");

  const callMode = provider.callMode;
  if (callMode !== ProviderCallMode.HAPPYHORSE_VIDEO_EDIT_BAILIAN) {
    throw new AppError(400, "INVALID_CALL_MODE", `createHappyHorseVideoEditTask 需要 callMode=happyhorse-video-edit-bailian，当前为 ${callMode}`);
  }

  if (!videoUrl) {
    throw new AppError(400, "MISSING_VIDEO_URL", "快乐马视频编辑必须提供 videoUrl");
  }

  // 解析模型
  const modelCandidates = parseModelCandidates(provider.model);
  const model = modelCandidates[0] ?? "happyhorse-1.0-video-edit";

  // 认证
  const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
  const auth = authCandidates[0] ?? `Bearer ${provider.secret}`;

  // 端点（复用参考生视频的端点构建器，API 路径完全一致）
  const createEndpoints = buildHappyHorseVideoCreateEndpointCandidates(provider.baseUrl);
  const resolvedEndpoint = createEndpoints[0] ?? provider.baseUrl;

  // 请求头：DashScope 异步需要 X-DashScope-Async
  const headers: Record<string, string> = {
    Authorization: auth,
    "Content-Type": "application/json",
    "X-DashScope-Async": "enable",
  };

  // 构建请求体
  const requestBody = buildHappyHorseVideoEditRequestBody({
    model,
    prompt,
    videoUrl,
    referenceImages: options?.referenceImages,
    resolution: options?.resolution,
    watermark: options?.watermark,
    audioSetting: options?.audioSetting,
    seed: options?.seed,
  });

  const requestBodySummary: Record<string, unknown> = {
    model,
    videoUrl,
    referenceImageCount: options?.referenceImages?.length ?? 0,
    promptLength: prompt.length,
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

  log.debug({ endpoint: resolvedEndpoint, model, videoUrl }, "创建快乐马视频编辑任务 POST");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, provider.timeoutMs));

  try {
    const response = await fetch(resolvedEndpoint, {
      method: "POST",
      headers,
      body: requestBody,
      signal: controller.signal,
    });

    const rawText = await response.text();
    const data = parseResponsePayload(rawText);
    const responseSummary = compactUnknownText(data, 1200);

    if (!response.ok) {
      throw new AppError(502, "HAPPYHORSE_VIDEO_EDIT_PROVIDER_ERROR", `HTTP ${response.status} ${response.statusText}; endpoint=${resolvedEndpoint}; response=${responseSummary}`);
    }

    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      throw new AppError(502, "HAPPYHORSE_VIDEO_EDIT_PROVIDER_ERROR", `${providerMessage}; endpoint=${resolvedEndpoint}`);
    }

    // 提取任务 ID
    const taskId = extractTaskIdFromHappyHorseResponse(data);
    if (!taskId) {
      throw new AppError(502, "HAPPYHORSE_VIDEO_EDIT_NO_TASK_ID", `未返回 taskId; endpoint=${resolvedEndpoint}; response=${responseSummary}`);
    }

    log.info({ taskId }, "快乐马视频编辑任务创建成功");

    // 构建查询端点（复用参考生视频的查询端点构建器）
    const queryEndpoints = buildHappyHorseVideoQueryEndpointCandidates(provider.baseUrl, taskId);
    const queryUrl = queryEndpoints[0] ?? null;

    return {
      taskId,
      videoUrl: null,
      queryUrl,
      auditInfo: {
        actualEndpoint: resolvedEndpoint,
        requestBodySummary,
        effectivePrompt: prompt,
        requestHeadersJson: JSON.stringify(sanitizedHeaders),
        requestBodyJson: requestBody,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 查询视频编辑任务状态
// ---------------------------------------------------------------------------

/**
 * 查询快乐马视频编辑任务状态（单次查询，不轮询）
 *
 * @param provider 提供商配置
 * @param taskId 任务 ID
 * @returns 任务状态和视频 URL（如果已完成）
 */
export async function queryHappyHorseVideoEditTask(
  provider: ResolvedRouteProvider,
  taskId: string,
): Promise<{
  status: "pending" | "succeeded" | "failed";
  videoUrl?: string;
  error?: { code: string; message: string };
}> {
  log.debug({ providerId: provider.id, taskId }, "queryHappyHorseVideoEditTask 开始");

  if (!taskId || !taskId.trim()) {
    return { status: "failed", error: { code: "INVALID_TASK_ID", message: "taskId 为空" } };
  }

  const callMode = provider.callMode;
  if (callMode !== ProviderCallMode.HAPPYHORSE_VIDEO_EDIT_BAILIAN) {
    return { status: "failed", error: { code: "INVALID_CALL_MODE", message: `需要 callMode=happyhorse-video-edit-bailian，当前为 ${callMode}` } };
  }

  const pollingConfig = getVideoPollingConfig();

  // 认证
  const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
  const auth = authCandidates[0] ?? `Bearer ${provider.secret}`;

  // 查询端点
  const queryEndpoints = buildHappyHorseVideoQueryEndpointCandidates(provider.baseUrl, taskId);
  const queryEndpoint = queryEndpoints[0] ?? "";
  if (!queryEndpoint) {
    return { status: "failed", error: { code: "NO_QUERY_ENDPOINT", message: "无法构建查询端点" } };
  }

  const headers: Record<string, string> = { Authorization: auth };

  log.debug({ queryEndpoint, taskId }, "查询快乐马视频编辑任务状态 GET");

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

    // 提取视频 URL
    const videoUrls = extractVideoUrlsFromHappyHorseResponse(data);
    if (videoUrls.length > 0) {
      log.info({ url: videoUrls[0], taskId }, "快乐马视频编辑查询成功，返回视频URL");
      return { status: "succeeded", videoUrl: videoUrls[0] };
    }

    // 检查状态
    const rawStatus = extractTaskStatusFromHappyHorseResponse(data);
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
