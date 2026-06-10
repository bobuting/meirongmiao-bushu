/**
 * 实时热榜工具函数
 */

import type {
  HotTrendType,
  HotTrendSuitability,
  HotTrendHumanPresence,
  SquareTrendTopic,
} from "../../contracts/hot-trend-base.js";

// ============================================================================
// 文本清理
// ============================================================================

/**
 * 清理叙述文本
 */
export function sanitizeNarrativeText(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 压缩文本行
 */
export function compactTextLine(text: string, maxLength = 120): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength - 3) + "...";
}

/**
 * 标准化标签值
 */
export function sanitizeTagValue(value: string): string {
  return value.replace(/\s+/g, "_").slice(0, 120);
}

// ============================================================================
// 键标准化
// ============================================================================

/**
 * 标准化热榜键
 */
export function normalizeHotTrendKey(type: HotTrendType, label: string): string {
  const normalizedLabel = label.trim().replace(/\s+/g, " ").toLowerCase();
  return `${type}:${normalizedLabel}`;
}

// ============================================================================
// 标签标准化
// ============================================================================

/**
 * 标准化热榜标签数组
 */
export function normalizeHotTrendLabels(raw: unknown): string[] {
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[，,;；|/]/)
      : [];
  const normalized = values
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0)
    .slice(0, 6);
  return [...new Set(normalized)];
}

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
// 启发式洞察构建
// ============================================================================

/**
 * 构建启发式热榜洞察
 */
export function buildHeuristicHotTrendInsight(
  topic: SquareTrendTopic,
  type: HotTrendType,
  id = topic.id,
): import("../../contracts/hot-trend-base.js").HotTrendInsight {
  const labels = guessHotTrendLabels(topic.label, type);
  const humanPresence = type === "video"
    ? inferHotTrendHumanPresenceFromText(`${topic.label} ${labels.join(" ")}`)
    : "yes";

  const scriptContent =
    `开场：傍晚路口，主角刷到"${topic.label}"后临时改变出行计划，转身走进熟悉的街区。\n` +
    "发展：她在店门口与橱窗前停下，快速试搭两套造型，对比版型与层次后的镜头状态。\n" +
    "转折：朋友发来消息催她赴约，她边走边整理衣摆，镜头切到细节与步态，情绪逐渐放松。\n" +
    "收束：夜色亮起，主角在街角回头一笑，整个人物状态和场景氛围完成统一。";

  return {
    id,
    title: topic.label,
    suitability: "medium",
    humanPresence,
    reason: "话题热度高，适合改写为短视频剧情。",
    labels,
    scriptTitle: `${topic.label} - ${type === "video" ? "视频" : "实时"}脚本`,
    scriptContent: sanitizeNarrativeText(scriptContent),
    durationSec: 20,
    sceneSettings: [],
    storyboardSegments: [],
  };
}

/**
 * 构建启发式热榜洞察数组
 */
export function buildHeuristicHotTrendInsights(
  topics: SquareTrendTopic[],
  type: HotTrendType,
): import("../../contracts/hot-trend-base.js").HotTrendInsight[] {
  return topics.map((topic, index) => buildHeuristicHotTrendInsight(topic, type, index + 1));
}