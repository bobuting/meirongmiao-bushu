// src/service/recommendation-service.ts

/**
 * 推荐聚合服务
 * 负责聚合多数据源内容，计算推荐得分，应用穿插策略，返回分页结果
 *
 * 核心流程：
 * 1. 根据分类筛选确定活跃适配器
 * 2. 获取用户偏好权重（未登录用户使用默认权重）
 * 3. 并行获取各数据源数据
 * 4. 计算推荐得分并排序
 * 5. 应用穿插策略
 * 6. 分页返回结果
 */

import type { Pool } from "pg";
import type {
  IDataSourceAdapter,
  RecommendContentItem,
  CategoryFilter,
  AggregateQueryParams,
  AggregateQueryResult,
  SourceType,
} from "../contracts/recommendation-adapter-contract.js";
import { TemplateAdapter } from "../adapters/template-adapter.js";
import { HotTrendAdapter } from "../adapters/hot-trend-adapter.js";
import { UserWorkAdapter } from "../adapters/user-work-adapter.js";
import { UserPreferenceService, type CategoryWeights } from "./user-preference-service.js";
import { RecommendConfigService } from "./recommend-config-service.js";
import { PAGINATION_CONFIG, INTERLEAVE_CONFIG, SCORE_WEIGHT_CONFIG, FRESHNESS_CONFIG } from "../contant-config/recommend-config.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 内部评分项（用于排序） */
interface ScoredItem {
  item: RecommendContentItem;
  score: number;
}

/** 默认分类权重（未登录用户） */
const DEFAULT_CATEGORY_WEIGHTS: CategoryWeights = {
  男装: 0.25,
  女装: 0.25,
  男童装: 0.25,
  女童装: 0.25,
};

// ============================================================================
// 服务接口
// ============================================================================

/**
 * 推荐聚合服务接口
 */
export interface IRecommendationService {
  /** 聚合查询多数据源内容 */
  aggregate(params: AggregateQueryParams): Promise<AggregateQueryResult>;
}

// ============================================================================
// 服务实现
// ============================================================================

/**
 * 推荐聚合服务实现
 */
export class RecommendationService implements IRecommendationService {
  private pool: Pool;
  private preferenceService: UserPreferenceService;
  private configService: RecommendConfigService;

  // 三个数据源适配器
  private templateAdapter: IDataSourceAdapter;
  private hotTrendAdapter: IDataSourceAdapter;
  private userWorkAdapter: IDataSourceAdapter;

  constructor(pool: Pool, repos: import("../repositories/pg/index.js").PgRepositoryCollection) {
    this.pool = pool;
    this.preferenceService = new UserPreferenceService(pool);
    this.configService = new RecommendConfigService();

    // 初始化适配器（通过仓库实例）
    this.templateAdapter = new TemplateAdapter(repos.squareTemplates);
    this.hotTrendAdapter = new HotTrendAdapter(repos.hotTrendAssets);
    this.userWorkAdapter = new UserWorkAdapter(repos.squareUserWorks);
  }

  /**
   * 聚合查询多数据源内容
   *
   * @param userId 用户ID（可选，未登录用户使用默认权重）
   * @param categoryFilter 分类筛选条件
   * @param page 页码
   * @param pageSize 每页数量
   */
  async aggregate(params: AggregateQueryParams): Promise<AggregateQueryResult> {
    const { userId, categoryFilter, page, pageSize } = params;

    // 验证分页参数
    const validPageSize = Math.min(pageSize, PAGINATION_CONFIG.MAX_PAGE_SIZE);

    // 1. 根据分类筛选确定活跃适配器
    const activeAdapters = this.determineActiveAdapters(categoryFilter);

    // 2. 获取用户偏好权重（未登录用户使用默认权重）
    let categoryWeights: CategoryWeights;
    if (userId) {
      categoryWeights = await this.preferenceService.calculateCategoryWeights(userId);
    } else {
      categoryWeights = DEFAULT_CATEGORY_WEIGHTS;
    }

    // 3. 并行获取各数据源数据
    const fetchPromises = activeAdapters.map((adapter) =>
      adapter.fetchItems({ categoryFilter, page, pageSize: validPageSize * 3 }), // 每个适配器取更多数据，便于后续排序
    );

    const fetchResults = await Promise.all(fetchPromises);
    const allItems: RecommendContentItem[] = fetchResults.flatMap((result) => result.items);

    // 4. 计算推荐得分并排序
    const scoredItems: ScoredItem[] = allItems.map((item) => ({
      item,
      score: this.calculateRecommendScore(item, categoryWeights),
    }));

    // 按得分降序排序
    scoredItems.sort((a, b) => b.score - a.score);

    // 5. 应用穿插策略
    const interleavedItems = this.applySourceInterleave(scoredItems);

    // 6. 分页返回
    const total = interleavedItems.length;
    const totalPages = Math.ceil(total / validPageSize);
    const offset = (page - 1) * validPageSize;
    const paginatedData = interleavedItems.slice(offset, offset + validPageSize);

    return {
      data: paginatedData,
      total,
      page,
      pageSize: validPageSize,
      totalPages,
    };
  }

  // ============================================================================
  // 适配器选择
  // ============================================================================

  /**
   * 根据分类筛选确定活跃适配器
   *
   * 规则：
   * - "全部": 所有三个适配器（热榜适配器只返回视频热榜，已排除实时热榜）
   * - "精选": 仅模板适配器
   * - "热榜": 仅热榜适配器（视频热榜）
   * - 服装分类（男装/女装/男童装/女童装）: 模板 + 用户作品适配器（热榜不参与服装分类）
   */
  private determineActiveAdapters(filter: CategoryFilter): IDataSourceAdapter[] {
    switch (filter) {
      case "全部":
        // 热榜适配器已过滤掉实时热榜，只返回视频热榜
        return [this.templateAdapter, this.hotTrendAdapter, this.userWorkAdapter];

      case "精选":
        return [this.templateAdapter];

      case "热榜":
        return [this.hotTrendAdapter];

      case "男装":
      case "女装":
      case "男童装":
      case "女童装":
        // 热榜不参与服装分类筛选
        return [this.templateAdapter, this.userWorkAdapter];

      default:
        // 默认返回所有适配器
        return [this.templateAdapter, this.hotTrendAdapter, this.userWorkAdapter];
    }
  }

  // ============================================================================
  // 推荐得分计算
  // ============================================================================

  /**
   * 计算内容项推荐得分
   *
   * 得分组成：
   * 1. 分类偏好匹配得分 - 用户偏好权重 × CATEGORY_MATCH_BASE
   * 2. 热度得分（仅热榜）- min(hotValue/HOT_VALUE_BASE, 1) × HOT_VALUE_MAX_SCORE
   * 3. 浏览量得分 - min(views/VIEW_BASE, 1) × VIEW_MAX_SCORE
   * 4. 点赞量得分 - min(likes/LIKE_BASE, 1) × LIKE_MAX_SCORE
   * 5. 新鲜度得分 - 24h内 +SCORE_WITHIN_24H，72h内 +SCORE_WITHIN_72H
   */
  private calculateRecommendScore(item: RecommendContentItem, userWeights: CategoryWeights): number {
    let score = 0;

    // 1. 分类偏好匹配得分（核心得分）
    // 热榜的 category 是来源平台，不参与服装分类偏好计算
    if (item.sourceType !== "hot_trend") {
      const categoryKey = this.getCategoryKey(item.category);
      if (categoryKey && userWeights[categoryKey] !== undefined) {
        score += userWeights[categoryKey] * SCORE_WEIGHT_CONFIG.CATEGORY_MATCH_BASE;
      }
    }

    // 2. 热度得分（仅热榜内容）
    if (item.sourceType === "hot_trend" && item.hotValue) {
      const hotNumeric = parseFloat(item.hotValue);
      if (!isNaN(hotNumeric)) {
        const hotScore = Math.min(hotNumeric / SCORE_WEIGHT_CONFIG.HOT_VALUE_BASE, 1) * SCORE_WEIGHT_CONFIG.HOT_VALUE_MAX_SCORE;
        score += hotScore;
      }
    }

    // 3. 浏览量得分（模板和作品）
    if (item.sourceType !== "hot_trend") {
      const viewScore = Math.min((item.views || 0) / SCORE_WEIGHT_CONFIG.VIEW_BASE, 1) * SCORE_WEIGHT_CONFIG.VIEW_MAX_SCORE;
      score += viewScore;
    }

    // 4. 点赞量得分（模板和作品）
    if (item.sourceType !== "hot_trend") {
      const likeScore = Math.min((item.likes || 0) / SCORE_WEIGHT_CONFIG.LIKE_BASE, 1) * SCORE_WEIGHT_CONFIG.LIKE_MAX_SCORE;
      score += likeScore;
    }

    // 5. 新鲜度得分
    const now = Date.now();
    const ageHours = (now - item.createdAt) / (60 * 60 * 1000);
    if (ageHours < FRESHNESS_CONFIG.THRESHOLD_24H) {
      score += FRESHNESS_CONFIG.SCORE_WITHIN_24H;
    } else if (ageHours < FRESHNESS_CONFIG.THRESHOLD_72H) {
      score += FRESHNESS_CONFIG.SCORE_WITHIN_72H;
    }

    return score;
  }

  /**
   * 将分类字符串转换为权重键名
   * 用于匹配用户偏好权重
   */
  private getCategoryKey(category: string): keyof CategoryWeights | null {
    const categoryMap: Record<string, keyof CategoryWeights> = {
      男装: "男装",
      女装: "女装",
      男童装: "男童装",
      女童装: "女童装",
    };
    return categoryMap[category] || null;
  }

  // ============================================================================
  // 穿插策略
  // ============================================================================

  /**
   * 应用来源穿插策略
   *
   * 策略：按 PICK_PATTERN 模式轮流从各来源池选取内容
   * 确保展示顺序中各来源内容穿插分布，避免同一来源内容过于集中
   *
   * Pattern: ["template", "template", "hot_trend", "template", "user_work", "hot_trend"]
   */
  private applySourceInterleave(scoredItems: ScoredItem[]): RecommendContentItem[] {
    // 按来源类型分组，保持原有得分排序
    const pools: Record<SourceType, ScoredItem[]> = {
      template: scoredItems.filter((s) => s.item.sourceType === "template"),
      hot_trend: scoredItems.filter((s) => s.item.sourceType === "hot_trend"),
      user_work: scoredItems.filter((s) => s.item.sourceType === "user_work"),
    };

    const result: RecommendContentItem[] = [];
    let patternIndex = 0;
    const pickPattern = INTERLEAVE_CONFIG.PICK_PATTERN;

    // 按穿插模式选取内容
    while (Object.values(pools).some((p) => p.length > 0)) {
      const sourceType = pickPattern[patternIndex % pickPattern.length];
      const pool = pools[sourceType];

      if (pool.length > 0) {
        const scoredItem = pool.shift();
        if (scoredItem) {
          result.push(scoredItem.item);
        }
      }

      patternIndex++;

      // 防止无限循环
      if (patternIndex > INTERLEAVE_CONFIG.MAX_ITERATIONS) {
        break;
      }
    }

    return result;
  }
}