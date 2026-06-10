/**
 * PostgreSQL 仓库基类
 * 提供 CRUD 操作的通用实现
 */

import type { Pool, PoolClient } from "pg";

/** 表名转换：将实体名转换为 nrm_ 前缀的表名 */
export function nrm(entityName: string): string {
  return `nrm_${entityName}`;
}

/** PG 仓库基类 */
export abstract class PgBaseRepository<T> {
  constructor(
    protected readonly pool: Pool,
    protected readonly tableName: string,
    protected readonly client?: PoolClient,
  ) {}

  /** 事务时用 client，否则用 pool */
  protected get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  /** 从数据库行映射到实体 */
  protected abstract mapRow(row: Record<string, unknown>): T;

  /** 从实体映射到数据库行 */
  protected abstract mapEntity(entity: T): Record<string, unknown>;

  /** 根据 ID 查找 */
  async findById(id: string): Promise<T | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 根据 ID 批量查找（避免 N+1 查询） */
  async findByIds(ids: string[]): Promise<T[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE id IN (${placeholders})`,
      ids,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 查找所有记录 */
  async list(): Promise<T[]> {
    const result = await this.queryClient.query(`SELECT * FROM ${this.tableName}`);
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 根据条件查找 */
  protected async findWhere(conditions: Record<string, unknown>): Promise<T[]> {
    const keys = Object.keys(conditions);
    // 空条件时直接返回全部记录
    if (keys.length === 0) {
      const result = await this.queryClient.query(`SELECT * FROM ${this.tableName}`);
      return result.rows.map((row) => this.mapRow(row));
    }
    const whereClause = keys.map((k, i) => `${k} = $${i + 1}`).join(" AND ");
    const values = Object.values(conditions);
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE ${whereClause}`,
      values,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 根据条件查找单个记录 */
  protected async findOneWhere(conditions: Record<string, unknown>): Promise<T | null> {
    const results = await this.findWhere(conditions);
    return results[0] ?? null;
  }

  /** 插入或更新 */
  async upsert(entity: T): Promise<void> {
    const data = this.mapEntity(entity);
    const keys = Object.keys(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const updates = keys
      .filter((k) => k !== "id")
      .map((k, i) => `${k} = EXCLUDED.${k}`)
      .join(", ");
    const values = Object.values(data);

    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${keys.join(", ")})
       VALUES (${placeholders})
       ON CONFLICT (id) DO UPDATE SET ${updates}`,
      values,
    );
  }

  /** 删除 */
  async delete(id: string): Promise<void> {
    await this.queryClient.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
  }

  /** 更新指定字段 */
  async updateFields(id: string, fields: Partial<T>): Promise<void> {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;

    // 将实体字段名转换为数据库字段名（camelCase -> snake_case）
    const dbFields: Record<string, unknown> = {};
    for (const key of keys) {
      const dbKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      let value = (fields as Record<string, unknown>)[key];
      // 毫秒时间戳自动转 ISO 字符串（PG timestamp 列不接受毫秒数）
      // 注意：created_at/updated_at/published_at/deleted_at/started_at 在本项目中均为 bigint 类型，不应转换
      const knownBigintTimestampFields = new Set(['created_at', 'updated_at', 'published_at', 'deleted_at', 'started_at']);
      if (!knownBigintTimestampFields.has(dbKey) && typeof value === "number" && /_(at|date|time)$/.test(dbKey) && value > 1e12) {
        value = new Date(value).toISOString();
      }
      // 数组/对象自动 JSON 序列化（PG jsonb 列不接受 JS 原生类型）
      if (typeof value === "object" && value !== null) {
        value = JSON.stringify(value);
      }
      dbFields[dbKey] = value;
    }

    const dbKeys = Object.keys(dbFields);
    const setClause = dbKeys.map((k, i) => `${k} = $${i + 2}`).join(", ");
    const values = [id, ...Object.values(dbFields)];

    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${setClause} WHERE id = $1`,
      values,
    );
  }

  /** JSONB 转换工具 */
  public static toJsonb(value: unknown): string {
    return JSON.stringify(value ?? null);
  }

  public static fromJsonb<T>(value: unknown): T | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as T;
      } catch {
        return null;
      }
    }
    return value as T;
  }

  /** 确保 JSONB 值始终为 string[] 类型，防御数据库中存了对象等非数组数据 */
  public static ensureStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string");
  }
}