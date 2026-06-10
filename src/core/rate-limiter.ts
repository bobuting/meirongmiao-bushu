/**
 * 内存速率限制器 — 纯 Node.js 实现，无外部依赖
 *
 * 使用滑动窗口计数器，基于 Map + 定时清理。
 * 适用于单实例部署；多实例需换 Redis 方案。
 */

interface RateBucket {
  /** 当前窗口内的请求计数 */
  count: number;
  /** 窗口重置时间戳 (ms) */
  resetAt: number;
}

export interface RateLimitRule {
  /** 窗口内最大请求数 */
  limit: number;
  /** 窗口时长 (ms) */
  windowMs: number;
}

export interface RateLimitResult {
  /** 是否允许请求 */
  allowed: boolean;
  /** 当前窗口剩余配额 */
  remaining: number;
  /** 超限后需要等待的毫秒数 */
  retryAfterMs: number;
}

/** 预置速率限制规则 */
export const RATE_LIMIT_RULES = {
  /** 登录: 每 IP 每分钟 5 次 */
  login: { limit: 5, windowMs: 60_000 } satisfies RateLimitRule,
  /** 注册: 每 IP 每小时 3 次 */
  register: { limit: 3, windowMs: 3_600_000 } satisfies RateLimitRule,
  /** 全局: 每 IP 每分钟 100 次 */
  global: { limit: 100, windowMs: 60_000 } satisfies RateLimitRule,
} as const;

export type RateLimitRuleName = keyof typeof RATE_LIMIT_RULES;

export class InMemoryRateLimiter {
  private buckets = new Map<string, RateBucket>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(cleanupIntervalMs = 60_000) {
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /** 检查请求是否被允许 */
  check(key: string, rule: RateLimitRule): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    // 窗口过期，重置
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + rule.windowMs };
      this.buckets.set(key, bucket);
    }

    bucket.count++;

    if (bucket.count > rule.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: bucket.resetAt - now,
      };
    }

    return {
      allowed: true,
      remaining: rule.limit - bucket.count,
      retryAfterMs: 0,
    };
  }

  /** 生成速率限制的 key: ruleName:ip */
  keyFor(ruleName: string, ip: string): string {
    return `${ruleName}:${ip}`;
  }

  /** 清理过期的桶 */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) {
        this.buckets.delete(key);
      }
    }
  }

  /** 销毁定时器 */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
