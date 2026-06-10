import { AppError } from "../core/errors.js";

const NON_RETRYABLE_VIDEO_HOT_TREND_BATCH_REVERSE_CODES = new Set([
  "PROVIDER_POLICY_MISSING",
  "ROUTE_PROVIDER_MISSING",
  "PROVIDER_POLICY_DISABLED",
  "PROVIDER_SECRET_MISSING",
  "REVERSE_URL_INVALID",
  "URL_REQUIRED",
]);

function normalizeCode(error: unknown): string | null {
  if (error instanceof AppError) {
    return error.code;
  }
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") {
    return String((error as { code: string }).code).trim() || null;
  }
  return null;
}

function normalizeMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim() || "UNKNOWN";
  }
  return String(error ?? "UNKNOWN").trim() || "UNKNOWN";
}

function isRetryableVideoHotTrendBatchReverseError(error: unknown): boolean {
  const code = normalizeCode(error);
  if (!code) {
    return true;
  }
  return !NON_RETRYABLE_VIDEO_HOT_TREND_BATCH_REVERSE_CODES.has(code);
}

export interface VideoHotTrendBatchReverseAttemptAudit {
  attempt: number;
  status: "success" | "error";
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
}

export interface VideoHotTrendBatchReverseResult<TOutput> {
  status: "success" | "failed";
  attempts: number;
  retried: boolean;
  output: TOutput | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptAudits: VideoHotTrendBatchReverseAttemptAudit[];
}

export function resolveVideoHotTrendBatchReverseMaxAttempts(retryCount: number | null | undefined): number {
  // 不再支持重试，始终返回 1
  return 1;
}

export async function runVideoHotTrendBatchReverseWithRetry<TOutput>(input: {
  maxAttempts: number;
  execute: (attempt: number) => Promise<TOutput>;
}): Promise<VideoHotTrendBatchReverseResult<TOutput>> {
  // 不再重试，只执行一次
  try {
    const output = await input.execute(1);
    return {
      status: "success",
      attempts: 1,
      retried: false,
      output,
      errorCode: null,
      errorMessage: null,
      attemptAudits: [{
        attempt: 1,
        status: "success",
        errorCode: null,
        errorMessage: null,
        retryable: false,
      }],
    };
  } catch (error) {
    const errorCode = normalizeCode(error);
    const errorMessage = normalizeMessage(error);
    return {
      status: "failed",
      attempts: 1,
      retried: false,
      output: null,
      errorCode,
      errorMessage,
      attemptAudits: [{
        attempt: 1,
        status: "error",
        errorCode,
        errorMessage,
        retryable: false,
      }],
    };
  }
}
