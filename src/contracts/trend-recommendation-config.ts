export const TREND_RECOMMENDATION_CONFIG_CONTRACT_VERSION = "AT50-03.v1";

export type TrendRecommendationGrade = "not_recommended" | "try" | "recommended";

export interface TrendRecommendationThresholds {
  readonly tryMinScore: number;
  readonly recommendedMinScore: number;
}

export interface TrendRecommendationRuleProfile {
  readonly profileId: string;
  readonly scriptTypeAllowlist: readonly string[];
  readonly trendTypeAllowlist: readonly string[];
  readonly tagWhitelist: readonly string[];
  readonly tagBlacklist: readonly string[];
}

export interface TrendRecommendationConfig {
  readonly functionVersion: string;
  readonly realtimeTopN: number;
  readonly videoTopN: number;
  readonly thresholds: TrendRecommendationThresholds;
  readonly profile: TrendRecommendationRuleProfile;
  readonly safeFallbackVersion: string;
}

export const TREND_RECOMMENDATION_DEFAULT_PROFILE: TrendRecommendationRuleProfile = {
  profileId: "fashion_soft_ad_v1",
  scriptTypeAllowlist: [
    "剧情/短剧",
    "日常Vlog/生活记录/生活美学",
    "氛围感/治愈/拍照穿搭/场景化OOTD",
    "情侣/闺蜜/亲子",
    "季节/节日/热点",
  ],
  trendTypeAllowlist: [
    "节日/节气",
    "影视/音乐",
    "社会情绪",
    "挑战赛/玩法",
    "跨界融合",
  ],
  tagWhitelist: ["推荐", "可尝试", "热点相关", "穿搭友好"],
  tagBlacklist: ["谨慎", "不推荐"],
};

export const TREND_RECOMMENDATION_DEFAULT_CONFIG: TrendRecommendationConfig = {
  functionVersion: TREND_RECOMMENDATION_CONFIG_CONTRACT_VERSION,
  realtimeTopN: 20,
  videoTopN: 20,
  thresholds: {
    tryMinScore: 0.55,
    recommendedMinScore: 0.75,
  },
  profile: TREND_RECOMMENDATION_DEFAULT_PROFILE,
  safeFallbackVersion: "AT50-03.fallback.v1",
};

export const TREND_RECOMMENDATION_CONFIG_INVARIANTS = [
  "TopN values are clamped to [1, 50] for realtime/video trend selection.",
  "Runtime hot-update patch must never produce invalid threshold order.",
  "When patch payload is invalid, resolver falls back to last valid config.",
  "Rule profile is explicit so operators can evolve strategy without changing code paths.",
] as const;

function clampTopN(input: unknown, fallback: number): number {
  const asNumber = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(asNumber)) {
    return fallback;
  }
  return Math.max(1, Math.min(50, Math.floor(asNumber)));
}

function normalizeStringArray(input: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(input)) {
    return [...fallback];
  }
  return [...new Set(input
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0))];
}

function normalizeThresholds(
  input: Partial<TrendRecommendationThresholds> | undefined,
  fallback: TrendRecommendationThresholds,
): TrendRecommendationThresholds {
  const tryMinScore = Number.isFinite(input?.tryMinScore) ? Number(input!.tryMinScore) : fallback.tryMinScore;
  const recommendedMinScore = Number.isFinite(input?.recommendedMinScore)
    ? Number(input!.recommendedMinScore)
    : fallback.recommendedMinScore;
  const boundedTry = Math.max(0, Math.min(1, tryMinScore));
  const boundedRecommended = Math.max(0, Math.min(1, recommendedMinScore));
  if (boundedRecommended < boundedTry) {
    return fallback;
  }
  return {
    tryMinScore: boundedTry,
    recommendedMinScore: boundedRecommended,
  };
}

export function normalizeTrendRecommendationConfig(input: Partial<TrendRecommendationConfig>): TrendRecommendationConfig {
  const base = TREND_RECOMMENDATION_DEFAULT_CONFIG;
  return {
    functionVersion:
      typeof input.functionVersion === "string" && input.functionVersion.trim().length > 0
        ? input.functionVersion.trim()
        : base.functionVersion,
    realtimeTopN: clampTopN(input.realtimeTopN, base.realtimeTopN),
    videoTopN: clampTopN(input.videoTopN, base.videoTopN),
    thresholds: normalizeThresholds(input.thresholds, base.thresholds),
    profile: {
      profileId:
        typeof input.profile?.profileId === "string" && input.profile.profileId.trim().length > 0
          ? input.profile.profileId.trim()
          : base.profile.profileId,
      scriptTypeAllowlist: normalizeStringArray(input.profile?.scriptTypeAllowlist, base.profile.scriptTypeAllowlist),
      trendTypeAllowlist: normalizeStringArray(input.profile?.trendTypeAllowlist, base.profile.trendTypeAllowlist),
      tagWhitelist: normalizeStringArray(input.profile?.tagWhitelist, base.profile.tagWhitelist),
      tagBlacklist: normalizeStringArray(input.profile?.tagBlacklist, base.profile.tagBlacklist),
    },
    safeFallbackVersion:
      typeof input.safeFallbackVersion === "string" && input.safeFallbackVersion.trim().length > 0
        ? input.safeFallbackVersion.trim()
        : base.safeFallbackVersion,
  };
}

export function mergeTrendRecommendationConfigForHotReload(input: {
  current: TrendRecommendationConfig;
  patch: Partial<TrendRecommendationConfig>;
}): TrendRecommendationConfig {
  const merged = normalizeTrendRecommendationConfig({
    ...input.current,
    ...input.patch,
    thresholds: {
      ...input.current.thresholds,
      ...(input.patch.thresholds ?? {}),
    },
    profile: {
      ...input.current.profile,
      ...(input.patch.profile ?? {}),
    },
  });
  if (merged.thresholds.recommendedMinScore < merged.thresholds.tryMinScore) {
    return input.current;
  }
  return merged;
}

export function resolveTrendRecommendationGrade(input: {
  score: number;
  config: TrendRecommendationConfig;
}): TrendRecommendationGrade {
  const score = Number.isFinite(input.score) ? Math.max(0, Math.min(1, input.score)) : 0;
  if (score >= input.config.thresholds.recommendedMinScore) {
    return "recommended";
  }
  if (score >= input.config.thresholds.tryMinScore) {
    return "try";
  }
  return "not_recommended";
}
