/**
 * 热点效果追踪 PG 仓库
 * 处理 nrm_hot_trend_effect_tracking 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import { getLogger } from "../../core/logger/index.js";

const log = getLogger("hot-trend-effect-tracking-repo");

/** 热点效果追踪记录 */
export interface HotTrendEffectTrackingRecord {
  id: number;
  hotspotTitle: string;
  reportDate: string;  // YYYY-MM-DD (date type in DB)
  platform: string;
  wasSelectedByStep3: boolean;
  generatedVideoCount: number | null;
  userRatingAvg: number | null;
  scriptQualityScore: number | null;
  videoCompletionRate: number | null;
  createdAt: Date | null;
}

/** 平台效果统计结果 */
export interface PlatformEffectStats {
  platform: string;
  totalSelected: number;
  avgVideoCount: number | null;
  avgRating: number | null;
}

/** 选取记录输入 */
export interface HotspotSelectionInput {
  hotspotTitle: string;
  reportDate: string;
  platform: string;
}

export class PgHotTrendEffectTrackingRepository extends PgBaseRepository<HotTrendEffectTrackingRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("hot_trend_effect_tracking"), client);
  }

  protected mapRow(row: Record<string, unknown>): HotTrendEffectTrackingRecord {
    return {
      id: row.id as number,
      hotspotTitle: row.hotspot_title as string,
      reportDate: row.report_date as string,
      platform: row.platform as string,
      wasSelectedByStep3: row.was_selected_by_step3 as boolean,
      generatedVideoCount: row.generated_video_count as number | null,
      userRatingAvg: row.user_rating_avg as number | null,
      scriptQualityScore: row.script_quality_score as number | null,
      videoCompletionRate: row.video_completion_rate as number | null,
      createdAt: row.created_at as Date | null,
    };
  }

  protected mapEntity(entity: HotTrendEffectTrackingRecord): Record<string, unknown> {
    return {
      id: entity.id,
      hotspot_title: entity.hotspotTitle,
      report_date: entity.reportDate,
      platform: entity.platform,
      was_selected_by_step3: entity.wasSelectedByStep3,
      generated_video_count: entity.generatedVideoCount,
      user_rating_avg: entity.userRatingAvg,
      script_quality_score: entity.scriptQualityScore,
      video_completion_rate: entity.videoCompletionRate,
      created_at: entity.createdAt,
    };
  }

  /**
   * Upsert 热点选取记录（单条）
   * ON CONFLICT (hotspot_title, report_date, platform)
   */
  async upsertSelection(params: HotspotSelectionInput): Promise<void> {
    try {
      await this.queryClient.query(
        `INSERT INTO ${this.tableName} (
          hotspot_title, report_date, platform, was_selected_by_step3
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (hotspot_title, report_date, platform) DO UPDATE SET
          was_selected_by_step3 = TRUE,
          created_at = NOW()`,
        [params.hotspotTitle, params.reportDate, params.platform, true]
      );

      log.info({
        hotspotTitle: params.hotspotTitle,
        reportDate: params.reportDate,
        platform: params.platform
      }, "Hotspot selection upserted");
    } catch (error) {
      log.error({ err: error, hotspotTitle: params.hotspotTitle }, "Failed to upsert hotspot selection");
      throw error;
    }
  }

  /**
   * Upsert 热点选取记录（批量）
   * ON CONFLICT (hotspot_title, report_date, platform)
   */
  async upsertSelectionBatch(inputs: HotspotSelectionInput[]): Promise<void> {
    if (inputs.length === 0) return;

    try {
      // 构建批量插入 SQL（使用 VALUES + ON CONFLICT）
      const values = inputs.map((h, idx) => {
        const escapedTitle = h.hotspotTitle.replace(/'/g, "''");
        return `('${escapedTitle}', '${h.reportDate}', '${h.platform}', true)`;
      });

      await this.queryClient.query(
        `INSERT INTO ${this.tableName} (
          hotspot_title, report_date, platform, was_selected_by_step3
        ) VALUES ${values.join(", ")}
        ON CONFLICT (hotspot_title, report_date, platform) DO UPDATE SET
          was_selected_by_step3 = TRUE,
          created_at = NOW()`
      );

      log.info({
        hotspotCount: inputs.length,
        reportDate: inputs[0]?.reportDate
      }, "Batch hotspot selection upserted");
    } catch (error) {
      log.error({ err: error }, "Failed to batch upsert hotspot selections");
      throw error;
    }
  }

  /**
   * 更新热点生成视频数量
   */
  async updateVideoCount(
    hotspotTitle: string,
    reportDate: string,
    videoCount: number
  ): Promise<void> {
    try {
      await this.queryClient.query(
        `UPDATE ${this.tableName}
        SET generated_video_count = $3
        WHERE hotspot_title = $1 AND report_date = $2`,
        [hotspotTitle, reportDate, videoCount]
      );

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
   * 查询平台转化效果统计
   * @param days 统计天数
   */
  async queryPlatformStats(days: number = 7): Promise<PlatformEffectStats[]> {
    try {
      const result = await this.queryClient.query<PlatformEffectStats>(
        `SELECT
          platform,
          COUNT(*) as total_selected,
          AVG(generated_video_count) as avg_video_count,
          AVG(user_rating_avg) as avg_rating
        FROM ${this.tableName}
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY platform
        ORDER BY total_selected DESC`
      );

      return result.rows;
    } catch (error) {
      log.error({ err: error, days }, "Failed to query platform stats");
      throw error;
    }
  }

  /**
   * 获取转化效果最好的热点（用于动态调整权重）
   * @param limit 返回数量
   */
  async findTopPerforming(limit: number = 20): Promise<HotTrendEffectTrackingRecord[]> {
    try {
      const result = await this.queryClient.query(
        `SELECT *
        FROM ${this.tableName}
        WHERE was_selected_by_step3 = TRUE
          AND generated_video_count > 0
        ORDER BY generated_video_count DESC, user_rating_avg DESC NULLS LAST
        LIMIT $1`,
        [limit]
      );

      return result.rows.map(row => this.mapRow(row));
    } catch (error) {
      log.error({ err: error, limit }, "Failed to find top performing hotspots");
      throw error;
    }
  }
}