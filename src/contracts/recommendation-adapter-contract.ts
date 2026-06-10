// src/contracts/recommendation-adapter-contract.ts

import type { SquarePublishCategory } from "./square-publish-category.js";

/** 来源类型 */
export type SourceType = "template" | "hot_trend" | "user_work";

/** 分类筛选类型 */
export type CategoryFilter =
  | "全部"
  | "精选"
  | "热榜"
  | SquarePublishCategory;

/** 统一内容项结构 */
export interface RecommendContentItem {
  id: string;
  title: string;
  coverUrl: string;
  videoUrl: string | null;
  category: string;
  sourceType: SourceType;
  sourceLabel: string;
  author: string | null;
  authorId: string | null;
  views: number;
  likes: number;
  hotValue: string | null;
  createdAt: number;
  publishedAt: number | null;
  /** 已关联的脚本ID（热榜资产反推后生成） */
  scriptId: string | null;
}

/** 数据源适配器接口 */
export interface IDataSourceAdapter {
  readonly sourceType: SourceType;

  fetchItems(params: {
    categoryFilter: CategoryFilter;
    page: number;
    pageSize: number;
  }): Promise<{ items: RecommendContentItem[]; total: number }>;

  supportsCategoryFilter(filter: CategoryFilter): boolean;
}

/** 聚合查询参数 */
export interface AggregateQueryParams {
  userId: string | null;
  categoryFilter: CategoryFilter;
  page: number;
  pageSize: number;
}

/** 聚合查询结果 */
export interface AggregateQueryResult {
  data: RecommendContentItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 来源标签 */
export const SOURCE_LABELS: Record<SourceType, string> = {
  template: "✨精选",
  hot_trend: "🔥热榜",
  user_work: "👥作品",
} as const;