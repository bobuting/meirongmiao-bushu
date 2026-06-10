/**
 * 热榜共享常量
 * 供热榜模块和视频热榜模块共同使用
 *
 * 从 modules/hot-trend/constants.ts 提取的共享部分
 */

// ============================================================================
// 资产标识标签
// ============================================================================

/** 热榜资产标识 */
export const HOT_TREND_ASSET_TAG = "__hot_trend_asset__";

// ============================================================================
// 类型标识前缀
// ============================================================================

/** 热榜键前缀 */
export const HOT_TREND_KEY_PREFIX = "hottrend-key:";

/** 热榜类型前缀 */
export const HOT_TREND_TYPE_PREFIX = "hottrend-type:";

/** 热榜类型遗留视频标签 */
export const HOT_TREND_TYPE_LEGACY_VIDEO_TAG = "__hot_trend_type__video";

/** 热榜类型遗留实时标签 */
export const HOT_TREND_TYPE_LEGACY_REALTIME_TAG = "__hot_trend_type__realtime";

// ============================================================================
// 打标相关前缀
// ============================================================================

/** 原因前缀 */
export const HOT_TREND_REASON_PREFIX = "hottrend-reason:";

/** 适合度前缀 */
export const HOT_TREND_SUITABILITY_PREFIX = "hottrend-suitability:";

/** 更新时间前缀 */
export const HOT_TREND_UPDATED_AT_PREFIX = "hottrend-updated-at:";

/** 同步时间前缀 */
export const HOT_TREND_SYNCED_AT_PREFIX = "hottrend-synced-at:";

/** 标签前缀 */
export const HOT_TREND_LABEL_PREFIX = "hottrend-label:";

/** 排名前缀 */
export const HOT_TREND_TOP_RANK_PREFIX = "hottrend-top-rank:";

/** 提示词版本前缀 */
export const HOT_TREND_PROMPT_VERSION_PREFIX = "hottrend-prompt-version:";

/** TopN前缀 */
export const HOT_TREND_TOPN_PREFIX = "hottrend-topn:";

/** 生成模式前缀 */
export const HOT_TREND_GENERATION_MODE_PREFIX = "hottrend-generation-mode:";

/** 推荐前缀 */
export const HOT_TREND_RECOMMENDED_PREFIX = "hottrend-recommended:";

/** 证据前缀 */
export const HOT_TREND_EVIDENCE_PREFIX = "hottrend-evidence:";

/** 真人出镜前缀 */
export const HOT_TREND_HUMAN_PRESENCE_PREFIX = "hottrend-human-presence:";

// ============================================================================
// 默认值和限制
// ============================================================================

/** 最大时长（秒） */
export const HOT_TREND_MAX_DURATION_SEC = 30;

/** 最大分镜数量 */
export const HOT_TREND_MAX_STORYBOARD_SEGMENTS = 10;

/** 最小叙述字符数 */
export const HOT_TREND_MIN_NARRATION_CHARS = 10;