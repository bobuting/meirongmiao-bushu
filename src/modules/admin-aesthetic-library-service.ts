// src/modules/admin-aesthetic-library-service.ts
/**
 * 审美特征库后台管理服务
 * 提供统计数据、特征 CRUD、热度排行等业务逻辑
 */

import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import { getLogger } from "../core/logger/index.js";
import { AppError } from "../core/errors.js";
import {
  type AgeGroupRange,
  AGE_GROUP_RANGES,
  isChildAgeGroup,
  getAgeGroupByRange,
} from "../constants/age-groups.js";

const log = getLogger("AdminAestheticLibraryService");

/**
 * 年龄范围类型（使用统一年龄段）
 */
export type AgeRange = AgeGroupRange;

/**
 * 统计数据结果
 */
export interface StatisticsResult {
  totalCount: number;
  childCount: number;
  adultCount: number;
  categoryDistribution: Record<string, number>;
  recentUpdates: number;
}

/**
 * 特征列表项
 */
export interface FeatureListItem {
  id: string;
  featureCategory: string;
  featureCategoryCn?: string;  // 特征分类中文名
  featureName: string;
  featureNameCn?: string;  // 特征名称中文名
  featureDescription: string;
  featureDescriptionCn?: string;  // 特征描述中文
  ethnicityApplicable: string[];
  ageRange: string;
  popularityScore: number;
  source: string;
  sourceImageUrl?: string;  // 原始图片 URL
  ossImageUrl?: string;     // OSS 图片 URL
  createdAt: number;
  updatedAt: number;
}

/**
 * 特征列表结果（分页）
 */
export interface FeatureListResult {
  items: FeatureListItem[];
  total: number;
  page: number;
  limit: number;
}

/**
 * 添加特征输入
 */
export interface AddFeatureInput {
  featureCategory: string;
  featureName: string;
  featureDescription: string;
  ethnicityApplicable: string[];
  ageRange: AgeRange;
}

/**
 * 编辑特征输入
 */
export interface EditFeatureInput {
  featureName?: string;
  featureDescription?: string;
  ethnicityApplicable?: string[];
  popularityScore?: number;
}

/**
 * 热度排行项
 */
export interface RankingItem {
  id: string;
  featureName: string;
  featureNameCn?: string;  // 特征名称中文名
  popularityScore: number;
  trendPeriod: string;
}

/**
 * 审美特征库后台管理服务
 */
export class AdminAestheticLibraryService {
  constructor(private repos: PgRepositoryCollection) {}

  /**
   * 获取统计数据
   * - 总数、儿童/成人分类统计（使用统一年龄段）
   * - 特征分类分布
   * - 近 7 天更新数
   */
  async getStatistics(): Promise<StatisticsResult> {
    const stats = await this.repos.aestheticLibrary.getStatistics();

    log.info({
      total: stats.totalCount,
      child: stats.childCount,
      adult: stats.adultCount,
    }, "统计数据查询完成");

    return stats;
  }

  /**
   * 获取特征列表（分页）
   * 支持按年龄范围、特征分类筛选
   */
  async listFeatures(params: {
    ageRange?: AgeRange;
    featureCategory?: string;
    page: number;
    limit: number;
  }): Promise<FeatureListResult> {
    const { items, total } = await this.repos.aestheticLibrary.findPaginated(params);

    log.info({
      page: params.page,
      limit: params.limit,
      total,
      returned: items.length,
    }, "特征列表查询完成");

    return {
      items: items.map((row) => ({
        id: row.id as string,
        featureCategory: row.feature_category as string,
        featureCategoryCn: (row.feature_category_cn as string) || undefined,
        featureName: row.feature_name as string,
        featureNameCn: (row.feature_name_cn as string) || undefined,
        featureDescription: row.feature_description as string,
        featureDescriptionCn: (row.feature_description_cn as string) || undefined,
        ethnicityApplicable: row.ethnicity_applicable as string[],
        ageRange: row.age_range as string,
        popularityScore: parseFloat(String(row.popularity_score)),
        source: row.source as string,
        sourceImageUrl: (row.source_image_url as string) || undefined,
        ossImageUrl: (row.oss_image_url as string) || undefined,
        createdAt: row.created_at as number,
        updatedAt: row.updated_at as number,
      })),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  /**
   * 添加新特征
   * 手动添加的特征标记为 'manual' 来源
   */
  async addFeature(data: AddFeatureInput): Promise<{ id: string }> {
    const now = Date.now();
    const id = crypto.randomUUID();

    await this.repos.aestheticLibrary.createFeature({
      id,
      featureCategory: data.featureCategory,
      featureName: data.featureName,
      featureDescription: data.featureDescription,
      ethnicityApplicable: data.ethnicityApplicable,
      ageRange: data.ageRange,
      trendPeriod: this.getCurrentQuarter(),
      source: "manual",
      sourceMetadata: {},
      now,
    });

    log.info({
      id,
      featureCategory: data.featureCategory,
      featureName: data.featureName,
      ageRange: data.ageRange,
    }, "新特征添加完成");

    return { id };
  }

  /**
   * 编辑特征
   * 支持修改名称、描述、适用种族、流行度评分
   */
  async editFeature(id: string, data: EditFeatureInput): Promise<{ success: boolean }> {
    const now = Date.now();
    const success = await this.repos.aestheticLibrary.updateFeature(id, data, now);

    // 无更新内容时抛出错误（与原逻辑保持一致）
    if (!success && Object.keys(data).length === 0) {
      throw new AppError(400, "NO_UPDATE_FIELDS", "编辑请求无有效更新字段");
    }

    log.info({
      id,
      updates: Object.keys(data).length,
      success,
    }, "特征编辑完成");

    return { success };
  }

  /**
   * 删除特征（软删除）
   * 将 is_active 设置为 false
   */
  async deleteFeature(id: string): Promise<{ success: boolean }> {
    const success = await this.repos.aestheticLibrary.softDelete(id, Date.now());

    log.info({
      id,
      success,
    }, "特征软删除完成");

    return { success };
  }

  /**
   * 获取热度排行
   * 按流行度评分降序，支持按年龄范围筛选
   */
  async getPopularityRanking(params: {
    ageRange?: AgeRange;
    limit: number;
  }): Promise<RankingItem[]> {
    const rows = await this.repos.aestheticLibrary.findPopularityRanking(params);

    log.info({
      ageRange: params.ageRange,
      limit: params.limit,
      returned: rows.length,
    }, "热度排行查询完成");

    return rows.map((row) => ({
      id: row.id as string,
      featureName: row.feature_name as string,
      featureNameCn: (row.feature_name_cn as string) || undefined,
      popularityScore: parseFloat(String(row.popularity_score)),
      trendPeriod: row.trend_period as string,
    }));
  }

  /**
   * 获取当前季度（如 2026-q1）
   */
  private getCurrentQuarter(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12
    const quarter = Math.ceil(month / 3); // 1-4
    return `${year}-q${quarter}`;
  }
}