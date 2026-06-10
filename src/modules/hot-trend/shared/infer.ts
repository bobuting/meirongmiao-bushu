/**
 * 热榜推断函数
 * 从 app.ts 迁移，包含文本推断和评分函数
 *
 * 迁移源: app.ts 行 7163-7180, 7249-7333, 8285-8309
 */

import type {
  HotTrendType,
  HotTrendSuitability,
  HotTrendHumanPresence,
  HotTrendInsight,
  HotTrendRecommendationScorer,
} from "../types.js";
import { parseHotTrendSmartStoryboardClass } from "./parse.js";

// ============================================================================
// 真人出镜推断
// ============================================================================

/**
 * 从文本推断真人出镜
 */
export function inferHotTrendHumanPresenceFromText(text: string): HotTrendHumanPresence {
  const normalized = text.toLowerCase();
  if (
    /(小动物|宠物|猫|狗|风景|景观|风光|美景|空镜|延时|航拍|食物|美食|菜谱|战争|冲突|哀悼|讣告|国家领导人|领导人|灾难|事故)/i.test(
      normalized,
    )
  ) {
    return "no";
  }
  if (
    /(真人|人物|角色|主角|女生|女孩|男生|男孩|情侣|闺蜜|亲子|妈妈|爸爸|博主|上身|试穿|穿搭|vlog|剧情|短剧|约会|通勤|变装)/i.test(
      normalized,
    )
  ) {
    return "yes";
  }
  return "uncertain";
}

// ============================================================================
// 适合度推断
// ============================================================================

/**
 * 推断热榜适合度
 */
export function inferHotTrendSuitability(topicLabel: string): {
  suitability: HotTrendSuitability;
  reason: string;
} {
  const score = scoreHotTrendFashionSoftAdAffinity({
    topicLabel,
    trendType: "realtime",
  });
  if (score <= -6) {
    return {
      suitability: "low",
      reason: "话题偏敏感或与穿搭表达弱相关，改写空间有限。",
    };
  }
  if (score >= 6) {
    return {
      suitability: "high",
      reason: "与日常穿搭/生活方式强相关，适合改写成剧情片段。",
    };
  }
  return {
    suitability: "medium",
    reason: "可改写，但需补足主场景、时间天气和角色行动线。",
  };
}

// ============================================================================
// 评分函数
// ============================================================================

/**
 * 计算热榜时尚软广适配度得分
 * 返回 -10 到 10 的分数
 */
export function scoreHotTrendFashionSoftAdAffinity(input: {
  topicLabel: string;
  trendType: HotTrendType;
  labels?: string[];
}): number {
  const text = `${input.topicLabel} ${(input.labels ?? []).join(" ")}`.toLowerCase();
  let score = 0;

  // 正向关键词 - 穿搭相关
  if (/(穿搭|时尚|衣橱|衣服|上身|版型|面料|look|ootd|搭配|显瘦|显高|通勤|出街|拍照|春装|夏装|秋装|冬装)/i.test(text)) {
    score += 6;
  }

  // 正向关键词 - 生活方式相关
  if (/(美妆|护肤|生活方式|探店|城市漫步|vlog|约会|校园|通勤|旅行|运动|健身|咖啡店|便利店|商场|街拍)/i.test(text)) {
    score += 3;
  }

  // 正向关键词 - 内容类型
  if (/(教程|攻略|清单|盘点|测评|开箱|好物|种草|避坑)/i.test(text)) {
    score += 2;
  }

  // 负向关键词 - 敏感话题
  if (/(灾难|事故|死亡|遇难|战争|冲突|刑事|拘留|诈骗|维权|政治|讣告|塌方|地震|洪水)/i.test(text)) {
    score -= 9;
  }

  // 负向关键词 - 财经相关
  if (/(财经|股市|汇率|油价|政策|发布会)/i.test(text)) {
    score -= 2;
  }

  // 视频热榜加权
  if (input.trendType === "video") {
    score += 1;
  }

  return score;
}

// ============================================================================
// 标签猜测
// ============================================================================

/**
 * 猜测热榜标签
 */
export function guessHotTrendLabels(topicLabel: string, trendType: HotTrendType): string[] {
  const text = topicLabel.toLowerCase();
  const labels: string[] = [];

  if (/(穿搭|时尚|衣|ootd|搭配)/i.test(text)) labels.push("时尚穿搭");
  if (/(美妆|护肤|妆|香水)/i.test(text)) labels.push("美妆护肤");
  if (/(剧情|电影|综艺|明星|演唱会|欧冠|比赛|体育)/i.test(text)) labels.push("娱乐热点");
  if (/(教程|攻略|技巧|方法|清单)/i.test(text)) labels.push("知识干货");
  if (/(开箱|测评|评测|种草|好物|购物)/i.test(text)) labels.push("消费种草");
  if (/(职场|打工|上班|学习|四六级|考试)/i.test(text)) labels.push("职场学习");
  if (/(情感|恋爱|婚姻|遗憾|共鸣)/i.test(text)) labels.push("情感表达");

  if (labels.length === 0) {
    labels.push(trendType === "video" ? "视频热点" : "实时热点");
  }

  return labels.slice(0, 3);
}

// ============================================================================
// 智能故事板类型推断
// ============================================================================

/**
 * 推断智能故事板类型
 */
export function resolveHotTrendSmartStoryboardClass(input: {
  tags: readonly string[];
  trendType: HotTrendType;
}): "realtime" | "video_copy" | "video_shot" {
  const fromTag = parseHotTrendSmartStoryboardClass(input.tags);
  if (fromTag) {
    return fromTag;
  }
  return input.trendType === "video" ? "video_copy" : "realtime";
}

// ============================================================================
// 谨慎/拒绝检查
// ============================================================================

/**
 * 检查洞察是否为谨慎或拒绝状态
 */
export function isHotTrendCautiousOrRejectedInsight(insight: Pick<HotTrendInsight, "labels" | "reason">): boolean {
  const haystack = `${insight.labels.join(" ")} ${insight.reason}`.toLowerCase();
  return /(谨慎|不推荐|不适合|风险|敏感|负面|哀悼|战争|冲突|灾难|事故|政治)/i.test(haystack);
}

/**
 * 检查视频洞察是否适合生成
 */
export function isVideoHotTrendInsightEligibleForGeneration(insight: HotTrendInsight): boolean {
  if (insight.humanPresence !== "yes") {
    return false;
  }
  if (insight.suitability !== "high") {
    return false;
  }
  if (isHotTrendCautiousOrRejectedInsight(insight)) {
    return false;
  }
  return true;
}

// ============================================================================
// 适合度辅助函数
// ============================================================================

/**
 * 检查适合度是否可推荐
 */
export function isStep3RecommendableSuitability(value: HotTrendSuitability | null): value is "high" | "medium" {
  return value === "high" || value === "medium";
}

// ============================================================================
// 推荐评分器解析
// ============================================================================

/** 默认推荐评分器 */
const DEFAULT_HOT_TREND_RECOMMENDATION_SCORER: HotTrendRecommendationScorer = scoreHotTrendFashionSoftAdAffinity;

/** 推荐评分器注册表 */
export const HOT_TREND_RECOMMENDATION_SCORER_REGISTRY: Partial<Record<string, HotTrendRecommendationScorer>> = {
  // 注意: TREND_RECOMMENDATION_CONFIG_CONTRACT_VERSION 需要从外部注入
  "AT50-03.v1": scoreHotTrendFashionSoftAdAffinity,
  "AT50-03.fallback.v1": scoreHotTrendFashionSoftAdAffinity,
};

/**
 * 解析推荐评分器
 */
export function resolveHotTrendRecommendationScorer(
  config: { functionVersion: string; safeFallbackVersion: string },
  contractVersion: string,
): {
  scorer: HotTrendRecommendationScorer;
  requestedVersion: string;
  resolvedVersion: string;
  usedFallback: boolean;
} {
  const requestedVersion = config.functionVersion.trim();
  const directScorer = HOT_TREND_RECOMMENDATION_SCORER_REGISTRY[requestedVersion];
  if (directScorer) {
    return {
      scorer: directScorer,
      requestedVersion,
      resolvedVersion: requestedVersion,
      usedFallback: false,
    };
  }
  const fallbackVersion = config.safeFallbackVersion.trim();
  const fallbackScorerByVersion = HOT_TREND_RECOMMENDATION_SCORER_REGISTRY[fallbackVersion];
  const fallbackScorer =
    fallbackScorerByVersion ??
    HOT_TREND_RECOMMENDATION_SCORER_REGISTRY[contractVersion] ??
    DEFAULT_HOT_TREND_RECOMMENDATION_SCORER;
  return {
    scorer: fallbackScorer,
    requestedVersion,
    resolvedVersion:
      fallbackScorerByVersion ? fallbackVersion : contractVersion,
    usedFallback: true,
  };
}