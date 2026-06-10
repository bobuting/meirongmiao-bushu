// src/service/recommend-config-service.ts

/**
 * 推荐配置服务
 * 提供推荐系统所需的各类配置参数
 * 配置值从 recommend-config.ts 常量文件导入，便于统一管理
 */

import {
  HOT_TREND_CONFIG,
  SCORE_WEIGHT_CONFIG,
  FRESHNESS_CONFIG,
  PREFERENCE_CONFIG,
  INTERLEAVE_CONFIG,
  PAGINATION_CONFIG,
} from "../contant-config/recommend-config.js";

// ============================================================================
// 服务接口
// ============================================================================

/**
 * 推荐配置服务接口
 */
export interface IRecommendConfigService {
  /** 获取热榜时效配置 */
  getHotTrendConfig(): typeof HOT_TREND_CONFIG;

  /** 获取推荐得分权重配置 */
  getScoreWeightConfig(): typeof SCORE_WEIGHT_CONFIG;

  /** 获取新鲜度得分配置 */
  getFreshnessConfig(): typeof FRESHNESS_CONFIG;

  /** 获取用户偏好计算配置 */
  getPreferenceConfig(): typeof PREFERENCE_CONFIG;

  /** 获取穿插策略配置 */
  getInterleaveConfig(): typeof INTERLEAVE_CONFIG;

  /** 获取分页配置 */
  getPaginationConfig(): typeof PAGINATION_CONFIG;
}

// ============================================================================
// 服务实现
// ============================================================================

/**
 * 推荐配置服务实现
 * 直接返回配置常量，无需额外处理
 */
export class RecommendConfigService implements IRecommendConfigService {
  /**
   * 获取热榜时效配置
   * 用于判断热榜数据的时效性阈值
   */
  getHotTrendConfig() {
    return HOT_TREND_CONFIG;
  }

  /**
   * 获取推荐得分权重配置
   * 用于计算推荐得分时的各项权重参数
   */
  getScoreWeightConfig() {
    return SCORE_WEIGHT_CONFIG;
  }

  /**
   * 获取新鲜度得分配置
   * 用于根据内容发布时间计算新鲜度加分
   */
  getFreshnessConfig() {
    return FRESHNESS_CONFIG;
  }

  /**
   * 获取用户偏好计算配置
   * 用于计算用户偏好权重时的各项参数
   */
  getPreferenceConfig() {
    return PREFERENCE_CONFIG;
  }

  /**
   * 获取穿插策略配置
   * 用于确定各来源内容穿插展示的模式
   */
  getInterleaveConfig() {
    return INTERLEAVE_CONFIG;
  }

  /**
   * 获取分页配置
   * 用于确定默认分页参数
   */
  getPaginationConfig() {
    return PAGINATION_CONFIG;
  }
}