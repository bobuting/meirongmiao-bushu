/**
 * 双策略内容过滤模块
 * 第一层：关键词预过滤（快速、本地）
 * 第二层：AI语义精筛（较慢、LLM辅助，失败时降级）
 */

import type { RankedHotTrend } from "./ranking.js";
import type { AppContext } from "../../../core/app-context.js";
import type { ProviderRouteKey } from "../../../contracts/provider-route-policy-contract.js";
import { getLogger } from "../../../core/logger/index.js";
import { requestLlmPlainTextWithMetadata } from "../../../services/llm/llm-transport.js";
import { skillLoader } from "../../../services/skills/index.js";

const log = getLogger("hot-trend-filter");

// ========== 类型定义 ==========

/**
 * 过滤结果
 */
export interface FilterResult {
  passed: RankedHotTrend[];
  rejected: RankedHotTrend[];
  rejectionReasons: Map<string, string>;  // title -> reason
  usedAiFilter: boolean;  // 是否使用了 AI 语义过滤
  aiFilterError?: string; // AI 过滤失败时的错误信息
}

/**
 * 关键词过滤配置
 */
export interface KeywordFilterConfig {
  // 禁止关键词（匹配则直接拒绝）
  blockedKeywords: string[];
  // 敏感关键词（匹配则进入 AI 审核）
  sensitiveKeywords: string[];
  // 必须包含关键词（至少匹配一个）
  requiredKeywords?: string[];
}

/**
 * AI 语义过滤配置
 */
export interface AiFilterConfig {
  enabled: boolean;
  maxBatchSize: number;  // 单次 AI 调用处理的最大数量
  temperature: number;
  fallbackOnReject: boolean;  // AI 拒绝时是否降级为关键词结果
}

// ========== 默认配置 ==========

/**
 * 默认禁止关键词（敏感话题、负面内容）
 */
export const DEFAULT_BLOCKED_KEYWORDS = [
  "灾难", "事故", "死亡", "遇难", "战争", "冲突",
  "刑事", "拘留", "诈骗", "维权", "政治", "讣告",
  "塌方", "地震", "洪水", "火灾", "疫情", "病毒",
  "领导人", "国家主席", "总理", "总统",
];

/**
 * 默认敏感关键词（需要 AI 审核）
 */
export const DEFAULT_SENSITIVE_KEYWORDS = [
  "明星", "网红", "八卦", "绯闻", "出轨", "离婚",
  "热搜", "争议", "舆论", "风波", "爆料",
];

/**
 * 默认关键词过滤配置
 */
export const DEFAULT_KEYWORD_FILTER_CONFIG: KeywordFilterConfig = {
  blockedKeywords: DEFAULT_BLOCKED_KEYWORDS,
  sensitiveKeywords: DEFAULT_SENSITIVE_KEYWORDS,
  requiredKeywords: undefined,  // 不强制要求
};

/**
 * 默认 AI 过滤配置
 */
export const DEFAULT_AI_FILTER_CONFIG: AiFilterConfig = {
  enabled: true,
  maxBatchSize: 20,
  temperature: 0.3,
  fallbackOnReject: true,
};

// ========== 第一层：关键词预过滤 ==========

/**
 * 关键词预过滤
 * @param trends - 热点列表
 * @param config - 过滤配置
 * @returns 过滤结果（passed + 需AI审核的列表）
 */
export function keywordPreFilter(
  trends: RankedHotTrend[],
  config: KeywordFilterConfig = DEFAULT_KEYWORD_FILTER_CONFIG
): {
  passed: RankedHotTrend[];
  rejected: RankedHotTrend[];
  needAiReview: RankedHotTrend[];
  rejectionReasons: Map<string, string>;
} {
  const passed: RankedHotTrend[] = [];
  const rejected: RankedHotTrend[] = [];
  const needAiReview: RankedHotTrend[] = [];
  const rejectionReasons = new Map<string, string>();

  for (const trend of trends) {
    const title = trend.title.toLowerCase();

    // 检查禁止关键词
    const blockedMatch = config.blockedKeywords.find(kw => title.includes(kw.toLowerCase()));
    if (blockedMatch) {
      rejected.push(trend);
      rejectionReasons.set(trend.title, `包含禁止关键词: ${blockedMatch}`);
      continue;
    }

    // 检查必须包含关键词（如果配置了）
    if (config.requiredKeywords && config.requiredKeywords.length > 0) {
      const hasRequired = config.requiredKeywords.some(kw => title.includes(kw.toLowerCase()));
      if (!hasRequired) {
        rejected.push(trend);
        rejectionReasons.set(trend.title, "不包含必要关键词");
        continue;
      }
    }

    // 检查敏感关键词（需要 AI 审核）
    const sensitiveMatch = config.sensitiveKeywords.find(kw => title.includes(kw.toLowerCase()));
    if (sensitiveMatch) {
      needAiReview.push(trend);
      continue;
    }

    // 无匹配关键词，直接通过
    passed.push(trend);
  }

  log.info({
    total: trends.length,
    passed: passed.length,
    rejected: rejected.length,
    needAiReview: needAiReview.length,
  }, "Keyword pre-filter completed");

  return { passed, rejected, needAiReview, rejectionReasons };
}

// ========== 第二层：AI 语义精筛 ==========

/**
 * AI 语义精筛
 * @param trends - 待审核的热点列表
 * @param deps - LLM 调用依赖
 * @param config - AI 过滤配置
 * @returns 过滤结果
 */
export async function aiSemanticFilter(
  trends: RankedHotTrend[],
  deps: {
    ctx: AppContext;
    routeKey: ProviderRouteKey;
    userId: string;
  },
  config: AiFilterConfig = DEFAULT_AI_FILTER_CONFIG
): Promise<{
  passed: RankedHotTrend[];
  rejected: RankedHotTrend[];
  rejectionReasons: Map<string, string>;
  error?: string;
}> {
  if (!config.enabled || trends.length === 0) {
    return {
      passed: trends,
      rejected: [],
      rejectionReasons: new Map(),
    };
  }

  // 分批处理（避免单次 LLM 调用过大）
  const batches = batchArray(trends, config.maxBatchSize);
  const allPassed: RankedHotTrend[] = [];
  const allRejected: RankedHotTrend[] = [];
  const allReasons = new Map<string, string>();

  for (const batch of batches) {
    try {
      const result = await processBatchWithAi(batch, deps, config);
      allPassed.push(...result.passed);
      allRejected.push(...result.rejected);
      for (const [title, reason] of result.rejectionReasons) {
        allReasons.set(title, reason);
      }
    } catch (error) {
      // AI 调用失败，根据配置决定是否降级
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.warn({ batchSize: batch.length, error: errorMsg }, "AI semantic filter failed");

      if (config.fallbackOnReject) {
        // 降级：全部通过（保守策略）
        allPassed.push(...batch);
      } else {
        // 不降级：全部拒绝（严格策略）
        allRejected.push(...batch);
        for (const trend of batch) {
          allReasons.set(trend.title, `AI审核失败: ${errorMsg}`);
        }
      }

      // 返回错误信息（仅第一个错误）
      return {
        passed: allPassed,
        rejected: allRejected,
        rejectionReasons: allReasons,
        error: errorMsg,
      };
    }
  }

  log.info({
    total: trends.length,
    passed: allPassed.length,
    rejected: allRejected.length,
  }, "AI semantic filter completed");

  return {
    passed: allPassed,
    rejected: allRejected,
    rejectionReasons: allReasons,
  };
}

/**
 * 使用 AI 处理单个批次
 */
async function processBatchWithAi(
  trends: RankedHotTrend[],
  deps: {
    ctx: AppContext;
    routeKey: ProviderRouteKey;
    userId: string;
  },
  config: AiFilterConfig
): Promise<{
  passed: RankedHotTrend[];
  rejected: RankedHotTrend[];
  rejectionReasons: Map<string, string>;
}> {
  // 通过 Skills 系统加载提示词，替换硬编码
  const { system: systemPrompt, user: userPrompt } = await skillLoader.render("hot_trend_filter", {
    trendTitles: trends.map(t => `- ${t.title}`).join("\n"),
  });

  const response = await requestLlmPlainTextWithMetadata(
    { id: deps.routeKey, vendor: "gemini", baseUrl: "", model: "", callMode: "openai" as const, timeoutMs: 60_000, secret: "" },
    systemPrompt,
    userPrompt,
    config.temperature,
    {
      ctx: deps.ctx,
      routeKey: deps.routeKey,
      businessContext: "热榜语义过滤",
      userId: deps.userId,
      timeoutMsOverride: 60_000,
    },
  );

  // 解析 AI 返回的 JSON 结果
  return parseAiFilterResponse(response.text, trends);
}

/**
 * 解析 AI 过滤响应
 */
function parseAiFilterResponse(
  response: string,
  trends: RankedHotTrend[]
): {
  passed: RankedHotTrend[];
  rejected: RankedHotTrend[];
  rejectionReasons: Map<string, string>;
} {
  const passed: RankedHotTrend[] = [];
  const rejected: RankedHotTrend[] = [];
  const rejectionReasons = new Map<string, string>();

  try {
    // 提取 JSON 部分（处理可能的 Markdown 包装）
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const results = parsed.results || [];

    for (const trend of trends) {
      const aiResult = results.find((r: { title: string }) => r.title === trend.title);

      if (aiResult && aiResult.suitable === false) {
        rejected.push(trend);
        rejectionReasons.set(trend.title, aiResult.reason || "AI判定不适合");
      } else {
        passed.push(trend);
      }
    }
  } catch (error) {
    // JSON 解析失败，保守策略：全部通过
    log.warn({ error: error instanceof Error ? error.message : String(error) }, "Failed to parse AI filter response");
    return {
      passed: trends,
      rejected: [],
      rejectionReasons: new Map(),
    };
  }

  return { passed, rejected, rejectionReasons };
}

// ========== 双策略组合过滤 ==========

/**
 * 双策略组合过滤
 * @param trends - 热点列表
 * @param deps - LLM 调用依赖
 * @param keywordConfig - 关键词配置
 * @param aiConfig - AI 配置
 * @returns 最终过滤结果
 */
export async function dualStrategyFilter(
  trends: RankedHotTrend[],
  deps: {
    ctx: AppContext;
    routeKey: ProviderRouteKey;
    userId: string;
  },
  keywordConfig: KeywordFilterConfig = DEFAULT_KEYWORD_FILTER_CONFIG,
  aiConfig: AiFilterConfig = DEFAULT_AI_FILTER_CONFIG
): Promise<FilterResult> {
  // 第一层：关键词预过滤
  const { passed, rejected, needAiReview, rejectionReasons } = keywordPreFilter(trends, keywordConfig);

  // 第二层：AI 语义精筛（仅处理需要审核的）
  let aiPassed: RankedHotTrend[] = [];
  let aiRejected: RankedHotTrend[] = [];
  let aiError: string | undefined;

  if (needAiReview.length > 0 && aiConfig.enabled) {
    const aiResult = await aiSemanticFilter(needAiReview, deps, aiConfig);
    aiPassed = aiResult.passed;
    aiRejected = aiResult.rejected;
    aiError = aiResult.error;

    for (const [title, reason] of aiResult.rejectionReasons) {
      rejectionReasons.set(title, reason);
    }
  } else if (needAiReview.length > 0) {
    // AI 未启用，保守策略：全部通过
    aiPassed = needAiReview;
  }

  // 合并结果
  const finalPassed = [...passed, ...aiPassed];
  const finalRejected = [...rejected, ...aiRejected];

  log.info({
    total: trends.length,
    finalPassed: finalPassed.length,
    finalRejected: finalRejected.length,
    usedAiFilter: aiConfig.enabled && needAiReview.length > 0,
  }, "Dual strategy filter completed");

  return {
    passed: finalPassed,
    rejected: finalRejected,
    rejectionReasons,
    usedAiFilter: aiConfig.enabled && needAiReview.length > 0,
    aiFilterError: aiError,
  };
}

// ========== 辅助函数 ==========

/**
 * 数组分批
 */
function batchArray<T>(arr: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < arr.length; i += batchSize) {
    batches.push(arr.slice(i, i + batchSize));
  }
  return batches;
}