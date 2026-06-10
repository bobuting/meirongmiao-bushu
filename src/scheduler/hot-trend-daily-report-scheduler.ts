/**
 * 每日热点分析报告调度器
 * 每天凌晨指定时间执行，预计算热点分析报告并持久化到数据库
 */

import type { Pool } from "pg";
import type { AppConfig } from "../contracts/types.js";
import type { AppContext } from "../core/app-context.js";
import type { ProviderRouteKey } from "../contracts/provider-route-policy-contract.js";
import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import { TikHubClient, type MultiPlatformHotTrend } from "../services/crawler/tikhub-client.js";
import { rankAndSelectTopTrends, parsePlatformWeightsFromString, type RankedHotTrend } from "../modules/hot-trend/shared/ranking.js";
import { dualStrategyFilter, type FilterResult } from "../modules/hot-trend/shared/semantic-filter.js";
import { getLogger } from "../core/logger/index.js";
import { skillLoader } from "../services/skills/index.js";
import { SchedulerDailyGuard, SCHEDULER_NAMES } from "../services/scheduler-daily-guard.js";

const log = getLogger("hot-trend-daily-report-scheduler");

// ========== 类型定义 ==========

/**
 * 每日热点报告结果
 */
export interface DailyReportResult {
  success: boolean;
  reportDate: string;  // YYYY-MM-DD
  platformSources: string[];
  hotspotCount: number;
  originalHotspots: RankedHotTrend[];
  platformDistribution: Record<string, number>;
  rawReportText: string;
  coreTrends: string[];
  outfitAngles: string[];
  emotionAtmosphere: string[];
  avoidTopics: string[];
  creativeSuggestions: string[];
  error?: string;
}

/**
 * 五段分析结果解析
 */
export interface ParsedFiveSectionReport {
  coreTrends: string[];
  outfitAngles: string[];
  emotionAtmosphere: string[];
  avoidTopics: string[];
  creativeSuggestions: string[];
}

// ========== 调度器类 ==========

/**
 * 每日热点分析报告调度器
 * 单例模式，每天凌晨指定时间执行
 */
export class HotTrendDailyReportScheduler {
  /** 定时器 ID */
  private intervalId: NodeJS.Timeout | null = null;

  /** 单例实例 */
  private static instance: HotTrendDailyReportScheduler | null = null;

  constructor(
    private readonly repos: PgRepositoryCollection,
    private readonly pool: Pool,
    private readonly appConfig: AppConfig,
    private readonly tikhubClient: TikHubClient,
    private readonly requestLlmPlainText: (system: string, user: string, temperature: number) => Promise<string>,
    private readonly ctx: AppContext,
    private readonly routeKey: ProviderRouteKey,
  ) {}

  /** 启动定时任务 */
  start(): void {
    if (!this.appConfig.hotTrendDailyReportEnabled) {
      log.info("每日热点报告调度器已禁用，跳过启动");
      return;
    }

    if (this.intervalId) {
      log.warn("定时任务已启动，跳过重复启动");
      return;
    }

    const scheduleHour = this.appConfig.hotTrendDailyReportHour;
    const now = Date.now();
    const nextRunTime = this.calculateNextRunTime(now, scheduleHour);
    const delayMs = nextRunTime - now;

    log.info({
      scheduleHour,
      nextRunTime: new Date(nextRunTime).toISOString(),
      delayMinutes: Math.round(delayMs / 1000 / 60)
    }, "启动每日热点报告调度器");

    // 设置首次执行定时器
    this.intervalId = setTimeout(() => {
      this.executeDailyReport();
      // 首次执行后，设置每 24 小时执行一次的定时器
      this.setupDailyInterval();
    }, delayMs);
  }

  /** 停止定时任务 */
  stop(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      log.info("定时任务已停止");
    }
  }

  /** 执行每日报告生成 */
  private async executeDailyReport(): Promise<void> {
    // 多进程防护
    const guard = new SchedulerDailyGuard(this.pool);
    const lockId = await guard.tryAcquire(SCHEDULER_NAMES.HOT_TREND_DAILY);
    if (!lockId) return;

    const reportDate = new Date().toISOString().split("T")[0];  // YYYY-MM-DD
    log.info({ reportDate }, "开始执行每日热点报告生成");

    try {
      // 1. 获取多平台热点数据
      const rawTrends = await this.fetchMultiPlatformTrends();
      if (rawTrends.length === 0) {
        log.warn("获取热点数据为空，跳过报告生成");
        return;
      }

      // 2. 多因子加权排序
      const platformWeights = parsePlatformWeightsFromString("");
      const rankedTrends = rankAndSelectTopTrends(rawTrends, { platformWeights, timeDecayHours: 24, qualityScoreRange: 20 }, 50);

      // 3. 双策略过滤
      const filterResult = await dualStrategyFilter(rankedTrends, {
        ctx: this.ctx,
        routeKey: this.routeKey,
        userId: "system", // 调度器使用 system 用户
      });

      // 4. LLM 五段分析
      const fiveSectionReport = await this.generateFiveSectionAnalysis(filterResult.passed);

      // 5. 计算平台分布
      const platformDistribution = this.calculatePlatformDistribution(filterResult.passed);

      // 6. 持久化到数据库
      await this.persistReport({
        success: true,
        reportDate,
        platformSources: Array.from(new Set(filterResult.passed.map(t => t.platform))),
        hotspotCount: filterResult.passed.length,
        originalHotspots: filterResult.passed,
        platformDistribution,
        rawReportText: fiveSectionReport.rawText,
        coreTrends: fiveSectionReport.coreTrends,
        outfitAngles: fiveSectionReport.outfitAngles,
        emotionAtmosphere: fiveSectionReport.emotionAtmosphere,
        avoidTopics: fiveSectionReport.avoidTopics,
        creativeSuggestions: fiveSectionReport.creativeSuggestions
      });

      log.info({
        reportDate,
        hotspotCount: filterResult.passed.length,
        platformSources: Array.from(new Set(filterResult.passed.map(t => t.platform)))
      }, "每日热点报告生成完成");

    } catch (error) {
      log.error({ err: error, reportDate }, "每日热点报告生成失败");
      // 记录失败报告
      await this.persistReport({
        success: false,
        reportDate,
        platformSources: [],
        hotspotCount: 0,
        originalHotspots: [],
        platformDistribution: {},
        rawReportText: "",
        coreTrends: [],
        outfitAngles: [],
        emotionAtmosphere: [],
        avoidTopics: [],
        creativeSuggestions: [],
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      await guard.release(lockId);
    }
  }

  /** 获取多平台热点数据 */
  private async fetchMultiPlatformTrends(): Promise<MultiPlatformHotTrend[]> {
    const platforms = ["douyin", "xiaohongshu", "kuaishou", "weibo", "bilibili", "zhihu"];
    const limitPerPlatform = 30;

    log.info({ platforms, limitPerPlatform }, "开始获取多平台热点数据");

    const trends = await this.tikhubClient.fetchAllPlatformHotTrends(platforms, limitPerPlatform);

    log.info({ total: trends.length }, "多平台热点数据获取完成");
    return trends;
  }

  /** 生成五段分析 */
  private async generateFiveSectionAnalysis(trends: RankedHotTrend[]): Promise<ParsedFiveSectionReport & { rawText: string }> {
    if (trends.length === 0) {
      return {
        rawText: "",
        coreTrends: [],
        outfitAngles: [],
        emotionAtmosphere: [],
        avoidTopics: [],
        creativeSuggestions: []
      };
    }

    log.info({ trendCount: trends.length }, "开始生成五段分析");

    // 从 Skills 系统获取提示词
    const { system, user } = await skillLoader.render("video_step3_hotspot_daily_analysis", {
      variables: {
        hotspotCount: trends.length,
        hotspotDetails: trends.map(t => `【热点 ${t.rank}】${t.title}（${t.platform}，热度${t.heatValue}）`).join("\n")
      }
    });

    const responseText = await this.requestLlmPlainText(system, user, 0.3);

    // 解析五段结构
    const parsed = this.parseFiveSectionResponse(responseText);

    log.info({
      coreTrendsCount: parsed.coreTrends.length,
      outfitAnglesCount: parsed.outfitAngles.length
    }, "五段分析完成");

    return {
      rawText: responseText,
      ...parsed
    };
  }

  /** 解析五段分析响应 */
  private parseFiveSectionResponse(responseText: string): ParsedFiveSectionReport {
    // 简单的段落解析（基于关键词匹配）
    const sections = {
      coreTrends: this.extractSection(responseText, "核心趋势", "穿搭切入点"),
      outfitAngles: this.extractSection(responseText, "穿搭切入点", "情绪氛围"),
      emotionAtmosphere: this.extractSection(responseText, "情绪氛围", "规避话题"),
      avoidTopics: this.extractSection(responseText, "规避话题", "创意建议"),
      creativeSuggestions: this.extractSection(responseText, "创意建议", null)
    };

    return sections;
  }

  /** 提取指定段落 */
  private extractSection(text: string, startMarker: string, endMarker: string | null): string[] {
    const startIndex = text.indexOf(startMarker);
    if (startIndex === -1) return [];

    const endIndex = endMarker ? text.indexOf(endMarker) : text.length;
    const sectionText = text.substring(startIndex + startMarker.length, endIndex);

    // 提取列表项（以 - 或数字开头的行）
    const items = sectionText.split("\n")
      .filter(line => line.trim().length > 0)
      .filter(line => /^[-\d]/.test(line.trim()))
      .map(line => line.replace(/^[-\d.]+\s*/, "").trim());

    return items;
  }

  /** 计算平台分布 */
  private calculatePlatformDistribution(trends: RankedHotTrend[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    for (const trend of trends) {
      distribution[trend.platform] = (distribution[trend.platform] || 0) + 1;
    }
    return distribution;
  }

  /** 持久化报告到数据库 */
  private async persistReport(result: DailyReportResult): Promise<void> {
    try {
      await this.repos.hotTrendDailyReports.upsertReport({
        reportDate: result.reportDate,
        platformSources: result.platformSources,
        hotspotCount: result.hotspotCount,
        originalHotspots: result.originalHotspots,
        platformDistribution: result.platformDistribution,
        rawReportText: result.rawReportText,
        coreTrends: result.coreTrends,
        outfitAngles: result.outfitAngles,
        emotionAtmosphere: result.emotionAtmosphere,
        avoidTopics: result.avoidTopics,
        creativeSuggestions: result.creativeSuggestions,
      });

      log.info({ reportDate: result.reportDate }, "报告持久化完成");
    } catch (error) {
      log.error({ err: error, reportDate: result.reportDate }, "报告持久化失败");
    }
  }

  /** 设置每日执行定时器 */
  private setupDailyInterval(): void {
    this.intervalId = setInterval(() => {
      this.executeDailyReport();
    }, 24 * 60 * 60 * 1000);
  }

  /** 计算下次执行时间 */
  private calculateNextRunTime(now: number, scheduleHour: number): number {
    const date = new Date(now);
    const todayTarget = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      scheduleHour,
      0,
      0,
      0
    ).getTime();

    // 如果已经过了今天的目标时间，则设置为明天
    if (now >= todayTarget) {
      return todayTarget + 24 * 60 * 60 * 1000;
    }
    return todayTarget;
  }

  /** 获取单例实例 */
  static getInstance(
    repos: PgRepositoryCollection,
    pool: Pool,
    appConfig: AppConfig,
    tikhubClient: TikHubClient,
    requestLlmPlainText: (system: string, user: string, temperature: number) => Promise<string>,
    ctx: AppContext,
    routeKey: ProviderRouteKey,
  ): HotTrendDailyReportScheduler {
    if (!HotTrendDailyReportScheduler.instance) {
      HotTrendDailyReportScheduler.instance = new HotTrendDailyReportScheduler(repos, pool, appConfig, tikhubClient, requestLlmPlainText, ctx, routeKey);
    }
    return HotTrendDailyReportScheduler.instance;
  }

  /** 重置单例 */
  static resetInstance(): void {
    if (HotTrendDailyReportScheduler.instance) {
      HotTrendDailyReportScheduler.instance.stop();
      HotTrendDailyReportScheduler.instance = null;
    }
  }

  /** 手动触发报告生成（用于测试） */
  async triggerManualReport(): Promise<DailyReportResult> {
    await this.executeDailyReport();
    // 从数据库读取最新报告
    return await this.repos.hotTrendDailyReports.findLatestRaw() as unknown as DailyReportResult;
  }
}