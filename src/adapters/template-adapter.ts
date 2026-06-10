// src/adapters/template-adapter.ts

import type {
  IDataSourceAdapter,
  RecommendContentItem,
  CategoryFilter,
  SourceType,
} from "../contracts/recommendation-adapter-contract.js";
import { SOURCE_LABELS } from "../contracts/recommendation-adapter-contract.js";
import type { SquarePublishCategory } from "../contracts/square-publish-category.js";
import type { PgSquareTemplateRepository } from "../repositories/pg/square-template-pg-repository.js";

/**
 * 模板数据源适配器
 * 从 nrm_square_templates 表查询启用的模板数据
 */
export class TemplateAdapter implements IDataSourceAdapter {
  readonly sourceType: SourceType = "template";
  private repo: PgSquareTemplateRepository;

  constructor(repo: PgSquareTemplateRepository) {
    this.repo = repo;
  }

  /**
   * 判断是否支持指定的分类筛选
   * 模板适配器支持：全部、精选、以及四个服装分类
   */
  supportsCategoryFilter(filter: CategoryFilter): boolean {
    return ["全部", "精选", "男装", "女装", "男童装", "女童装"].includes(filter);
  }

  /**
   * 获取模板数据
   * @param categoryFilter 分类筛选条件
   * @param page 页码（暂未使用，模板按排序字段直接取前 pageSize 条）
   * @param pageSize 每页数量
   */
  async fetchItems(params: {
    categoryFilter: CategoryFilter;
    page: number;
    pageSize: number;
  }): Promise<{ items: RecommendContentItem[]; total: number }> {
    const { categoryFilter, pageSize } = params;

    const category = (categoryFilter !== "全部" && categoryFilter !== "精选") ? categoryFilter : undefined;
    const rows = await this.repo.findEnabledByCategory(category, pageSize);

    return {
      items: rows.map((row) => this.mapRowToItem(row)),
      total: rows.length,
    };
  }

  /**
   * 将数据库行映射为 RecommendContentItem
   */
  private mapRowToItem(row: Record<string, unknown>): RecommendContentItem {
    return {
      id: row.id as string,
      title: row.title as string,
      coverUrl: row.cover_url as string,
      videoUrl: row.video_url as string | null,
      category: row.category as string,
      sourceType: "template",
      sourceLabel: SOURCE_LABELS.template,
      author: row.author as string | null,
      authorId: null,
      views: row.views as number,
      likes: row.likes as number,
      hotValue: null,
      createdAt: row.created_at as number,
      publishedAt: null,
      scriptId: null,
    };
  }
}