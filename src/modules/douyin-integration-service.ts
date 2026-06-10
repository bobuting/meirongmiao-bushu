import { AppError } from "../core/errors.js";
import { decryptSecret, encryptSecret, maskSecret } from "../core/security.js";
import { resolveEndpointByPolicy } from "../core/runtime-placeholder-policy.js";
import type {
  ReverseFetchOrchestratorRepository,
  SourceCredentialRepository,
} from "../contracts/repository-port-narrowing.js";
import type { IAuditStore } from "../persistence/audit-store.js";
import type {
  AppConfig,
  ReverseAttempt,
  ReverseFetchReasonCode,
  ReverseFetchStage,
  ReverseNextAction,
  ReverseTrace,
  SourceCredential,
  SourceCredentialScope,
  TrendWindow,
} from "../contracts/types.js";
import type {
  DouhotEntry,
  ReverseFetchInput,
  ReverseFetchTraceResult,
  ReverseFetcherAdapter,
  ReverseFetcherFailure,
  ReverseFetcherResult,
  ReverseFetcherSuccess,
  TrendSourceAdapter,
  TrendSourceFetchResult,
  TrendTopic,
} from "../contracts/douyin-integration.js";
import { DEFAULT_REVERSE_FETCH_STAGE_ORDER } from "../contracts/douyin-integration.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("douyin-integration");

const SYSTEM_CREDENTIAL_USER_ID = "__system__";
// ExternalApiAdapter 使用 TikHub 解析视频真实下载地址
// 支持主端点和备用端点 fallback

export interface ReverseExternalApiConfig {
  tikhub: {
    endpoint: string | null;
    fallbackEndpoint: string | null; // 备用端点：fetch_one_video_by_share_url
    token: string | null;
  };
}

function nowMs(): number {
  return Date.now();
}

function normalizeBaseUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }
  return value.replace(/\/+$/, "");
}

function parseDateWindow(window: TrendWindow): number {
  if (window === "7d") return 7 * 24;
  if (window === "30d") return 30 * 24;
  return 24;
}

function normalizeTikHubVideoDateWindow(raw: string | number | null | undefined): 24 | 168 | 720 {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 24;
  }
  if (parsed >= 720) {
    return 720;
  }
  if (parsed >= 168) {
    return 168;
  }
  return 24;
}

/**
 * 将小时数映射为 TikHub API 的 date_window 参数值
 * API 要求: 1 = 按小时, 2 = 按天
 */
function mapDateWindowToApiValue(hours: number): 1 | 2 {
  // <= 24 小时用按小时，> 24 小时用按天
  return hours <= 24 ? 1 : 2;
}

function normalizeToken(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  return value ? value : null;
}

function toAbsoluteDouyinUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^\/\/(?:[a-z0-9-]+\.)*(?:douyin\.com|iesdouyin\.com)(?:\/|$)/i.test(trimmed)) {
    return `https:${trimmed}`;
  }
  if (/^(?:[a-z0-9-]+\.)*(?:douyin\.com|iesdouyin\.com)(?:\/|$)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  if (trimmed.startsWith("/")) {
    return `https://www.douyin.com${trimmed}`;
  }
  return `https://www.douyin.com/${trimmed}`;
}

function extractVideoUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const data = payload as Record<string, unknown>;

  // 抖音 CDN 会分离音频和视频流，优先提取视频相关 URL，避免拿到纯音频流
  // 高优先级：明确标注为视频的字段
  const videoPriorityCandidates: unknown[] = [
    (data.data as Record<string, unknown> | undefined)?.original_video_url,
    (data.video_data as Record<string, unknown> | undefined)?.nwm_video_url_HQ,
    ((data.data as Record<string, unknown> | undefined)?.video_data as Record<string, unknown> | undefined)
      ?.nwm_video_url_HQ,
    data.videoUrl,
    data.video_url,
    (data.data as Record<string, unknown> | undefined)?.videoUrl,
    (data.data as Record<string, unknown> | undefined)?.video_url,
  ];

  // 低优先级：可能是音频也可能是视频的通用字段
  const generalCandidates: unknown[] = [
    data.url,
    data.play_url,
    data.playUrl,
    (data.data as Record<string, unknown> | undefined)?.url,
    (data.data as Record<string, unknown> | undefined)?.play_url,
    (data.data as Record<string, unknown> | undefined)?.playUrl,
    (data.video_data as Record<string, unknown> | undefined)?.wm_video_url_HQ,
    ((data.data as Record<string, unknown> | undefined)?.video_data as Record<string, unknown> | undefined)
      ?.wm_video_url_HQ,
    ((((data.data as Record<string, unknown> | undefined)?.aweme_detail as Record<string, unknown> | undefined)
      ?.video as Record<string, unknown> | undefined)?.play_addr as Record<string, unknown> | undefined)
      ?.url_list,
    Array.isArray(data.items) ? data.items : null,
    Array.isArray(data.data) ? data.data : null,
    Array.isArray((data.data as Record<string, unknown> | undefined)?.items)
      ? (data.data as Record<string, unknown> | undefined)?.items
      : null,
  ];

  // 先从高优先级候选中查找
  const videoUrl = findFirstHttpUrl(videoPriorityCandidates);
  if (videoUrl) {
    return videoUrl;
  }

  // 回退到通用候选
  return findFirstHttpUrl(generalCandidates);
}

/** 从候选值列表中提取第一个有效的 HTTP URL */
function findFirstHttpUrl(candidates: unknown[]): string | null {
  for (const value of candidates) {
    if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const first = value.find((item) => {
        if (typeof item === "string") {
          return /^https?:\/\//i.test(item.trim());
        }
        if (!item || typeof item !== "object") {
          return false;
        }
        return Boolean(extractVideoUrl(item));
      });
      if (typeof first === "string") {
        return first.trim();
      }
      if (first && typeof first === "object") {
        const nested = extractVideoUrl(first);
        if (nested) {
          return nested;
        }
      }
    }
  }
  return null;
}

function parseTrendDirection(raw: unknown): "up" | "down" | "flat" {
  if (typeof raw === "number") {
    if (raw > 0) return "up";
    if (raw < 0) return "down";
    return "flat";
  }
  if (typeof raw === "string") {
    const text = raw.toLowerCase();
    if (/(up|rise|增|升)/i.test(text)) return "up";
    if (/(down|drop|降|跌)/i.test(text)) return "down";
  }
  return "flat";
}

function buildTrendTopicIdentity(topic: TrendTopic): string {
  const normalizedLabel = topic.label.trim().toLowerCase();
  const itemId = typeof topic.itemId === "string" ? topic.itemId.trim() : "";
  if (/^\d{10,24}$/.test(itemId)) {
    return `item:${itemId}|label:${normalizedLabel}`;
  }
  const normalizedUrl = typeof topic.url === "string" ? topic.url.trim().toLowerCase() : "";
  if (normalizedUrl.length > 0) {
    return `url:${normalizedUrl}|label:${normalizedLabel}`;
  }
  return `label:${normalizedLabel}`;
}

export function mergeTrendTopicsByIdentity(
  topicCollections: ReadonlyArray<ReadonlyArray<TrendTopic>>,
  limit: number,
): TrendTopic[] {
  const boundedLimit = Math.max(1, Math.floor(limit));
  const dedup = new Map<string, TrendTopic>();
  for (const collection of topicCollections) {
    for (const topic of collection) {
      const identity = buildTrendTopicIdentity(topic);
      if (!dedup.has(identity)) {
        dedup.set(identity, topic);
      }
      if (dedup.size >= boundedLimit) {
        break;
      }
    }
    if (dedup.size >= boundedLimit) {
      break;
    }
  }
  return [...dedup.values()]
    .sort((a, b) => a.id - b.id)
    .slice(0, boundedLimit);
}

function isDouyinUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("douyin.com") || host.includes("iesdouyin.com");
  } catch (error) {
    log.warn({ err: error, url }, "URL 解析失败，判定为非抖音链接");
    return false;
  }
}

function parseStage(stageRaw: string): ReverseFetchStage | null {
  const value = stageRaw.trim().toUpperCase();
  const candidates: ReverseFetchStage[] = [
    "S1_CUSTOM_COOKIE",
    "S2_PUBLIC_POOL",
    "S3_PLAYWRIGHT_GUEST",
    "S4_USER_QR_COOKIE",
    "S5_EXTERNAL_API",
    "S6_LOCAL_FILE",
  ];
  return candidates.find((item) => item === value) ?? null;
}

export function resolveReverseFetchStageOrder(raw: string | undefined): ReverseFetchStage[] {
  if (!raw?.trim()) {
    return [...DEFAULT_REVERSE_FETCH_STAGE_ORDER];
  }
  const stages = raw
    .split(/[,\s|;]+/)
    .map((item) => parseStage(item))
    .filter((item): item is ReverseFetchStage => Boolean(item));
  if (stages.length === 0) {
    return [...DEFAULT_REVERSE_FETCH_STAGE_ORDER];
  }
  const deduped = [...new Set(stages)];
  if (!deduped.includes("S6_LOCAL_FILE")) {
    deduped.push("S6_LOCAL_FILE");
  }
  return deduped;
}

export function buildReverseExternalApiConfig(config?: Partial<AppConfig>): ReverseExternalApiConfig {
  const tikhubToken = normalizeToken(config?.tikhubApiToken);
  const tikhubEndpointRaw = normalizeBaseUrl(config?.tikhubReverseApiUrl);

  // 备用端点：根据分享链接获取作品数据（从 aweme_detail.video.play_addr.url_list 提取）
  const fallbackEndpoint = "https://api.tikhub.io/api/v1/douyin/web/fetch_one_video_by_share_url";

  return {
    tikhub: {
      endpoint: tikhubEndpointRaw,
      fallbackEndpoint,
      token: tikhubToken,
    },
  };
}

function isLikelyDouyinVideoUrl(url: string): boolean {
  if (!isDouyinUrl(url)) {
    return false;
  }
  return /\/video\/\d+/i.test(url) || /v\.douyin\.com\//i.test(url) || /\/aweme\/v1\/play\//i.test(url);
}

function isLikelyDirectPlayableVideoUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("douyinvod.com")) {
      return true;
    }
  } catch (error) {
    log.warn({ err: error, url }, "URL 解析失败，继续其他规则检查");
  }
  if (/\/aweme\/v1\/play\//i.test(url)) {
    return true;
  }
  if (/\.mp4(?:[?#]|$)/i.test(url)) {
    return true;
  }
  if (/[?&]mime_type=video_mp4(?:[&#]|$)/i.test(url)) {
    return true;
  }
  if (/\/video\/tos\//i.test(url)) {
    return true;
  }
  return /(?:^|[?&])(video_id|vid)=/i.test(url);
}

function normalizeTrendUrlCandidate(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1) {
    return null;
  }
  return toAbsoluteDouyinUrl(trimmed);
}

function normalizeAwemeId(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") {
    return null;
  }
  const text = String(raw).trim();
  if (!/^\d{10,24}$/.test(text)) {
    return null;
  }
  return text;
}

function collectTrendTopicIdCandidates(row: Record<string, unknown>): string[] {
  const awemeInfo = (row.aweme_info ?? row.awemeInfo) as Record<string, unknown> | undefined;
  const awemeDetail = (awemeInfo?.aweme_detail ?? awemeInfo?.awemeDetail) as Record<string, unknown> | undefined;
  return [
    row.aweme_id,
    row.awemeId,
    row.group_id,
    row.groupId,
    row.item_id,
    row.itemId,
    row.video_id,
    row.videoId,
    awemeInfo?.aweme_id,
    awemeInfo?.awemeId,
    awemeDetail?.aweme_id,
    awemeDetail?.awemeId,
    awemeDetail?.item_id,
    awemeDetail?.itemId,
  ]
    .map((value) => normalizeAwemeId(value))
    .filter((value): value is string => Boolean(value));
}

function extractTrendTopicItemIdFromRow(row: Record<string, unknown>): string | null {
  const candidates = collectTrendTopicIdCandidates(row);
  return candidates.length > 0 ? candidates[0] : null;
}

function extractTrendTopicUrlFromRow(row: Record<string, unknown>): string {
  const awemeInfo = (row.aweme_info ?? row.awemeInfo) as Record<string, unknown> | undefined;
  const awemeDetail = (awemeInfo?.aweme_detail ?? awemeInfo?.awemeDetail) as Record<string, unknown> | undefined;
  const awemeVideo = (awemeDetail?.video ?? awemeDetail?.videoInfo) as Record<string, unknown> | undefined;
  const playAddr = (awemeVideo?.play_addr ?? awemeVideo?.playAddr) as Record<string, unknown> | undefined;
  const downloadAddr = (awemeVideo?.download_addr ?? awemeVideo?.downloadAddr) as Record<string, unknown> | undefined;
  const shareInfo = (row.share_info ?? row.shareInfo) as Record<string, unknown> | undefined;
  const listCandidates = [
    row.url_list,
    row.urlList,
    row.play_urls,
    row.playUrls,
    row.video_urls,
    row.videoUrls,
    playAddr?.url_list,
    playAddr?.urlList,
    downloadAddr?.url_list,
    downloadAddr?.urlList,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .map((value) => normalizeTrendUrlCandidate(value))
    .filter((value): value is string => Boolean(value));
  const candidates = [
    // Prefer direct-play/download candidates for shot reverse.
    row.play_url,
    row.playUrl,
    row.download_url,
    row.downloadUrl,
    row.video_url,
    row.videoUrl,
    awemeDetail?.play_url,
    awemeDetail?.playUrl,
    awemeDetail?.download_url,
    awemeDetail?.downloadUrl,
    awemeInfo?.play_url,
    awemeInfo?.playUrl,
    awemeInfo?.download_url,
    awemeInfo?.downloadUrl,
    ...listCandidates,
    row.share_url,
    row.shareUrl,
    row.item_url,
    row.itemUrl,
    row.detail_url,
    row.detailUrl,
    row.jump_url,
    row.jumpUrl,
    row.url,
    awemeInfo?.share_url,
    awemeInfo?.shareUrl,
    awemeDetail?.share_url,
    awemeDetail?.shareUrl,
    awemeDetail?.item_url,
    awemeDetail?.itemUrl,
    awemeDetail?.url,
    shareInfo?.share_url,
    shareInfo?.shareUrl,
  ]
    .map((value) => normalizeTrendUrlCandidate(value))
    .filter((value): value is string => Boolean(value));
  const uniqueCandidates = [...new Set(candidates)];
  const directPlayable = uniqueCandidates.find((value) => isLikelyDirectPlayableVideoUrl(value));
  if (directPlayable) {
    return directPlayable;
  }
  const prioritized = uniqueCandidates.find((value) => isLikelyDouyinVideoUrl(value));
  if (prioritized) {
    return prioritized;
  }
  const douyinUrl = uniqueCandidates.find((value) => isDouyinUrl(value));
  if (douyinUrl) {
    return douyinUrl;
  }
  const awemeIdCandidates = collectTrendTopicIdCandidates(row);
  if (awemeIdCandidates.length > 0) {
    return `https://www.douyin.com/video/${awemeIdCandidates[0]}`;
  }
  return "https://www.douyin.com/";
}

async function fetchJsonFromEndpoint(
  endpoint: string,
  sourceUrl: string,
  headers: Record<string, string>,
  timeoutMs: number,
  method: "GET" | "POST" = "GET",
  body: unknown = null,
  urlParamName: string = "url",
): Promise<{ status: number; data: unknown; text: string }> {
  const encodedUrl = encodeURIComponent(sourceUrl);
  const hasTemplate = endpoint.includes("{url}");
  const baseUrl = hasTemplate
    ? endpoint.replaceAll("{url}", encodedUrl)
    : endpoint;
  const url =
    method === "GET" && !hasTemplate
      ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${urlParamName}=${encodedUrl}`
      : baseUrl;
  const requestBody =
    method === "POST"
      ? body ??
        (hasTemplate
          ? { url: sourceUrl }
          : {
              url: sourceUrl,
            })
      : undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs));
  try {
    const resp = await fetch(url, {
      method,
      headers:
        method === "POST"
          ? {
              "Content-Type": "application/json",
              ...headers,
            }
          : headers,
      body: method === "POST" ? JSON.stringify(requestBody) : undefined,
      signal: controller.signal,
    });
    const text = await resp.text();
    let data: unknown = null;
    if (text.trim().length > 0) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        log.warn({ err: error }, "JSON 解析失败，保留原始文本");
        data = null;
      }
    }
    return { status: resp.status, data, text };
  } finally {
    clearTimeout(timer);
  }
}

function toFailure(
  stage: ReverseFetchStage,
  provider: string,
  reasonCode: ReverseFetchReasonCode,
  retryable: boolean,
  nextAction: ReverseNextAction,
  detail: string | null = null,
): ReverseFetcherFailure {
  return {
    ok: false,
    stage,
    provider,
    reasonCode,
    retryable,
    nextAction,
    detail,
  };
}

function toSuccess(
  stage: ReverseFetchStage,
  provider: string,
  resolvedVideoUrl: string,
  detail: string | null = null,
  scriptHints?: ReverseFetcherSuccess["scriptHints"],
): ReverseFetcherSuccess {
  return {
    ok: true,
    stage,
    provider,
    resolvedVideoUrl,
    ...(scriptHints ? { scriptHints } : {}),
    reasonCode: "OK",
    retryable: false,
    nextAction: "none",
    detail,
  };
}

type AdapterConfig = {
  stage: ReverseFetchStage;
  provider: string;
  endpoint: string | null;
  timeoutMs?: number;
  headers?: Record<string, string>;
  missingCredentialAction?: ReverseNextAction;
  method?: "GET" | "POST";
  body?: unknown;
  urlParamName?: string; // 自定义 URL 查询参数名，默认为 "url"
};

async function resolveByHttpEndpoint(
  input: ReverseFetchInput,
  config: AdapterConfig,
): Promise<ReverseFetcherResult> {

  if (!isDouyinUrl(input.url)) {
    return toFailure(config.stage, config.provider, "INVALID_URL", false, "upload_video_file", "non-douyin url");
  }
  if (!config.endpoint) {
    return toFailure(
      config.stage,
      config.provider,
      "UPSTREAM_EMPTY",
      false,
      config.missingCredentialAction ?? "retry_stage",
      "endpoint not configured",
    );
  }
  try {
    const result = await fetchJsonFromEndpoint(
      config.endpoint,
      input.url,
      {
        Accept: "application/json,text/plain,*/*",
        ...(config.headers ?? {}),
      },
      config.timeoutMs ?? 8_000,
      config.method ?? "GET",
      config.body,
      config.urlParamName,
    );
    if (result.status === 401 || result.status === 403) {
      return toFailure(
        config.stage,
        config.provider,
        "UPSTREAM_UNAUTHORIZED",
        false,
        config.missingCredentialAction ?? "upload_cookie",
        `http-${result.status}`,
      );
    }
    if (result.status >= 400) {
      return toFailure(
        config.stage,
        config.provider,
        "UPSTREAM_HTTP_ERROR",
        true,
        "retry_stage",
        `http-${result.status}`,
      );
    }
    const resolved = extractVideoUrl(result.data);
    if (!resolved) {
      return toFailure(config.stage, config.provider, "UPSTREAM_EMPTY", true, "retry_stage", "video url missing");
    }
    return toSuccess(config.stage, config.provider, resolved);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return toFailure(config.stage, config.provider, "UPSTREAM_TIMEOUT", true, "retry_stage", "timeout");
    }
    return toFailure(config.stage, config.provider, "UNKNOWN", true, "retry_stage", String(error));
  }
}

export class SourceCredentialService {
  constructor(
    private readonly store: SourceCredentialRepository,
    private readonly auditStore: IAuditStore,
  ) {}

  public async upsert(input: {
    userId: string;
    scope: SourceCredentialScope;
    provider: string;
    secret: string;
    expiresAt?: number | null;
    shared?: boolean;
  }): Promise<SourceCredential> {
    const normalizedProvider = input.provider.trim().toLowerCase() || "default";
    const ownerUserId = input.shared ? SYSTEM_CREDENTIAL_USER_ID : input.userId;
    const allCredentials = await this.store.sourceCredentials.list();
    const existing = allCredentials
      .filter(
        (item) =>
          item.userId === ownerUserId &&
          item.scope === input.scope &&
          item.provider === normalizedProvider &&
          item.revokedAt === null,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const now = this.store.now();
    const value = input.secret.trim();
    const item: SourceCredential = {
      id: existing?.id ?? this.store.generateId(),
      userId: ownerUserId,
      scope: input.scope,
      provider: normalizedProvider,
      keyHint: `${normalizedProvider}:${input.scope}`,
      cipherText: encryptSecret(value),
      maskedValue: maskSecret(value),
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.store.sourceCredentials.upsert(item);
    this.auditStore.insertAuditLog({
      id: this.store.generateId(),
      actorUserId: input.userId,
      action: "source_credential_upserted",
      targetId: item.id,
      meta: {
        scope: item.scope,
        provider: item.provider,
        shared: Boolean(input.shared),
        expiresAt: item.expiresAt,
      },
      createdAt: now,
    });
    return item;
  }

  public async revoke(actorUserId: string, credentialId: string): Promise<SourceCredential> {
    const item = await this.store.sourceCredentials.findById(credentialId);
    if (!item) {
      throw new AppError(404, "CREDENTIAL_NOT_FOUND", "Source credential not found");
    }
    const now = this.store.now();
    const next: SourceCredential = { ...item, revokedAt: now, updatedAt: now };
    await this.store.sourceCredentials.upsert(next);
    this.auditStore.insertAuditLog({
      id: this.store.generateId(),
      actorUserId,
      action: "source_credential_revoked",
      targetId: next.id,
      meta: {
        scope: next.scope,
        provider: next.provider,
      },
      createdAt: now,
    });
    return next;
  }

  public async listForUser(userId: string): Promise<SourceCredential[]> {
    const all = await this.store.sourceCredentials.list();
    return all
      .filter((item) => item.userId === userId || item.userId === SYSTEM_CREDENTIAL_USER_ID)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public async resolveActiveSecret(userId: string, scope: SourceCredentialScope, provider?: string): Promise<string | null> {
    const now = this.store.now();
    const providerValue = provider?.trim().toLowerCase();
    const all = await this.store.sourceCredentials.list();
    const records = all
      .filter((item) => item.scope === scope)
      .filter((item) => item.revokedAt === null)
      .filter((item) => item.expiresAt === null || item.expiresAt > now)
      .filter((item) => (providerValue ? item.provider === providerValue : true))
      .filter((item) => item.userId === userId || item.userId === SYSTEM_CREDENTIAL_USER_ID)
      .sort((a, b) => {
        if (a.userId !== b.userId) {
          // Prefer user-specific credential over shared.
          return a.userId === userId ? -1 : 1;
        }
        return b.updatedAt - a.updatedAt;
      });
    if (records.length < 1) {
      return null;
    }
    return decryptSecret(records[0].cipherText);
  }
}

export class CustomCookieAdapter implements ReverseFetcherAdapter {
  public readonly stage = "S1_CUSTOM_COOKIE" as const;
  public readonly provider = "custom_cookie";

  constructor(
    private readonly credentials: SourceCredentialService,
    endpoint: string | null | undefined = null,
    private readonly timeoutMs = 8_000,
  ) {
    this.endpoint = resolveEndpointByPolicy({
      moduleId: "src/modules/douyin-integration-service.ts",
      policyKey: "reverse_fetch.adapter_endpoint",
      endpoint: normalizeBaseUrl(endpoint),
    });
  }

  private readonly endpoint: string | null;

  async fetch(input: ReverseFetchInput): Promise<ReverseFetcherResult> {
    const cookie = await this.credentials.resolveActiveSecret(input.userId, "custom_cookie", this.provider);
    if (!cookie) {
      return toFailure(this.stage, this.provider, "CREDENTIAL_MISSING", false, "upload_cookie", "custom cookie missing");
    }
    return resolveByHttpEndpoint(input, {
      stage: this.stage,
      provider: this.provider,
      endpoint: this.endpoint,
      timeoutMs: this.timeoutMs,
      headers: { Cookie: cookie },
      missingCredentialAction: "upload_cookie",
    });
  }
}

export class PublicPoolAdapter implements ReverseFetcherAdapter {
  public readonly stage = "S2_PUBLIC_POOL" as const;
  public readonly provider = "public_pool";

  constructor(endpoint: string | null | undefined = null, private readonly timeoutMs = 8_000) {
    this.endpoint = resolveEndpointByPolicy({
      moduleId: "src/modules/douyin-integration-service.ts",
      policyKey: "reverse_fetch.adapter_endpoint",
      endpoint: normalizeBaseUrl(endpoint),
    });
  }

  private readonly endpoint: string | null;

  async fetch(input: ReverseFetchInput): Promise<ReverseFetcherResult> {
    return resolveByHttpEndpoint(input, {
      stage: this.stage,
      provider: this.provider,
      endpoint: this.endpoint,
      timeoutMs: this.timeoutMs,
    });
  }
}

export class PlaywrightGuestAdapter implements ReverseFetcherAdapter {
  public readonly stage = "S3_PLAYWRIGHT_GUEST" as const;
  public readonly provider = "playwright_guest";

  constructor(
    private readonly credentials: SourceCredentialService,
    endpoint: string | null | undefined = null,
    private readonly timeoutMs = 8_000,
  ) {
    this.endpoint = resolveEndpointByPolicy({
      moduleId: "src/modules/douyin-integration-service.ts",
      policyKey: "reverse_fetch.adapter_endpoint",
      endpoint: normalizeBaseUrl(endpoint),
    });
  }

  private readonly endpoint: string | null;

  async fetch(input: ReverseFetchInput): Promise<ReverseFetcherResult> {
    const cookie = await this.credentials.resolveActiveSecret(input.userId, "playwright_guest", this.provider);
    if (!cookie) {
      return toFailure(
        this.stage,
        this.provider,
        "PLAYWRIGHT_UNAVAILABLE",
        true,
        "retry_stage",
        "guest cookie missing",
      );
    }
    return resolveByHttpEndpoint(input, {
      stage: this.stage,
      provider: this.provider,
      endpoint: this.endpoint,
      timeoutMs: this.timeoutMs,
      headers: { Cookie: cookie },
      missingCredentialAction: "retry_stage",
    });
  }
}

export class UserQrCookieAdapter implements ReverseFetcherAdapter {
  public readonly stage = "S4_USER_QR_COOKIE" as const;
  public readonly provider = "user_qr_cookie";

  constructor(
    private readonly credentials: SourceCredentialService,
    endpoint: string | null | undefined = null,
    private readonly timeoutMs = 8_000,
  ) {
    this.endpoint = resolveEndpointByPolicy({
      moduleId: "src/modules/douyin-integration-service.ts",
      policyKey: "reverse_fetch.adapter_endpoint",
      endpoint: normalizeBaseUrl(endpoint),
    });
  }

  private readonly endpoint: string | null;

  async fetch(input: ReverseFetchInput): Promise<ReverseFetcherResult> {
    const cookie = await this.credentials.resolveActiveSecret(input.userId, "user_qr_cookie", this.provider);
    if (!cookie) {
      return toFailure(this.stage, this.provider, "QR_LOGIN_REQUIRED", false, "open_qr_login", "qr cookie missing");
    }
    return resolveByHttpEndpoint(input, {
      stage: this.stage,
      provider: this.provider,
      endpoint: this.endpoint,
      timeoutMs: this.timeoutMs,
      headers: { Cookie: cookie },
      missingCredentialAction: "open_qr_login",
    });
  }
}

export class ExternalApiAdapter implements ReverseFetcherAdapter {
  public readonly stage = "S5_EXTERNAL_API" as const;
  public readonly provider = "external_api:tikhub";

  constructor(
    private readonly credentials: SourceCredentialService,
    private readonly config: ReverseExternalApiConfig = buildReverseExternalApiConfig(),
    private readonly timeoutMs = 120_000,
  ) {}

  private tokenHeaders(token: string | null): Record<string, string> | undefined {
    if (!token) {
      return undefined;
    }
    return {
      Authorization: `Bearer ${token}`,
      "x-api-key": token,
      "x-token": token,
    };
  }

  async fetch(input: ReverseFetchInput): Promise<ReverseFetcherResult> {
    // 检查 TikHub endpoint 是否配置
    if (!this.config.tikhub.endpoint && !this.config.tikhub.fallbackEndpoint) {
      return toFailure(
        this.stage,
        this.provider,
        "EXTERNAL_API_DISABLED",
        false,
        "upload_video_file",
        "tikhub endpoint not configured",
      );
    }

    // 获取 token（优先从用户凭证，其次从环境变量）
    const fallbackToken =
      (await this.credentials.resolveActiveSecret(input.userId, "external_api", "tikhub")) ??
      normalizeToken(process.env.REVERSE_EXTERNAL_API_TOKEN) ??
      null;

    const effectiveToken = this.config.tikhub.token ?? fallbackToken;

    // 主端点尝试
    if (this.config.tikhub.endpoint) {
      log.info({ module: "douyin-integration", url: input.url, endpoint: this.config.tikhub.endpoint }, "尝试主端点");
      const primaryResult = await resolveByHttpEndpoint(input, {
        stage: this.stage,
        provider: this.provider,
        endpoint: this.config.tikhub.endpoint,
        timeoutMs: this.timeoutMs,
        headers: this.tokenHeaders(effectiveToken),
        method: "GET",
        missingCredentialAction: "upload_video_file",
        urlParamName: "share_url",
      });

      if (primaryResult.ok) {
        log.info({ module: "douyin-integration", resolvedUrl: primaryResult.resolvedVideoUrl }, "主端点成功");
        return primaryResult;
      }

      // 主端点失败，记录并尝试备用端点
      log.warn(
        {
          module: "douyin-integration",
          url: input.url,
          reasonCode: primaryResult.reasonCode,
          detail: primaryResult.detail,
        },
        "主端点失败，尝试备用端点",
      );
    }

    // 备用端点尝试
    if (this.config.tikhub.fallbackEndpoint) {
      log.info({ module: "douyin-integration", url: input.url, endpoint: this.config.tikhub.fallbackEndpoint }, "尝试备用端点");
      const fallbackResult = await resolveByHttpEndpoint(input, {
        stage: this.stage,
        provider: this.provider + ":fallback",
        endpoint: this.config.tikhub.fallbackEndpoint,
        timeoutMs: this.timeoutMs,
        headers: this.tokenHeaders(effectiveToken),
        method: "GET",
        missingCredentialAction: "upload_video_file",
        urlParamName: "share_url",
      });

      if (fallbackResult.ok) {
        log.info({ module: "douyin-integration", resolvedUrl: fallbackResult.resolvedVideoUrl }, "备用端点成功");
        return fallbackResult;
      }

      // 备用端点也失败
      log.warn(
        {
          module: "douyin-integration",
          url: input.url,
          reasonCode: fallbackResult.reasonCode,
          detail: fallbackResult.detail,
        },
        "备用端点失败",
      );

      return fallbackResult;
    }

    // 无可用端点或全部失败
    return toFailure(
      this.stage,
      this.provider,
      "UPSTREAM_EMPTY",
      false,
      "upload_video_file",
      "所有 TikHub 端点均失败",
    );
  }
}

export class ReverseFetchOrchestrator {
  private readonly adapterByStage: Map<ReverseFetchStage, ReverseFetcherAdapter>;

  constructor(
    private readonly store: ReverseFetchOrchestratorRepository,
    adapters: ReverseFetcherAdapter[],
    private readonly stageOrder: ReverseFetchStage[],
  ) {
    this.adapterByStage = new Map<ReverseFetchStage, ReverseFetcherAdapter>();
    for (const adapter of adapters) {
      this.adapterByStage.set(adapter.stage, adapter);
    }
  }

  public async execute(input: ReverseFetchInput): Promise<ReverseFetchTraceResult> {
    const traceId = this.store.generateId();
    const startedAt = this.store.now();
    const attempts: ReverseFetchTraceResult["attempts"] = [];

    for (const stage of this.stageOrder) {
      if (stage === "S6_LOCAL_FILE") {
        break;
      }
      const adapter = this.adapterByStage.get(stage);
      if (!adapter) {
        attempts.push({
          stage,
          provider: "unconfigured",
          status: "failed",
          reasonCode: "UNKNOWN",
          elapsedMs: 0,
          retryable: false,
          nextAction: "retry_stage",
          detail: "stage adapter missing",
        });
        continue;
      }
      const attemptStartedAt = this.store.now();
      const result = await adapter.fetch(input);
      const elapsedMs = Math.max(1, this.store.now() - attemptStartedAt);
      attempts.push({
        stage: result.stage,
        provider: result.provider,
        status: result.ok ? "success" : "failed",
        reasonCode: result.reasonCode,
        elapsedMs,
        retryable: result.retryable,
        nextAction: result.nextAction,
        detail: result.detail ?? null,
      });
      if (result.ok) {
        const completedAt = this.store.now();
        const trace: ReverseTrace = {
          id: traceId,
          userId: input.userId,
          projectId: input.projectId,
          inputUrl: input.url,
          stageOrder: [...this.stageOrder],
          finalStage: result.stage,
          success: true,
          resolvedVideoUrl: result.resolvedVideoUrl,
          scriptHints: result.scriptHints ?? null,
          createdAt: startedAt,
          updatedAt: completedAt,
        };
        await this.store.reverseTraces.upsert(trace);
        for (const attempt of attempts) {
          const record: ReverseAttempt = {
            id: this.store.generateId(),
            traceId: trace.id,
            taskId: null,
            userId: input.userId,
            projectId: input.projectId,
            inputUrl: input.url,
            stage: attempt.stage,
            provider: attempt.provider,
            status: attempt.status,
            reasonCode: attempt.reasonCode,
            elapsedMs: attempt.elapsedMs,
            retryable: attempt.retryable,
            nextAction: attempt.nextAction,
            detail: attempt.detail,
            createdAt: completedAt,
          };
          await this.store.reverseAttempts.upsert(record);
        }
        return {
          traceId: trace.id,
          stageOrder: [...this.stageOrder],
          attempts,
          success: true,
          finalStage: result.stage,
          resolvedVideoUrl: result.resolvedVideoUrl,
          scriptHints: result.scriptHints ?? null,
          nextAction: "none",
        };
      }
    }

    const completedAt = this.store.now();
    const trace: ReverseTrace = {
      id: traceId,
      userId: input.userId,
      projectId: input.projectId,
      inputUrl: input.url,
      stageOrder: [...this.stageOrder],
      finalStage: "S6_LOCAL_FILE",
      success: false,
      resolvedVideoUrl: null,
      createdAt: startedAt,
      updatedAt: completedAt,
    };
    await this.store.reverseTraces.upsert(trace);
    const suggestedNextAction =
      attempts.length > 0 && attempts[attempts.length - 1].nextAction !== "none"
        ? attempts[attempts.length - 1].nextAction
        : "upload_video_file";
    attempts.push({
      stage: "S6_LOCAL_FILE",
      provider: "local_file",
      status: "failed",
      reasonCode: "LOCAL_FILE_REQUIRED",
      elapsedMs: 0,
      retryable: false,
      nextAction: "upload_video_file",
      detail: "all previous stages exhausted",
    });
    for (const attempt of attempts) {
      const record: ReverseAttempt = {
        id: this.store.generateId(),
        traceId: trace.id,
        taskId: null,
        userId: input.userId,
        projectId: input.projectId,
        inputUrl: input.url,
        stage: attempt.stage,
        provider: attempt.provider,
        status: attempt.status,
        reasonCode: attempt.reasonCode,
        elapsedMs: attempt.elapsedMs,
        retryable: attempt.retryable,
        nextAction: attempt.nextAction,
        detail: attempt.detail,
        createdAt: completedAt,
      };
      await this.store.reverseAttempts.upsert(record);
    }
    return {
      traceId: trace.id,
      stageOrder: [...this.stageOrder],
      attempts,
      success: false,
      finalStage: "S6_LOCAL_FILE",
      resolvedVideoUrl: null,
      scriptHints: null,
      nextAction: suggestedNextAction,
    };
  }
}

function extractTrendRows(payload: unknown): Array<Record<string, unknown>> {
  if (typeof payload === "string") {
    try {
      return extractTrendRows(JSON.parse(payload));
    } catch (error) {
      log.warn({ err: error }, "解析趋势数据 JSON 失败");
      return [];
    }
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const queue: unknown[] = [payload];
  const visited = new Set<unknown>();
  let bestRows: Array<Record<string, unknown>> = [];
  let bestScore = -1;
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    if (Array.isArray(current)) {
      const rows = current.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
      if (rows.length > 0) {
        const score = rows.reduce((sum, row) => {
          const labelRaw =
            row.title ??
            row.word ??
            row.hot_word ??
            row.topic ??
            row.name ??
            row.item_title ??
            row.keyword ??
            row.desc;
          const hasLabel = typeof labelRaw === "string" && labelRaw.trim().length > 0;
          const hasRank = row.rank !== undefined || row.position !== undefined || row.hot_rank !== undefined || row.score !== undefined;
          const hasUrl = row.url !== undefined || row.item_url !== undefined || row.share_url !== undefined;
          return sum + (hasLabel ? 3 : 0) + (hasRank ? 1 : 0) + (hasUrl ? 1 : 0);
        }, 0);
        if (score > bestScore || (score === bestScore && rows.length > bestRows.length)) {
          bestRows = rows;
          bestScore = score;
        }
      }
      for (const item of current) {
        if (item && typeof item === "object") {
          queue.push(item);
        }
      }
      continue;
    }
    if (typeof current === "object") {
      for (const value of Object.values(current as Record<string, unknown>)) {
        if (value && (typeof value === "object" || Array.isArray(value))) {
          queue.push(value);
        }
      }
    }
  }
  return bestRows;
}

function trendRowQualityScore(row: Record<string, unknown>): number {
  const labelRaw =
    row.title ??
    row.word ??
    row.hot_word ??
    row.topic ??
    row.name ??
    row.item_title ??
    row.keyword ??
    row.desc;
  const hasLabel = typeof labelRaw === "string" && labelRaw.trim().length > 0;
  const hasRank =
    row.rank !== undefined || row.position !== undefined || row.hot_rank !== undefined || row.score !== undefined;
  const hasUrl =
    row.url !== undefined ||
    row.item_url !== undefined ||
    row.share_url !== undefined ||
    row.video_url !== undefined ||
    row.play_url !== undefined;
  const hasId =
    row.item_id !== undefined ||
    row.itemId !== undefined ||
    row.aweme_id !== undefined ||
    row.awemeId !== undefined ||
    row.group_id !== undefined ||
    row.groupId !== undefined;
  return (hasLabel ? 3 : 0) + (hasRank ? 1 : 0) + (hasUrl ? 1 : 0) + (hasId ? 1 : 0);
}

function scoreTrendRows(rows: Array<Record<string, unknown>>): number {
  return rows.reduce((sum, row) => sum + trendRowQualityScore(row), 0);
}

function extractTrendRowsByPriority(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const preferredKeyRegex = /^(objs|aweme_list|awemeList|item_list|itemList|list|items|hot_list|hotspot_list)$/i;
  const queue: unknown[] = [payload];
  const visited = new Set<unknown>();
  const candidates: Array<Array<Record<string, unknown>>> = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current) || typeof current !== "object") {
      continue;
    }
    visited.add(current);
    if (Array.isArray(current)) {
      for (const value of current) {
        if (value && typeof value === "object") {
          queue.push(value);
        }
      }
      continue;
    }
    const record = current as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (Array.isArray(value) && preferredKeyRegex.test(key)) {
        const rows = value.filter(
          (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
        );
        if (rows.length > 0) {
          candidates.push(rows);
        }
      }
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }
  if (candidates.length < 1) {
    return [];
  }
  candidates.sort((a, b) => {
    const scoreDiff = scoreTrendRows(b) - scoreTrendRows(a);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return b.length - a.length;
  });
  return candidates[0] ?? [];
}

function normalizeTrendTopicsFromRows(rows: Array<Record<string, unknown>>, limit: number): TrendTopic[] {
  const dedup = new Set<string>();
  const topics: TrendTopic[] = [];
  for (const [index, row] of rows.entries()) {
    const awemeInfo = (row.aweme_info ?? row.awemeInfo) as Record<string, unknown> | undefined;
    const awemeDetail = (awemeInfo?.aweme_detail ?? awemeInfo?.awemeDetail) as Record<string, unknown> | undefined;
    const labelRaw =
      row.title ??
      row.word ??
      row.hot_word ??
      row.topic ??
      row.name ??
      row.item_title ??
      row.keyword ??
      row.sentence ??  // 实时热榜 API 使用 sentence 字段
      row.desc ??
      awemeInfo?.desc ??
      awemeDetail?.desc;
    if (typeof labelRaw !== "string" || labelRaw.trim().length < 1) {
      continue;
    }
    const label = labelRaw.trim();
    const key = label.toLowerCase();
    if (dedup.has(key)) {
      continue;
    }
    dedup.add(key);
    const rankRaw = row.rank ?? row.position ?? row.hot_rank ?? index + 1;
    const rank = Number.isFinite(Number(rankRaw)) ? Math.max(1, Number(rankRaw)) : index + 1;
    const sourceUrl = extractTrendTopicUrlFromRow(row);
    const itemId = extractTrendTopicItemIdFromRow(row);
    const coverUrl = extractTrendTopicCoverFromRow(row, awemeInfo, awemeDetail);
    topics.push({
      id: rank,
      label,
      url: sourceUrl,
      trend: parseTrendDirection(row.trend ?? row.rank_diff ?? row.hot_trend),
      itemId,
      coverUrl,
      rawPayload: { ...row },
    });
    if (topics.length >= Math.max(1, limit)) {
      break;
    }
  }
  return topics.sort((a, b) => a.id - b.id);
}

/**
 * 从 TikHub 原始数据中提取视频封面
 * 抖音 API 封面位置优先级：
 * 1. aweme_detail.video.cover.url_list[0]
 * 2. aweme_detail.video.origin_cover.url_list[0]
 * 3. aweme_info.video.cover.url_list[0]
 * 4. video.cover.url_list[0]
 * 5. cover.url_list[0]
 */
function extractTrendTopicCoverFromRow(
  row: Record<string, unknown>,
  awemeInfo?: Record<string, unknown>,
  awemeDetail?: Record<string, unknown>,
): string | null {
  // TikHub low-fan-list 等接口直接返回字符串格式封面
  const directCoverUrl = row.item_cover_url ?? row.cover_url ?? row.coverUrl;
  if (typeof directCoverUrl === "string" && directCoverUrl.trim()) {
    return directCoverUrl.trim();
  }

  // 尝试从多个嵌套位置提取封面
  const candidates: unknown[] = [
    // aweme_detail.video.cover
    (awemeDetail?.video as Record<string, unknown>)?.cover,
    // aweme_detail.video.origin_cover
    (awemeDetail?.video as Record<string, unknown>)?.origin_cover,
    // aweme_info.video.cover
    (awemeInfo?.video as Record<string, unknown>)?.cover,
    // row.video.cover
    (row.video as Record<string, unknown>)?.cover,
    // row.cover
    row.cover,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const coverObj = candidate as Record<string, unknown>;

    // url_list 是数组，取第一个
    const urlList = coverObj.url_list;
    if (Array.isArray(urlList) && urlList.length > 0 && typeof urlList[0] === "string") {
      return urlList[0];
    }

    // 有些 API 直接返回 url 字段
    if (typeof coverObj.url === "string" && coverObj.url.trim()) {
      return coverObj.url.trim();
    }
  }

  return null;
}

function toCompactTextSnippet(raw: string, maxLen = 260): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function tryParseJsonOrThrow(rawText: string, sourceLabel: string, errorCode: string): unknown {
  if (rawText.trim().length < 1) {
    return {};
  }
  try {
    return JSON.parse(rawText);
  } catch {
    throw new AppError(502, errorCode, `${sourceLabel} response is not json: ${toCompactTextSnippet(rawText)}`);
  }
}

function extractTikHubCacheUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const cacheUrl = record.cache_url ?? record.cacheUrl;
  return typeof cacheUrl === "string" && cacheUrl.trim().length > 0 ? cacheUrl.trim() : null;
}

function extractTikHubDataPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  const root = payload as Record<string, unknown>;
  const outerData = root.data;
  if (!outerData || typeof outerData !== "object") {
    return payload;
  }
  const outerRecord = outerData as Record<string, unknown>;
  const nestedData = outerRecord.data;
  if (nestedData && typeof nestedData === "object") {
    return nestedData;
  }
  return outerData;
}

function validateTikHubUpstreamCode(payload: unknown): void {
  if (!payload || typeof payload !== "object") {
    return;
  }
  const root = payload as Record<string, unknown>;
  const codeRaw = root.code ?? (root.data as Record<string, unknown> | undefined)?.code;
  const messageRaw =
    root.message ??
    root.msg ??
    root.message_zh ??
    (root.data as Record<string, unknown> | undefined)?.message ??
    (root.data as Record<string, unknown> | undefined)?.msg;
  const code = Number(codeRaw);
  if (!Number.isFinite(code) || code === 0 || code === 200) {
    return;
  }
  const message = typeof messageRaw === "string" ? messageRaw.trim() : "";
  throw new AppError(
    502,
    "TIKHUB_UPSTREAM_ERROR",
    `tikhub upstream code=${String(codeRaw)}${message ? ` message=${message}` : ""}`,
  );
}

export class TikHubTrendAdapter implements TrendSourceAdapter {
  private readonly source = "tikhub";

  constructor(
    private readonly endpoint: string | null,
    private readonly token: string | null,
    private readonly timeoutMs = Number(process.env.TIKHUB_TIMEOUT_MS ?? 8_000),
    private readonly section = "TikHub 热榜",
      private readonly method: "GET" | "POST" = "POST",
      private readonly requestProfile: {
        pageSize: number;
        page: number;
        dateWindow: number;
      } = {
        pageSize: Math.max(1, Number(process.env.TIKHUB_VIDEO_PAGE_SIZE ?? 55)),
        page: Math.max(1, Number(process.env.TIKHUB_VIDEO_PAGE ?? 1)),
        dateWindow: normalizeTikHubVideoDateWindow(process.env.TIKHUB_VIDEO_DATE_WINDOW),
      },
  ) {}

  private headers(): Record<string, string> {
    if (!this.token) {
      return { Accept: "application/json,text/plain,*/*" };
    }
    return {
      Accept: "application/json,text/plain,*/*",
      Authorization: `Bearer ${this.token}`,
      "x-api-key": this.token,
      "x-token": this.token,
    };
  }

  async fetchVideoHotTrends(limit: number, _window: TrendWindow): Promise<TrendSourceFetchResult> {
    if (!this.endpoint) {
      throw new AppError(400, "TIKHUB_ENDPOINT_MISSING", "TikHub endpoint missing");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1_000, this.timeoutMs));
    try {
      const requestLimit = Math.max(Math.max(1, limit), this.requestProfile.pageSize);

      // 构建请求 URL 和参数
      let requestUrl: string;
      let requestBody: Record<string, unknown> | undefined;

      if (this.method === "GET") {
        // GET 方法：参数通过 URL 查询字符串传递
        const url = new URL(this.endpoint ?? "");
        url.searchParams.set("page", String(this.requestProfile.page));
        url.searchParams.set("page_size", String(requestLimit));
        // 实时热榜 API 需要 type 参数
        url.searchParams.set("type", "snapshot");
        requestUrl = url.toString();
      } else {
        // POST 方法：参数通过请求体传递
        requestUrl = this.endpoint ?? "";
        // fetch_hot_total_low_fan_list 不接受 date_window 参数
        const isLowFanEndpoint = this.endpoint.includes("low_fan");
        requestBody = {
          page_size: requestLimit,
          page: this.requestProfile.page,
          ...(isLowFanEndpoint ? {} : { date_window: mapDateWindowToApiValue(this.requestProfile.dateWindow) }),
        };
      }

      const response = await fetch(requestUrl, {
        method: this.method,
        headers:
          this.method === "POST"
            ? {
                "Content-Type": "application/json",
                ...this.headers(),
              }
            : this.headers(),
        body: this.method === "POST" ? JSON.stringify(requestBody) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok && this.method === "POST" && response.status === 405) {
        const fallbackUrl = new URL(this.endpoint);
        fallbackUrl.searchParams.set("page_size", String(requestLimit));
        fallbackUrl.searchParams.set("page", String(this.requestProfile.page));
        fallbackUrl.searchParams.set("date_window", String(mapDateWindowToApiValue(this.requestProfile.dateWindow)));
        const fallback = await fetch(fallbackUrl.toString(), {
          method: "GET",
          headers: this.headers(),
          signal: controller.signal,
        });
        const fallbackText = await fallback.text();
        if (!fallback.ok) {
          throw new AppError(502, "TIKHUB_FETCH_FAILED", `tikhub status=${fallback.status}`);
        }
        const parsedFallback = tryParseJsonOrThrow(fallbackText, "tikhub", "TIKHUB_PARSE_FAILED");
        validateTikHubUpstreamCode(parsedFallback);
        const fallbackPayload = extractTikHubDataPayload(parsedFallback);
        const fallbackPreferredRows = extractTrendRowsByPriority(fallbackPayload);
        const fallbackGenericRows = extractTrendRows(fallbackPayload);
        const fallbackRows =
          fallbackPreferredRows.length > fallbackGenericRows.length &&
          fallbackPreferredRows.length >= Math.max(1, Math.floor(limit / 2))
            ? fallbackPreferredRows
            : fallbackGenericRows;
        const topicsFallback = normalizeTrendTopicsFromRows(fallbackRows, limit);
        if (topicsFallback.length < 1) {
          throw new AppError(502, "TIKHUB_EMPTY", `tikhub topic list empty: ${toCompactTextSnippet(fallbackText)}`);
        }
        return {
          source: this.source,
          section: this.section,
          updatedAt: new Date(nowMs()).toISOString(),
          topics: topicsFallback,
        };
      }
      if (!response.ok) {
        throw new AppError(502, "TIKHUB_FETCH_FAILED", `tikhub status=${response.status}`);
      }
      const parsed = tryParseJsonOrThrow(text, "tikhub", "TIKHUB_PARSE_FAILED");
      validateTikHubUpstreamCode(parsed);
      const parsedDataPayload = extractTikHubDataPayload(parsed);
      const preferredRows = extractTrendRowsByPriority(parsedDataPayload);
      const genericRows = extractTrendRows(parsedDataPayload);
      const selectedRows =
        preferredRows.length > genericRows.length && preferredRows.length >= Math.max(1, Math.floor(limit / 2))
          ? preferredRows
          : genericRows;
      let topics = normalizeTrendTopicsFromRows(selectedRows, limit);
      if (topics.length < 1) {
        const cacheUrl = extractTikHubCacheUrl(parsed);
        if (cacheUrl) {
          const cacheResponse = await fetch(cacheUrl, {
            method: "GET",
            headers: {
              Accept: "application/json,text/plain,*/*",
            },
            signal: controller.signal,
          });
          const cacheText = await cacheResponse.text();
          if (!cacheResponse.ok) {
            throw new AppError(502, "TIKHUB_CACHE_FETCH_FAILED", `tikhub cache status=${cacheResponse.status}`);
          }
          const cacheParsed = tryParseJsonOrThrow(cacheText, "tikhub cache", "TIKHUB_CACHE_PARSE_FAILED");
          const cachePayload = extractTikHubDataPayload(cacheParsed);
          const cachePreferredRows = extractTrendRowsByPriority(cachePayload);
          const cacheGenericRows = extractTrendRows(cachePayload);
          const cacheRows =
            cachePreferredRows.length > cacheGenericRows.length &&
            cachePreferredRows.length >= Math.max(1, Math.floor(limit / 2))
              ? cachePreferredRows
              : cacheGenericRows;
          topics = normalizeTrendTopicsFromRows(cacheRows, limit);
          if (topics.length < 1) {
            throw new AppError(502, "TIKHUB_EMPTY", `tikhub cache topic list empty: ${toCompactTextSnippet(cacheText)}`);
          }
        }
      }
      if (topics.length < 1) {
        throw new AppError(502, "TIKHUB_EMPTY", `tikhub topic list empty: ${toCompactTextSnippet(text)}`);
      }
      return {
        source: this.source,
        section: this.section,
        updatedAt: new Date(nowMs()).toISOString(),
        topics,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AppError(504, "TIKHUB_TIMEOUT", "tikhub request timeout");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<{ ok: boolean; source: string; reason: string | null }> {
    try {
      await this.fetchVideoHotTrends(1, "24h");
      return { ok: true, source: this.source, reason: null };
    } catch (error) {
      return { ok: false, source: this.source, reason: String(error) };
    }
  }

  async authStatus(): Promise<{ ready: boolean; source: string; reason: string | null }> {
    return {
      ready: Boolean(this.token),
      source: this.source,
      reason: this.token ? null : "missing tikhub token",
    };
  }

  async refreshSession(): Promise<{ ok: boolean; source: string; reason: string | null }> {
    return {
      ok: true,
      source: this.source,
      reason: "token-based api, no refresh required",
    };
  }
}

export class DouhotAdapter implements TrendSourceAdapter {
  private readonly source = "douhot";

  constructor(
    private readonly credentials: SourceCredentialService,
    private readonly endpoint = normalizeBaseUrl(process.env.DOUHOT_VIDEO_LIST_ENDPOINT) ??
      "https://douhot.douyin.com/douhot/v1/hotspot/list",
    private readonly timeoutMs = Number(process.env.DOUHOT_TIMEOUT_MS ?? 8_000),
  ) {}

  async fetchVideoHotTrends(limit: number, window: TrendWindow): Promise<TrendSourceFetchResult> {
    const queryDateWindow = parseDateWindow(window);
    const url = `${this.endpoint}${this.endpoint.includes("?") ? "&" : "?"}active_tab=hotspot_video&date_window=${queryDateWindow}&sub_type=1001`;
    const cookie = (await this.credentials.resolveActiveSecret(SYSTEM_CREDENTIAL_USER_ID, "custom_cookie")) ??
      (await this.credentials.resolveActiveSecret(SYSTEM_CREDENTIAL_USER_ID, "user_qr_cookie"));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1_000, this.timeoutMs));
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json,text/plain,*/*",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        signal: controller.signal,
      });
      const text = await resp.text();
      if (!resp.ok) {
        throw new AppError(502, "DOUHOT_FETCH_FAILED", `douhot status=${resp.status}`);
      }
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new AppError(502, "DOUHOT_PARSE_FAILED", `douhot response is not json: ${toCompactTextSnippet(text)}`);
      }
      const entries = normalizeDouhotEntries(parsed).slice(0, Math.max(1, limit));
      if (entries.length < 1) {
        throw new AppError(502, "DOUHOT_EMPTY", "douhot topic list empty");
      }
      return {
        source: this.source,
        section: "热点宝视频榜",
        updatedAt: new Date(nowMs()).toISOString(),
        topics: entries.map((entry) => mapDouhotEntryToTrendTopic(entry)),
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AppError(504, "DOUHOT_TIMEOUT", "douhot request timeout");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<{ ok: boolean; source: string; reason: string | null }> {
    try {
      await this.fetchVideoHotTrends(1, "24h");
      return { ok: true, source: this.source, reason: null };
    } catch (error) {
      return { ok: false, source: this.source, reason: String(error) };
    }
  }

  async authStatus(): Promise<{ ready: boolean; source: string; reason: string | null }> {
    const hasCookie =
      Boolean(await this.credentials.resolveActiveSecret(SYSTEM_CREDENTIAL_USER_ID, "custom_cookie")) ||
      Boolean(await this.credentials.resolveActiveSecret(SYSTEM_CREDENTIAL_USER_ID, "user_qr_cookie"));
    return {
      ready: hasCookie,
      source: this.source,
      reason: hasCookie ? null : "missing shared douhot cookie",
    };
  }

  async refreshSession(): Promise<{ ok: boolean; source: string; reason: string | null }> {
    return {
      ok: false,
      source: this.source,
      reason: "manual qr refresh required",
    };
  }
}

function normalizeDouhotEntries(payload: unknown): DouhotEntry[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const raw = payload as Record<string, unknown>;
  const candidates = [
    raw.data,
    (raw.data as Record<string, unknown> | undefined)?.list,
    (raw.data as Record<string, unknown> | undefined)?.hotspot_list,
    raw.list,
    raw.items,
    (raw.data as Record<string, unknown> | undefined)?.items,
  ];
  const lists: unknown[][] = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      lists.push(candidate);
    } else if (candidate && typeof candidate === "object") {
      const record = candidate as Record<string, unknown>;
      for (const value of Object.values(record)) {
        if (Array.isArray(value)) {
          lists.push(value);
        }
      }
    }
  }
  const source = lists.find((item) => item.length > 0) ?? [];
  const dedup = new Set<string>();
  const output: DouhotEntry[] = [];
  for (const [index, item] of source.entries()) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const titleRaw = row.title ?? row.word ?? row.hot_word ?? row.topic ?? row.name;
    const urlRaw = row.url ?? row.share_url ?? row.detail_url ?? row.video_url ?? row.jump_url;
    if (typeof titleRaw !== "string" || titleRaw.trim().length < 1) {
      continue;
    }
    const title = titleRaw.trim();
    const normalizedKey = title.toLowerCase();
    if (dedup.has(normalizedKey)) {
      continue;
    }
    dedup.add(normalizedKey);
    const rankRaw = row.rank ?? row.position ?? row.hot_rank ?? index + 1;
    const rank = Number.isFinite(Number(rankRaw)) ? Math.max(1, Number(rankRaw)) : index + 1;
    const trend = parseTrendDirection(row.trend ?? row.rank_diff ?? row.hot_trend);
    const hotValueRaw = row.hot_value ?? row.hotValue ?? row.score ?? null;
    output.push({
      rank,
      title,
      url: typeof urlRaw === "string" && urlRaw.trim().length > 0 ? toAbsoluteDouyinUrl(urlRaw.trim()) : "https://www.douyin.com/",
      trend,
      hotValue: Number.isFinite(Number(hotValueRaw)) ? Number(hotValueRaw) : null,
      rawPayload: { ...row },
    });
  }
  return output.sort((a, b) => a.rank - b.rank);
}

export function mapDouhotEntryToTrendTopic(entry: DouhotEntry): TrendTopic {
  const normalizedPayload =
    entry.rawPayload && typeof entry.rawPayload === "object"
      ? { ...entry.rawPayload }
      : {
          rank: entry.rank,
          title: entry.title,
          url: entry.url,
          trend: entry.trend,
          hotValue: entry.hotValue,
        };
  return {
    id: entry.rank,
    label: entry.title,
    url: entry.url,
    trend: entry.trend,
    rawPayload: normalizedPayload,
  };
}

export interface ReverseFetchAdapterRuntimeConfig {
  customCookieEndpoint?: string | null;
  customCookieTimeoutMs?: number;
  publicPoolEndpoint?: string | null;
  publicPoolTimeoutMs?: number;
  playwrightGuestEndpoint?: string | null;
  playwrightGuestTimeoutMs?: number;
  userQrCookieEndpoint?: string | null;
  userQrCookieTimeoutMs?: number;
  externalApiTimeoutMs?: number;
}

export function createDefaultReverseFetchAdapters(
  store: SourceCredentialRepository,
  auditStore: IAuditStore,
  config?: Partial<AppConfig>,
  runtime?: ReverseFetchAdapterRuntimeConfig,
): {
  credentials: SourceCredentialService;
  adapters: ReverseFetcherAdapter[];
} {
  const credentials = new SourceCredentialService(store, auditStore);
  return {
    credentials,
    adapters: [
      new CustomCookieAdapter(
        credentials,
        runtime?.customCookieEndpoint,
        runtime?.customCookieTimeoutMs,
      ),
      new PublicPoolAdapter(runtime?.publicPoolEndpoint, runtime?.publicPoolTimeoutMs),
      new PlaywrightGuestAdapter(
        credentials,
        runtime?.playwrightGuestEndpoint,
        runtime?.playwrightGuestTimeoutMs,
      ),
      new UserQrCookieAdapter(
        credentials,
        runtime?.userQrCookieEndpoint,
        runtime?.userQrCookieTimeoutMs,
      ),
      new ExternalApiAdapter(
        credentials,
        buildReverseExternalApiConfig(config),
        runtime?.externalApiTimeoutMs,
      ),
    ],
  };
}
