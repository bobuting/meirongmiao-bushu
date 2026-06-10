/**
 * Hot Trend 服务初始化模块
 *
 * 阶段 4: 提供热点趋势配置解析函数。
 *
 * 注意：hotTrendCache、hotTrendInFlight、sideVideoTasks 等 Map 的创建
 * 保留在 app.ts 中，因为它们使用的是 hot-trend 模块的特定类型。
 */

import type { AppContext } from "../core/app-context.js";
import type { HotTrendType } from "../contracts/hot-trend-base.js";

/** 视频热榜默认同步间隔（毫秒） */
const DEFAULT_HOT_TREND_SYNC_INTERVAL_MS = 60 * 60 * 1000;

/** 热门趋势配置解析结果 */
export interface HotTrendConfigResolvers {
  resolveHotTrendSyncIntervalMs: (type: HotTrendType) => number;
  resolveHotTrendRealtimeTopN: () => number;
  resolveHotTrendVideoTopN: () => number;
  resolveHotTrendVideoDateWindowHours: () => 24 | 168 | 720;
  resolveHotTrendVideoDateWindowLabel: () => "24h" | "7d" | "30d";
}

/**
 * 阶段 4: Hot Trend 配置解析函数
 *
 * 提供热点趋势同步相关的配置解析。
 */
export function setupHotTrend(ctx: AppContext): HotTrendConfigResolvers {
  // 解析同步间隔（毫秒）
  const resolveHotTrendSyncIntervalMs = (type: HotTrendType): number => {
    const defaultIntervalMsRaw = Number(process.env.HOT_TREND_SYNC_INTERVAL_MS ?? Number.NaN);
    const defaultIntervalMs = Number.isFinite(defaultIntervalMsRaw)
      ? Math.max(60_000, defaultIntervalMsRaw)
      : DEFAULT_HOT_TREND_SYNC_INTERVAL_MS;

    if (type === "realtime") {
      const configuredHours = Number(ctx.configService.get().hotTrendRealtimeSyncIntervalHours);
      if (Number.isFinite(configuredHours) && configuredHours > 0) {
        return Math.max(60_000, Math.floor(configuredHours) * 60 * 60 * 1000);
      }
      return defaultIntervalMs;
    }
    // video
    const configuredHours = Number(ctx.configService.get().hotTrendVideoSyncIntervalHours);
    if (Number.isFinite(configuredHours) && configuredHours > 0) {
      return Math.max(60_000, Math.floor(configuredHours) * 60 * 60 * 1000);
    }
    return defaultIntervalMs;
  };

  // 解析实时热榜 TopN
  const resolveHotTrendRealtimeTopN = (): number => {
    const configured = Number(ctx.configService.get().hotTrendRealtimeTopN);
    if (Number.isFinite(configured) && configured > 0) {
      return Math.max(1, Math.min(50, Math.floor(configured)));
    }
    return 50;
  };

  // 解析视频热榜 TopN
  const resolveHotTrendVideoTopN = (): number => {
    const configured = Number(ctx.configService.get().hotTrendVideoTopN);
    if (Number.isFinite(configured) && configured > 0) {
      return Math.max(1, Math.min(50, Math.floor(configured)));
    }
    return 50;
  };

  // 解析视频热榜时间窗口（小时）
  const resolveHotTrendVideoDateWindowHours = (): 24 | 168 | 720 => {
    const configured = Number(ctx.configService.get().hotTrendVideoDateWindowHours);
    if (!Number.isFinite(configured)) {
      return 168; // 默认 7 天
    }
    const normalized = Math.max(24, Math.min(720, Math.floor(configured)));
    if (normalized >= 720) {
      return 720;
    }
    if (normalized >= 168) {
      return 168;
    }
    return 24;
  };

  // 解析视频热榜时间窗口标签
  const resolveHotTrendVideoDateWindowLabel = (): "24h" | "7d" | "30d" => {
    const hours = resolveHotTrendVideoDateWindowHours();
    if (hours >= 720) {
      return "30d";
    }
    if (hours >= 168) {
      return "7d";
    }
    return "24h";
  };

  return {
    resolveHotTrendSyncIntervalMs,
    resolveHotTrendRealtimeTopN,
    resolveHotTrendVideoTopN,
    resolveHotTrendVideoDateWindowHours,
    resolveHotTrendVideoDateWindowLabel,
  };
}