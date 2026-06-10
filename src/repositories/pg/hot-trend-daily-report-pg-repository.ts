/**
 * 热榜每日报告 PG 仓库
 * 处理 nrm_hot_trend_daily_report 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 每日报告记录 */
export interface HotTrendDailyReportRecord {
  id: string;
  reportDate: string;
  platformSources: unknown;
  hotspotCount: number;
  platformDistribution: unknown;
  coreTrends: unknown;
  outfitAngles: unknown;
  emotionAtmosphere: unknown;
  avoidTopics: unknown;
  creativeSuggestions: unknown;
  createdAt: number;
  updatedAt: number;
}

export class PgHotTrendDailyReportRepository extends PgBaseRepository<HotTrendDailyReportRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("hot_trend_daily_report"), client);
  }

  protected mapRow(row: Record<string, unknown>): HotTrendDailyReportRecord {
    return {
      id: row.id as string,
      reportDate: String(row.report_date ?? ""),
      platformSources: row.platform_sources,
      hotspotCount: Number(row.hotspot_count ?? 0),
      platformDistribution: row.platform_distribution,
      coreTrends: row.core_trends,
      outfitAngles: row.outfit_angles,
      emotionAtmosphere: row.emotion_atmosphere,
      avoidTopics: row.avoid_topics,
      creativeSuggestions: row.creative_suggestions,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  protected mapEntity(entity: HotTrendDailyReportRecord): Record<string, unknown> {
    return {
      id: entity.id,
      report_date: entity.reportDate,
      platform_sources: entity.platformSources,
      hotspot_count: entity.hotspotCount,
      platform_distribution: entity.platformDistribution,
      core_trends: entity.coreTrends,
      outfit_angles: entity.outfitAngles,
      emotion_atmosphere: entity.emotionAtmosphere,
      avoid_topics: entity.avoidTopics,
      creative_suggestions: entity.creativeSuggestions,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  /** 统计总数 */
  async count(): Promise<number> {
    const result = await this.queryClient.query("SELECT COUNT(*) FROM " + this.tableName);
    return parseInt(String(result.rows[0]?.count ?? 0), 10);
  }

  /** 分页查询（按报告日期倒序） */
  async findPaginated(limit: number, offset: number): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT id, report_date, platform_sources, hotspot_count, platform_distribution,
              core_trends, outfit_angles, emotion_atmosphere, avoid_topics, creative_suggestions,
              created_at, updated_at
       FROM ${this.tableName}
       ORDER BY report_date DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return result.rows;
  }

  /** 按报告日期查找 */
  async findByReportDate(reportDate: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE report_date = $1::date LIMIT 1`,
      [reportDate],
    );
    return result.rows[0] ?? null;
  }

  /** Upsert 每日报告（按 report_date 冲突时更新） */
  async upsertReport(params: {
    reportDate: string;
    platformSources: string[];
    hotspotCount: number;
    originalHotspots: unknown;
    platformDistribution: unknown;
    rawReportText: string;
    coreTrends: unknown;
    outfitAngles: unknown;
    emotionAtmosphere: unknown;
    avoidTopics: unknown;
    creativeSuggestions: unknown;
  }): Promise<void> {
    await this.queryClient.query(`
      INSERT INTO ${this.tableName} (
        report_date, platform_sources, hotspot_count, original_hotspots,
        platform_distribution, raw_report_text, core_trends, outfit_angles,
        emotion_atmosphere, avoid_topics, creative_suggestions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (report_date) DO UPDATE SET
        platform_sources = EXCLUDED.platform_sources,
        hotspot_count = EXCLUDED.hotspot_count,
        original_hotspots = EXCLUDED.original_hotspots,
        platform_distribution = EXCLUDED.platform_distribution,
        raw_report_text = EXCLUDED.raw_report_text,
        core_trends = EXCLUDED.core_trends,
        outfit_angles = EXCLUDED.outfit_angles,
        emotion_atmosphere = EXCLUDED.emotion_atmosphere,
        avoid_topics = EXCLUDED.avoid_topics,
        creative_suggestions = EXCLUDED.creative_suggestions,
        updated_at = NOW()
    `, [
      params.reportDate,
      params.platformSources,
      params.hotspotCount,
      JSON.stringify(params.originalHotspots),
      JSON.stringify(params.platformDistribution),
      params.rawReportText,
      JSON.stringify(params.coreTrends),
      JSON.stringify(params.outfitAngles),
      JSON.stringify(params.emotionAtmosphere),
      JSON.stringify(params.avoidTopics),
      JSON.stringify(params.creativeSuggestions),
    ]);
  }

  /** 获取最新一条报告原始行 */
  async findLatestRaw(): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} ORDER BY report_date DESC LIMIT 1`,
    );
    return result.rows[0] ?? null;
  }

  /** 获取最近指定天数内的预计算报告（用于热点分析器降级查询） */
  async findLatestWithinDays(days: number = 7): Promise<{
    report_date: string;
    raw_report_text: string;
    hotspot_count: number;
    core_trends: string[] | null;
    outfit_angles: string[] | null;
    emotion_atmosphere: string[] | null;
    avoid_topics: string[] | null;
    creative_suggestions: string[] | null;
  } | null> {
    const result = await this.queryClient.query(
      `SELECT
        report_date,
        raw_report_text,
        hotspot_count,
        core_trends,
        outfit_angles,
        emotion_atmosphere,
        avoid_topics,
        creative_suggestions
      FROM ${this.tableName}
      WHERE report_date >= CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY report_date DESC
      LIMIT 1`,
    );
    if (result.rows.length === 0) return null;
    return result.rows[0] as {
      report_date: string;
      raw_report_text: string;
      hotspot_count: number;
      core_trends: string[] | null;
      outfit_angles: string[] | null;
      emotion_atmosphere: string[] | null;
      avoid_topics: string[] | null;
      creative_suggestions: string[] | null;
    };
  }

  /** 获取最新一条日报（不限天数，用于主题构思等场景） */
  async findLatest(): Promise<{
    report_date: string;
    core_trends: string[] | null;
    emotion_atmosphere: string[] | null;
    creative_suggestions: string[] | null;
    raw_report_text: string | null;
  } | null> {
    const result = await this.queryClient.query(
      `SELECT
        report_date,
        core_trends,
        emotion_atmosphere,
        creative_suggestions,
        raw_report_text
      FROM ${this.tableName}
      ORDER BY report_date DESC
      LIMIT 1`,
    );
    if (result.rows.length === 0) return null;
    return result.rows[0] as {
      report_date: string;
      core_trends: string[] | null;
      emotion_atmosphere: string[] | null;
      creative_suggestions: string[] | null;
      raw_report_text: string | null;
    };
  }
}
