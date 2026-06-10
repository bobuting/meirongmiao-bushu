import type {
  ProviderExecutionGovernanceConfig,
  ProviderExecutionGovernanceConfigInput,
  ProviderExecutionLease,
  ProviderExecutionLimiter,
  ProviderExecutionTimeoutDecision,
} from "../contracts/provider-execution-governance-contract.js";
import {
  normalizeProviderExecutionGovernanceConfig,
  parseProviderExecutionRouteKey,
} from "../contracts/provider-execution-governance-contract.js";
import type { ProviderRouteKey } from "../contracts/provider-route-policy-contract.js";

export const PROVIDER_EXECUTION_GOVERNANCE_IMPL_VERSION = "AT28-27.v1";

type Clock = () => number;

interface PendingAcquire {
  readonly routeKey: ProviderRouteKey;
  readonly requestId: string;
  readonly maxConcurrency: number;
  readonly resolve: (lease: ProviderExecutionLease) => void;
}

function normalizeRequestId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export class InMemoryProviderExecutionLimiter implements ProviderExecutionLimiter {
  private readonly activeByRoute = new Map<ProviderRouteKey, number>();
  private readonly queueByRoute = new Map<ProviderRouteKey, PendingAcquire[]>();

  constructor(private readonly now: Clock = () => Date.now()) {}

  private activeCount(routeKey: ProviderRouteKey): number {
    return this.activeByRoute.get(routeKey) ?? 0;
  }

  private setActiveCount(routeKey: ProviderRouteKey, count: number): void {
    if (count <= 0) {
      this.activeByRoute.delete(routeKey);
      return;
    }
    this.activeByRoute.set(routeKey, count);
  }

  private enqueue(routeKey: ProviderRouteKey, pending: PendingAcquire): void {
    const queue = this.queueByRoute.get(routeKey) ?? [];
    queue.push(pending);
    this.queueByRoute.set(routeKey, queue);
  }

  private dequeue(routeKey: ProviderRouteKey): PendingAcquire | null {
    const queue = this.queueByRoute.get(routeKey);
    if (!queue || queue.length < 1) {
      return null;
    }
    const next = queue.shift() ?? null;
    if (queue.length < 1) {
      this.queueByRoute.delete(routeKey);
    } else {
      this.queueByRoute.set(routeKey, queue);
    }
    return next;
  }

  async acquire(input: {
    routeKey: ProviderRouteKey;
    requestId: string;
    maxConcurrency: number;
  }): Promise<ProviderExecutionLease> {
    const routeKey = parseProviderExecutionRouteKey(input.routeKey);
    const requestId = normalizeRequestId(input.requestId);
    if (!requestId) {
      throw new Error("provider execution requestId is required");
    }
    const normalized = normalizeProviderExecutionGovernanceConfig({
      maxConcurrency: input.maxConcurrency,
    });
    const maxConcurrency = normalized.maxConcurrency;
    const active = this.activeCount(routeKey);
    if (active < maxConcurrency) {
      this.setActiveCount(routeKey, active + 1);
      return {
        routeKey,
        requestId,
        acquiredAt: this.now(),
        maxConcurrency,
      };
    }
    return await new Promise<ProviderExecutionLease>((resolve) => {
      this.enqueue(routeKey, {
        routeKey,
        requestId,
        maxConcurrency,
        resolve,
      });
    });
  }

  release(lease: ProviderExecutionLease): void {
    const routeKey = parseProviderExecutionRouteKey(lease.routeKey);
    const active = this.activeCount(routeKey);
    if (active > 0) {
      this.setActiveCount(routeKey, active - 1);
    }
    const next = this.dequeue(routeKey);
    if (!next) {
      return;
    }
    const current = this.activeCount(routeKey);
    if (current >= next.maxConcurrency) {
      this.enqueue(routeKey, next);
      return;
    }
    this.setActiveCount(routeKey, current + 1);
    next.resolve({
      routeKey: next.routeKey,
      requestId: next.requestId,
      acquiredAt: this.now(),
      maxConcurrency: next.maxConcurrency,
    });
  }
}

export function createInMemoryProviderExecutionLimiter(now?: Clock): ProviderExecutionLimiter {
  return new InMemoryProviderExecutionLimiter(now);
}

export function resolveProviderExecutionTimeoutDecision(input: {
  routeKey: ProviderRouteKey;
  runtimeConfig: ProviderExecutionGovernanceConfigInput | ProviderExecutionGovernanceConfig;
  policyTimeoutMs?: number | null;
  slowRequestThresholdMs?: number | null;
}): ProviderExecutionTimeoutDecision {
  const base = normalizeProviderExecutionGovernanceConfig(input.runtimeConfig);
  const withPolicy = normalizeProviderExecutionGovernanceConfig({
    maxConcurrency: base.maxConcurrency,
    timeoutMs: input.policyTimeoutMs ?? base.timeoutMs,
    slowRequestThresholdMs: input.slowRequestThresholdMs ?? base.slowRequestThresholdMs,
  });
  return {
    routeKey: parseProviderExecutionRouteKey(input.routeKey),
    timeoutMs: withPolicy.timeoutMs,
    slowRequestThresholdMs: withPolicy.slowRequestThresholdMs,
  };
}
