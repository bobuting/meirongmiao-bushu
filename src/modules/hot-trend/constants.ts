/**
 * 热榜常量定义
 * 从 app.ts 迁移，包含标签前缀和默认值
 *
 * 迁移源: app.ts 行 6909-6944
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

/** 故事打磨模式前缀 */
export const HOT_TREND_STORY_POLISH_MODE_PREFIX = "hottrend-story-polish-mode:";

/** 推荐前缀 */
export const HOT_TREND_RECOMMENDED_PREFIX = "hottrend-recommended:";

/** 证据前缀 */
export const HOT_TREND_EVIDENCE_PREFIX = "hottrend-evidence:";

/** 真人出镜前缀 */
export const HOT_TREND_HUMAN_PRESENCE_PREFIX = "hottrend-human-presence:";

// ============================================================================
// 文本分析相关前缀
// ============================================================================

/** 文本原因前缀 */
export const HOT_TREND_TEXT_REASON_PREFIX = "hottrend-text-reason:";

/** 文本适合度前缀 */
export const HOT_TREND_TEXT_SUITABILITY_PREFIX = "hottrend-text-suitability:";

/** 文本标签前缀 */
export const HOT_TREND_TEXT_LABEL_PREFIX = "hottrend-text-label:";

// ============================================================================
// 多模态分析相关前缀
// ============================================================================

/** 多模态原因前缀 */
export const HOT_TREND_MULTIMODAL_REASON_PREFIX = "hottrend-multimodal-reason:";

/** 多模态判决前缀 */
export const HOT_TREND_MULTIMODAL_VERDICT_PREFIX = "hottrend-multimodal-verdict:";

/** 多模态真人出镜前缀 */
export const HOT_TREND_MULTIMODAL_HUMAN_PRESENCE_PREFIX = "hottrend-multimodal-human-presence:";

/** 多模态真人露出前缀 */
export const HOT_TREND_MULTIMODAL_HUMAN_EXPOSURE_PREFIX = "hottrend-multimodal-human-exposure:";

// ============================================================================
// 重打标相关前缀
// ============================================================================

/** 重打标时间前缀 */
export const HOT_TREND_RELABELED_AT_PREFIX = "hottrend-relabeled-at:";

/** 重打标批次前缀 */
export const HOT_TREND_RELABEL_BATCH_PREFIX = "hottrend-relabel-batch:";

// ============================================================================
// 智能故事板相关
// ============================================================================

/** 智能故事板类型前缀 */
export const HOT_TREND_SMART_STORYBOARD_CLASS_PREFIX = "hottrend-smart-class:";

// ============================================================================
// 默认值和限制
// ============================================================================

/** Step3 最大时长（秒） */
export const HOT_TREND_STEP3_MAX_DURATION_SEC = 30;

/** Step3 最大分镜数量 */
export const HOT_TREND_STEP3_MAX_STORYBOARD_SEGMENTS = 10;

/** 最小叙述字符数 */
export const HOT_TREND_MIN_NARRATION_CHARS = 10;

/** 视频热榜数据不足错误码 */
export const HOT_TREND_VIDEO_UNDERFLOW_ERROR_CODE = "HOT_TREND_VIDEO_FETCH_UNDERFLOW";

/** 视频热榜回退额外获取数量 */
export const HOT_TREND_VIDEO_FALLBACK_EXTRA_FETCH_COUNT = Math.max(
  5,
  Number(process.env.HOT_TREND_VIDEO_FALLBACK_EXTRA_FETCH_COUNT ?? 30),
);