/**
 * 阶段1：热点分析评估报告 - Prompt构建
 * 提示词从数据库获取，代码只准备变量数据
 */

import type { AppContext } from "../../../core/app-context.js";
import type { TrendEntry } from "../../../contracts/types.js";
import type { HotspotAnalysisReport, Stage1Input } from "./types.js";
import { skillLoader } from "../../../services/skills/index.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { getLogger } from "../../../core/logger/index.js";

const logger = getLogger("llm-transport");

const PROMPT_CODE_HOTSPOT_ANALYSIS = "video_step3_hotspot_analysis";

/**
 * 构建热点分析的变量数据
 * 返回提示词模板所需的变量对象
 */
function buildHotspotAnalysisVariables(hotspots: TrendEntry[]): Record<string, unknown> {
  // 格式化热点列表 - 包含全部详细信息
  const hotspotDetails = hotspots.map((h, index) => {
    return `【热点 ${index + 1}】
- 标题：${h.title}
- 排名：${h.rank}
- 趋势：${h.trend === "up" ? "上升" : h.trend === "down" ? "下降" : "持平"}`;
  }).join("\n");

  const userPrompt = `热点数量：${hotspots.length}

${hotspotDetails}`;

  return {
    userPrompt,
  };
}

/**
 * 将LLM返回的文本包装成报告对象
 * 原始文本保存在 rawText 字段，供下一步直接使用
 */
export function parseHotspotAnalysisResponse(responseText: string, hotspotCount: number): HotspotAnalysisReport {
  // 返回包含原始文本的报告，其他字段使用默认值
  // 下一步直接使用 rawText 字段
  return {
    rawText: responseText.trim(),
    overview: {
      totalCount: hotspotCount,
      emotionTypes: [],
      qualityDistribution: {
        excellent: hotspotCount,
        good: 0,
        fair: 0,
        poor: 0,
        excluded: 0,
      },
    },
    emotionDistribution: {
      categories: [],
    },
    coreIssues: [],
    emotionTrend: {
      direction: "healing_needed",
      userDeepNeed: "详见 rawText",
    },
    hotspotEvaluations: [],
    suitableHotspotTypes: {
      lifestyle: [],
      emotional: [],
      seasonal: [],
      healing: [],
      workplace: [],
      festival: [],
    },
  };
}

/**
 * 热点分析阶段入口函数
 * 从数据库获取提示词模板，传入变量进行渲染
 */
export async function analyzeHotspots(
  input: Stage1Input,
  ctx: AppContext,
  routeKey: string,
  userId: string,
  deps: {
    requestLlmPlainText: (systemPrompt: string, userPrompt: string, temperature: number) => Promise<string>;
  },
): Promise<HotspotAnalysisReport> {
  const { hotspots } = input;

  if (!hotspots || hotspots.length === 0) {
    return createEmptyHotspotAnalysisReport();
  }

  // 构建变量数据
  const variables = buildHotspotAnalysisVariables(hotspots);

  // 从数据库获取提示词模板
  const { system, user } = await skillLoader.render(PROMPT_CODE_HOTSPOT_ANALYSIS, { variables });


  try {
    const responseText = await deps.requestLlmPlainText(
      system,
      user,
      0.3,
    );

    // 直接返回原始文本
    const report = parseHotspotAnalysisResponse(responseText, hotspots.length);

    return report;
  } catch (error) {
    logger.error(
      { err: error, routeKey },
      "Error during analysis"
    );
    return createFallbackHotspotAnalysisReport(hotspots);
  }
}

/**
 * 创建空的热点分析报告
 */
function createEmptyHotspotAnalysisReport(): HotspotAnalysisReport {
  return {
    rawText: "",
    overview: {
      totalCount: 0,
      emotionTypes: [],
      qualityDistribution: {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
        excluded: 0,
      },
    },
    emotionDistribution: {
      categories: [],
    },
    coreIssues: [],
    emotionTrend: {
      direction: "healing_needed",
      userDeepNeed: "暂无数据",
    },
    hotspotEvaluations: [],
    suitableHotspotTypes: {
      lifestyle: [],
      emotional: [],
      seasonal: [],
      healing: [],
      workplace: [],
      festival: [],
    },
  };
}

/**
 * 创建降级的热点分析报告（LLM调用失败时使用）
 */
function createFallbackHotspotAnalysisReport(hotspots: TrendEntry[]): HotspotAnalysisReport {
  return {
    rawText: "热点分析服务暂时不可用，请稍后重试",
    overview: {
      totalCount: hotspots.length,
      emotionTypes: ["待分析"],
      qualityDistribution: {
        excellent: 0,
        good: 0,
        fair: hotspots.length,
        poor: 0,
        excluded: 0,
      },
    },
    emotionDistribution: {
      categories: [],
    },
    coreIssues: [],
    emotionTrend: {
      direction: "healing_needed",
      userDeepNeed: "分析服务暂时不可用",
    },
    hotspotEvaluations: [],
    suitableHotspotTypes: {
      lifestyle: [],
      emotional: [],
      seasonal: [],
      healing: [],
      workplace: [],
      festival: [],
    },
  };
}