/**
 * 热点效果追踪模块
 * 记录 Step3 选取热点时的转化数据
 *
 * 已迁移至 Repository 模式，所有数据库操作通过 hotTrendEffectTracking 仓库执行
 */

import type { PgRepositoryCollection } from "../../../repositories/pg/index.js";
import type { HotTrendEffectTrackingRecord } from "../../../repositories/pg/hot-trend-effect-tracking-pg-repository.js";
import type { RankedHotTrend } from "./ranking.js";
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("hot-trend-effect-tracking");

// ========== 类型定义 ==========

/**
 * 效果追踪记录
 */
export interface EffectTrackingRecord {
  hotspotTitle: string;
  reportDate: string;  // YYYY-MM-DD
  platform: string;
  wasSelectedByStep3: boolean;
  generatedVideoCount?: number;
  userRatingAvg?: number;
  scriptQualityScore?: number;
  videoCompletionRate?: number;
}

// ========== 效果追踪函数 ==========

/**
 * 记录热点被 Step3 选取
 * @param repos - 仓库集合
 * @param hotspot - 被选取的热点
 * @param reportDate - 报告日期
 */
export async function recordHotspotSelectedByStep3(
  repos: Pick<PgRepositoryCollection, "hotTrendEffectTracking">,
  hotspot: RankedHotTrend,
  reportDate: string
): Promise<void> {
  try {
    await repos.hotTrendEffectTracking.upsertSelection({
      hotspotTitle: hotspot.title,
      reportDate,
      platform: hotspot.platform
    });

    log.info({
      hotspotTitle: hotspot.title,
      reportDate,
      platform: hotspot.platform
    }, "Hotspot selection recorded");
  } catch (error) {
    log.error({ err: error, hotspotTitle: hotspot.title }, "Failed to record hotspot selection");
    throw error;
  }
}

/**
 * 更新热点生成视频数量
 * @param repos - 仓库集合
 * @param hotspotTitle - 热点标题
 * @param reportDate - 报告日期
 * @param videoCount - 生成的视频数量
 */
export async function updateHotspotVideoCount(
  repos: Pick<PgRepositoryCollection, "hotTrendEffectTracking">,
  hotspotTitle: string,
  reportDate: string,
  videoCount: number
): Promise<void> {
  try {
    await repos.hotTrendEffectTracking.updateVideoCount(hotspotTitle, reportDate, videoCount);

    log.info({
      hotspotTitle,
      reportDate,
      videoCount
    }, "Hotspot video count updated");
  } catch (error) {
    log.error({ err: error, hotspotTitle }, "Failed to update video count");
    throw error;
  }
}

/**
 * 批量记录热点选取
 * @param repos - 仓库集合
 * @param hotspots - 被选取的热点列表
 * @param reportDate - 报告日期
 */
export async function batchRecordHotspotSelections(
  repos: Pick<PgRepositoryCollection, "hotTrendEffectTracking">,
  hotspots: RankedHotTrend[],
  reportDate: string
): Promise<void> {
  if (hotspots.length === 0) return;

  try {
    const inputs = hotspots.map(h => ({
      hotspotTitle: h.title,
      reportDate,
      platform: h.platform
    }));

    await repos.hotTrendEffectTracking.upsertSelectionBatch(inputs);

    log.info({
      hotspotCount: hotspots.length,
      reportDate
    }, "Batch hotspot selection recorded");
  } catch (error) {
    log.error({ err: error }, "Failed to batch record hotspot selections");
    throw error;
  }
}

/**
 * 查询平台转化效果统计
 * @param repos - 仓库集合
 * @param days - 统计天数
 * @returns 各平台的转化效果统计
 */
export async function queryPlatformEffectStats(
  repos: Pick<PgRepositoryCollection, "hotTrendEffectTracking">,
  days: number = 7
): Promise<{
  platform: string;
  totalSelected: number;
  avgVideoCount: number;
  avgRating: number;
}[]> {
  try {
    const stats = await repos.hotTrendEffectTracking.queryPlatformStats(days);
    return stats.map((s) => ({
      platform: s.platform,
      totalSelected: s.totalSelected,
      avgVideoCount: s.avgVideoCount ?? 0,
      avgRating: s.avgRating ?? 0,
    }));
  } catch (error) {
    log.error({ err: error, days }, "Failed to query platform effect stats");
    throw error;
  }
}

/**
 * 获取转化效果最好的热点（用于动态调整权重）
 * @param repos - 仓库集合
 * @param limit - 返回数量
 * @returns 效果最好的热点列表
 */
export async function getTopPerformingHotspots(
  repos: Pick<PgRepositoryCollection, "hotTrendEffectTracking">,
  limit: number = 20
): Promise<EffectTrackingRecord[]> {
  try {
    const records = await repos.hotTrendEffectTracking.findTopPerforming(limit);

    // 转换为 EffectTrackingRecord 格式
    return records.map((r: HotTrendEffectTrackingRecord) => ({
      hotspotTitle: r.hotspotTitle,
      reportDate: r.reportDate,
      platform: r.platform,
      wasSelectedByStep3: r.wasSelectedByStep3,
      generatedVideoCount: r.generatedVideoCount ?? undefined,
      userRatingAvg: r.userRatingAvg ?? undefined,
      scriptQualityScore: r.scriptQualityScore ?? undefined,
      videoCompletionRate: r.videoCompletionRate ?? undefined
    }));
  } catch (error) {
    log.error({ err: error, limit }, "Failed to get top performing hotspots");
    throw error;
  }
}