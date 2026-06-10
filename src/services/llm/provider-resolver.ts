/**
 * provider-resolver.ts
 *
 * Provider 路由解析相关函数集合。
 * 从 app.ts 提取，负责 Provider 选择、超时计算、fallback 顺序、审计记录等逻辑。
 */

import { decryptSecret } from "../../core/security.js";
import { AppError } from "../../core/errors.js";
import { getLogger } from "../../core/logger/index.js";
import type { ProviderRouteKey, ProviderCallAudit, ProviderCallMode } from "../../contracts/types.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";
import { parseModelCandidates } from "../../utils/http-request.js";
import type { AppContext } from "../../core/app-context.js";

// ---------------------------------------------------------------------------
// 诊断类型定义（从 dual-fallback-policy 简化迁移）
// ---------------------------------------------------------------------------

/** 能力降级键 */
export type CapabilityFallbackKey = "video_studio" | "reverse_copy" | "video_reverse" | "hot_billboard";

/** 降级尝试状态 */
export type FallbackAttemptStatus = "success" | "error" | "timeout";

/** 降级尝试记录 */
export interface FallbackAttempt {
  capability: CapabilityFallbackKey;
  apiId: string;
  model: string;
  stage: "model_chain" | "api_chain";
  status: FallbackAttemptStatus;
  latencyMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  endpoint?: string | null;
}

/** 能力诊断信息 */
export interface CapabilityDiagnostics {
  requestId: string | null;
  attempts: FallbackAttempt[];
}

/** 创建能力诊断信息 */
export function createCapabilityDiagnostics(
  capability: CapabilityFallbackKey,
  attempts: FallbackAttempt[],
  requestId: string | null = null,
): CapabilityDiagnostics {
  return {
    requestId,
    attempts: attempts.map((item) => ({
      capability,
      apiId: item.apiId,
      model: item.model,
      stage: item.stage,
      status: item.status,
      latencyMs: Math.max(1, Math.floor(item.latencyMs || 1)),
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      endpoint: item.endpoint,
    })),
  };
}

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 解析后的路由 Provider 信息 */
export interface ResolvedRouteProvider {
  id: string;
  vendor: string;
  baseUrl: string;
  model: string;
  callMode: ProviderCallMode;
  /** 访问标识（如 AWS Access Key ID / 可灵 AccessKey），用于 JWT 认证等场景 */
  accessKey?: string | null;
  options?: {
    geminiGroundingEnabled?: boolean;
    geminiFallbackModels?: string[];
  };
  timeoutMs: number;
  secret: string;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** Gemini 文本 fallback 默认模型列表 */
const DEFAULT_GEMINI_TEXT_FALLBACK_MODELS = [
  "gemini-3-pro-preview"
] as const;

/** Gemini 图片 fallback 默认模型列表 */
const DEFAULT_GEMINI_IMAGE_FALLBACK_MODELS = [
  "gemini-3-flash-image-preview"
] as const;

// ---------------------------------------------------------------------------
// 函数实现
// ---------------------------------------------------------------------------

/** 判断是否为云雾 Provider */
export function isYunwuProviderSource(provider: { vendor: string; baseUrl: string }): boolean {
  const vendor = provider.vendor.trim().toLowerCase();
  const base = provider.baseUrl.trim().toLowerCase();
  return vendor.includes("yunwu") || base.includes("yunwu.ai");
}

/** 解析 Provider 超时时间 */
export function resolveProviderTimeoutMs(
  routeKey: ProviderRouteKey,
  baseTimeoutMs: number,
  provider: { vendor: string; baseUrl: string },
): number {
  let timeoutMs = Math.max(1_000, baseTimeoutMs);
  // Yunwu Gemini on script_generation/grounding routes regularly takes much longer than generic defaults (20s).
  if (
    (routeKey === ProviderRouteKeys.STEP3_REALTIME_SCRIPT_GENERATION ||
      routeKey === ProviderRouteKeys.STEP1_FASHION_SEARCH) &&
    isYunwuProviderSource(provider)
  ) {
    timeoutMs = Math.max(timeoutMs, 120_000);
  }
  return timeoutMs;
}

/** 解析路由 Provider ID */
export async function resolveRouteProviderId(ctx: AppContext, routeKey: ProviderRouteKey): Promise<string> {
  const policy = (await ctx.repos.providerPolicies.list()).find(
    (item) => item.routeKey === routeKey && item.enabled,
  );
  if (policy) {
    return policy.primaryProviderId;
  }
  const firstEnabled = (await ctx.repos.providers.list()).find((item) => item.enabled);
  if (firstEnabled) {
    return firstEnabled.id;
  }
  return "system-default";
}

/** 解析路由重试次数 */
export async function resolveRouteRetryCount(ctx: AppContext, routeKey: ProviderRouteKey): Promise<number> {
  const policy = (await ctx.repos.providerPolicies.list()).find(
    (item) => item.routeKey === routeKey && item.enabled,
  );
  if (!policy) {
    return 0;
  }
  const retryCount = Number(policy.retryCount);
  if (!Number.isFinite(retryCount)) {
    return 0;
  }
  return Math.max(0, Math.floor(retryCount));
}

/** 记录路由审计 */
export async function recordRouteAudit(
  ctx: AppContext,
  routeKey: ProviderRouteKey,
  startedAt: number,
  status: "success" | "error" | "timeout",
  cost = 0,
  errorCode: string | null = null,
  errorMessage: string | null = null,
  requestSummary: string | null = null,
  responseSummary: string | null = null,
  options?: {
    requestId?: string | null;
    timeoutMs?: number | null;
    slowRequestThresholdMs?: number | null;
  },
): Promise<void> {
  const normalizedErrorMessage =
    errorMessage && errorMessage.trim().length > 0
      ? errorMessage.trim()
      : errorCode && errorCode.trim().length > 0
        ? errorCode.trim()
        : null;
  ctx.providerAdminService.recordCallAudit({
    providerId: await resolveRouteProviderId(ctx, routeKey),
    routeKey,
    status,
    latencyMs: Math.max(1, ctx.clock.now() - startedAt),
    cost,
    errorCode,
    errorMessage: normalizedErrorMessage,
    requestSummary,
    responseSummary,
    requestId: options?.requestId ?? undefined,
    timeoutMs: options?.timeoutMs ?? undefined,
    slowRequestThresholdMs: options?.slowRequestThresholdMs ?? undefined,
    createdAt: startedAt,
  });
}

/** 创建待处理路由审计 */
export async function createPendingRouteAudit(
  ctx: AppContext,
  input: {
    routeKey: ProviderRouteKey;
    startedAt: number;
    providerId?: string | null;
    requestId?: string | null;
    requestSummary?: string | null;
    responseSummary?: string | null;
    timeoutMs?: number | null;
    slowRequestThresholdMs?: number | null;
  },
): Promise<ProviderCallAudit> {
  return ctx.providerAdminService.recordCallAudit({
    providerId: input.providerId?.trim() || await resolveRouteProviderId(ctx, input.routeKey),
    routeKey: input.routeKey,
    requestId: input.requestId ?? undefined,
    status: "pending",
    latencyMs: 0,
    cost: 0,
    errorCode: null,
    errorMessage: null,
    requestSummary: input.requestSummary ?? null,
    responseSummary: input.responseSummary ?? null,
    timeoutMs: input.timeoutMs ?? undefined,
    slowRequestThresholdMs: input.slowRequestThresholdMs ?? undefined,
    createdAt: input.startedAt,
  });
}

/** 完成路由审计 */
export function finalizeRouteAudit(
  ctx: AppContext,
  input: {
    auditId: string;
    routeKey?: ProviderRouteKey;
    providerId?: string | null;
    requestId?: string | null;
    startedAt: number;
    status: "success" | "error" | "timeout";
    cost?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    requestSummary?: string | null;
    responseSummary?: string | null;
    timeoutMs?: number | null;
    slowRequestThresholdMs?: number | null;
  },
): ProviderCallAudit {
  const normalizedErrorMessage =
    input.errorMessage && input.errorMessage.trim().length > 0
      ? input.errorMessage.trim()
      : input.errorCode && input.errorCode.trim().length > 0
        ? input.errorCode.trim()
        : null;
  return ctx.providerAdminService.updateCallAudit({
    auditId: input.auditId,
    providerId: input.providerId?.trim() || undefined,
    routeKey: input.routeKey,
    requestId: input.requestId ?? undefined,
    status: input.status,
    latencyMs: Math.max(1, ctx.clock.now() - input.startedAt),
    cost: input.cost ?? 0,
    errorCode: input.errorCode ?? null,
    errorMessage: normalizedErrorMessage,
    requestSummary: input.requestSummary,
    responseSummary: input.responseSummary,
    timeoutMs: input.timeoutMs ?? undefined,
    slowRequestThresholdMs: input.slowRequestThresholdMs ?? undefined,
  });
}

/** 解析路由 Provider（支持 fallback_provider_ids 顺序降级） */
export async function resolveRouteProvider(ctx: AppContext, routeKey: ProviderRouteKey): Promise<ResolvedRouteProvider | null> {
  const policy = (await ctx.repos.providerPolicies.list()).find((item) => item.routeKey === routeKey && item.enabled);
  if (!policy) {
    return null;
  }

  // 构建尝试顺序：primary → fallback_provider_ids（去重并排除 primary）
  const uniqueFallbackIds = policy.fallbackProviderIds.filter((id) => id !== policy.primaryProviderId);
  const providerIdsToTry = [policy.primaryProviderId, ...uniqueFallbackIds];
  const log = getLogger("provider-resolver");
  const failedProviders: Array<{ providerId: string; reason: string }> = [];

  for (const providerId of providerIdsToTry) {
    const provider = await ctx.repos.providers.findById(providerId);
    if (!provider || !provider.enabled) {
      const reason = provider ? "provider_disabled" : "provider_missing";
      failedProviders.push({ providerId, reason });
      log.warn({ routeKey, providerId, providerName: provider?.name, reason }, "Provider 不可用，尝试下一个");
      continue;
    }

    const secret = await ctx.repos.providerSecrets.findByProviderId(provider.id);
    if (!secret) {
      failedProviders.push({ providerId, reason: "secret_missing" });
      log.warn({ routeKey, providerId, providerName: provider.name, reason: "secret_missing" }, "Provider secret 缺失，尝试下一个");
      continue;
    }

    // 成功解析，记录是否使用了 fallback
    if (providerId !== policy.primaryProviderId) {
      log.info({ routeKey, primaryProviderId: policy.primaryProviderId, fallbackProviderId: providerId, providerName: provider.name }, "使用 fallback provider");
    }

    return {
      id: provider.id,
      vendor: provider.vendor,
      baseUrl: provider.baseUrl,
      model: provider.model,
      callMode: provider.callMode,
      options: provider.options,
      timeoutMs: resolveProviderTimeoutMs(routeKey, policy.timeoutMs, provider),
      secret: decryptSecret(secret.cipherText),
      accessKey: provider.accessKey || undefined,
    };
  }

  // 所有 provider 都不可用，记录详细失败信息
  const failedDetails = failedProviders.map((f) => `${f.providerId}(${f.reason})`).join(", ");
  throw new AppError(400, "PROVIDER_POLICY_INVALID", `${routeKey} 所有 provider 不可用: ${failedDetails}`);
}

/** 带 fallback 的 Provider 解析 */
export async function resolveRouteProviderWithFallback(
  ctx: AppContext,
  routeKeys: ProviderRouteKey[],
): Promise<{ routeKey: ProviderRouteKey; provider: ResolvedRouteProvider } | null> {
  for (const routeKey of routeKeys) {
    const provider = await resolveRouteProvider(ctx, routeKey);
    if (provider) {
      return { routeKey, provider };
    }
  }
  return null;
}

/** 模型候选去重 */
export function dedupeModelCandidates(models: string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of models) {
    const value = String(item ?? "").trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(value);
  }
  return output;
}

/** 判断是否为 Gemini 图片模型 */
export function isLikelyGeminiImageModelCandidate(modelRaw: string): boolean {
  const model = String(modelRaw ?? "").trim().toLowerCase();
  if (!model) {
    return false;
  }
  return (
    model.includes("image") ||
    model.includes("imagen") ||
    model.includes("nano-banana") ||
    model.includes("nanobanana") ||
    model.includes("seedream")
  );
}

/** 解析 Gemini 模型候选 */
export function resolveGeminiModelCandidates(
  provider: ResolvedRouteProvider,
  options?: { purpose?: "llm" | "image" },
): string[] {
  // 调试模式：跳过 fallback，只使用 provider 指定的模型
  const skipFallback = String(process.env.DEBUG_SKIP_LLM_FALLBACK ?? "").toLowerCase() === "true";
  const purpose = options?.purpose ?? "llm";
  const primary = parseModelCandidates(provider.model);

  // 调试模式直接返回 primary，不走 fallback
  if (skipFallback) {
    return dedupeModelCandidates(primary);
  }

  const fromOptions = Array.isArray(provider.options?.geminiFallbackModels)
    ? provider.options.geminiFallbackModels
    : [];
  if (purpose === "image") {
    const explicitImageCandidates = dedupeModelCandidates([...primary, ...fromOptions]).filter((item) =>
      isLikelyGeminiImageModelCandidate(item),
    );
    if (explicitImageCandidates.length > 0) {
      return explicitImageCandidates;
    }
    return [...DEFAULT_GEMINI_IMAGE_FALLBACK_MODELS];
  }
  const fallbackModels =
    fromOptions.length > 0
      ? fromOptions
      : isYunwuProviderSource(provider)
        ? [...DEFAULT_GEMINI_TEXT_FALLBACK_MODELS]
        : [];
  const merged = dedupeModelCandidates([...primary, ...fallbackModels]);
  if (merged.length > 0) {
    return merged;
  }
  return dedupeModelCandidates([provider.model, ...DEFAULT_GEMINI_TEXT_FALLBACK_MODELS]);
}

/** 解析有序 Provider 链 */
export function resolveOrderedProviderChain(
  providers: ResolvedRouteProvider[],
  apiFallbackOrder?: string[],
): ResolvedRouteProvider[] {
  if (!Array.isArray(apiFallbackOrder) || apiFallbackOrder.length < 1) {
    return providers;
  }
  const rank = new Map<string, number>();
  apiFallbackOrder.forEach((item, index) => {
    const key = String(item ?? "").trim().toLowerCase();
    if (!key || rank.has(key)) {
      return;
    }
    rank.set(key, index);
  });
  return [...providers].sort((a, b) => {
    const ar = rank.get(a.id.toLowerCase());
    const br = rank.get(b.id.toLowerCase());
    if (ar === undefined && br === undefined) return 0;
    if (ar === undefined) return 1;
    if (br === undefined) return -1;
    return ar - br;
  });
}

/** 解析模型 fallback 顺序 */
export function resolveModelFallbackOrder(provider: ResolvedRouteProvider, override?: string[]): string[] {
  const fromProvider = parseModelCandidates(provider.model);
  if (!Array.isArray(override) || override.length < 1) {
    return fromProvider.length > 0 ? fromProvider : [provider.model];
  }
  const normalizedOverride = override
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
  if (normalizedOverride.length < 1) {
    return fromProvider.length > 0 ? fromProvider : [provider.model];
  }
  return dedupeModelCandidates([...normalizedOverride, ...fromProvider]);
}

/** 标准化运行时覆盖列表 */
export function normalizeRuntimeOverrideList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const output = raw
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
  return output.length > 0 ? output : undefined;
}

/** 构建侧边错误载荷 */
export function buildSideErrorPayload(
  code: string,
  message: string,
  diagnostics: CapabilityDiagnostics,
): {
  errorCode: string;
  message: string;
  requestId: string | null;
  diagnostics: CapabilityDiagnostics;
} {
  return {
    errorCode: code,
    message,
    requestId: diagnostics.requestId ?? null,
    diagnostics,
  };
}

/** 映射反推尝试到 fallback 尝试 */
export function mapReverseAttemptsToFallbackAttempts(
  attempts: Array<{
    stage: string;
    provider: string;
    status: "success" | "failed";
    reasonCode: string;
    elapsedMs: number;
    detail: string | null;
  }>,
): FallbackAttempt[] {
  return attempts.map((attempt, index) => ({
    capability: "reverse_copy",
    apiId: attempt.provider || "reverse-fetch",
    model: attempt.stage,
    stage: index === 0 ? "model_chain" : "api_chain",
    status: attempt.status === "success" ? "success" : "error",
    latencyMs: Math.max(1, attempt.elapsedMs || 1),
    errorCode: attempt.status === "success" ? null : attempt.reasonCode || "UNKNOWN",
    errorMessage: attempt.status === "success" ? null : attempt.detail ?? attempt.reasonCode ?? "UNKNOWN",
  }));

}

/** 解析路由 Provider 链 */
export async function resolveRouteProviderChain(ctx: AppContext, routeKey: ProviderRouteKey): Promise<ResolvedRouteProvider[]> {
  const policy = (await ctx.repos.providerPolicies.list()).find((item) => item.routeKey === routeKey && item.enabled);
  if (!policy) {
    const single = await resolveRouteProvider(ctx, routeKey);
    return single ? [single] : [];
  }
  const providerIds = [policy.primaryProviderId, ...(policy.fallbackProviderIds ?? [])];
  const seen = new Set<string>();
  const providers: ResolvedRouteProvider[] = [];
  for (const providerId of providerIds) {
    const normalizedId = String(providerId ?? "").trim();
    if (!normalizedId || seen.has(normalizedId)) {
      continue;
    }
    seen.add(normalizedId);
    const provider = await ctx.repos.providers.findById(normalizedId);
    if (!provider || !provider.enabled) {
      continue;
    }
    const secret = await ctx.repos.providerSecrets.findByProviderId(provider.id);
    if (!secret) {
      continue;
    }
    providers.push({
      id: provider.id,
      vendor: provider.vendor,
      baseUrl: provider.baseUrl,
      model: provider.model,
      callMode: provider.callMode,
      accessKey: provider.accessKey,
      options: provider.options,
      timeoutMs: resolveProviderTimeoutMs(routeKey, policy.timeoutMs, provider),
      secret: decryptSecret(secret.cipherText),
    });
  }
  return providers;
}
