/**
 * 用户偏好服务
 * 负责获取、计算和更新用户偏好画像
 *
 * 偏好权重计算：
 * - 项目资产偏好（70% 权重）：从用户资产的 apparelCategory 字段统计服装分类
 * - 注意：需要在上传流程中填充 apparelCategory 字段
 * - 行为数据偏好（30% 权重）：从行为日志统计各分类的 view 和 click 次数
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import {
  PgUserSquarePreferenceRepository,
  DEFAULT_CATEGORY_WEIGHTS,
  DEFAULT_SOURCE_WEIGHTS,
  DEFAULT_BEHAVIOR_STATS,
  type UserSquarePreference,
  type CategoryWeights,
  type SourceWeights,
  type BehaviorStats,
} from "../repositories/pg/user-square-preference-pg-repository.js";
import {
  PgSquareBehaviorLogRepository,
  type BehaviorType,
} from "../repositories/pg/square-behavior-log-pg-repository.js";
import { PgProjectRepository } from "../repositories/pg/project-pg-repository.js";
import { PgAssetRepository } from "../repositories/pg/asset-pg-repository.js";
import { SQUARE_PUBLISH_CATEGORY, type SquarePublishCategory } from "../contant-config/shared_dict.js";

// ============================================================================
// 常量定义
// ============================================================================

/** 项目资产权重比例 */
const ASSET_WEIGHT_RATIO = 0.7;

/** 行为数据权重比例 */
const BEHAVIOR_WEIGHT_RATIO = 0.3;

/** 点击权重系数（点击权重 = 3 × 浏览权重） */
const CLICK_WEIGHT = 3;

/** 浏览权重系数 */
const VIEW_WEIGHT = 1;

/** 行为日志统计时间范围（7 天） */
const BEHAVIOR_LOG_DAYS = 7;

/** 项目查询上限 */
const PROJECT_LIMIT = 50;

/** 所有服装分类 */
const ALL_CATEGORIES: SquarePublishCategory[] = [
  SQUARE_PUBLISH_CATEGORY.MEN,
  SQUARE_PUBLISH_CATEGORY.WOMEN,
  SQUARE_PUBLISH_CATEGORY.BOYS,
  SQUARE_PUBLISH_CATEGORY.GIRLS,
];

// ============================================================================
// 服务接口
// ============================================================================

/**
 * 用户偏好服务接口
 */
export interface IUserPreferenceService {
  /** 获取用户偏好画像 */
  getUserPreference(userId: string): Promise<UserSquarePreference>;

  /** 计算综合偏好权重（项目资产 70% + 行为数据 30%） */
  calculateCategoryWeights(userId: string): Promise<CategoryWeights>;

  /** 更新用户偏好 */
  updateUserPreference(userId: string): Promise<UserSquarePreference>;

  /** 计算项目资产偏好权重 */
  calculateAssetPreference(userId: string): Promise<CategoryWeights>;

  /** 计算行为数据偏好权重 */
  calculateBehaviorPreference(userId: string): Promise<CategoryWeights>;
}

// ============================================================================
// 服务实现
// ============================================================================

/**
 * 用户偏好服务实现
 */
export class UserPreferenceService implements IUserPreferenceService {
  private preferenceRepo: PgUserSquarePreferenceRepository;
  private behaviorLogRepo: PgSquareBehaviorLogRepository;
  private projectRepo: PgProjectRepository;
  private assetRepo: PgAssetRepository;

  constructor(pool: Pool) {
    this.preferenceRepo = new PgUserSquarePreferenceRepository(pool);
    this.behaviorLogRepo = new PgSquareBehaviorLogRepository(pool);
    this.projectRepo = new PgProjectRepository(pool);
    this.assetRepo = new PgAssetRepository(pool);
  }

  /**
   * 获取用户偏好画像
   * 如果不存在则创建默认偏好
   */
  async getUserPreference(userId: string): Promise<UserSquarePreference> {
    const existing = await this.preferenceRepo.findByUserId(userId);

    if (existing) {
      return existing;
    }

    // 创建默认偏好
    const now = Date.now();
    const newPreference: UserSquarePreference = {
      id: randomUUID(),
      userId,
      categoryWeights: DEFAULT_CATEGORY_WEIGHTS,
      sourceWeights: DEFAULT_SOURCE_WEIGHTS,
      assetTypeWeights: {},
      behaviorStats: DEFAULT_BEHAVIOR_STATS,
      lastUpdated: now,
      createdAt: now,
    };

    await this.preferenceRepo.upsertByUserId(newPreference);
    return newPreference;
  }

  /**
   * 计算综合偏好权重（项目资产 70% + 行为数据 30%）
   */
  async calculateCategoryWeights(userId: string): Promise<CategoryWeights> {
    // 计算项目资产偏好权重
    const assetWeights = await this.calculateAssetPreference(userId);

    // 计算行为数据偏好权重
    const behaviorWeights = await this.calculateBehaviorPreference(userId);

    // 合并计算综合权重
    const finalWeights: CategoryWeights = {
      男装: assetWeights.男装 * ASSET_WEIGHT_RATIO + behaviorWeights.男装 * BEHAVIOR_WEIGHT_RATIO,
      女装: assetWeights.女装 * ASSET_WEIGHT_RATIO + behaviorWeights.女装 * BEHAVIOR_WEIGHT_RATIO,
      男童装: assetWeights.男童装 * ASSET_WEIGHT_RATIO + behaviorWeights.男童装 * BEHAVIOR_WEIGHT_RATIO,
      女童装: assetWeights.女童装 * ASSET_WEIGHT_RATIO + behaviorWeights.女童装 * BEHAVIOR_WEIGHT_RATIO,
    };

    // 归一化确保总和为 1
    const total = finalWeights.男装 + finalWeights.女装 + finalWeights.男童装 + finalWeights.女童装;
    if (total > 0) {
      finalWeights.男装 /= total;
      finalWeights.女装 /= total;
      finalWeights.男童装 /= total;
      finalWeights.女童装 /= total;
    } else {
      // 如果权重为 0，返回默认权重
      return DEFAULT_CATEGORY_WEIGHTS;
    }

    return finalWeights;
  }

  /**
   * 更新用户偏好
   * 重新计算偏好权重并保存到数据库
   */
  async updateUserPreference(userId: string): Promise<UserSquarePreference> {
    // 计算综合偏好权重
    const categoryWeights = await this.calculateCategoryWeights(userId);

    // 计算行为统计
    const behaviorStats = await this.calculateBehaviorStats(userId);

    // 获取现有偏好或创建新的
    const existing = await this.preferenceRepo.findByUserId(userId);
    const now = Date.now();

    const preference: UserSquarePreference = {
      id: existing?.id ?? randomUUID(),
      userId,
      categoryWeights,
      sourceWeights: existing?.sourceWeights ?? DEFAULT_SOURCE_WEIGHTS,
      assetTypeWeights: existing?.assetTypeWeights ?? {},
      behaviorStats,
      lastUpdated: now,
      createdAt: existing?.createdAt ?? now,
    };

    await this.preferenceRepo.upsertByUserId(preference);
    return preference;
  }

  /**
   * 计算项目资产偏好权重（70% 权重）
   * 从用户项目的资产中统计各服装分类的出现次数
   */
  async calculateAssetPreference(userId: string): Promise<CategoryWeights> {
    // 查询用户项目（限制 50 个）
    const projects = await this.projectRepo.findByUserId(userId);
    const limitedProjects = projects.slice(0, PROJECT_LIMIT);

    // 如果没有项目，返回默认权重
    if (limitedProjects.length === 0) {
      return DEFAULT_CATEGORY_WEIGHTS;
    }

    // 统计各服饰类型出现次数
    const typeCounts: Record<SquarePublishCategory, number> = {
      [SQUARE_PUBLISH_CATEGORY.MEN]: 0,
      [SQUARE_PUBLISH_CATEGORY.WOMEN]: 0,
      [SQUARE_PUBLISH_CATEGORY.BOYS]: 0,
      [SQUARE_PUBLISH_CATEGORY.GIRLS]: 0,
    };

    // 查询每个项目的资产，统计服装分类
    for (const project of limitedProjects) {
      const assets = await this.assetRepo.findByProjectId(project.id);
      for (const asset of assets) {
        // 使用 apparelCategory 字段统计服装分类
        const category = asset.apparelCategory;
        if (category && typeCounts[category] !== undefined) {
          typeCounts[category]++;
        }
      }
    }

    // 计算总数量
    const total = Object.values(typeCounts).reduce((sum, count) => sum + count, 0);

    // 如果没有数据，返回默认权重
    if (total === 0) {
      return DEFAULT_CATEGORY_WEIGHTS;
    }

    // 归一化权重
    const weights: CategoryWeights = {
      男装: typeCounts[SQUARE_PUBLISH_CATEGORY.MEN] / total,
      女装: typeCounts[SQUARE_PUBLISH_CATEGORY.WOMEN] / total,
      男童装: typeCounts[SQUARE_PUBLISH_CATEGORY.BOYS] / total,
      女童装: typeCounts[SQUARE_PUBLISH_CATEGORY.GIRLS] / total,
    };

    return weights;
  }

  /**
   * 计算行为数据偏好权重（30% 权重）
   * 从用户最近 7 天的行为日志统计各分类的 view 和 click 次数
   */
  async calculateBehaviorPreference(userId: string): Promise<CategoryWeights> {
    // 计算时间范围（最近 7 天）
    const endTime = Date.now();
    const startTime = endTime - BEHAVIOR_LOG_DAYS * 24 * 60 * 60 * 1000;

    // 查询行为日志
    const logs = await this.behaviorLogRepo.findByUserIdAndDateRange(userId, startTime, endTime);

    // 如果没有行为日志，返回默认权重
    if (logs.length === 0) {
      return DEFAULT_CATEGORY_WEIGHTS;
    }

    // 统计各分类的行为次数
    const behaviorCounts: Record<SquarePublishCategory, { view: number; click: number }> = {
      [SQUARE_PUBLISH_CATEGORY.MEN]: { view: 0, click: 0 },
      [SQUARE_PUBLISH_CATEGORY.WOMEN]: { view: 0, click: 0 },
      [SQUARE_PUBLISH_CATEGORY.BOYS]: { view: 0, click: 0 },
      [SQUARE_PUBLISH_CATEGORY.GIRLS]: { view: 0, click: 0 },
    };

    // 统计日志
    logs.forEach((log) => {
      const category = log.itemCategory as SquarePublishCategory;
      if (behaviorCounts[category]) {
        const behaviorType = log.behaviorType as BehaviorType;
        if (behaviorType === "view") {
          behaviorCounts[category].view++;
        } else if (behaviorType === "click") {
          behaviorCounts[category].click++;
        }
      }
    });

    // 计算行为得分（点击权重 > 浏览权重）
    const behaviorScores: Record<SquarePublishCategory, number> = {
      [SQUARE_PUBLISH_CATEGORY.MEN]:
        behaviorCounts[SQUARE_PUBLISH_CATEGORY.MEN].view * VIEW_WEIGHT +
        behaviorCounts[SQUARE_PUBLISH_CATEGORY.MEN].click * CLICK_WEIGHT,
      [SQUARE_PUBLISH_CATEGORY.WOMEN]:
        behaviorCounts[SQUARE_PUBLISH_CATEGORY.WOMEN].view * VIEW_WEIGHT +
        behaviorCounts[SQUARE_PUBLISH_CATEGORY.WOMEN].click * CLICK_WEIGHT,
      [SQUARE_PUBLISH_CATEGORY.BOYS]:
        behaviorCounts[SQUARE_PUBLISH_CATEGORY.BOYS].view * VIEW_WEIGHT +
        behaviorCounts[SQUARE_PUBLISH_CATEGORY.BOYS].click * CLICK_WEIGHT,
      [SQUARE_PUBLISH_CATEGORY.GIRLS]:
        behaviorCounts[SQUARE_PUBLISH_CATEGORY.GIRLS].view * VIEW_WEIGHT +
        behaviorCounts[SQUARE_PUBLISH_CATEGORY.GIRLS].click * CLICK_WEIGHT,
    };

    // 计算总分
    const totalScore = Object.values(behaviorScores).reduce((sum, score) => sum + score, 0);

    // 如果没有得分，返回默认权重
    if (totalScore === 0) {
      return DEFAULT_CATEGORY_WEIGHTS;
    }

    // 归一化权重
    const weights: CategoryWeights = {
      男装: behaviorScores[SQUARE_PUBLISH_CATEGORY.MEN] / totalScore,
      女装: behaviorScores[SQUARE_PUBLISH_CATEGORY.WOMEN] / totalScore,
      男童装: behaviorScores[SQUARE_PUBLISH_CATEGORY.BOYS] / totalScore,
      女童装: behaviorScores[SQUARE_PUBLISH_CATEGORY.GIRLS] / totalScore,
    };

    return weights;
  }

  /**
   * 计算行为统计数据
   * 用于存储到偏好表的 behaviorStats 字段
   */
  private async calculateBehaviorStats(userId: string): Promise<BehaviorStats> {
    const endTime = Date.now();
    const startTime = endTime - BEHAVIOR_LOG_DAYS * 24 * 60 * 60 * 1000;

    const logs = await this.behaviorLogRepo.findByUserIdAndDateRange(userId, startTime, endTime);

    const viewCount: Record<string, number> = {};
    const clickCount: Record<string, number> = {};

    logs.forEach((log) => {
      const category = log.itemCategory;
      if (log.behaviorType === "view") {
        viewCount[category] = (viewCount[category] ?? 0) + 1;
      } else if (log.behaviorType === "click") {
        clickCount[category] = (clickCount[category] ?? 0) + 1;
      }
    });

    return {
      view_count: viewCount,
      click_count: clickCount,
    };
  }
}

// ============================================================================
// 导出
// ============================================================================

export type { CategoryWeights, SourceWeights, BehaviorStats, UserSquarePreference };