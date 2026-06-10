import { DEFAULT_CONFIG } from "../core/config.js";
import type { AppConfig } from "./types.js";

export const RUNTIME_CONFIG_INJECTION_CONTRACT_VERSION = "AT49-09.v4";

export type RuntimeConfigValueKind = "boolean" | "integer" | "number" | "string" | "enum";

export interface AppConfigEnvBinding {
  configKey: keyof AppConfig;
  valueKind: RuntimeConfigValueKind;
  envKeys: readonly string[];
  modules: readonly string[];
  note: string;
}

export interface InfraRuntimeEnvBinding {
  injectionKey: string;
  valueKind: RuntimeConfigValueKind;
  envKeys: readonly string[];
  modules: readonly string[];
  note: string;
}

export const APP_CONFIG_ENV_BINDINGS: readonly AppConfigEnvBinding[] = [
  {
    configKey: "videoMusicEnabled",
    valueKind: "boolean",
    envKeys: ["VIDEO_MUSIC_ENABLED"],
    modules: ["src/core/runtime-config.ts", "src/modules/admin-config-service.ts", "apps/web/pages/admin/adminGlobalSystemSettingsPanel.tsx"],
    note: "Feature gate for the independent video-music domain and Step5 recommendation bridge.",
  },
  {
    configKey: "videoMusicAllowedAtmospheres",
    valueKind: "string",
    envKeys: ["VIDEO_MUSIC_ALLOWED_ATMOSPHERES"],
    modules: ["src/core/runtime-config.ts", "src/modules/video-music/video-music-config.ts"],
    note: "Comma-separated atmosphere allowlist for script-to-music matching.",
  },
  {
    configKey: "videoMusicDefaultAtmospheres",
    valueKind: "string",
    envKeys: ["VIDEO_MUSIC_DEFAULT_ATMOSPHERES"],
    modules: ["src/core/runtime-config.ts", "src/modules/video-music/video-music-config.ts"],
    note: "Fallback atmosphere list when no script signal is detected.",
  },
  {
    configKey: "videoMusicPathPrefix",
    valueKind: "string",
    envKeys: ["VIDEO_MUSIC_PATH_PREFIX"],
    modules: ["src/core/runtime-config.ts", "src/modules/video-music/video-music-config.ts"],
    note: "Local filesystem directory for generated/managed background music files.",
  },
  {
    configKey: "videoMusicPublicBaseUrl",
    valueKind: "string",
    envKeys: ["VIDEO_MUSIC_PUBLIC_BASE_URL"],
    modules: ["src/core/runtime-config.ts", "src/modules/video-music/video-music-config.ts"],
    note: "Public base url prefix used by independent music routes and export mixing.",
  },
  {
    configKey: "videoMusicVisitUrl",
    valueKind: "string",
    envKeys: ["VIDEO_MUSIC_VISIT_URL"],
    modules: ["src/core/runtime-config.ts", "src/modules/video-music/video-music-config.ts"],
    note: "Optional upstream music list url used for donor-style music sync into the local library.",
  },
  {
    configKey: "lockoutAttempts",
    valueKind: "integer",
    envKeys: ["LOCKOUT_ATTEMPTS"],
    modules: ["src/modules/auth-service.ts"],
    note: "Failed-login threshold before temporary lockout.",
  },
  {
    configKey: "lockoutMinutes",
    valueKind: "integer",
    envKeys: ["LOCKOUT_MINUTES"],
    modules: ["src/modules/auth-service.ts"],
    note: "Lockout window duration in minutes.",
  },
  {
    configKey: "scriptMaxDurationSec",
    valueKind: "integer",
    envKeys: ["SCRIPT_MAX_DURATION_SEC"],
    modules: ["src/modules/script-service.ts"],
    note: "Upper bound for generated script duration.",
  },
  {
    configKey: "mockCreditDefault",
    valueKind: "integer",
    envKeys: ["MOCK_CREDIT_DEFAULT"],
    modules: ["src/modules/credit-service.ts"],
    note: "Initial credit amount for newly provisioned accounts.",
  },
  {
    configKey: "creditValidityDays",
    valueKind: "integer",
    envKeys: ["CREDIT_VALIDITY_DAYS"],
    modules: ["src/modules/credit-service.ts"],
    note: "Credit validity window in days.",
  },
  {
    configKey: "providerErrorLogRetentionDays",
    valueKind: "integer",
    envKeys: ["PROVIDER_ERROR_LOG_RETENTION_DAYS"],
    modules: ["src/modules/provider-admin-service.ts"],
    note: "Retention days for provider error audit logs.",
  },
  {
    configKey: "reverseFetchStageOrder",
    valueKind: "string",
    envKeys: ["REVERSE_FETCH_STAGE_ORDER"],
    modules: ["src/app.ts", "src/modules/douyin-integration-service.ts"],
    note: "Ordered reverse fallback stage chain.",
  },
  {
    configKey: "reverseExternalApiPriority",
    valueKind: "string",
    envKeys: ["REVERSE_EXTERNAL_API_PRIORITY"],
    modules: ["src/modules/douyin-integration-service.ts"],
    note: "External reverse API provider ordering.",
  },
  {
    configKey: "apifyReverseApiUrl",
    valueKind: "string",
    envKeys: ["APIFY_REVERSE_API_URL"],
    modules: ["src/modules/douyin-integration-service.ts"],
    note: "Apify reverse endpoint.",
  },
  {
    configKey: "apifyReverseApiToken",
    valueKind: "string",
    envKeys: ["APIFY_API_TOKEN", "APIFY_REVERSE_API_TOKEN"],
    modules: ["src/modules/douyin-integration-service.ts"],
    note: "Apify reverse token aliases.",
  },
  {
    configKey: "tikhubVideoHotApiUrl",
    valueKind: "string",
    envKeys: ["TIKHUB_VIDEO_HOT_API_URL"],
    modules: ["src/app.ts"],
    note: "TikHub low-fan high-like video hot list endpoint.",
  },
  {
    configKey: "tikhubRealtimeHotApiUrl",
    valueKind: "string",
    envKeys: ["TIKHUB_REALTIME_HOT_API_URL"],
    modules: ["src/app.ts"],
    note: "TikHub realtime hot trend source endpoint.",
  },
  {
    configKey: "tikhubReverseApiUrl",
    valueKind: "string",
    envKeys: ["TIKHUB_REVERSE_API_URL", "REVERSE_EXTERNAL_API_ENDPOINT"],
    modules: ["src/modules/douyin-integration-service.ts"],
    note: "TikHub reverse endpoint and legacy alias.",
  },
  {
    configKey: "tikhubApiToken",
    valueKind: "string",
    envKeys: ["TIKHUB_API_TOKEN"],
    modules: ["src/app.ts", "src/modules/douyin-integration-service.ts"],
    note: "TikHub auth token.",
  },
  {
    configKey: "anytocopyReverseApiUrl",
    valueKind: "string",
    envKeys: ["ANYTOCOPY_REVERSE_API_URL"],
    modules: ["src/modules/douyin-integration-service.ts"],
    note: "Anytocopy reverse endpoint.",
  },
  {
    configKey: "anytocopyReverseApiToken",
    valueKind: "string",
    envKeys: ["ANYTOCOPY_API_TOKEN", "ANYTOCOPY_REVERSE_API_TOKEN"],
    modules: ["src/modules/douyin-integration-service.ts"],
    note: "Anytocopy token aliases.",
  },
  {
    configKey: "anytocopyEnabled",
    valueKind: "boolean",
    envKeys: ["ANYTOCOPY_ENABLED"],
    modules: ["src/modules/douyin-integration-service.ts"],
    note: "Feature gate for anytocopy external provider.",
  },
  {
    configKey: "douhotVideoHotApiUrl",
    valueKind: "string",
    envKeys: ["DOUHOT_VIDEO_LIST_ENDPOINT"],
    modules: ["src/modules/douyin-integration-service.ts"],
    note: "Douhot source endpoint.",
  },
  {
    configKey: "douyinHotHubRealtimeUrl",
    valueKind: "string",
    envKeys: ["DOUYIN_HOT_HUB_README_URL"],
    modules: ["src/app.ts"],
    note: "Douyin hot hub fallback feed URL.",
  },
  {
    configKey: "hotTrendRealtimeTopN",
    valueKind: "integer",
    envKeys: ["HOT_TREND_REALTIME_TOP_N"],
    modules: ["src/app.ts", "src/modules/admin-config-service.ts"],
    note: "Realtime hot-trend TopN candidate count (1..50).",
  },
  {
    configKey: "hotTrendVideoTopN",
    valueKind: "integer",
    envKeys: ["HOT_TREND_VIDEO_TOP_N"],
    modules: ["src/app.ts", "src/modules/admin-config-service.ts"],
    note: "Video hot-trend TopN candidate count (1..50).",
  },
  {
    configKey: "hotTrendRealtimeSyncIntervalHours",
    valueKind: "integer",
    envKeys: ["HOT_TREND_REALTIME_SYNC_INTERVAL_HOURS"],
    modules: ["src/app.ts", "src/modules/admin-config-service.ts"],
    note: "Realtime hot-trend scheduler interval (hours), bounded to [1,168].",
  },
  {
    configKey: "hotTrendVideoSyncIntervalHours",
    valueKind: "integer",
    envKeys: ["HOT_TREND_VIDEO_SYNC_INTERVAL_HOURS"],
    modules: ["src/app.ts", "src/modules/admin-config-service.ts"],
    note: "Video hot-trend scheduler interval (hours), bounded to [12,168].",
  },
  {
    configKey: "hotTrendVideoDateWindowHours",
    valueKind: "integer",
    envKeys: ["HOT_TREND_VIDEO_DATE_WINDOW_HOURS"],
    modules: ["src/app.ts", "src/modules/admin-config-service.ts"],
    note: "Video hot-trend fetch date window (hours), bounded to [24,720].",
  },
  {
    configKey: "hotTrendPromptVersion",
    valueKind: "string",
    envKeys: ["HOT_TREND_PROMPT_VERSION"],
    modules: ["src/app.ts", "apps/web/pages/review-admin/ReviewDashboard.tsx"],
    note: "Version stamp for prompt observability and comparison.",
  },
] as const;

export const INFRA_RUNTIME_ENV_BINDINGS: readonly InfraRuntimeEnvBinding[] = [
  {
    injectionKey: "server.port",
    valueKind: "integer",
    envKeys: ["PORT", "API_PORT"],
    modules: ["src/server.ts", "src/app.ts"],
    note: "Server listen port and internal base URL derivation.",
  },
  {
    injectionKey: "server.host",
    valueKind: "string",
    envKeys: ["HOST"],
    modules: ["src/server.ts"],
    note: "Server bind host.",
  },
  {
    injectionKey: "runtime.nodeEnv",
    valueKind: "enum",
    envKeys: ["NODE_ENV"],
    modules: ["src/app.ts"],
    note: "Environment mode controls logger and bootstrap defaults.",
  },
  {
    injectionKey: "runtime.apiBodyLimitBytes",
    valueKind: "integer",
    envKeys: ["API_BODY_LIMIT_BYTES"],
    modules: ["src/app.ts"],
    note: "Fastify body parser limit.",
  },
  {
    injectionKey: "runtime.persistence",
    valueKind: "enum",
    envKeys: ["PERSISTENCE_DRIVER", "DATABASE_URL", "PERSISTENCE_FLUSH_INTERVAL_MS", "PERSISTENCE_REQUIRE_READY", "ALLOW_TEST_POSTGRES"],
    modules: ["src/app.ts", "src/persistence/runtime.ts"],
    note: "Persistence runtime driver and readiness policy.",
  },
  {
    injectionKey: "runtime.objectStorage",
    valueKind: "enum",
    envKeys: [
      "OBJECT_STORAGE_DRIVER",
      "OBJECT_STORAGE_BUCKET",
      "OBJECT_STORAGE_LOCAL_DIR",
      "OBJECT_STORAGE_PUBLIC_BASE",
      "OBJECT_STORAGE_S3_PUBLIC_BASE",
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "S3_REGION",
      "S3_ENDPOINT",
      "S3_FORCE_PATH_STYLE",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_SESSION_TOKEN",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
    ],
    modules: ["src/storage/runtime.ts", "src/app.ts", "src/modules/provider-admin-service.ts"],
    note: "Object storage adapter and provider audit log root resolution.",
  },
  {
    injectionKey: "runtime.security",
    valueKind: "string",
    envKeys: ["APP_SECRET_KEY"],
    modules: ["src/core/security.ts"],
    note: "Runtime encryption key source.",
  },
  {
    injectionKey: "runtime.videoJobExecutor",
    valueKind: "enum",
    envKeys: ["VIDEO_JOB_EXECUTOR_ENABLED", "VIDEO_JOB_EXECUTOR_INTERVAL_MS"],
    modules: ["src/service/async-job-service.ts"],
    note: "Video job executor migrated to unified async job queue.",
  },
  {
    injectionKey: "runtime.bootstrapAdmin",
    valueKind: "string",
    envKeys: ["DEV_BOOTSTRAP_ADMIN_EMAIL", "DEV_BOOTSTRAP_ADMIN_PASSWORD"],
    modules: ["src/app.ts"],
    note: "Non-production bootstrap admin credentials.",
  },
  {
    injectionKey: "runtime.providerAuditLogDir",
    valueKind: "string",
    envKeys: ["PROVIDER_AUDIT_LOG_DIR"],
    modules: ["src/modules/provider-admin-service.ts"],
    note: "Filesystem location for provider error logs.",
  },
  {
    injectionKey: "runtime.hotTrendScheduler",
    valueKind: "integer",
    envKeys: ["HOT_TREND_SYNC_INTERVAL_MS", "HOT_TREND_REALTIME_SYNC_INTERVAL_MS", "HOT_TREND_VIDEO_SYNC_INTERVAL_MS", "HOT_TREND_AUTO_ANALYZE_ON_STARTUP"],
    modules: ["src/app.ts"],
    note: "Hot trend scheduler intervals and startup behavior.",
  },
] as const;

export const RUNTIME_CONFIG_INJECTION_INVARIANTS = [
  "All AppConfig keys must be mapped by exactly one typed env binding.",
  "Env aliases must be uppercase snake case and attached to an explicit module owner.",
  "AT28-42 must replace direct process.env reads with injected runtime config accessors.",
] as const;

function assertEnvAliasShape(envKey: string): void {
  if (!/^[A-Z0-9_]+$/.test(envKey)) {
    throw new Error(`Invalid runtime env alias: ${envKey}`);
  }
}

export function assertRuntimeConfigInjectionContract(): {
  version: string;
  appConfigKeyCount: number;
  infraBindingCount: number;
  envAliasCount: number;
} {
  const defaultConfigKeys = Object.keys(DEFAULT_CONFIG).sort();
  const bindingKeys = APP_CONFIG_ENV_BINDINGS.map((item) => item.configKey).sort();
  if (defaultConfigKeys.length !== bindingKeys.length) {
    throw new Error(
      `AppConfig binding count mismatch: defaults=${defaultConfigKeys.length} bindings=${bindingKeys.length}`,
    );
  }

  const seenConfigKeys = new Set<string>();
  for (const binding of APP_CONFIG_ENV_BINDINGS) {
    const key = String(binding.configKey);
    if (seenConfigKeys.has(key)) {
      throw new Error(`Duplicate AppConfig env binding: ${key}`);
    }
    seenConfigKeys.add(key);
    if (binding.modules.length < 1) {
      throw new Error(`AppConfig env binding missing module owner: ${key}`);
    }
    for (const envKey of binding.envKeys) {
      assertEnvAliasShape(envKey);
    }
  }
  for (const key of defaultConfigKeys) {
    if (!seenConfigKeys.has(key)) {
      throw new Error(`Missing AppConfig env binding: ${key}`);
    }
  }

  const seenInfraBindings = new Set<string>();
  for (const binding of INFRA_RUNTIME_ENV_BINDINGS) {
    if (seenInfraBindings.has(binding.injectionKey)) {
      throw new Error(`Duplicate infra runtime binding: ${binding.injectionKey}`);
    }
    seenInfraBindings.add(binding.injectionKey);
    if (binding.modules.length < 1) {
      throw new Error(`Infra runtime binding missing module owner: ${binding.injectionKey}`);
    }
    for (const envKey of binding.envKeys) {
      assertEnvAliasShape(envKey);
    }
  }
  if (INFRA_RUNTIME_ENV_BINDINGS.length < 8) {
    throw new Error("Infra runtime binding set is incomplete.");
  }

  return {
    version: RUNTIME_CONFIG_INJECTION_CONTRACT_VERSION,
    appConfigKeyCount: APP_CONFIG_ENV_BINDINGS.length,
    infraBindingCount: INFRA_RUNTIME_ENV_BINDINGS.length,
    envAliasCount:
      APP_CONFIG_ENV_BINDINGS.reduce((count, item) => count + item.envKeys.length, 0) +
      INFRA_RUNTIME_ENV_BINDINGS.reduce((count, item) => count + item.envKeys.length, 0),
  };
}
