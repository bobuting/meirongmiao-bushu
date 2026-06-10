/**
 * 实时热榜常量定义
 */

import { HOT_TREND_MAX_DURATION_SEC, HOT_TREND_MAX_STORYBOARD_SEGMENTS } from "../../contracts/hot-trend-constants.js";

// ============================================================================
// 导出共享常量
// ============================================================================

export {
  HOT_TREND_MAX_DURATION_SEC,
  HOT_TREND_MAX_STORYBOARD_SEGMENTS,
};

// ============================================================================
// 实时热榜特有常量
// ============================================================================

/** 实时热榜默认数据窗口 */
export const REALTIME_HOT_TREND_DATE_WINDOW = "24h" as const;

/** 实时热榜默认获取数量 */
export const REALTIME_HOT_TREND_DEFAULT_FETCH_LIMIT = 50;

/** 实时热榜默认 TopN */
export const REALTIME_HOT_TREND_DEFAULT_TOP_N = 20;

/** 实时热榜同步间隔（毫秒）- 1小时 */
export const REALTIME_HOT_TREND_SYNC_INTERVAL_MS = 60 * 60 * 1000;

/** 实时热榜数据源 */
export const REALTIME_HOT_TREND_SOURCE = "douyin-hot-hub";

/** 实时热榜板块名称 */
export const REALTIME_HOT_TREND_SECTION = "抖音热榜";