/**
 * 广场聚合查询服务
 * 委托 PgSquareTemplateRepository 执行数据库操作
 */

import type { PgSquareTemplateRepository } from "../repositories/pg/square-template-pg-repository.js";
import { SQUARE_PUBLISH_CATEGORY, type SquarePublishCategory } from "../contant-config/shared_dict.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 来源类型（仅模板） */
export type SourceType = "template";

/** 广场内容项统一结构 */
export interface SquareContentItem {
  id: string;
  title: string;
  coverUrl: string;
  videoUrl: string | null;
  category: string;
  sourceType: SourceType;
  sourceLabel: string;
  author: string | null;
  views: number;
  likes: number;
  createdAt: number;
}

/** 聚合查询参数 */
export interface AggregateQueryParams {
  category?: string;
  keyword?: string;
  page: number;
  pageSize: number;
}

/** 分页结果 */
export interface AggregateQueryResult {
  data: SquareContentItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// 常量定义
// ============================================================================

/** 来源标签 */
const SOURCE_LABELS: Record<SourceType, string> = {
  template: "✨精选",
};

// ============================================================================
// 服务接口
// ============================================================================

/**
 * 广场聚合查询服务接口
 */
export interface ISquareAggregateService {
  /** 聚合查询模板数据 */
  aggregate(params: AggregateQueryParams): Promise<AggregateQueryResult>;
}

// ============================================================================
// 服务实现
// ============================================================================

/**
 * 广场聚合查询服务实现
 * 委托 PgSquareTemplateRepository 执行数据库操作
 */
export class SquareAggregateService implements ISquareAggregateService {
  constructor(private readonly repo: PgSquareTemplateRepository) {}

  /**
   * 聚合查询模板数据
   *
   * 处理流程：
   * 1. 查询模板数据（支持分类筛选）
   * 2. 按 sort_order 和 created_at 排序
   * 3. 分页返回结果
   */
  async aggregate(params: AggregateQueryParams): Promise<AggregateQueryResult> {
    const { category, keyword, page, pageSize } = params;

    // 验证分类有效性
    const validCategory = category && this.isValidCategory(category) ? category : undefined;

    // 查询模板数据
    const templates = await this.repo.listForAggregate(validCategory, keyword);

    // 分页
    const total = templates.length;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    const paginatedData = templates.slice(offset, offset + pageSize);

    return {
      data: paginatedData.map(row => this.mapTemplateToItem(row)),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  // ============================================================================
  // 数据映射
  // ============================================================================

  /** 将模板记录映射为 SquareContentItem */
  private mapTemplateToItem(row: { id: string; title: string; coverUrl: string; videoUrl: string | null; category: string; author: string; views: number; likes: number; createdAt: number }): SquareContentItem {
    return {
      id: row.id,
      title: row.title,
      coverUrl: row.coverUrl,
      videoUrl: row.videoUrl,
      category: row.category,
      sourceType: "template",
      sourceLabel: SOURCE_LABELS.template,
      author: row.author,
      views: row.views,
      likes: row.likes,
      createdAt: row.createdAt,
    };
  }

  // ============================================================================
  // 工具方法
  // ============================================================================

  /** 验证分类是否有效 */
  private isValidCategory(category: string): boolean {
    const validCategories: SquarePublishCategory[] = [
      SQUARE_PUBLISH_CATEGORY.MEN,
      SQUARE_PUBLISH_CATEGORY.WOMEN,
      SQUARE_PUBLISH_CATEGORY.BOYS,
      SQUARE_PUBLISH_CATEGORY.GIRLS,
    ];
    return validCategories.includes(category as SquarePublishCategory);
  }
}

// ============================================================================
// 导出
// ============================================================================

export type { CategoryWeights } from "./user-preference-service.js";
