export const VIDEO_REVERSE_READINESS_CONTRACT_VERSION = "AT29-05.v3";

export const VIDEO_REVERSE_READINESS_ERROR_CODES = [
  "PROVIDER_POLICY_MISSING",
  "PROVIDER_DISABLED",
  "PROVIDER_SECRET_MISSING",
  "MODEL_NOT_CONFIGURED",
  "VIDEO_TRANSPORT_UNSUPPORTED",
] as const;

export type VideoReverseReadinessErrorCode = (typeof VIDEO_REVERSE_READINESS_ERROR_CODES)[number];
export type VideoReverseFailureUiState = "environment_not_ready" | "request_error";

export const VIDEO_REVERSE_ENVIRONMENT_NOT_READY_MESSAGE = "环境未就绪：请先配置视频反推 provider / policy。";
export const VIDEO_REVERSE_TRANSPORT_UNSUPPORTED_MESSAGE =
  "环境未就绪：当前视频反推 provider 不支持直链视频多模态，请切换到 Gemini / Yunwu Gemini 视频协议。";
export const VIDEO_REVERSE_GENERIC_FAILURE_MESSAGE = "视频反推失败，请稍后重试。";
export const VIDEO_REVERSE_LINK_EXPIRED_MESSAGE = "链接已失效或不可访问，请更换可访问的抖音/视频链接后重试。";

export const VIDEO_REVERSE_READINESS_INVARIANTS = [
  "Readiness failures must surface explicit 503-style errors instead of fake success payloads.",
  "Frontend error handling must treat both code and errorCode fields as the same logical error code source.",
  "Environment-not-ready failures must not create placeholder library cards or synthetic script results.",
  "Unknown failures may show a generic retry message, but they still must not persist success-like reverse results.",
  "Frontend may keep the previous successful analysis panel visible when a new reverse request fails.",
] as const;

export interface VideoReverseErrorPayload {
  readonly code?: string | null;
  readonly errorCode?: string | null;
  readonly message?: string | null;
  readonly requestId?: string | null;
  readonly request_id?: string | null;
}

export interface VideoReverseFailurePolicy {
  readonly normalizedCode: string | null;
  readonly uiState: VideoReverseFailureUiState;
  readonly httpStatus: 503 | 502;
  readonly userMessage: string;
  readonly allowPlaceholderCardWrite: false;
  readonly allowLibraryMutation: false;
}

export function normalizeVideoReverseErrorCode(payload: VideoReverseErrorPayload | null | undefined): string | null {
  const normalized =
    String(payload?.code ?? payload?.errorCode ?? "")
      .trim()
      .toUpperCase() || null;
  return normalized;
}

export function isVideoReverseReadinessErrorCode(code: unknown): code is VideoReverseReadinessErrorCode {
  return (
    code === "PROVIDER_POLICY_MISSING" ||
    code === "PROVIDER_DISABLED" ||
    code === "PROVIDER_SECRET_MISSING" ||
    code === "MODEL_NOT_CONFIGURED" ||
    code === "VIDEO_TRANSPORT_UNSUPPORTED"
  );
}

export function resolveVideoReverseFailurePolicy(payload: VideoReverseErrorPayload | null | undefined): VideoReverseFailurePolicy {
  const normalizedCode = normalizeVideoReverseErrorCode(payload);
  const message = String(payload?.message ?? "").trim();

  if (normalizedCode && isVideoReverseReadinessErrorCode(normalizedCode)) {
    const explicitEnvironmentMessage = message.startsWith("环境未就绪") ? message : "";
    const defaultMessage =
      normalizedCode === "VIDEO_TRANSPORT_UNSUPPORTED"
        ? VIDEO_REVERSE_TRANSPORT_UNSUPPORTED_MESSAGE
        : VIDEO_REVERSE_ENVIRONMENT_NOT_READY_MESSAGE;
    return {
      normalizedCode,
      uiState: "environment_not_ready",
      httpStatus: 503,
      userMessage: explicitEnvironmentMessage || defaultMessage,
      allowPlaceholderCardWrite: false,
      allowLibraryMutation: false,
    };
  }

  const normalizedMessage = message.toLowerCase();
  const shouldShowLinkExpiredMessage =
    normalizedCode === "VIDEO_SOURCE_UNREADABLE" ||
    normalizedCode === "REVERSE_URL_INVALID" ||
    normalizedCode === "URL_REQUIRED" ||
    ((normalizedCode === "DUAL_FALLBACK_EXHAUSTED" || normalizedCode === "VIDEO_REVERSE_FAILED") &&
      [
        "video_reverse failed after dual fallback attempts",
        "reverse_copy failed after dual fallback attempts",
        "provider response indicates missing video input",
        "未读取到有效视频内容",
        "missing video input",
        "link expired",
        "链接失效",
        "链接不可访问",
        "url invalid",
        "404",
      ].some((token) => normalizedMessage.includes(token.toLowerCase())));
  if (shouldShowLinkExpiredMessage) {
    return {
      normalizedCode: normalizedCode ?? "VIDEO_SOURCE_UNREADABLE",
      uiState: "request_error",
      httpStatus: 502,
      userMessage: VIDEO_REVERSE_LINK_EXPIRED_MESSAGE,
      allowPlaceholderCardWrite: false,
      allowLibraryMutation: false,
    };
  }

  return {
    normalizedCode,
    uiState: "request_error",
    httpStatus: 502,
    userMessage: message || VIDEO_REVERSE_GENERIC_FAILURE_MESSAGE,
    allowPlaceholderCardWrite: false,
    allowLibraryMutation: false,
  };
}

export function shouldPersistVideoReverseFailureResult(_payload: VideoReverseErrorPayload | null | undefined): true {
  return true;
}
