export type TrendType = "realtime" | "video";

export type TrendStaleRefreshMode =
  | "cold_bootstrapping"
  | "cached_visible_refreshing"
  | "cached_visible_refresh_failed"
  | "fresh_visible_idle"
  | "fresh_visible_refreshing"
  | "empty_idle"
  | "empty_error";

export interface TrendStaleRefreshInput {
  readonly type: TrendType;
  readonly cacheTopicCount: number;
  readonly fetchedTopicCount: number;
  readonly refreshing: boolean;
  readonly fetchFailed: boolean;
}

export const TREND_STALE_REFRESH_INVARIANTS = [
  "When cache exists, UI must keep topic list visible during refresh.",
  "Refresh failure with cache must keep cache visible and annotate degraded state.",
  "Cold boot should only happen when both cache and fetched data are empty while refreshing.",
  "First successful fetch must transition to fresh-visible states.",
] as const;

export function resolveTrendStaleRefreshMode(input: TrendStaleRefreshInput): TrendStaleRefreshMode {
  const hasCache = input.cacheTopicCount > 0;
  const hasFetched = input.fetchedTopicCount > 0;

  if (hasFetched) {
    return input.refreshing ? "fresh_visible_refreshing" : "fresh_visible_idle";
  }

  if (hasCache) {
    if (input.refreshing) {
      return "cached_visible_refreshing";
    }
    return input.fetchFailed ? "cached_visible_refresh_failed" : "cached_visible_refreshing";
  }

  if (input.refreshing) {
    return "cold_bootstrapping";
  }

  return input.fetchFailed ? "empty_error" : "empty_idle";
}

export function shouldRenderTrendList(mode: TrendStaleRefreshMode): boolean {
  return (
    mode === "cached_visible_refreshing" ||
    mode === "cached_visible_refresh_failed" ||
    mode === "fresh_visible_idle" ||
    mode === "fresh_visible_refreshing"
  );
}

export const TREND_STALE_REFRESH_CONTRACT_VERSION = "N23-R5-01.v1";
