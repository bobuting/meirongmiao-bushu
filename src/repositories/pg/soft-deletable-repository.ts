/**
 * PostgreSQL 伪删除仓库基类
 * 继承 PgBaseRepository，添加伪删除能力
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository } from "./base-pg-repository.js";
import type { SoftDeletable } from "../../contracts/types.js";

/** 查询选项 */
export interface SoftDeleteQueryOptions {
  includeDeleted?: boolean;
}

/** 伪删除 Repository 基类 */
export abstract class PgSoftDeletableRepository<T extends SoftDeletable> extends PgBaseRepository<T> {
  constructor(
    protected override readonly pool: Pool,
    protected override readonly tableName: string,
    protected override readonly client?: PoolClient,
  ) {
    super(pool, tableName, client);
  }

  /** 伪删除：设置 deleted_at 和 deleted_by */
  async softDelete(id: string, deletedBy: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET deleted_at = $2, deleted_by = $3 WHERE id = $1`,
      [id, Date.now(), deletedBy],
    );
  }

  /** 恢复：清除 deleted_at 和 deleted_by */
  async restore(id: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET deleted_at = NULL, deleted_by = NULL WHERE id = $1`,
      [id],
    );
  }

  /** 物理删除：真正删除数据 */
  async hardDelete(id: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
  }

  /** 根据 ID 查找（默认过滤已删除） */
  override async findById(id: string, options?: SoftDeleteQueryOptions): Promise<T | null> {
    const includeDeleted = options?.includeDeleted ?? false;
    const sql = includeDeleted
      ? `SELECT * FROM ${this.tableName} WHERE id = $1 LIMIT 1`
      : `SELECT * FROM ${this.tableName} WHERE id = $1 AND deleted_at IS NULL LIMIT 1`;
    const result = await this.queryClient.query(sql, [id]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 查找所有记录（默认过滤已删除） */
  override async list(options?: SoftDeleteQueryOptions): Promise<T[]> {
    const includeDeleted = options?.includeDeleted ?? false;
    const sql = includeDeleted
      ? `SELECT * FROM ${this.tableName}`
      : `SELECT * FROM ${this.tableName} WHERE deleted_at IS NULL`;
    const result = await this.queryClient.query(sql);
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 查找已删除记录（用于清理任务） */
  async listDeleted(retentionDays?: number): Promise<T[]> {
    if (retentionDays) {
      const threshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const result = await this.queryClient.query(
        `SELECT * FROM ${this.tableName} WHERE deleted_at IS NOT NULL AND deleted_at < $1`,
        [threshold],
      );
      return result.rows.map((row) => this.mapRow(row));
    }
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE deleted_at IS NOT NULL`,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 根据条件查找（自动过滤已删除） */
  protected override async findWhere(
    conditions: Record<string, unknown>,
    options?: SoftDeleteQueryOptions,
  ): Promise<T[]> {
    const keys = Object.keys(conditions);
    const includeDeleted = options?.includeDeleted ?? false;

    // 空条件时直接返回全部（已过滤）
    if (keys.length === 0) {
      return this.list(options);
    }

    const whereClause = keys.map((k, i) => `${k} = $${i + 1}`).join(" AND ");
    const deletedFilter = includeDeleted ? "" : "AND deleted_at IS NULL";
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE ${whereClause} ${deletedFilter}`,
      Object.values(conditions),
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 查找单个记录（自动过滤已删除） */
  protected override async findOneWhere(
    conditions: Record<string, unknown>,
    options?: SoftDeleteQueryOptions,
  ): Promise<T | null> {
    const results = await this.findWhere(conditions, options);
    return results[0] ?? null;
  }

  /** 统计已删除记录数量 */
  async countDeleted(retentionDays?: number): Promise<number> {
    if (retentionDays) {
      const threshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const result = await this.queryClient.query(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE deleted_at IS NOT NULL AND deleted_at < $1`,
        [threshold],
      );
      return (result.rows[0]?.count as number) ?? 0;
    }
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE deleted_at IS NOT NULL`,
    );
    return (result.rows[0]?.count as number) ?? 0;
  }
}
