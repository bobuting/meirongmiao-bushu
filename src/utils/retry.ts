/**
 * retry.ts
 *
 * 通用重试工具 — 指数退避 + 抖动
 */

/** 重试选项 */
export interface RetryOptions {
  /** 最大尝试次数（含首次），默认 3 */
  maxAttempts?: number;
  /** 基础延迟毫秒，默认 1000 */
  baseDelayMs?: number;
  /** 最大延迟毫秒，默认 10000 */
  maxDelayMs?: number;
  /** 判断是否可重试的函数，默认全部重试 */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/** 带抖动的指数退避延迟 */
function getDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exp = baseMs * Math.pow(2, attempt);
  const jitter = exp * 0.2 * Math.random();
  return Math.min(exp + jitter, maxMs);
}

/** 执行异步操作，失败时按指数退避重试 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 10000;
  const shouldRetry = options?.shouldRetry ?? (() => true);

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1 && shouldRetry(error, attempt)) {
        const delay = getDelay(attempt, baseDelayMs, maxDelayMs);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
