/**
 * 万相视频换人 LLM 服务
 *
 * 独立的视频换人服务，对应 callMode: wanxiang-video-mix-bailian
 * 模型: wan2.2-animate-mix
 * 协议: 阿里云百炼 DashScope 异步任务（创建 → 轮询）
 *
 * 遵循"视频编辑类 CallMode 用独立函数"的标准，
 * 不在 llm-video.ts 的 createVideoTask/queryVideoTask 中添加 switch case。
 *
 * 功能：将人物图片替换到参考视频中，保留原视频的动作、表情、环境
 */

import { AppError } from "../../core/errors.js";
import {
  buildAuthHeaderCandidates,
} from "../../utils/http-request.js";
import { compactUnknownText } from "../../utils/text.js";
import { ProviderCallMode } from "../../contracts/types.js";
import {
  buildWanxiangVideoMixCreateEndpointCandidates,
  buildWanxiangVideoMixQueryEndpointCandidates,
  buildWanxiangVideoMixRequestBody,
  extractTaskIdFromWanxiangVideoMixResponse,
  extractTaskStatusFromWanxiangVideoMixResponse,
  extractVideoUrlsFromWanxiangVideoMixResponse,
} from "../../modules/wanxiang-video-mix-provider-endpoints.js";
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
// 创建视频换人任务
// ---------------------------------------------------------------------------

/**
 * 创建万相视频换人任务
 *
 * @param provider 提供商配置
 * @param imageUrl 人物图片 URL（必填）
 * @param videoUrl 参考视频 URL（必填）
 * @param options 可选参数
 * @returns 任务信息（taskId + queryUrl）
 */
export async function createWanxiangVideoMixTask(
  provider: ResolvedRouteProvider,
  imageUrl: string,
  videoUrl: string,
  options?: {
    /** 服务模式：wan-std（标准）或 wan-pro（专业） */
    mode?: "wan-std" | "wan-pro";
    /** 是否添加水印 */
    watermark?: boolean;
    /** 是否检查输入图片 */
    checkImage?: boolean;
  },
): Promise<{
  taskId: string;
  videoUrl: string | null;
  queryUrl: string | null;
  auditInfo?: VideoRequestAuditInfo;
}> {
  log.debug({ providerId: provider.id, model: provider.model, imageUrl, videoUrl }, "createWanxiangVideoMixTask 开始");

  const callMode = provider.callMode;
  if (callMode !== ProviderCallMode.WANXIANG_VIDEO_MIX_BAILIAN) {
    throw new AppError(400, "INVALID_CALL_MODE", `createWanxiangVideoMixTask 需要 callMode=wanxiang-video-mix-bailian，当前为 ${callMode}`);
  }

  if (!imageUrl?.trim()) {
    throw new AppError(400, "MISSING_IMAGE_URL", "万相视频换人必须提供 imageUrl（人物图片 URL）");
  }

  if (!videoUrl?.trim()) {
    throw new AppError(400, "MISSING_VIDEO_URL", "万相视频换人必须提供 videoUrl（参考视频 URL）");
  }

  // 认证
  const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
  const auth = authCandidates[0] ?? `Bearer ${provider.secret}`;

  // 端点
  const createEndpoints = buildWanxiangVideoMixCreateEndpointCandidates(provider.baseUrl);
  const resolvedEndpoint = createEndpoints[0] ?? provider.baseUrl;

  // 请求头：DashScope 异步需要 X-DashScope-Async
  const headers: Record<string, string> = {
    Authorization: auth,
    "Content-Type": "application/json",
    "X-DashScope-Async": "enable",
  };

  // 构建请求体
  const requestBody = buildWanxiangVideoMixRequestBody({
    imageUrl,
    videoUrl,
    mode: options?.mode ?? "wan-std",
    watermark: options?.watermark ?? false,
    checkImage: options?.checkImage ?? true,
  });

  const requestBodySummary: Record<string, unknown> = {
    model: "wan2.2-animate-mix",
    imageUrl,
    videoUrl,
    mode: options?.mode ?? "wan-std",
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

  log.debug({ endpoint: resolvedEndpoint, imageUrl, videoUrl }, "创建万相视频换人任务 POST");

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
      throw new AppError(502, "WANXIANG_VIDEO_MIX_PROVIDER_ERROR", `HTTP ${response.status} ${response.statusText}; endpoint=${resolvedEndpoint}; response=${responseSummary}`);
    }

    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      throw new AppError(502, "WANXIANG_VIDEO_MIX_PROVIDER_ERROR", `${providerMessage}; endpoint=${resolvedEndpoint}`);
    }

    // 提取任务 ID
    const taskId = extractTaskIdFromWanxiangVideoMixResponse(data);
    if (!taskId) {
      throw new AppError(502, "WANXIANG_VIDEO_MIX_NO_TASK_ID", `未返回 taskId; endpoint=${resolvedEndpoint}; response=${responseSummary}`);
    }

    log.info({ taskId, imageUrl, videoUrl }, "万相视频换人任务创建成功");

    // 构建查询端点
    const queryEndpoints = buildWanxiangVideoMixQueryEndpointCandidates(provider.baseUrl, taskId);
    const queryUrl = queryEndpoints[0] ?? null;

    return {
      taskId,
      videoUrl: null,
      queryUrl,
      auditInfo: {
        actualEndpoint: resolvedEndpoint,
        requestBodySummary,
        effectivePrompt: `image_url=${imageUrl}, video_url=${videoUrl}`,
        requestHeadersJson: JSON.stringify(sanitizedHeaders),
        requestBodyJson: requestBody,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 查询视频换人任务状态
// ---------------------------------------------------------------------------

/**
 * 查询万相视频换人任务状态（单次查询，不轮询）
 *
 * @param provider 提供商配置
 * @param taskId 任务 ID
 * @returns 任务状态和视频 URL（如果已完成）
 */
export async function queryWanxiangVideoMixTask(
  provider: ResolvedRouteProvider,
  taskId: string,
): Promise<{
  status: "pending" | "succeeded" | "failed";
  videoUrl?: string;
  videoDuration?: number;
  videoRatio?: string;
  error?: { code: string; message: string };
}> {
  log.debug({ providerId: provider.id, taskId }, "queryWanxiangVideoMixTask 开始");

  if (!taskId || !taskId.trim()) {
    return { status: "failed", error: { code: "INVALID_TASK_ID", message: "taskId 为空" } };
  }

  const callMode = provider.callMode;
  if (callMode !== ProviderCallMode.WANXIANG_VIDEO_MIX_BAILIAN) {
    return { status: "failed", error: { code: "INVALID_CALL_MODE", message: `需要 callMode=wanxiang-video-mix-bailian，当前为 ${callMode}` } };
  }

  const pollingConfig = getVideoPollingConfig();

  // 认证
  const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
  const auth = authCandidates[0] ?? `Bearer ${provider.secret}`;

  // 查询端点
  const queryEndpoints = buildWanxiangVideoMixQueryEndpointCandidates(provider.baseUrl, taskId);
  const queryEndpoint = queryEndpoints[0] ?? "";
  if (!queryEndpoint) {
    return { status: "failed", error: { code: "NO_QUERY_ENDPOINT", message: "无法构建查询端点" } };
  }

  const headers: Record<string, string> = { Authorization: auth };

  log.debug({ queryEndpoint, taskId }, "查询万相视频换人任务状态 GET");

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
    const videoUrls = extractVideoUrlsFromWanxiangVideoMixResponse(data);
    if (videoUrls.length > 0) {
      // 提取视频时长和服务模式
      const usage = (data as { usage?: Record<string, unknown> })?.usage;
      const videoDuration = usage?.video_duration as number | undefined;
      const videoRatio = usage?.video_ratio as string | undefined;

      log.info({ url: videoUrls[0], taskId, videoDuration, videoRatio }, "万相视频换人查询成功，返回视频URL");
      return {
        status: "succeeded",
        videoUrl: videoUrls[0],
        videoDuration,
        videoRatio,
      };
    }

    // 检查状态
    const rawStatus = extractTaskStatusFromWanxiangVideoMixResponse(data);
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