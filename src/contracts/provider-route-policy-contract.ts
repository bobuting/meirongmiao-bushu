import type { ProviderType } from "./types.js";
import type { ProviderRouteKey } from "./provider-route-keys.js";
import { parseProviderRouteKey as parseProviderRouteKeyImpl, ProviderRouteKeys, ALL_PROVIDER_ROUTE_KEYS, isProviderRouteKey } from "./provider-route-keys.js";

// 重新导出 ProviderRouteKey 相关
export { ProviderRouteKeys, ALL_PROVIDER_ROUTE_KEYS, isProviderRouteKey, parseProviderRouteKey } from "./provider-route-keys.js";
export type { ProviderRouteKey } from "./provider-route-keys.js";
export type { ProviderType } from "./types.js";

// ============================================================================
// ProviderType 工具函数（统一类型）
// ============================================================================

export const PROVIDER_TYPES = ["text", "image", "video"] as const;

const PROVIDER_TYPE_SET = new Set<string>(PROVIDER_TYPES);

/** 校验 value 是否为有效的 ProviderType */
export function isProviderType(value: unknown): value is ProviderType {
  return typeof value === "string" && PROVIDER_TYPE_SET.has(value);
}

/** 解析并校验 ProviderType，失败时抛出错误 */
export function parseProviderType(value: unknown): ProviderType {
  if (typeof value !== "string") {
    throw new Error("type must be a string");
  }
  const normalized = value.trim();
  if (!PROVIDER_TYPE_SET.has(normalized)) {
    throw new Error(`type must be one of: ${PROVIDER_TYPES.join(", ")}`);
  }
  return normalized as ProviderType;
}

// ============================================================================
// ProviderRouteKey 默认策略配置
// ============================================================================

export interface ProviderRoutePolicyDefaultStrategy {
  timeoutMs: number;
  retryCount: number;
}

/** 默认策略配置（按业务 routeKey 配置） */
export const PROVIDER_ROUTE_POLICY_DEFAULT_STRATEGY: Record<string, ProviderRoutePolicyDefaultStrategy> = {
  // Step1
  step1_fashion_search: { timeoutMs: 600_000, retryCount: 2 },
  step1_fashion_analysis: { timeoutMs: 600_000, retryCount: 2 },
  // Step2
  step2_five_view_generation_child: { timeoutMs: 600_000, retryCount: 2 },
  step2_five_view_generation_adult: { timeoutMs: 600_000, retryCount: 2 },
  // Step3
  step3_script_generation: { timeoutMs: 600_000, retryCount: 2 },
  step3_realtime_script_generation: { timeoutMs: 600_000, retryCount: 2 },
  step3_aesthetic_script_generation: { timeoutMs: 600_000, retryCount: 2 },
  step3_video_script_rewrite: { timeoutMs: 600_000, retryCount: 2 },
  step3_library_script_rewrite: { timeoutMs: 600_000, retryCount: 2 },
  step3_story_theme_concept: { timeoutMs: 600_000, retryCount: 2 },
  step3_story_theme_outline: { timeoutMs: 600_000, retryCount: 2 },
  step3_story_theme_generation: { timeoutMs: 600_000, retryCount: 2 },
  step3_resonance_story_concept: { timeoutMs: 600_000, retryCount: 2 },
  step3_resonance_story_generation: { timeoutMs: 600_000, retryCount: 2 },
  script_effectiveness_generation: { timeoutMs: 600_000, retryCount: 2 },
  step3_storyboard_image: { timeoutMs: 600_000, retryCount: 2 },
  step3_storyboard_image_child: { timeoutMs: 600_000, retryCount: 2 },
  step3_storyboard_image_adult: { timeoutMs: 600_000, retryCount: 2 },
  // Step4
  step3_storyboard_prompt: { timeoutMs: 600_000, retryCount: 2 },
  // Step4 分镜视频
  step4_clip_video_generation: { timeoutMs: 600_000, retryCount: 2 },
  step4_clip_video_generation_child: { timeoutMs: 600_000, retryCount: 2 },
  step4_clip_video_generation_adult: { timeoutMs: 600_000, retryCount: 2 },
  // 裂变
  fission_story_generation: { timeoutMs: 600_000, retryCount: 2 },
  // 广场
  square_video_reverse: { timeoutMs: 600_000, retryCount: 2 },
  // 热榜
  hot_trend_video_reverse: { timeoutMs: 600_000, retryCount: 2 },
  // 库管理
  library_portrait_detect: { timeoutMs: 600_000, retryCount: 2 },
  // 能力实验室
  text_generation: { timeoutMs: 600_000, retryCount: 2 },
  image_generation: { timeoutMs: 600_000, retryCount: 2 },
  video_generation: { timeoutMs: 600_000, retryCount: 2 },
};

/** 通用默认策略（routeKey 不在默认映射中时使用） */
const DEFAULT_STRATEGY: ProviderRoutePolicyDefaultStrategy = { timeoutMs: 600_000, retryCount: 2 };

export interface ProviderRoutePolicyConfigInputDto {
  routeKey: unknown;
  type: unknown;
  primaryProviderId: unknown;
  fallbackProviderIds?: unknown;
  timeoutMs?: unknown;
  retryCount?: unknown;
  enabled?: unknown;
  description?: unknown;
}

export interface ProviderRoutePolicyConfigDto {
  routeKey: ProviderRouteKey;
  type: ProviderType;
  primaryProviderId: string;
  fallbackProviderIds: string[];
  timeoutMs: number;
  retryCount: number;
  enabled: boolean;
  description?: string;
}

function parseNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length < 1) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function parseIntWithMin(value: unknown, fallback: number, fieldName: string, min: number): number {
  if (value === undefined || value === null) {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${fieldName} must be a number`);
  }
  return Math.max(min, Math.floor(numeric));
}

function parseBooleanWithFallback(value: unknown, fallback: boolean, fieldName: string): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be boolean`);
  }
  return value;
}

function parseFallbackProviderIds(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("fallbackProviderIds must be an array");
  }
  const normalized = value.map((item) => parseNonEmptyString(item, "fallbackProviderIds item"));
  return [...new Set(normalized)];
}

export function normalizeProviderRoutePolicyConfigDto(input: ProviderRoutePolicyConfigInputDto): ProviderRoutePolicyConfigDto {
  const routeKey = parseProviderRouteKeyImpl(input.routeKey);
  const type = parseProviderType(input.type);
  const defaults = PROVIDER_ROUTE_POLICY_DEFAULT_STRATEGY[routeKey] ?? DEFAULT_STRATEGY;
  return {
    routeKey,
    type,
    primaryProviderId: parseNonEmptyString(input.primaryProviderId, "primaryProviderId"),
    fallbackProviderIds: parseFallbackProviderIds(input.fallbackProviderIds),
    timeoutMs: parseIntWithMin(input.timeoutMs, defaults.timeoutMs, "timeoutMs", 1_000),
    retryCount: parseIntWithMin(input.retryCount, defaults.retryCount, "retryCount", 0),
    enabled: parseBooleanWithFallback(input.enabled, true, "enabled"),
    description: typeof input.description === "string" ? input.description.trim() : undefined,
  };
}
