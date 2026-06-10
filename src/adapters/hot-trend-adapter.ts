// src/adapters/hot-trend-adapter.ts

import type {
  IDataSourceAdapter,
  RecommendContentItem,
  CategoryFilter,
  SourceType,
} from "../contracts/recommendation-adapter-contract.js";
import { SOURCE_LABELS } from "../contracts/recommendation-adapter-contract.js";
import { HOT_TREND_CONFIG } from "../contant-config/recommend-config.js";
import type { PgHotTrendAssetRepository } from "../repositories/pg/hot-trend-asset-pg-repository.js";

/**
 * 热榜数据源适配器
 * 从 nrm_hot_trend_assets 表查询热榜数据
 *
 * 特点：
 * - 只支持"全部"和"热榜"两个分类筛选
 * - 数据具有时效性，超过72小时的数据不返回
 */
export class HotTrendAdapter implements IDataSourceAdapter {
  readonly sourceType: SourceType = "hot_trend";
  private repo: PgHotTrendAssetRepository;

  constructor(repo: PgHotTrendAssetRepository) {
    this.repo = repo;
  }

  /**
   * 判断是否支持指定的分类筛选
   * 热榜适配器只支持"全部"和"热榜"
   */
  supportsCategoryFilter(filter: CategoryFilter): boolean {
    return filter === "全部" || filter === "热榜";
  }

  /**
   * 获取热榜数据
   * @param categoryFilter 分类筛选条件（热榜只响应"全部"和"热榜"）
   * @param page 页码（暂未使用）
   * @param pageSize 每页数量
   */
  async fetchItems(params: {
    categoryFilter: CategoryFilter;
    page: number;
    pageSize: number;
  }): Promise<{ items: RecommendContentItem[]; total: number }> {
    const { categoryFilter, pageSize } = params;

    // 其他分类筛选时返回空数组
    if (!this.supportsCategoryFilter(categoryFilter)) {
      return { items: [], total: 0 };
    }

    // 计算时效阈值：只返回72小时内的热榜数据
    const now = Date.now();
    const expiryThreshold = now - HOT_TREND_CONFIG.EXPIRY_MS;

    const rows = await this.repo.findVideoTrendsWithOss(expiryThreshold, pageSize);

    return {
      items: rows.map((row) => this.mapRowToItem(row)),
      total: rows.length,
    };
  }

  /**
   * 将数据库行映射为 RecommendContentItem
   * 热榜数据的特殊处理：
   * - title 使用 topic 字段
   * - coverUrl: 从 cover_url 字段获取（TikHub API 提取）
   * - category 使用 section（来源平台名称）
   * - hotValue 存储热度值
   */
  private mapRowToItem(row: Record<string, unknown>): RecommendContentItem {
    // 封面图 URL 从 TikHub API 提取存储
    const coverUrl = (row.cover_url as string | null) || "";

    return {
      id: row.id as string,
      title: row.topic as string,
      coverUrl,
      videoUrl: row.source_oss_url as string | null,
      // 热榜的 category 字段使用来源平台名称（如"TikHub 热榜"）
      category: (row.section as string) || (row.source as string) || "热榜",
      sourceType: "hot_trend",
      sourceLabel: SOURCE_LABELS.hot_trend,
      author: null, // 热榜无作者信息
      authorId: null,
      views: 0, // 热榜无浏览量
      likes: 0, // 热榜无点赞量
      hotValue: row.hot_value as string | null,
      createdAt: row.created_at as number,
      publishedAt: null,
      scriptId: row.script_id as string | null,
    };
  }
}