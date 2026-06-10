/**
 * 用户广场偏好 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 分类权重类型 */
export type CategoryWeights = {
  男装: number;
  女装: number;
  男童装: number;
  女童装: number;
};

/** 来源权重类型 */
export type SourceWeights = {
  template: number;
  hot_trend: number;
  user_work: number;
};

/** 行为统计类型 */
export type BehaviorStats = {
  view_count: Record<string, number>;
  click_count: Record<string, number>;
};

/** 用户广场偏好实体 */
export interface UserSquarePreference {
  id: string;
  userId: string;
  categoryWeights: CategoryWeights;
  sourceWeights: SourceWeights;
  assetTypeWeights: Record<string, number>;
  behaviorStats: BehaviorStats;
  lastUpdated: number;
  createdAt: number;
}

// ============================================================================
// 默认值
// ============================================================================

export const DEFAULT_CATEGORY_WEIGHTS: CategoryWeights = {
  男装: 0.25,
  女装: 0.25,
  男童装: 0.25,
  女童装: 0.25,
};

export const DEFAULT_SOURCE_WEIGHTS: SourceWeights = {
  template: 0.5,
  hot_trend: 0.3,
  user_work: 0.2,
};

export const DEFAULT_BEHAVIOR_STATS: BehaviorStats = {
  view_count: {},
  click_count: {},
};

// ============================================================================
// 仓库实现
// ============================================================================

export class PgUserSquarePreferenceRepository extends PgBaseRepository<UserSquarePreference> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("user_square_preferences"), client);
  }

  protected mapRow(row: Record<string, unknown>): UserSquarePreference {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      categoryWeights: PgBaseRepository.fromJsonb<CategoryWeights>(row.category_weights) ?? DEFAULT_CATEGORY_WEIGHTS,
      sourceWeights: PgBaseRepository.fromJsonb<SourceWeights>(row.source_weights) ?? DEFAULT_SOURCE_WEIGHTS,
      assetTypeWeights: PgBaseRepository.fromJsonb<Record<string, number>>(row.asset_type_weights) ?? {},
      behaviorStats: PgBaseRepository.fromJsonb<BehaviorStats>(row.behavior_stats) ?? DEFAULT_BEHAVIOR_STATS,
      lastUpdated: row.last_updated as number,
      createdAt: row.created_at as number,
    };
  }

  protected mapEntity(entity: UserSquarePreference): Record<string, unknown> {
    return {
      id: entity.id,
      user_id: entity.userId,
      category_weights: JSON.stringify(entity.categoryWeights),
      source_weights: JSON.stringify(entity.sourceWeights),
      asset_type_weights: JSON.stringify(entity.assetTypeWeights),
      behavior_stats: JSON.stringify(entity.behaviorStats),
      last_updated: entity.lastUpdated,
      created_at: entity.createdAt,
    };
  }

  /** 根据用户 ID 查找偏好 */
  async findByUserId(userId: string): Promise<UserSquarePreference | null> {
    return this.findOneWhere({ user_id: userId });
  }

  /** 创建或更新用户偏好 */
  async upsertByUserId(preference: UserSquarePreference): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (id, user_id, category_weights, source_weights, asset_type_weights, behavior_stats, last_updated, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET
         category_weights = EXCLUDED.category_weights,
         source_weights = EXCLUDED.source_weights,
         asset_type_weights = EXCLUDED.asset_type_weights,
         behavior_stats = EXCLUDED.behavior_stats,
         last_updated = EXCLUDED.last_updated`,
      [
        preference.id,
        preference.userId,
        JSON.stringify(preference.categoryWeights),
        JSON.stringify(preference.sourceWeights),
        JSON.stringify(preference.assetTypeWeights),
        JSON.stringify(preference.behaviorStats),
        preference.lastUpdated,
        preference.createdAt,
      ],
    );
  }

  /** 更新分类权重 */
  async updateCategoryWeights(userId: string, weights: CategoryWeights): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET category_weights = $2, last_updated = $3 WHERE user_id = $1`,
      [userId, JSON.stringify(weights), Date.now()],
    );
  }

  /** 更新行为统计 */
  async updateBehaviorStats(userId: string, stats: BehaviorStats): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET behavior_stats = $2, last_updated = $3 WHERE user_id = $1`,
      [userId, JSON.stringify(stats), Date.now()],
    );
  }
}