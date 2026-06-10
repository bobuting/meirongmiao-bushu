import type { AppConfig } from "../contracts/types.js";
import { normalizeProviderExecutionGovernanceConfig } from "../contracts/provider-execution-governance-contract.js";
import { DEFAULT_CONFIG } from "./config.js";

export type RuntimeEnvInput = Readonly<Record<string, string | undefined>>;

export interface RuntimeServerConfig {
  port: number;
  host: string;
  nodeEnv: string;
  apiBodyLimitBytes: number;
  internalBaseUrl: string;
  hostBaseUrl: string;
}

export interface RuntimePersistenceConfig {
  requireReady: boolean;
}

export interface RuntimeReverseConfig {
  stageOrder: string;
  tikhubApiToken: string | null;
  tikhubVideoDateWindowSetting: string;
  tikhubVideoHotTimeoutMs: number;
  tikhubVideoHotPageSize: number;
  tikhubTimeoutMs: number;
  customCookieEndpoint: string | null;
  customCookieTimeoutMs: number;
  publicPoolEndpoint: string | null;
  publicPoolTimeoutMs: number;
  playwrightGuestEndpoint: string | null;
  playwrightGuestTimeoutMs: number;
  userQrCookieEndpoint: string | null;
  userQrCookieTimeoutMs: number;
  externalApiTimeoutMs: number;
}

export interface RuntimeObjectStorageConfig {
  driver: string;
  bucket: string | null;
  localDir: string | null;
  publicBase: string;
  s3Region: string | null;
  s3Endpoint: string | null;
  s3ForcePathStyle: boolean | null;
  s3PublicBase: string | null;
  s3AccessKeyConfigured: boolean;
  s3SecretKeyConfigured: boolean;
}

export interface RuntimeProviderConfig {
  providerAuditLogDir: string | null;
  maxConcurrency: number;
  timeoutMs: number;
  slowRequestThresholdMs: number;
}

export interface RuntimeDouyinPublishConfig {
  enabled: boolean;
  socialAutoUploadDir: string;
  cookieDir: string;
  historyStorePath: string;
  qrHeadless: boolean;
  remoteLoginEnabled: boolean;
  remoteLoginXpraBin: string;
  remoteLoginChromeBin: string;
  remoteLoginBindHost: string;
  remoteLoginPublicUrlTemplate: string;
  remoteLoginPortStart: number;
  remoteLoginPortEnd: number;
  remoteLoginDisplayStart: number;
  remoteLoginDisplayEnd: number;
  remoteLoginSessionTimeoutMs: number;
}

export interface RuntimeBootstrapAdminConfig {
  email: string | undefined;
  password: string | undefined;
}

export interface RuntimeScoringDaemonConfig {
  enabled: boolean;
  intervalMs: number;
  batchSize: number;
  llmTimeoutMs: number;
}

export interface RuntimeConfigBundle {
  appConfig: AppConfig;
  server: RuntimeServerConfig;
  persistence: RuntimePersistenceConfig;
  reverse: RuntimeReverseConfig;
  objectStorage: RuntimeObjectStorageConfig;
  provider: RuntimeProviderConfig;
  douyinPublish: RuntimeDouyinPublishConfig;
  bootstrapAdmin: RuntimeBootstrapAdminConfig;
  scoringDaemon: RuntimeScoringDaemonConfig;
  evolution: RuntimeEvolutionConfig;
}

export interface RuntimeEvolutionConfig {
  enabled: boolean;
  intervalMs: number;
  minSampleSize: number;
  lowScoreThreshold: number;
  autoDraft: boolean;
}

function readString(env: RuntimeEnvInput, key: string): string | undefined {
  const raw = env[key];
  if (raw === undefined) {
    return undefined;
  }
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

function readStringAlias(env: RuntimeEnvInput, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = readString(env, key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function readInteger(value: string | undefined, fallback: number, min?: number, max?: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  let normalized = Math.floor(parsed);
  if (min !== undefined) {
    normalized = Math.max(min, normalized);
  }
  if (max !== undefined) {
    normalized = Math.min(max, normalized);
  }
  return normalized;
}

function readNumber(value: string | undefined, fallback: number, min?: number, max?: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  let normalized = parsed;
  if (min !== undefined) {
    normalized = Math.max(min, normalized);
  }
  if (max !== undefined) {
    normalized = Math.min(max, normalized);
  }
  return normalized;
}

export function resolveRuntimeAppConfig(
  env: RuntimeEnvInput,
  baseConfig: AppConfig = DEFAULT_CONFIG,
): AppConfig {
  const next: AppConfig = { ...baseConfig };
  const mutable = next as unknown as Record<string, string | number | boolean>;
  const applyBoolean = (key: keyof AppConfig, envKeys: readonly string[]) => {
    const raw = readStringAlias(env, envKeys);
    mutable[String(key)] = readBoolean(raw, Boolean(baseConfig[key]));
  };
  const applyInteger = (
    key: keyof AppConfig,
    envKeys: readonly string[],
    min?: number,
    max?: number,
  ) => {
    const raw = readStringAlias(env, envKeys);
    mutable[String(key)] = readInteger(raw, Number(baseConfig[key]), min, max);
  };
  const applyString = (key: keyof AppConfig, envKeys: readonly string[]) => {
    const raw = readStringAlias(env, envKeys);
    if (raw !== undefined) {
      mutable[String(key)] = raw;
    }
  };
  const applyNumber = (
    key: keyof AppConfig,
    envKeys: readonly string[],
    min?: number,
    max?: number,
  ) => {
    const raw = readStringAlias(env, envKeys);
    mutable[String(key)] = readNumber(raw, Number(baseConfig[key]), min, max);
  };

  applyBoolean("videoMusicEnabled", ["VIDEO_MUSIC_ENABLED"]);
  applyString("videoMusicAllowedAtmospheres", ["VIDEO_MUSIC_ALLOWED_ATMOSPHERES"]);
  applyString("videoMusicDefaultAtmospheres", ["VIDEO_MUSIC_DEFAULT_ATMOSPHERES"]);
  applyString("videoMusicPathPrefix", ["VIDEO_MUSIC_PATH_PREFIX"]);
  applyString("videoMusicPublicBaseUrl", ["VIDEO_MUSIC_PUBLIC_BASE_URL"]);
  applyString("videoMusicVisitUrl", ["VIDEO_MUSIC_VISIT_URL"]);
  applyInteger("lockoutAttempts", ["LOCKOUT_ATTEMPTS"], 1, 20);
  applyInteger("lockoutMinutes", ["LOCKOUT_MINUTES"], 1, 240);
  applyInteger("scriptMaxDurationSec", ["SCRIPT_MAX_DURATION_SEC"], 1, 600);
  applyInteger("mockCreditDefault", ["MOCK_CREDIT_DEFAULT"], 0);
  applyInteger("creditValidityDays", ["CREDIT_VALIDITY_DAYS"], 1, 3650);
  applyInteger("providerErrorLogRetentionDays", ["PROVIDER_ERROR_LOG_RETENTION_DAYS"], 1, 365);
  applyString("reverseFetchStageOrder", ["REVERSE_FETCH_STAGE_ORDER"]);
  applyString("reverseExternalApiPriority", ["REVERSE_EXTERNAL_API_PRIORITY"]);
  applyString("apifyReverseApiUrl", ["APIFY_REVERSE_API_URL"]);
  applyString("apifyReverseApiToken", ["APIFY_API_TOKEN", "APIFY_REVERSE_API_TOKEN"]);
  applyString("tikhubVideoHotApiUrl", ["TIKHUB_VIDEO_HOT_API_URL"]);
  applyString("tikhubRealtimeHotApiUrl", ["TIKHUB_REALTIME_HOT_API_URL"]);
  applyString("tikhubReverseApiUrl", ["TIKHUB_REVERSE_API_URL", "REVERSE_EXTERNAL_API_ENDPOINT"]);
  applyString("tikhubApiToken", ["TIKHUB_API_TOKEN"]);
  applyString("anytocopyReverseApiUrl", ["ANYTOCOPY_REVERSE_API_URL"]);
  applyString("anytocopyReverseApiToken", ["ANYTOCOPY_API_TOKEN", "ANYTOCOPY_REVERSE_API_TOKEN"]);
  applyBoolean("anytocopyEnabled", ["ANYTOCOPY_ENABLED"]);
  applyString("douhotVideoHotApiUrl", ["DOUHOT_VIDEO_LIST_ENDPOINT"]);
  applyString("douyinHotHubRealtimeUrl", ["DOUYIN_HOT_HUB_README_URL"]);
  applyInteger("hotTrendRealtimeTopN", ["HOT_TREND_REALTIME_TOP_N", "HOT_TREND_REALTIME_TOP_X"], 1, 50);
  applyInteger("hotTrendVideoTopN", ["HOT_TREND_VIDEO_TOP_N"], 1, 50);
  applyInteger(
    "hotTrendRealtimeSyncIntervalHours",
    ["HOT_TREND_REALTIME_SYNC_INTERVAL_HOURS"],
    1,
    168,
  );
  applyInteger("hotTrendVideoSyncIntervalHours", ["HOT_TREND_VIDEO_SYNC_INTERVAL_HOURS"], 12, 168);
  applyInteger("hotTrendVideoDateWindowHours", ["HOT_TREND_VIDEO_DATE_WINDOW_HOURS"], 24, 720);
  applyString("hotTrendPromptVersion", ["HOT_TREND_PROMPT_VERSION"]);
  return next;
}

export function resolveRuntimeConfig(
  rawEnv: RuntimeEnvInput = process.env,
  baseConfig: AppConfig = DEFAULT_CONFIG,
): RuntimeConfigBundle {
  const env: RuntimeEnvInput = { ...rawEnv };
  const appConfig = resolveRuntimeAppConfig(env, baseConfig);

  const port = readInteger(readStringAlias(env, ["PORT", "API_PORT"]), 3020, 1, 65535);
  const host = readStringAlias(env, ["HOST"]) ?? "0.0.0.0";
  const nodeEnv = readStringAlias(env, ["NODE_ENV"]) ?? "development";
  const apiBodyLimitBytes = readInteger(readStringAlias(env, ["API_BODY_LIMIT_BYTES"]), 30 * 1024 * 1024, 1024);
  const internalBaseUrlRaw = readStringAlias(env, ["INTERNAL_BASE_URL"]);
  const internalBaseUrl = (internalBaseUrlRaw ?? `http://127.0.0.1:${port}`).replace(/\/+$/, "");
  const hostBaseUrlRaw = readStringAlias(env, ["HOST_BASE_URL"]);
  const hostBaseUrl = hostBaseUrlRaw
    ? hostBaseUrlRaw.replace(/\/+$/, "")
    : `http://127.0.0.1:${port}`;

  const persistenceRequireReady = readBoolean(readStringAlias(env, ["PERSISTENCE_REQUIRE_READY"]), true);

  const reverseStageOrder =
    appConfig.reverseFetchStageOrder.trim() ||
    readStringAlias(env, ["REVERSE_FETCH_STAGE_ORDER"]) ||
    "";
  const tikhubApiToken = appConfig.tikhubApiToken.trim() || readStringAlias(env, ["TIKHUB_API_TOKEN"]) || null;
  const tikhubVideoDateWindowSetting = (readStringAlias(env, ["TIKHUB_VIDEO_HOT_DATE_WINDOW"]) ?? "")
    .trim()
    .toLowerCase();
  const tikhubVideoHotTimeoutMs = Math.max(
    120_000,
    readInteger(readStringAlias(env, ["TIKHUB_VIDEO_HOT_TIMEOUT_MS"]), 120_000, 1000),
  );
  const tikhubVideoHotPageSize = Math.max(
    55,
    readInteger(readStringAlias(env, ["TIKHUB_VIDEO_HOT_PAGE_SIZE"]), 55, 1),
  );
  const tikhubTimeoutMs = readInteger(readStringAlias(env, ["TIKHUB_TIMEOUT_MS"]), 8_000, 1000);

  const objectStorageDriver = (readStringAlias(env, ["OBJECT_STORAGE_DRIVER"]) ?? "local").toLowerCase();
  const objectStorageBucket = readStringAlias(env, ["OBJECT_STORAGE_BUCKET"]) ?? null;
  const objectStorageLocalDir = readStringAlias(env, ["OBJECT_STORAGE_LOCAL_DIR"]) ?? null;
  const objectStoragePublicBaseRaw = readStringAlias(env, ["OBJECT_STORAGE_PUBLIC_BASE"]) ?? "/storage/objects";
  const objectStoragePublicBase = (objectStoragePublicBaseRaw.startsWith("/")
    ? objectStoragePublicBaseRaw
    : `/${objectStoragePublicBaseRaw}`
  ).replace(/\/+$/, "");
  const s3Region = readStringAlias(env, ["S3_REGION"]) ?? null;
  const s3Endpoint = readStringAlias(env, ["S3_ENDPOINT"]) ?? null;
  const s3ForcePathStyleRaw = readStringAlias(env, ["S3_FORCE_PATH_STYLE"]);
  const s3ForcePathStyle = s3ForcePathStyleRaw === undefined ? null : readBoolean(s3ForcePathStyleRaw, false);
  const s3PublicBase = readStringAlias(env, ["OBJECT_STORAGE_S3_PUBLIC_BASE"]) ?? null;
  const s3AccessKeyConfigured = Boolean(readStringAlias(env, ["S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID"]));
  const s3SecretKeyConfigured = Boolean(readStringAlias(env, ["S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY"]));

  const isProduction = nodeEnv === "production";
  const isTest = nodeEnv === "test";
  const appSecretKey = readStringAlias(env, ["APP_SECRET_KEY"]);
  if (isProduction) {
    if (!appSecretKey) {
      throw new Error("[startup] APP_SECRET_KEY is required when NODE_ENV=production.");
    }
    const lowered = appSecretKey.trim().toLowerCase();
    if (lowered === "change-me-in-prod" || lowered === "dev-only-secret-key-change-me") {
      throw new Error(
        "[startup] APP_SECRET_KEY cannot use placeholder/dev fallback value when NODE_ENV=production.",
      );
    }
  }

  const bootstrapEmailFromEnv = readStringAlias(env, ["DEV_BOOTSTRAP_ADMIN_EMAIL"]);
  const bootstrapPasswordFromEnv = readStringAlias(env, ["DEV_BOOTSTRAP_ADMIN_PASSWORD"]);
  if (isProduction && (bootstrapEmailFromEnv || bootstrapPasswordFromEnv)) {
    throw new Error("[startup] DEV_BOOTSTRAP_ADMIN_* is forbidden when NODE_ENV=production.");
  }

  const bootstrapEmail = bootstrapEmailFromEnv ?? (isTest ? "admin@example.com" : undefined);
  const bootstrapPassword = bootstrapPasswordFromEnv ?? (isTest ? "admin123" : undefined);
  const bootstrapPairReady = Boolean(bootstrapEmail) && Boolean(bootstrapPassword);
  const bootstrapPairIncomplete = (Boolean(bootstrapEmail) || Boolean(bootstrapPassword)) && !bootstrapPairReady;
  if (bootstrapPairIncomplete) {
    throw new Error(
      "[startup] DEV_BOOTSTRAP_ADMIN_EMAIL and DEV_BOOTSTRAP_ADMIN_PASSWORD must be provided together.",
    );
  }
  const providerExecutionConfig = normalizeProviderExecutionGovernanceConfig({
    maxConcurrency: readStringAlias(env, ["PROVIDER_MAX_CONCURRENCY"]),
    timeoutMs: readStringAlias(env, ["PROVIDER_TIMEOUT_MS"]),
    slowRequestThresholdMs: readStringAlias(env, ["PROVIDER_SLOW_REQUEST_THRESHOLD_MS"]),
  });

  return {
    appConfig,
    server: {
      port,
      host,
      nodeEnv,
      apiBodyLimitBytes,
      internalBaseUrl,
      hostBaseUrl,
    },
    persistence: {
      requireReady: persistenceRequireReady,
    },
    reverse: {
      stageOrder: reverseStageOrder,
      tikhubApiToken,
      tikhubVideoDateWindowSetting,
      tikhubVideoHotTimeoutMs,
      tikhubVideoHotPageSize,
      tikhubTimeoutMs,
      customCookieEndpoint: readStringAlias(env, ["REVERSE_CUSTOM_COOKIE_ENDPOINT"]) ?? null,
      customCookieTimeoutMs: readInteger(readStringAlias(env, ["REVERSE_CUSTOM_COOKIE_TIMEOUT_MS"]), 8_000, 1000),
      publicPoolEndpoint: readStringAlias(env, ["REVERSE_PUBLIC_POOL_ENDPOINT"]) ?? null,
      publicPoolTimeoutMs: readInteger(readStringAlias(env, ["REVERSE_PUBLIC_POOL_TIMEOUT_MS"]), 8_000, 1000),
      playwrightGuestEndpoint: readStringAlias(env, ["REVERSE_PLAYWRIGHT_GUEST_ENDPOINT"]) ?? null,
      playwrightGuestTimeoutMs: readInteger(
        readStringAlias(env, ["REVERSE_PLAYWRIGHT_GUEST_TIMEOUT_MS"]),
        8_000,
        1000,
      ),
      userQrCookieEndpoint: readStringAlias(env, ["REVERSE_USER_QR_COOKIE_ENDPOINT"]) ?? null,
      userQrCookieTimeoutMs: readInteger(
        readStringAlias(env, ["REVERSE_USER_QR_COOKIE_TIMEOUT_MS"]),
        8_000,
        1000,
      ),
      externalApiTimeoutMs: readInteger(readStringAlias(env, ["REVERSE_EXTERNAL_API_TIMEOUT_MS"]), 120_000, 1000),
    },
    objectStorage: {
      driver: objectStorageDriver,
      bucket: objectStorageBucket,
      localDir: objectStorageLocalDir,
      publicBase: objectStoragePublicBase,
      s3Region,
      s3Endpoint,
      s3ForcePathStyle,
      s3PublicBase,
      s3AccessKeyConfigured,
      s3SecretKeyConfigured,
    },
    provider: {
      providerAuditLogDir: readStringAlias(env, ["PROVIDER_AUDIT_LOG_DIR"]) ?? null,
      maxConcurrency: providerExecutionConfig.maxConcurrency,
      timeoutMs: providerExecutionConfig.timeoutMs,
      slowRequestThresholdMs: providerExecutionConfig.slowRequestThresholdMs,
    },
    douyinPublish: {
      enabled: readBoolean(readStringAlias(env, ["DOUYIN_PUBLISH_ENABLED"]), true),
      socialAutoUploadDir: readStringAlias(env, ["SOCIAL_AUTO_UPLOAD_DIR"]) ?? "",
      cookieDir: readStringAlias(env, ["DOUYIN_COOKIE_DIR", "DOUYIN_COOKIE_FILE"]) ?? "",
      historyStorePath:
        readStringAlias(env, ["DOUYIN_PUBLISH_HISTORY_STORE_PATH"]) ?? "data/douyin-publish-history.json",
      qrHeadless: readBoolean(readStringAlias(env, ["DOUYIN_QR_HEADLESS"]), true),
      remoteLoginEnabled: readBoolean(readStringAlias(env, ["DOUYIN_REMOTE_LOGIN_ENABLED"]), false),
      remoteLoginXpraBin: readStringAlias(env, ["DOUYIN_REMOTE_LOGIN_XPRA_BIN"]) ?? "xpra",
      remoteLoginChromeBin: readStringAlias(env, ["DOUYIN_REMOTE_LOGIN_CHROME_BIN"]) ?? "",
      remoteLoginBindHost: readStringAlias(env, ["DOUYIN_REMOTE_LOGIN_BIND_HOST"]) ?? "127.0.0.1",
      remoteLoginPublicUrlTemplate:
        readStringAlias(env, ["DOUYIN_REMOTE_LOGIN_PUBLIC_URL_TEMPLATE"]) ?? "",
      remoteLoginPortStart: readInteger(
        readStringAlias(env, ["DOUYIN_REMOTE_LOGIN_PORT_START"]),
        14500,
        1000,
        65535,
      ),
      remoteLoginPortEnd: readInteger(
        readStringAlias(env, ["DOUYIN_REMOTE_LOGIN_PORT_END"]),
        14599,
        1000,
        65535,
      ),
      remoteLoginDisplayStart: readInteger(
        readStringAlias(env, ["DOUYIN_REMOTE_LOGIN_DISPLAY_START"]),
        100,
        1,
        9999,
      ),
      remoteLoginDisplayEnd: readInteger(
        readStringAlias(env, ["DOUYIN_REMOTE_LOGIN_DISPLAY_END"]),
        199,
        1,
        9999,
      ),
      remoteLoginSessionTimeoutMs: readInteger(
        readStringAlias(env, ["DOUYIN_REMOTE_LOGIN_SESSION_TIMEOUT_MS"]),
        15 * 60 * 1000,
        10_000,
      ),
    },
    bootstrapAdmin: {
      email: bootstrapEmail,
      password: bootstrapPassword,
    },
    scoringDaemon: {
      enabled: readBoolean(readStringAlias(env, ["SCORING_DAEMON_ENABLED"]), false),
      intervalMs: readInteger(readStringAlias(env, ["SCORING_DAEMON_INTERVAL_MS"]), 10_000, 1_000, 300_000),
      batchSize: readInteger(readStringAlias(env, ["SCORING_DAEMON_BATCH_SIZE"]), 5, 1, 20),
      llmTimeoutMs: readInteger(readStringAlias(env, ["SCORING_DAEMON_LLM_TIMEOUT_MS"]), 30_000, 5_000, 120_000),
    },
    evolution: {
      enabled: readBoolean(readStringAlias(env, ["PROMPT_EVOLUTION_ENABLED"]), false),
      intervalMs: readInteger(readStringAlias(env, ["PROMPT_EVOLUTION_INTERVAL_MS"]), 1_800_000, 60_000, 86_400_000),
      minSampleSize: readInteger(readStringAlias(env, ["PROMPT_EVOLUTION_MIN_SAMPLE_SIZE"]), 20, 5, 200),
      lowScoreThreshold: readInteger(readStringAlias(env, ["PROMPT_EVOLUTION_LOW_SCORE_THRESHOLD"]), 60, 0, 100),
      autoDraft: readBoolean(readStringAlias(env, ["PROMPT_EVOLUTION_AUTO_DRAFT"]), true),
    },
  };
}
