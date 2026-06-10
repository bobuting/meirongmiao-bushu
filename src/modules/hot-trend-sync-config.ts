/**
 * 热榜同步配置解析模块
 *
 * 从 app.ts 提取的热榜同步相关的配置解析函数：
 * - 同步间隔解析
 * - TopN 数量解析
 * - 日期窗口解析
 * - 凭证解析（TikHub、Douhot）
 * - Adapter 工厂
 * - Owner 解析
 */

import { createHash } from "node:crypto";
import type {
  AppConfig,
  SourceCredentialScope,
  TrendEntry,
  User,
} from "../contracts/types.js";
import { AppError } from "../core/errors.js";
import type { AppContext } from "../core/app-context.js";
import type { RuntimeReverseConfig } from "../core/runtime-config.js";
import { decryptSecret } from "../core/security.js";
import {
  HOT_TREND_SOURCE_CONTRACT,
  VIDEO_HOT_TREND_FETCH_CONTRACT,
  type HotTrendType,
} from "../contracts/hot-trend-fetch-config.js";
import type { SourceCredentialService } from "./douyin-integration-service.js";
import { DouhotAdapter, TikHubTrendAdapter } from "./reverse-fetch-adapters.js";

// ============================================================================
// 类型
// ============================================================================

/** 热榜同步配置解析所需的运行时环境 */
export interface HotTrendSyncConfigEnv {
  /** 环境变量 HOT_TREND_SYNC_INTERVAL_MS */
  hotTrendSyncIntervalMs: string | undefined;
  /** 环境变量 HOT_TREND_REALTIME_SYNC_INTERVAL_MS */
  hotTrendRealtimeSyncIntervalMs: string | undefined;
  /** 环境变量 HOT_TREND_VIDEO_SYNC_INTERVAL_MS */
  hotTrendVideoSyncIntervalMs: string | undefined;
  /** 环境变量 HOT_TREND_VIDEO_FETCH_UNDERFLOW_STRATEGY */
  hotTrendVideoFetchUnderflowStrategy: string | undefined;
  /** 环境变量 HOT_TREND_ASSET_OWNER_EMAIL */
  hotTrendAssetOwnerEmail: string | undefined;
  /** 环境变量 HOT_TREND_ASSET_OWNER_PASSWORD */
  hotTrendAssetOwnerPassword: string | undefined;
}

/** 系统凭证用户 ID 常量 */
export const HOT_TREND_SYSTEM_CREDENTIAL_USER_ID = "__system__";

// ============================================================================
// 预计算间隔值（避免每次调用重复计算）
// ============================================================================

export interface HotTrendSyncIntervalState {
  hotTrendRealtimeSyncIntervalMs: number;
  hotTrendVideoSyncIntervalMs: number;
}

/** 预计算热榜同步间隔毫秒值 */
export function computeHotTrendSyncIntervalState(
  env: HotTrendSyncConfigEnv,
): HotTrendSyncIntervalState {
  const defaultRaw = Number(env.hotTrendSyncIntervalMs ?? Number.NaN);
  const hotTrendRealtimeSyncIntervalMs = Math.max(
    60 * 60 * 1000,
    Number(
      env.hotTrendRealtimeSyncIntervalMs ??
      (Number.isFinite(defaultRaw) ? defaultRaw : 60 * 60 * 1000),
    ),
  );
  const hotTrendVideoSyncIntervalMs = Math.max(
    VIDEO_HOT_TREND_FETCH_CONTRACT.intervalMs,
    Number(
      env.hotTrendVideoSyncIntervalMs ??
      (Number.isFinite(defaultRaw) ? defaultRaw : VIDEO_HOT_TREND_FETCH_CONTRACT.intervalMs),
    ),
  );
  return { hotTrendRealtimeSyncIntervalMs, hotTrendVideoSyncIntervalMs };
}

// ============================================================================
// 同步间隔解析
// ============================================================================

/** 解析实时热榜同步间隔（小时） */
export function resolveHotTrendRealtimeSyncIntervalHours(
  config: AppConfig,
  intervalState: HotTrendSyncIntervalState,
): number {
  const configured = Number(config.hotTrendRealtimeSyncIntervalHours);
  if (!Number.isFinite(configured)) {
    return Math.max(1, Math.floor(intervalState.hotTrendRealtimeSyncIntervalMs / (60 * 60 * 1000)));
  }
  return Math.max(1, Math.min(168, Math.floor(configured)));
}

/** 解析视频热榜同步间隔（小时） */
export function resolveHotTrendVideoSyncIntervalHours(
  config: AppConfig,
  intervalState: HotTrendSyncIntervalState,
): number {
  const configured = Number(config.hotTrendVideoSyncIntervalHours);
  if (!Number.isFinite(configured)) {
    return Math.max(12, Math.floor(intervalState.hotTrendVideoSyncIntervalMs / (60 * 60 * 1000)));
  }
  return Math.max(12, Math.min(168, Math.floor(configured)));
}

/** 解析实时热榜 TopN */
export function resolveHotTrendRealtimeTopN(config: AppConfig): number {
  const configured = Number(config.hotTrendRealtimeTopN);
  if (Number.isFinite(configured)) {
    return Math.max(1, Math.min(50, Math.floor(configured)));
  }
  return 20;
}

/** 解析视频热榜 TopN */
export function resolveHotTrendVideoTopN(config: AppConfig): number {
  const configured = Number(config.hotTrendVideoTopN);
  if (Number.isFinite(configured)) {
    return Math.max(1, Math.min(50, Math.floor(configured)));
  }
  return 20;
}

// ============================================================================
// 日期窗口解析
// ============================================================================

/** 解析视频热榜日期窗口（小时） */
export function resolveHotTrendVideoDateWindowHours(config: AppConfig): 24 | 168 | 720 {
  const configured = Number(config.hotTrendVideoDateWindowHours);
  if (!Number.isFinite(configured)) {
    return VIDEO_HOT_TREND_FETCH_CONTRACT.dateWindow;
  }
  const normalized = Math.max(24, Math.min(720, Math.floor(configured)));
  if (normalized >= 720) {
    return 720;
  }
  if (normalized >= 168) {
    return 168;
  }
  return 24;
}

/** 解析视频热榜日期窗口标签 */
export function resolveHotTrendVideoDateWindowLabel(config: AppConfig): "24h" | "7d" | "30d" {
  const hours = resolveHotTrendVideoDateWindowHours(config);
  if (hours >= 720) {
    return "30d";
  }
  if (hours >= 168) {
    return "7d";
  }
  return "24h";
}

/** 解析热榜同步间隔毫秒（按类型） */
export function resolveHotTrendSyncIntervalMs(
  type: HotTrendType,
  config: AppConfig,
  intervalState: HotTrendSyncIntervalState,
): number {
  return type === "video"
    ? Math.max(VIDEO_HOT_TREND_FETCH_CONTRACT.intervalMs, resolveHotTrendVideoSyncIntervalHours(config, intervalState) * 60 * 60 * 1000)
    : Math.max(HOT_TREND_SOURCE_CONTRACT[0].intervalMs, resolveHotTrendRealtimeSyncIntervalHours(config, intervalState) * 60 * 60 * 1000);
}

/** 计算下一次热榜运行时间（整点对齐） */
export function calculateNextHotTrendRunTime(
  type: HotTrendType,
  config: AppConfig,
  intervalState: HotTrendSyncIntervalState,
  nowMs = Date.now(),
): number {
  const nowDate = new Date(nowMs);
  const next = new Date(nowDate.getTime());
  next.setMinutes(0, 0, 0);
  const intervalMs = resolveHotTrendSyncIntervalMs(type, config, intervalState);
  const anchorMs = next.getTime();
  const remainder = anchorMs % intervalMs;
  if (remainder === 0) {
    return anchorMs + intervalMs;
  }
  return anchorMs + (intervalMs - remainder);
}

// ============================================================================
// 凭证解析
// ============================================================================

/** 解析最新的源凭证密文 */
export async function resolveLatestSourceCredentialSecret(
  ctx: AppContext,
  scope: SourceCredentialScope,
  provider?: string,
): Promise<string | null> {
  const providerValue = provider?.trim().toLowerCase();
  const now = ctx.clock.now();
  const candidates = [...await ctx.repos.sourceCredentials.list()]
    .filter((item) => item.scope === scope)
    .filter((item) => item.revokedAt === null)
    .filter((item) => item.expiresAt === null || item.expiresAt > now)
    .filter((item) => (providerValue ? item.provider === providerValue : true))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  for (const item of candidates) {
    try {
      const value = decryptSecret(item.cipherText).trim();
      if (value.length > 0) {
        return value;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/** 解析 TikHub Provider 密钥 */
export async function resolveTikHubProviderSecret(ctx: AppContext): Promise<string | null> {
  const providers = [...await ctx.repos.providers.list()]
    .filter((item) => item.enabled)
    .filter((item) => {
      const signature = `${item.name} ${item.vendor} ${item.baseUrl}`.toLowerCase();
      return signature.includes("tikhub");
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
  for (const provider of providers) {
    const secret = await ctx.repos.providerSecrets.findByProviderId(provider.id);
    if (!secret) {
      continue;
    }
    try {
      const value = decryptSecret(secret.cipherText).trim();
      if (value.length > 0) {
        return value;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/** 解析指定用户的 TikHub Token */
export async function resolveTikHubTokenForUser(
  credentialService: SourceCredentialService,
  userId: string,
): Promise<string | null> {
  const providerScoped = (await credentialService.resolveActiveSecret(userId, "external_api", "tikhub"))?.trim();
  if (providerScoped) {
    return providerScoped;
  }
  const genericScoped = (await credentialService.resolveActiveSecret(userId, "external_api"))?.trim();
  if (genericScoped) {
    return genericScoped;
  }
  return null;
}

/** 解析热榜系统使用的 TikHub Token（按优先级查找） */
export async function resolveTikHubTokenForHotTrends(
  ctx: AppContext,
  credentialService: SourceCredentialService,
  reverseConfig: RuntimeReverseConfig,
): Promise<string | null> {
  const configured = ctx.configService.get().tikhubApiToken?.trim();
  if (configured) {
    return configured;
  }
  const envToken = reverseConfig.tikhubApiToken?.trim();
  if (envToken) {
    return envToken;
  }
  const sharedCredential =
    (await credentialService.resolveActiveSecret(HOT_TREND_SYSTEM_CREDENTIAL_USER_ID, "external_api", "tikhub")) ??
    (await credentialService.resolveActiveSecret(HOT_TREND_SYSTEM_CREDENTIAL_USER_ID, "external_api"));
  const normalizedShared = sharedCredential?.trim() ?? "";
  if (normalizedShared.length > 0) {
    return normalizedShared;
  }
  const latestUserCredential = await resolveLatestSourceCredentialSecret(ctx, "external_api", "tikhub");
  if (latestUserCredential) {
    return latestUserCredential;
  }
  const latestGenericCredential = await resolveLatestSourceCredentialSecret(ctx, "external_api");
  if (latestGenericCredential) {
    return latestGenericCredential;
  }
  const providerSecret = await resolveTikHubProviderSecret(ctx);
  if (providerSecret) {
    return providerSecret;
  }
  return null;
}

/** 解析 Douhot 热榜接口端点 */
export function resolveDouhotEndpointForHotTrends(ctx: AppContext): string | undefined {
  const configured = ctx.configService.get().douhotVideoHotApiUrl?.trim();
  if (!configured) {
    return undefined;
  }
  // Legacy dashboard config accidentally pointed to a web page path.
  if (/\/square\/hotspot(?:\/)?$/i.test(configured)) {
    return undefined;
  }
  return configured;
}

// ============================================================================
// Adapter 工厂
// ============================================================================

/** 构建 DouhotAdapter 实例 */
export function buildDouhotAdapter(
  credentialService: SourceCredentialService,
  ctx: AppContext,
): DouhotAdapter {
  return new DouhotAdapter(credentialService, resolveDouhotEndpointForHotTrends(ctx));
}

/** 构建 TikHub 视频热榜 Adapter */
export async function buildTikHubVideoAdapter(
  ctx: AppContext,
  credentialService: SourceCredentialService,
  reverseConfig: RuntimeReverseConfig,
  tokenOverride?: string | null,
): Promise<TikHubTrendAdapter> {
  return new TikHubTrendAdapter(
    ctx.configService.get().tikhubVideoHotApiUrl?.trim() || null,
    tokenOverride?.trim() || (await resolveTikHubTokenForHotTrends(ctx, credentialService, reverseConfig)),
    reverseConfig.tikhubVideoHotTimeoutMs,
    "TikHub 视频热榜",
    "POST",
    {
      pageSize: reverseConfig.tikhubVideoHotPageSize,
      page: VIDEO_HOT_TREND_FETCH_CONTRACT.page,
      dateWindow: resolveHotTrendVideoDateWindowHours(ctx.configService.get()),
    },
  );
}

/** 构建 TikHub 实时热榜 Adapter */
export async function buildTikHubRealtimeAdapter(
  ctx: AppContext,
  credentialService: SourceCredentialService,
  reverseConfig: RuntimeReverseConfig,
  tokenOverride?: string | null,
): Promise<TikHubTrendAdapter> {
  return new TikHubTrendAdapter(
    ctx.configService.get().tikhubRealtimeHotApiUrl?.trim() || null,
    tokenOverride?.trim() || (await resolveTikHubTokenForHotTrends(ctx, credentialService, reverseConfig)),
    reverseConfig.tikhubTimeoutMs,
    "TikHub 实时热榜",
    "GET",
  );
}

// ============================================================================
// Owner 解析
// ============================================================================

/** 解析热榜资产 Owner 用户 */
export async function resolveHotTrendOwner(
  ctx: AppContext,
  env: HotTrendSyncConfigEnv,
): Promise<User> {
  const preferredEmail = env.hotTrendAssetOwnerEmail?.trim().toLowerCase();
  if (preferredEmail) {
    const byEmail = await ctx.repos.users.findById(preferredEmail);
    if (byEmail) {
      return byEmail;
    }
  }
  const firstAdmin = [...await ctx.repos.users.list()].find((item) => item.role === "admin");
  if (firstAdmin) {
    return firstAdmin;
  }
  const email = preferredEmail || "hottrend-bot@local";
  const password = env.hotTrendAssetOwnerPassword?.trim() || "hottrend-bot-123456";
  try {
    return ctx.authService.register(email, password, "admin");
  } catch {
    const fallback = await ctx.repos.users.findById(email);
    if (fallback) {
      return fallback;
    }
    throw new AppError(500, "HOT_TREND_OWNER_MISSING", "Hot trend asset owner unavailable");
  }
}

// ============================================================================
// 趋势条目操作
// ============================================================================

/** 创建或更新趋势条目 */
export async function upsertTrendEntry(
  ctx: AppContext,
  trendType: HotTrendType,
  source: string,
  dateWindow: "24h" | "7d" | "30d",
  topic: { id: number; label: string; url: string; trend: "up" | "down" | "flat"; itemId?: string | null; rawPayload?: Record<string, unknown> | null },
  syncedAt: number,
): Promise<TrendEntry> {
  const normalizedLabel = topic.label.trim().replace(/\s+/g, " ").toLowerCase();
  const normalizedKey = `${trendType}:${normalizedLabel}:${dateWindow}`;
  const hash = createHash("sha256")
    .update(`${source}|${trendType}|${normalizedKey}|${topic.url}|${topic.itemId ?? ""}`)
    .digest("hex");
  const existing = [...await ctx.repos.trendEntries.list()].find(
    (item) => item.source === source && item.trendType === trendType && item.normalizedKey === normalizedKey,
  );
  const entry: TrendEntry = {
    id: existing?.id ?? ctx.clock.generateId(),
    source,
    trendType,
    dateWindow,
    normalizedKey,
    title: topic.label,
    url: topic.url,
    itemId: topic.itemId ?? null,
    trend: topic.trend,
    rank: topic.id,
    hash,
    syncedAt,
    rawPayload: topic.rawPayload ?? null,
  };
  await ctx.repos.trendEntries.upsert(entry);
  return entry;
}

/** 创建趋势同步任务 */
export async function createTrendSyncJob(
  ctx: AppContext,
  trendType: HotTrendType,
  source: string,
  dateWindow: "24h" | "7d" | "30d",
): Promise<import("../contracts/types.js").TrendSyncJob> {
  const job: import("../contracts/types.js").TrendSyncJob = {
    id: ctx.clock.generateId(),
    trendType,
    source,
    dateWindow,
    status: "running",
    startedAt: ctx.clock.now(),
    finishedAt: null,
    elapsedMs: null,
    topicCount: 0,
    errorCode: null,
    errorMessage: null,
  };
  await ctx.repos.trendSyncJobs.upsert(job);
  return job;
}

/** 完成趋势同步任务 */
export async function finishTrendSyncJob(
  ctx: AppContext,
  job: import("../contracts/types.js").TrendSyncJob,
  patch: {
    status: "success" | "failed";
    topicCount?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
): Promise<void> {
  const finishedAt = ctx.clock.now();
  const next: import("../contracts/types.js").TrendSyncJob = {
    ...job,
    status: patch.status,
    topicCount: patch.topicCount ?? job.topicCount,
    errorCode: patch.errorCode ?? null,
    errorMessage: patch.errorMessage ?? null,
    finishedAt,
    elapsedMs: Math.max(1, finishedAt - job.startedAt),
  };
  await ctx.repos.trendSyncJobs.upsert(next);
}
