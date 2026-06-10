// apps/web/pages/review-admin/review-dashboard-utils.ts
/**
 * 管理后台工具函数（基础配置 + 积分管理共享）
 */

import {
  ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS,
  type AdminGlobalSystemSettingsDraft,
} from "../admin/adminGlobalSystemSettingsPanel";

// ============================================================================
// 用户显示工具函数
// ============================================================================

export function displayName(email: string): string {
  const head = email.split("@")[0] ?? "user";
  const normalized = head.replace(/[._-]+/g, " ").trim();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "User";
}

// ============================================================================
// 系统设置重置工具函数
// ============================================================================

export function buildResetGlobalSectionDraft(
  current: AdminGlobalSystemSettingsDraft,
  sectionId: string,
): AdminGlobalSystemSettingsDraft {
  switch (sectionId) {
    case "security-policy":
      return {
        ...current,
        lockoutAttempts: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.lockoutAttempts,
        lockoutMinutes: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.lockoutMinutes,
        sessionTtlHours: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.sessionTtlHours,
        sessionAutoRenewMinutesBeforeExpiry:
          ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.sessionAutoRenewMinutesBeforeExpiry,
      };
    case "generation":
      return {
        ...current,
        scriptMaxDurationSec: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.scriptMaxDurationSec,
      };
    case "credits":
      return {
        ...current,
        mockCreditDefault: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.mockCreditDefault,
        creditValidityDays: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.creditValidityDays,
      };
    case "video-music":
      return {
        ...current,
        videoMusicEnabled: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicEnabled,
        videoMusicAllowedAtmospheres: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicAllowedAtmospheres,
        videoMusicDefaultAtmospheres: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicDefaultAtmospheres,
        videoMusicPathPrefix: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicPathPrefix,
        videoMusicPublicBaseUrl: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicPublicBaseUrl,
        videoMusicVisitUrl: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicVisitUrl,
      };
    case "video-music-config":
      return {
        ...current,
        videoMusicAllowedAtmospheres: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicAllowedAtmospheres,
        videoMusicDefaultAtmospheres: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicDefaultAtmospheres,
        videoMusicVisitUrl: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicVisitUrl,
        videoMusicPathPrefix: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicPathPrefix,
      };
    case "oss-config":
      return {
        ...current,
        ossEndpoint: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.ossEndpoint,
        ossRegion: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.ossRegion,
        ossAccessKeyId: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.ossAccessKeyId,
        ossSecretAccessKey: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.ossSecretAccessKey,
        ossBucketName: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.ossBucketName,
        ossForcePathStyle: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.ossForcePathStyle,
        ossPublicBaseUrl: ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.ossPublicBaseUrl,
      };
    default:
      return current;
  }
}

// ============================================================================
// 文件导入导出工具函数
// ============================================================================

export function downloadJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function parseImportJson<T>(text: string, field: "items"): T[] {
  const raw = JSON.parse(text) as unknown;
  if (Array.isArray(raw)) {
    return raw as T[];
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>)[field])) {
    return (raw as Record<string, unknown>)[field] as T[];
  }
  throw new Error("导入内容必须是 JSON 数组，或 {items:[...]} 结构");
}
