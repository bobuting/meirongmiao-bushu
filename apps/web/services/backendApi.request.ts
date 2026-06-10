/**
 * backendApi 请求工具模块
 * 包含 request 函数、配置解析、SSE 解析等核心工具
 */

import { useAppStore } from "../store/useAppStore";
import { ApiError, type ApiMode, type ApiFeature, ALL_FEATURES, FEATURE_ALIAS } from "./backendApi.types";
import { API_PATH_PREFIX } from "./backendApi.config";

// ============================================================================
// 环境变量与配置
// ============================================================================

const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<
  string,
  string | undefined
>;
const API_BASE = (env.VITE_API_BASE_URL ?? "").trim();

export const API_MODE = normalizeMode(env.VITE_API_MODE);
export const API_REAL_FEATURES = parseFeatureList(env.VITE_API_REAL_FEATURES);
export const API_REAL_FALLBACK_TO_MOCK = normalizeBoolean(env.VITE_API_REAL_FALLBACK_TO_MOCK, false);
export const API_MOCK_DELAY_MS = Number.parseInt(env.VITE_API_MOCK_DELAY_MS ?? "120", 10) || 0;

// ============================================================================
// 配置解析工具
// ============================================================================

function normalizeMode(raw: string | undefined): ApiMode {
  const value = (raw ?? "real").trim().toLowerCase();
  if (value === "real" || value === "mock" || value === "hybrid") {
    return value;
  }
  return "real";
}

function normalizeBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) {
    return fallback;
  }
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }
  return fallback;
}

function parseFeatureList(raw: string | undefined): Set<ApiFeature> {
  const source = (raw ?? "").trim().toLowerCase();
  const features = new Set<ApiFeature>();
  if (!source) {
    return features;
  }
  const tokens = source
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  for (const token of tokens) {
    if (token === "*" || token === "all") {
      for (const feature of ALL_FEATURES) {
        features.add(feature);
      }
      continue;
    }
    const mapped = FEATURE_ALIAS[token];
    if (mapped) {
      features.add(mapped);
    }
  }
  return features;
}

export function shouldUseReal(feature: ApiFeature): boolean {
  if (API_MODE === "real") {
    return true;
  }
  if (API_MODE === "mock") {
    return false;
  }
  return API_REAL_FEATURES.has(feature);
}

export function getApiBaseUrl(): string {
  return API_BASE || "";
}

// ============================================================================
// Mock 工具
// ============================================================================

export async function mockDelay(delayMs?: number): Promise<void> {
  const resolvedDelay = typeof delayMs === "number" && Number.isFinite(delayMs) ? Math.max(0, Math.floor(delayMs)) : API_MOCK_DELAY_MS;
  if (resolvedDelay <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, resolvedDelay));
}

// ============================================================================
// SSE 解析
// ============================================================================

export function parseSSEEvents(buffer: string): {
  parsed: Array<{ type: string; data: string }>;
  remainder: string;
} {
  const parsed: Array<{ type: string; data: string }> = [];
  const lines = buffer.split("\n");
  let currentEvent: { type?: string; data?: string } = {};
  let remainder = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("event: ")) {
      currentEvent.type = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      currentEvent.data = line.slice(6);
    } else if (line === "" && currentEvent.type && currentEvent.data) {
      parsed.push({ type: currentEvent.type, data: currentEvent.data });
      currentEvent = {};
    } else if (i === lines.length - 1 && line !== "") {
      remainder = line;
    }
  }

  return { parsed, remainder };
}

// ============================================================================
// API 调用记录（调试气泡用）
// ============================================================================

export interface ApiCallRecord {
  /** 唯一 ID */
  id: string;
  /** 请求方法 */
  method: string;
  /** 请求路径（不含前缀） */
  path: string;
  /** 完整 URL */
  url: string;
  /** 请求体（JSON 序列化后的字符串） */
  requestBody: string | null;
  /** HTTP 状态码 */
  status: number | null;
  /** 是否成功（2xx） */
  ok: boolean;
  /** 响应体（JSON 序列化后的字符串，截断） */
  responseBody: string | null;
  /** 错误码（业务层） */
  errorCode: string | null;
  /** 错误消息 */
  errorMessage: string | null;
  /** 耗时（ms） */
  durationMs: number;
  /** 时间戳 */
  timestamp: number;
}

const API_CALL_LOG: ApiCallRecord[] = [];
const API_CALL_LOG_MAX = 60;
let apiCallSeq = 0;

/** 记录一条 API 调用 */
function recordApiCall(record: ApiCallRecord): void {
  API_CALL_LOG.push(record);
  if (API_CALL_LOG.length > API_CALL_LOG_MAX) {
    API_CALL_LOG.splice(0, API_CALL_LOG.length - API_CALL_LOG_MAX);
  }
  apiCallSeq++;
}

/** 获取 API 调用记录（供调试气泡消费） */
export function getApiCallLog(): ApiCallRecord[] {
  return API_CALL_LOG;
}

/** 获取 API 调用记录更新序号（用于判断是否有新数据） */
export function getApiCallSeq(): number {
  return apiCallSeq;
}

/** 截断字符串到指定长度 */
function truncate(str: string | null, maxLen: number): string | null {
  if (!str) return null;
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}

// ============================================================================
// 核心请求函数
// ============================================================================

interface ApiErrorPayload {
  code?: string;
  message?: string;
  requestId?: string;
  request_id?: string;
}

export async function request<T>(
  method: string,
  path: string,
  options?: {
    token?: string | null;
    body?: unknown;
    skipAuthModal?: boolean; // 重试请求跳过 401 弹窗，防止登录后再次弹出
  },
): Promise<T> {
  const headers: Record<string, string> = {};
  const isFormDataBody = typeof FormData !== "undefined" && options?.body instanceof FormData;

  // 自动从 store 获取 token（如果调用者没有显式传递）
  const effectiveToken = options?.token ?? useAppStore.getState().token;
  if (effectiveToken) {
    headers.authorization = `Bearer ${effectiveToken}`;
  }
  if (options?.body !== undefined && !isFormDataBody) {
    headers["content-type"] = "application/json";
  }

  const fetchInit: RequestInit = {
    method,
    headers,
    body:
      options?.body !== undefined
        ? isFormDataBody
          ? (options.body as FormData)
          : JSON.stringify(options.body)
        : undefined,
  };

  // 直接使用配置的 API_BASE 或同源请求（开发环境由 Vite proxy 转发，生产环境后端托管前端）
  const baseUrl = API_BASE || "";
  const url = `${baseUrl}${API_PATH_PREFIX}${path}`;

  // 调试气泡：记录请求开始
  const _startTime = Date.now();
  const _recordId = `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const _bodyStr = !isFormDataBody && options?.body !== undefined
    ? truncate(JSON.stringify(options.body), 2000)
    : isFormDataBody ? "[FormData]" : null;

  let _responseBodyStr: string | null = null;
  let _responseOk = false;
  let _responseStatus: number | null = null;
  let _errorCode: string | null = null;
  let _errorMessage: string | null = null;

  try {
  const response = await fetch(url, fetchInit);
  const responseContentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const isJsonResponse = responseContentType.includes("application/json");
  _responseStatus = response.status;
  _responseOk = response.ok;

  if (!isJsonResponse) {
    _errorCode = "API_INVALID_RESPONSE";
    _errorMessage = `${method} ${path} returned non-JSON response`;
    recordApiCall({
      id: _recordId, method, path, url,
      requestBody: _bodyStr,
      status: _responseStatus, ok: false,
      responseBody: null, errorCode: _errorCode, errorMessage: _errorMessage,
      durationMs: Date.now() - _startTime, timestamp: _startTime,
    });
    throw new ApiError(502, "API_INVALID_RESPONSE", `${method} ${path} returned non-JSON response`, null);
  }

  const payload = (await response.json().catch((e) => {
    console.warn('[API] 响应 JSON 解析失败:', method, path, response.status, e);
    return {};
  })) as ApiErrorPayload & T;
  _responseBodyStr = truncate(JSON.stringify(payload), 4000);

  if (!response.ok) {
    const requestId = String(payload.requestId ?? payload.request_id ?? "").trim() || null;
    _errorCode = (payload as ApiErrorPayload).code ?? "API_ERROR";
    _errorMessage = (payload as ApiErrorPayload).message ?? `${response.status} ${response.statusText}`;
    recordApiCall({
      id: _recordId, method, path, url,
      requestBody: _bodyStr,
      status: _responseStatus, ok: false,
      responseBody: _responseBodyStr, errorCode: _errorCode, errorMessage: _errorMessage,
      durationMs: Date.now() - _startTime, timestamp: _startTime,
    });
    if (response.status === 401) {
      if (typeof window !== "undefined" && !options?.skipAuthModal) {
        console.warn(`[🔐 401拦截] ${method} ${path}`, {
          code: payload.code,
          message: payload.message,
          requestId,
          authModalVisible: useAppStore.getState().authModalVisible,
        });

        // 弹出重登录框，保留项目数据不刷新页面
        const bodyToRetry = isFormDataBody ? undefined : options?.body;
        useAppStore.getState().showReLoginModal(method, path, bodyToRetry);
      }
      throw new ApiError(
        401,
        payload.code ?? "UNAUTHORIZED",
        payload.message ?? "登录已失效，请重新登录后重试",
        requestId,
      );
    }
    // 402 积分不足：弹出通知提示用户充值
    if (response.status === 402) {
      if (typeof window !== "undefined") {
        console.warn(`[💳 402拦截] ${method} ${path}`, {
          code: payload.code,
          message: payload.message,
          requestId,
        });

        // 弹出积分不足通知，引导用户充值
        useAppStore.getState().pushTaskNotification({
          category: "clip",
          title: "积分不足",
          detail: payload.message ?? "当前积分余额不足，请充值后继续操作",
          targetPath: "/profile",
          projectId: null,
          toastDurationMs: 8000,
        });
      }
      throw new ApiError(
        402,
        payload.code ?? "INSUFFICIENT_CREDIT",
        payload.message ?? "积分不足，请充值后继续操作",
        requestId,
      );
    }
    throw new ApiError(
      response.status,
      payload.code ?? "API_ERROR",
      payload.message ?? `${response.status} ${response.statusText}`,
      requestId,
    );
  }
  // 成功响应：记录
  recordApiCall({
    id: _recordId, method, path, url,
    requestBody: _bodyStr,
    status: _responseStatus, ok: true,
    responseBody: _responseBodyStr, errorCode: null, errorMessage: null,
    durationMs: Date.now() - _startTime, timestamp: _startTime,
  });
  return payload as T;
  } catch (err) {
    // 网络异常等非 HTTP 错误
    if (_responseStatus === null) {
      recordApiCall({
        id: _recordId, method, path, url,
        requestBody: _bodyStr,
        status: null, ok: false,
        responseBody: null,
        errorCode: "NETWORK_ERROR",
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - _startTime, timestamp: _startTime,
      });
    }
    throw err;
  }
}

// ============================================================================
// 运行时配置
// ============================================================================

export const backendApiRuntime = {
  mode: API_MODE,
  realFeatures: [...API_REAL_FEATURES],
  fallbackToMock: API_REAL_FALLBACK_TO_MOCK,
};

// ============================================================================
// 通用 API 请求函数工厂
// ============================================================================

/**
 * 创建 API 请求函数
 * 用于需要 path + options 风格调用方式的场景
 *
 * @example
 * const apiRequest = createApiRequest(token);
 * const data = await apiRequest('/some/path', { method: 'POST', body: { foo: 'bar' } });
 */
export function createApiRequest(token: string | null) {
  return async <T = unknown>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
    } = {}
  ): Promise<T> => {
    // 如果 token 为空，使用 store 中的 token
    const effectiveToken = token ?? useAppStore.getState().token;
    return request<T>(options.method || "GET", path, {
      token: effectiveToken,
      body: options.body,
    });
  };
}