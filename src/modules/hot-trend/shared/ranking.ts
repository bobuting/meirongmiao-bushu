/**
 * 多因子加权排序模块
 * 综合热度值、平台权重、时效因子、内容质量因子进行排序
 */

import type { MultiPlatformHotTrend } from "../../../services/crawler/tikhub-client.js";
import { scoreHotTrendFashionSoftAdAffinity } from "./infer.js";

// ========== 类型定义 ==========

/**
 * 平台权重配置
 */
export interface PlatformWeightConfig {
  platform: string;
  weight: number;  // 0.0 - 1.0
}

/**
 * 排序因子配置
 */
export interface RankingFactorConfig {
  platformWeights: PlatformWeightConfig[];
  timeDecayHours: number;      // 时效衰减周期（小时）
  qualityScoreRange: number;   // 内容质量得分范围（用于归一化）
}

/**
 * 排序后的热点结果
 */
export interface RankedHotTrend extends MultiPlatformHotTrend {
  compositeScore: number;      // 综合得分
  platformWeight: number;      // 平台权重
  timeDecayFactor: number;     // 时效因子
  qualityFactor: number;       // 内容质量因子
  baseHeatNormalized: number;  // 归一化后的基础热度
}

// ========== 默认配置 ==========

/**
 * 默认平台权重（抖音 > 小红书 > 快手）
 */
export const DEFAULT_PLATFORM_WEIGHTS: PlatformWeightConfig[] = [
  { platform: "douyin", weight: 1.0 },
  { platform: "xiaohongshu", weight: 0.7 },
  { platform: "kuaishou", weight: 0.5 },
  { platform: "weibo", weight: 0.4 },
  { platform: "bilibili", weight: 0.3 },
  { platform: "zhihu", weight: 0.2 },
];

/**
 * 默认排序因子配置
 */
export const DEFAULT_RANKING_CONFIG: RankingFactorConfig = {
  platformWeights: DEFAULT_PLATFORM_WEIGHTS,
  timeDecayHours: 24,       // 24小时内热度衰减
  qualityScoreRange: 20,    // infer 函数返回 -10 到 10，范围是 20
};

// ========== 核心排序函数 ==========

/**
 * 计算热点综合得分
 * @param trend - 热点数据
 * @param config - 排序配置
 * @param referenceTime - 参考时间（用于计算时效）
 * @returns 排序后的热点结果
 */
export function calculateCompositeScore(
  trend: MultiPlatformHotTrend,
  config: RankingFactorConfig = DEFAULT_RANKING_CONFIG,
  referenceTime: number = Date.now()
): RankedHotTrend {
  // 1. 平台权重
  const platformWeight = getPlatformWeight(trend.platform, config.platformWeights);

  // 2. 时效因子（热度随时间衰减）
  const hoursElapsed = (referenceTime - trend.createdAt) / (1000 * 60 * 60);
  const timeDecayFactor = calculateTimeDecayFactor(hoursElapsed, config.timeDecayHours);

  // 3. 内容质量因子（基于关键词匹配）
  const qualityScore = scoreHotTrendFashionSoftAdAffinity({
    topicLabel: trend.title,
    trendType: "realtime",
  });
  // 归一化到 0-1 范围（-10 到 10 映射到 0 到 1）
  const qualityFactor = (qualityScore + 10) / config.qualityScoreRange;

  // 4. 基础热度归一化（相对于同平台其他热点）
  // 注意：热度值需要在批量处理时归一化，这里先保留原始值
  const baseHeatNormalized = trend.heatValue;

  // 5. 综合得分 = 热度 × 平台权重 × 时效因子 × 内容质量
  const compositeScore = baseHeatNormalized * platformWeight * timeDecayFactor * qualityFactor;

  return {
    ...trend,
    compositeScore,
    platformWeight,
    timeDecayFactor,
    qualityFactor,
    baseHeatNormalized,
  };
}

/**
 * 批量计算综合得分并排序
 * @param trends - 热点列表
 * @param config - 排序配置
 * @param limit - 返回数量限制
 * @returns 排序后的热点列表
 */
export function rankAndSelectTopTrends(
  trends: MultiPlatformHotTrend[],
  config: RankingFactorConfig = DEFAULT_RANKING_CONFIG,
  limit: number = 50
): RankedHotTrend[] {
  if (trends.length === 0) {
    return [];
  }

  const referenceTime = Date.now();

  // 计算每个热点的综合得分
  const ranked = trends.map(trend => calculateCompositeScore(trend, config, referenceTime));

  // 归一化基础热度（相对于全部热点的最大值）
  const maxHeat = Math.max(...ranked.map(r => r.heatValue));
  if (maxHeat > 0) {
    for (const r of ranked) {
      r.baseHeatNormalized = r.heatValue / maxHeat;
      // 重新计算综合得分
      r.compositeScore = r.baseHeatNormalized * r.platformWeight * r.timeDecayFactor * r.qualityFactor;
    }
  }

  // 按综合得分降序排序
  ranked.sort((a, b) => b.compositeScore - a.compositeScore);

  // 返回 Top N
  return ranked.slice(0, limit);
}

// ========== 辅助函数 ==========

/**
 * 获取平台权重
 * @param platform - 平台名称
 * @param weights - 权重配置列表
 * @returns 权重值（未配置的平台返回 0.1）
 */
export function getPlatformWeight(platform: string, weights: PlatformWeightConfig[]): number {
  const config = weights.find(w => w.platform === platform);
  return config?.weight ?? 0.1;  // 未配置的平台给予低权重
}

/**
 * 计算时效衰减因子
 * 使用指数衰减：factor = 1 / (1 + hours / decayHours)
 * @param hoursElapsed - 已过小时数
 * @param decayHours - 衰减周期
 * @returns 衰减因子（0-1）
 */
export function calculateTimeDecayFactor(hoursElapsed: number, decayHours: number): number {
  // 确保因子在 0-1 范围内
  const factor = 1 / (1 + Math.max(0, hoursElapsed) / decayHours);
  return Math.max(0, Math.min(1, factor));
}

/**
 * 从配置字符串解析平台权重
 * 格式："douyin:1.0,xiaohongshu:0.7,kuaishou:0.5"
 * @param configString - 配置字符串
 * @returns 权重配置列表
 */
export function parsePlatformWeightsFromString(configString: string): PlatformWeightConfig[] {
  if (!configString || configString.trim() === "") {
    return DEFAULT_PLATFORM_WEIGHTS;
  }

  const weights: PlatformWeightConfig[] = [];
  const parts = configString.split(",");

  for (const part of parts) {
    const [platform, weightStr] = part.split(":");
    if (platform && weightStr) {
      const weight = parseFloat(weightStr);
      if (!isNaN(weight) && weight >= 0 && weight <= 1) {
        weights.push({ platform: platform.trim(), weight });
      }
    }
  }

  // 如果解析失败，返回默认配置
  return weights.length > 0 ? weights : DEFAULT_PLATFORM_WEIGHTS;
}

/**
 * 合并去重（跨平台相同主题）
 * @param trends - 热点列表
 * @returns 去重后的热点列表
 */
export function deduplicateByTitle(trends: MultiPlatformHotTrend[]): MultiPlatformHotTrend[] {
  const seen = new Map<string, MultiPlatformHotTrend>();

  for (const trend of trends) {
    const key = normalizeTitle(trend.title);
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, trend);
    } else {
      // 合并热度值（累加）
      existing.heatValue += trend.heatValue;
      // 保留排名更高的平台
      if (trend.rank < existing.rank) {
        existing.platform = trend.platform;
        existing.rank = trend.rank;
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * 标题标准化（用于去重）
 * @param title - 原标题
 * @returns 标准化后的标题
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^一-龥a-z0-9]/g, "")  // 移除非中文非字母数字字符
    .trim();
}