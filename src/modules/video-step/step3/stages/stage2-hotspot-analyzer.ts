/**
 * 阶段2：热点深度分析
 * 从数据库读取预计算的热点报告（近7天内有效）
 * 若近7天无报告则降级为实时 LLM 分析
 */

import type { AppContext } from "../../../../core/app-context.js";
import type { HotspotAnalysisReport } from "../types.js";
import type { TrendEntry } from "../../../../contracts/types.js";
import { analyzeHotspots } from "../hotspot-analysis-prompt.js";
import { getLogger } from "../../../../core/logger/index.js";
import { ProviderRouteKeys } from "../../../../contracts/provider-route-keys.js";

const log = getLogger("stage2-hotspot-analyzer");

// =====================================================
// 热点分析结果内存缓存（仅用于降级时的实时分析）
// =====================================================

/** 缓存有效期：2 小时（毫秒） */
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

interface CacheEntry {
  report: HotspotAnalysisReport;
  createdAt: number;
}

/** 模块级缓存 Map，key = 热点标题 hash */
const hotspotAnalysisCache = new Map<string, CacheEntry>();

/**
 * 阶段2：热点深度分析（优先从数据库读取预计算报告）
 * @param hotspots 热点数据（用于降级时的实时分析）
 * @param ctx 应用上下文
 * @param userId 用户ID
 * @param deps 依赖（数据库连接、LLM）
 * @returns 热点分析报告（原始文本在 rawText 字段）
 */
export async function stage2_analyzeHotspots(
  hotspots: TrendEntry[],
  ctx: AppContext,
  userId: string,
  deps: {
    requestLlmPlainText: (systemPrompt: string, userPrompt: string, temperature: number) => Promise<string>;
    dailyReportEnabled: boolean;  // 是否启用预计算报告
  },
): Promise<HotspotAnalysisReport> {
  log.info({ hotspotCount: hotspots.length }, "Starting hotspot analysis");

  // 热点为空时返回空报告
  if (!hotspots || hotspots.length === 0) {
    log.info("No hotspots to analyze, returning empty report");
    return createEmptyHotspotAnalysisReport(0);
  }

  // ===== 优先从数据库读取预计算报告 =====
  if (deps.dailyReportEnabled) {
    const cachedReport = await ctx.repos.hotTrendDailyReports.findLatestWithinDays(7);
    if (cachedReport) {
      log.info({ reportDate: cachedReport.report_date }, "Using pre-computed daily report from DB");
      return convertDailyReportToAnalysisReport(cachedReport);
    }
    log.warn("No pre-computed daily report found, falling back to realtime analysis");
  }

  // ===== 降级：实时 LLM 分析（带 2 小时缓存） =====
  const cacheKey = "global_hotspot_analysis";
  const cached = hotspotAnalysisCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    log.info({ cacheAgeMinutes: Math.round((Date.now() - cached.createdAt) / 60000) }, "Cache HIT (realtime fallback)");
    return cached.report;
  }
  if (cached) {
    hotspotAnalysisCache.delete(cacheKey);
    log.info("Cache EXPIRED (realtime fallback)");
  }

  const startTime = Date.now();

  try {
    // 调用实时分析
    const report = await analyzeHotspots(
      { hotspots },
      ctx,
      ProviderRouteKeys.STEP3_HOT_DEEP_ANALYSIS,
      userId,
      { requestLlmPlainText: deps.requestLlmPlainText },
    );

    const elapsed = Date.now() - startTime;
    log.info({ elapsedMs: elapsed }, "Realtime analysis complete");

    // 写入缓存
    hotspotAnalysisCache.set(cacheKey, { report, createdAt: Date.now() });
    log.info("Cache SET (realtime fallback)");

    return report;
  } catch (error) {
    log.error({ err: error }, "Hotspot analysis failed");
    throw error;
  }
}

/**
 * convertDailyReportToAnalysisReport 参数类型（与 repo 返回类型对齐）
 */
type DailyReportRow = {
  report_date: string;
  raw_report_text: string;
  hotspot_count: number;
  core_trends: string[] | null;
  outfit_angles: string[] | null;
  emotion_atmosphere: string[] | null;
  avoid_topics: string[] | null;
  creative_suggestions: string[] | null;
};

/**
 * 将数据库预计算报告转换为 HotspotAnalysisReport 格式
 * 数据库字段使用下划线格式，需要映射到驼峰格式
 */
function convertDailyReportToAnalysisReport(dbReport: DailyReportRow): HotspotAnalysisReport {
  // 防御性处理：字段可能为 null，默认为空数组
  const emotionAtmosphere = dbReport.emotion_atmosphere ?? [];
  const coreTrends = dbReport.core_trends ?? [];
  const outfitAngles = dbReport.outfit_angles ?? [];

  return {
    rawText: dbReport.raw_report_text,
    overview: {
      totalCount: dbReport.hotspot_count,
      emotionTypes: emotionAtmosphere,
      qualityDistribution: {
        excellent: dbReport.hotspot_count,
        good: 0,
        fair: 0,
        poor: 0,
        excluded: 0,
      },
    },
    emotionDistribution: {
      categories: emotionAtmosphere.map(e => ({
        type: e,
        count: 1,
        percentage: emotionAtmosphere.length > 0 ? 100 / emotionAtmosphere.length : 0,
        hotspotIds: []
      })),
    },
    coreIssues: coreTrends.map(t => ({
      issue: t,
      relatedHotspots: [],
      heatLevel: "medium" as const,
      deepNeed: ""
    })),
    emotionTrend: {
      direction: "healing_needed",
      userDeepNeed: emotionAtmosphere.join(", "),
    },
    hotspotEvaluations: [],
    suitableHotspotTypes: {
      lifestyle: outfitAngles,
      emotional: emotionAtmosphere,
      seasonal: [],
      healing: [],
      workplace: [],
      festival: [],
    },
  };
}

/**
 * 创建空的热点分析报告
 */
function createEmptyHotspotAnalysisReport(count: number): HotspotAnalysisReport {
  return {
    rawText: "",
    overview: {
      totalCount: count,
      emotionTypes: [],
      qualityDistribution: {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
        excluded: count,
      },
    },
    emotionDistribution: { categories: [] },
    coreIssues: [],
    emotionTrend: { direction: "healing_needed", userDeepNeed: "暂无热点数据" },
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