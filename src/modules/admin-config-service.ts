import type { AppConfig, User } from "../contracts/types.js";
import type { IUserRepository } from "../contracts/repository-ports/user-repository.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { AppConfigService } from "../services/config/app-config-service.js";
import type { IAdminConfigService } from "../contracts/services.js";
import type { IAuditStore } from "../persistence/audit-store.js";
import { assertCondition } from "../core/errors.js";

const NUMERIC_CONFIG_KEYS: Array<keyof AppConfig> = [
  "lockoutAttempts",
  "lockoutMinutes",
  "scriptMaxDurationSec",
  "mockCreditDefault",
  "creditValidityDays",
  "providerErrorLogRetentionDays",
  "hotTrendRealtimeTopN",
  "hotTrendVideoTopN",
  "hotTrendRealtimeSyncIntervalHours",
  "hotTrendVideoSyncIntervalHours",
  "hotTrendVideoDateWindowHours",
  "hotTrendDailyReportHour",
  "squareCreatorDiscoveryHour",
  "squareTemplateAutoPublishHour",
  "sessionTtlHours",
  "sessionAutoRenewMinutesBeforeExpiry",
];

const STRING_CONFIG_KEYS: Array<keyof AppConfig> = [
  "videoMusicAllowedAtmospheres",
  "videoMusicDefaultAtmospheres",
  "videoMusicPathPrefix",
  "videoMusicPublicBaseUrl",
  "videoMusicVisitUrl",
  "reverseFetchStageOrder",
  "reverseExternalApiPriority",
  "apifyReverseApiUrl",
  "apifyReverseApiToken",
  "tikhubVideoHotApiUrl",
  "tikhubRealtimeHotApiUrl",
  "tikhubReverseApiUrl",
  "tikhubApiToken",
  "anytocopyReverseApiUrl",
  "anytocopyReverseApiToken",
  "douhotVideoHotApiUrl",
  "douyinHotHubRealtimeUrl",
  "hotTrendPromptVersion",
  "ossEndpoint",
  "ossRegion",
  "ossAccessKeyId",
  "ossSecretAccessKey",
  "ossBucketName",
  "ossPublicBaseUrl",
];

const BOOLEAN_CONFIG_KEYS: Array<keyof AppConfig> = [
  "videoMusicEnabled",
  "anytocopyEnabled",
  "ossForcePathStyle",
  "hotTrendDailyReportEnabled",
  "squareCreatorDiscoveryEnabled",
  "squareTemplateAutoPublishEnabled",
];

const CONFIG_KEYS: Array<keyof AppConfig> = [
  ...NUMERIC_CONFIG_KEYS,
  ...STRING_CONFIG_KEYS,
  ...BOOLEAN_CONFIG_KEYS,
];

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export class AdminConfigService implements IAdminConfigService {
  constructor(
    private readonly repos: { users: IUserRepository },
    private readonly clock: IRepositoryClock,
    private readonly configService: AppConfigService,
    private readonly auditStore: IAuditStore,
  ) {}

  get(): AppConfig {
    return { ...this.configService.get() };
  }

  async update(actor: User, partial: Partial<AppConfig>): Promise<AppConfig> {
    assertCondition(actor.role === "admin", 403, "FORBIDDEN", "Admin only");
    const next: AppConfig = { ...this.configService.get() };
    const normalizedPatch: Partial<AppConfig> = { ...partial };

    for (const key of Object.keys(normalizedPatch)) {
      assertCondition(
        CONFIG_KEYS.includes(key as keyof AppConfig),
        400,
        "CONFIG_KEY_INVALID",
        `Unsupported config key: ${key}`,
      );
    }

    for (const key of NUMERIC_CONFIG_KEYS) {
      const raw = normalizedPatch[key] as unknown;
      if (raw === undefined) {
        continue;
      }
      assertCondition(
        typeof raw === "number" && Number.isFinite(raw),
        400,
        "CONFIG_INVALID",
        `${key} must be a finite number`,
      );
      const value = raw as number;
      switch (key) {
        case "lockoutAttempts":
        case "lockoutMinutes":
        case "creditValidityDays":
        case "providerErrorLogRetentionDays":
          assertCondition(
            isPositiveInteger(value),
            400,
            "CONFIG_INVALID",
            `${key} must be a positive integer`,
          );
          break;
        case "scriptMaxDurationSec":
          assertCondition(
            Number.isInteger(value) && value >= 1 && value <= 90,
            400,
            "CONFIG_INVALID",
            "scriptMaxDurationSec must be an integer between 1 and 90",
          );
          break;
        case "mockCreditDefault":
          assertCondition(value >= 0, 400, "CONFIG_INVALID", "mockCreditDefault must be >= 0");
          break;
        case "hotTrendRealtimeTopN":
        case "hotTrendVideoTopN":
          assertCondition(
            Number.isInteger(value) && value >= 1 && value <= 50,
            400,
            "CONFIG_INVALID",
            `${key} must be an integer between 1 and 50`,
          );
          break;
        case "hotTrendRealtimeSyncIntervalHours":
          assertCondition(
            Number.isInteger(value) && value >= 1 && value <= 168,
            400,
            "CONFIG_INVALID",
            "hotTrendRealtimeSyncIntervalHours must be an integer between 1 and 168",
          );
          break;
        case "hotTrendVideoSyncIntervalHours":
          assertCondition(
            Number.isInteger(value) && value >= 12 && value <= 168,
            400,
            "CONFIG_INVALID",
            "hotTrendVideoSyncIntervalHours must be an integer between 12 and 168",
          );
          break;
        case "hotTrendVideoDateWindowHours":
          assertCondition(
            Number.isInteger(value) && value >= 24 && value <= 720,
            400,
            "CONFIG_INVALID",
            "hotTrendVideoDateWindowHours must be an integer between 24 and 720",
          );
          break;
        case "hotTrendDailyReportHour":
          assertCondition(
            Number.isInteger(value) && value >= 0 && value <= 23,
            400,
            "CONFIG_INVALID",
            "hotTrendDailyReportHour must be an integer between 0 and 23",
          );
          break;
        case "sessionTtlHours":
          assertCondition(
            Number.isInteger(value) && value >= 1 && value <= 720,
            400,
            "CONFIG_INVALID",
            "sessionTtlHours must be an integer between 1 and 720",
          );
          break;
        case "sessionAutoRenewMinutesBeforeExpiry":
          assertCondition(
            Number.isInteger(value) && value >= 1 && value <= 1440,
            400,
            "CONFIG_INVALID",
            "sessionAutoRenewMinutesBeforeExpiry must be an integer between 1 and 1440",
          );
          break;
        case "squareCreatorDiscoveryHour":
        case "squareTemplateAutoPublishHour":
          assertCondition(
            Number.isInteger(value) && value >= 0 && value <= 23,
            400,
            "CONFIG_INVALID",
            `${key} must be an integer between 0 and 23`,
          );
          break;
        default:
          break;
      }
      (next as Record<keyof AppConfig, unknown>)[key] = value;
    }

    for (const key of STRING_CONFIG_KEYS) {
      const raw = normalizedPatch[key] as unknown;
      if (raw === undefined) {
        continue;
      }
      assertCondition(typeof raw === "string", 400, "CONFIG_INVALID", `${key} must be a string`);
      const value = (raw as string).trim();
      if (
        key === "videoMusicAllowedAtmospheres" ||
        key === "videoMusicDefaultAtmospheres" ||
        key === "videoMusicPathPrefix" ||
        key === "videoMusicPublicBaseUrl" ||
        key === "hotTrendPromptVersion"
      ) {
        assertCondition(value.length > 0, 400, "CONFIG_INVALID", `${key} must be a non-empty string`);
      }
      (next as Record<keyof AppConfig, unknown>)[key] = value;
    }

    for (const key of BOOLEAN_CONFIG_KEYS) {
      const raw = normalizedPatch[key] as unknown;
      if (raw === undefined) {
        continue;
      }
      assertCondition(typeof raw === "boolean", 400, "CONFIG_INVALID", `${key} must be a boolean`);
      (next as Record<keyof AppConfig, unknown>)[key] = raw;
    }

    await this.configService.update(next);
    const logId = this.clock.generateId();
    this.auditStore.insertAuditLog({
      id: logId,
      actorUserId: actor.id,
      action: "admin_config_update",
      targetId: "global_config",
      createdAt: this.clock.now(),
    });
    return { ...this.configService.get() };
  }

  async unlockUser(actor: User, userId: string): Promise<void> {
    assertCondition(actor.role === "admin", 403, "FORBIDDEN", "Admin only");
    const user = await this.repos.users.findById(userId);
    assertCondition(Boolean(user), 404, "NOT_FOUND", "User not found");
    const target = user as User;
    target.failedAttempts = 0;
    target.lockUntil = null;
    await this.repos.users.upsert(target);
  }
}
