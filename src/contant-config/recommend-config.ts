// src/contant-config/recommend-config.ts

/**
 * 推荐系统配置参数
 * 所有数值均有明确的业务语义，避免魔法数值
 */

/** 热榜时效配置 */
export const HOT_TREND_CONFIG = {
  /** 热榜数据保留时长（小时）- 热榜更新周期约每日一次，保留72h确保内容充足 */
  EXPIRY_HOURS: 72,

  /** 热榜数据保留时长（毫秒）- 用于时间戳计算 */
  EXPIRY_MS: 72 * 60 * 60 * 1000,
} as const;

/** 推荐得分权重配置 */
export const SCORE_WEIGHT_CONFIG = {
  /** 分类偏好匹配基础得分系数
   * 业务含义：用户偏好分类的内容获得基础加分，权重越高得分越高
   * 计算：用户偏好权重 × 此系数 = 基础得分
   */
  CATEGORY_MATCH_BASE: 100,

  /** 热榜热度得分上限
   * 业务含义：热度值带来的最高加分，防止热榜内容过度占优
   */
  HOT_VALUE_MAX_SCORE: 10,

  /** 热榜热度基准值
   * 业务含义：达到此热度值时获得满分，超过不再加分
   * 来源：平台热榜典型热度值为万级，取10000作为基准
   */
  HOT_VALUE_BASE: 10000,

  /** 浏览量得分上限 */
  VIEW_MAX_SCORE: 5,

  /** 浏览量基准值 */
  VIEW_BASE: 1000,

  /** 点赞量得分上限 */
  LIKE_MAX_SCORE: 3,

  /** 点赞量基准值 */
  LIKE_BASE: 100,
} as const;

/** 新鲜度得分配置 */
export const FRESHNESS_CONFIG = {
  /** 24小时内发布的内容获得此加分 */
  SCORE_WITHIN_24H: 5,

  /** 72小时内发布的内容获得此加分 */
  SCORE_WITHIN_72H: 2,

  /** 时间阈值（小时） */
  THRESHOLD_24H: 24,
  THRESHOLD_72H: 72,
} as const;

/** 用户偏好计算配置 */
export const PREFERENCE_CONFIG = {
  /** 项目资产偏好权重占比 */
  ASSET_WEIGHT_RATIO: 0.7,

  /** 行为数据偏好权重占比 */
  BEHAVIOR_WEIGHT_RATIO: 0.3,

  /** 点击行为权重系数 */
  CLICK_WEIGHT_FACTOR: 3,

  /** 浏览行为权重系数 */
  VIEW_WEIGHT_FACTOR: 1,

  /** 行为日志统计时间范围（天） */
  BEHAVIOR_LOG_DAYS: 7,

  /** 项目查询上限 */
  PROJECT_QUERY_LIMIT: 50,
} as const;

/** 穿插策略配置 */
export const INTERLEAVE_CONFIG = {
  /** 穿插模式 */
  PICK_PATTERN: ["template", "template", "hot_trend", "template", "user_work", "hot_trend"] as const,

  /** 防止无限循环的最大迭代次数 */
  MAX_ITERATIONS: 1000,
} as const;

/** 分页配置 */
export const PAGINATION_CONFIG = {
  /** 默认每页数量 */
  DEFAULT_PAGE_SIZE: 20,

  /** 最大每页数量 */
  MAX_PAGE_SIZE: 50,
} as const;