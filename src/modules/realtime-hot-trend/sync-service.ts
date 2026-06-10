/**
 * 实时热榜同步服务
 * 主同步流程的实现，使用依赖注入模式
 * 只获取数据并排名，不进行评分或推荐
 *
 * 迁移源: app.ts syncHotTrendAssets 函数中的 realtime 分支逻辑
 */

import type {
  HotTrendType,
  SquareTrendTopic,
} from "../../contracts/hot-trend-base.js";
import type {
  RealtimeHotTrendSyncDeps,
  RealtimeHotTrendSyncInput,
  RealtimeHotTrendSyncResult,
  RealtimeHotTrendSyncEntry,
} from "../../contracts/realtime-hot-trend-sync-contract.js";

import { AppError } from "../../core/errors.js";
import { rankRealtimeTopics } from "./pipeline.js";
import {
  REALTIME_HOT_TREND_DATE_WINDOW,
  REALTIME_HOT_TREND_DEFAULT_FETCH_LIMIT,
  REALTIME_HOT_TREND_SYNC_INTERVAL_MS,
  REALTIME_HOT_TREND_SECTION,
} from "./constants.js";

// ============================================================================
// 服务创建
// ============================================================================

/**
 * 创建实时热榜同步服务
 */
export function createRealtimeHotTrendSyncService(deps: RealtimeHotTrendSyncDeps) {
  // ========================================================================
  // 阶段1: 数据获取
  // ========================================================================

  /**
   * 获取实时热榜话题
   */
  async function fetchRealtimeHotTrendTopics(
    tokenOverride: string | null
  ): Promise<{ topics: SquareTrendTopic[]; source: string; updatedAt: string | null }> {
    try {
      const result = await deps.fetchDouyinHotHubTrends(
        "realtime",
        REALTIME_HOT_TREND_DEFAULT_FETCH_LIMIT,
        deps.config.douyinHotHubRealtimeUrl,
        {
          DOUYIN_HOT_HUB_README_URL: process.env.DOUYIN_HOT_HUB_README_URL,
          DOUYIN_HOT_HUB_TIMEOUT_MS: process.env.DOUYIN_HOT_HUB_TIMEOUT_MS,
        },
        {
          makeFetchFailedError: (message) => new AppError(502, "HOT_HUB_FETCH_FAILED", message),
          makeParseFailedError: (message) => new AppError(502, "HOT_HUB_PARSE_FAILED", message),
        }
      );
      return result;
    } catch (error) {
      deps.log.warn({ err: error }, "douyin-hot-hub failed, fallback to tikhub realtime");
      try {
        const tikhubAdapter = deps.buildTikHubRealtimeAdapter(tokenOverride);
        const result = await tikhubAdapter.fetchVideoHotTrends(
          REALTIME_HOT_TREND_DEFAULT_FETCH_LIMIT,
          REALTIME_HOT_TREND_DATE_WINDOW
        );
        return result;
      } catch (fallbackError) {
        const primaryMessage = error instanceof Error ? error.message : String(error);
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new AppError(
          502,
          "REALTIME_TREND_SOURCE_FAILED",
          `realtime trend source failed: douyin-hot-hub=${primaryMessage}; tikhub=${fallbackMessage}`
        );
      }
    }
  }

  // ========================================================================
  // 主同步函数
  // ========================================================================

  /**
   * 执行实时热榜同步
   */
  async function sync(input: RealtimeHotTrendSyncInput): Promise<RealtimeHotTrendSyncResult> {
    const now = deps.now();
    const type: HotTrendType = "realtime";

    // 检查缓存
    const cached = input.realtimeHotTrendCache.get(type);
    if (!input.force && cached && now < cached.nextSyncAt) {
      return {
        entry: cached,
        stats: {
          topicCount: cached.topics.length,
          generatedCount: 0,
          llmAnalyzed: 0,
          llmFailed: 0,
          created: 0,
          updated: 0,
          prunedSmartStoryboardCount: 0,
          analysisSource: cached.analysisSource,
        },
      };
    }

    // 检查进行中的任务
    const currentJob = input.realtimeHotTrendInFlight.get(type);
    if (currentJob) {
      return currentJob.then((entry) => ({
        entry,
        stats: {
          topicCount: entry.topics.length,
          generatedCount: 0,
          llmAnalyzed: 0,
          llmFailed: 0,
          created: 0,
          updated: 0,
          prunedSmartStoryboardCount: 0,
          analysisSource: entry.analysisSource,
        },
      }));
    }

    // 执行同步流程：数据获取 → 排名 → 返回
    const jobPromise = (async (): Promise<RealtimeHotTrendSyncResult> => {
      // 阶段1: 数据获取
      const fetched = await fetchRealtimeHotTrendTopics(input.tokenOverride);
      const effectiveTopics = fetched.topics;

      // 记录趋势条目
      for (const topic of effectiveTopics) {
        deps.upsertTrendEntry(type, fetched.source, REALTIME_HOT_TREND_DATE_WINDOW, topic, now);
      }

      // 阶段2: 排名
      rankRealtimeTopics(effectiveTopics);

      // 构建结果条目
      const entry: RealtimeHotTrendSyncEntry = {
        type,
        source: fetched.source,
        section: REALTIME_HOT_TREND_SECTION,
        updatedAt: fetched.updatedAt,
        syncedAt: now,
        nextSyncAt: now + REALTIME_HOT_TREND_SYNC_INTERVAL_MS,
        llmUsed: false,
        analysisSource: "none",
        topics: effectiveTopics,
      };

      return {
        entry,
        stats: {
          topicCount: effectiveTopics.length,
          generatedCount: 0,
          llmAnalyzed: 0,
          llmFailed: 0,
          created: 0,
          updated: 0,
          prunedSmartStoryboardCount: 0,
          analysisSource: "none",
        },
      };
    })();

    input.realtimeHotTrendInFlight.set(type, jobPromise.then((result) => result.entry));

    try {
      const result = await jobPromise;
      input.realtimeHotTrendCache.set(type, result.entry);
      return result;
    } finally {
      input.realtimeHotTrendInFlight.delete(type);
    }
  }

  return {
    sync,
    fetchRealtimeHotTrendTopics,
  };
}

// ============================================================================
// 导出类型
// ============================================================================

export type RealtimeHotTrendSyncService = ReturnType<typeof createRealtimeHotTrendSyncService>;