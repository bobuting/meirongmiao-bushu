/**
 * 广场行为日志 PG 仓库
 * 记录用户在广场中的浏览和点击行为
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 内容项类型 */
export type ItemType = "template" | "hot_trend" | "user_work";

/** 行为类型 */
export type BehaviorType = "view" | "click";

/** 广场行为日志实体 */
export interface SquareBehaviorLog {
  id: string;
  userId: string;
  itemId: string;
  itemType: ItemType;
  itemCategory: string; // 男装 | 女装 | 男童装 | 女童装
  behaviorType: BehaviorType;
  sessionId?: string | null;
  createdAt: number;
}

/** 分类统计结果 */
export interface CategoryCountResult {
  itemCategory: string;
  count: number;
}

// ============================================================================
// 仓库实现
// ============================================================================

export class PgSquareBehaviorLogRepository extends PgBaseRepository<SquareBehaviorLog> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("square_behavior_logs"), client);
  }

  protected mapRow(row: Record<string, unknown>): SquareBehaviorLog {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      itemId: row.item_id as string,
      itemType: row.item_type as ItemType,
      itemCategory: row.item_category as string,
      behaviorType: row.behavior_type as BehaviorType,
      sessionId: row.session_id as string | null,
      createdAt: row.created_at as number,
    };
  }

  protected mapEntity(entity: SquareBehaviorLog): Record<string, unknown> {
    return {
      id: entity.id,
      user_id: entity.userId,
      item_id: entity.itemId,
      item_type: entity.itemType,
      item_category: entity.itemCategory,
      behavior_type: entity.behaviorType,
      session_id: entity.sessionId ?? null,
      created_at: entity.createdAt,
    };
  }

  /** 根据用户 ID 和日期范围查询日志 */
  async findByUserIdAndDateRange(
    userId: string,
    startTime: number,
    endTime: number,
  ): Promise<SquareBehaviorLog[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
       ORDER BY created_at DESC`,
      [userId, startTime, endTime],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 按分类统计行为数量 */
  async countByCategory(
    userId: string,
    behaviorType?: BehaviorType,
  ): Promise<CategoryCountResult[]> {
    let query = `SELECT item_category, COUNT(*) as count
                 FROM ${this.tableName}
                 WHERE user_id = $1`;
    const params: (string | number)[] = [userId];

    if (behaviorType) {
      query += ` AND behavior_type = $${params.length + 1}`;
      params.push(behaviorType);
    }

    query += ` GROUP BY item_category`;

    const result = await this.queryClient.query(query, params);
    return result.rows.map((row) => ({
      itemCategory: row.item_category as string,
      count: parseInt(row.count as string, 10),
    }));
  }

  /** 批量插入行为日志 */
  async batchInsert(logs: SquareBehaviorLog[]): Promise<void> {
    if (logs.length === 0) return;

    const values: (string | number | null)[] = [];
    const placeholders: string[] = [];

    logs.forEach((log, index) => {
      const base = index * 8;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`,
      );
      values.push(
        log.id,
        log.userId,
        log.itemId,
        log.itemType,
        log.itemCategory,
        log.behaviorType,
        log.sessionId ?? null,
        log.createdAt,
      );
    });

    await this.queryClient.query(
      `INSERT INTO ${this.tableName}
       (id, user_id, item_id, item_type, item_category, behavior_type, session_id, created_at)
       VALUES ${placeholders.join(", ")}`,
      values,
    );
  }

  /** 删除旧日志（保留指定天数内的记录） */
  async deleteOldLogs(retentionDays: number): Promise<number> {
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE created_at < $1`,
      [cutoffTime],
    );
    return result.rowCount ?? 0;
  }
}