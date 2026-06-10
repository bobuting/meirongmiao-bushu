// src/adapters/user-work-adapter.ts

import type {
  IDataSourceAdapter,
  RecommendContentItem,
  CategoryFilter,
  SourceType,
} from "../contracts/recommendation-adapter-contract.js";
import { SOURCE_LABELS } from "../contracts/recommendation-adapter-contract.js";
import type { SquarePublishCategory } from "../contracts/square-publish-category.js";
import type { PgSquareUserWorkRepository } from "../repositories/pg/square-user-work-pg-repository.js";

/**
 * 用户作品数据源适配器
 * 从 nrm_square_user_works 表查询用户发布的作品数据
 *
 * 特点：
 * - 支持"全部"和四个服装分类
 * - 不支持"模板"和"热榜"分类（这些分类下返回空数组）
 * - 使用 published_at 字段排序（发布时间）
 */
export class UserWorkAdapter implements IDataSourceAdapter {
  readonly sourceType: SourceType = "user_work";
  private repo: PgSquareUserWorkRepository;

  constructor(repo: PgSquareUserWorkRepository) {
    this.repo = repo;
  }

  /**
   * 判断是否支持指定的分类筛选
   * 用户作品适配器支持：全部、男装、女装、男童装、女童装
   */
  supportsCategoryFilter(filter: CategoryFilter): boolean {
    return ["全部", "男装", "女装", "男童装", "女童装"].includes(filter);
  }

  /**
   * 获取用户作品数据
   * @param categoryFilter 分类筛选条件
   * @param page 页码（暂未使用）
   * @param pageSize 每页数量
   */
  async fetchItems(params: {
    categoryFilter: CategoryFilter;
    page: number;
    pageSize: number;
  }): Promise<{ items: RecommendContentItem[]; total: number }> {
    const { categoryFilter, pageSize } = params;

    // 不支持"精选"和"热榜"分类，返回空数组
    if (categoryFilter === "精选" || categoryFilter === "热榜") {
      return { items: [], total: 0 };
    }

    const category = categoryFilter !== "全部" ? categoryFilter as SquarePublishCategory : undefined;
    const works = await this.repo.findByCategory(category, pageSize);
    const items = works.map((work) => ({
      id: work.id,
      title: work.title,
      coverUrl: work.coverUrl,
      videoUrl: work.videoUrl,
      category: work.category,
      sourceType: "user_work" as const,
      sourceLabel: SOURCE_LABELS.user_work,
      author: null,
      authorId: work.userId,
      views: work.views,
      likes: work.likes,
      hotValue: null,
      createdAt: work.createdAt,
      publishedAt: work.publishedAt,
      scriptId: null,
    }));
    return { items, total: items.length };
  }
}