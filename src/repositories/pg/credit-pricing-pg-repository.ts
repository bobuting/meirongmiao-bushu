/**
 * 积分定价 PG 仓库
 * 管理各 RouteKey 对应的积分成本
 */

import type { Pool, PoolClient } from "pg";
import { nrm } from "./base-pg-repository.js";

/** 积分定价记录 */
export interface CreditPricingRecord {
  routeKey: string;
  creditCost: number;
  description: string | null;
  category: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 积分定价变更历史记录 */
export interface CreditPricingHistoryRecord {
  id: string;
  routeKey: string;
  oldCost: number | null;
  newCost: number;
  changeReason: string | null;
  changedBy: string | null;
  changedAt: number;
}

/** 积分定价仓库接口 */
export interface ICreditPricingRepository {
  /** 获取所有生效的定价 */
  getAllActive(): Promise<CreditPricingRecord[]>;

  /** 获取所有定价（包括未生效） */
  getAll(): Promise<CreditPricingRecord[]>;

  /** 根据 RouteKey 获取定价 */
  getByRouteKey(routeKey: string): Promise<CreditPricingRecord | null>;

  /** 批量获取定价 */
  getByRouteKeys(routeKeys: string[]): Promise<CreditPricingRecord[]>;

  /** 设置定价（创建或更新） */
  setPricing(routeKey: string, creditCost: number, description?: string, category?: string, changedBy?: string, changeReason?: string): Promise<CreditPricingRecord>;

  /** 批量设置定价 */
  setPricingBatch(pricings: Array<{ routeKey: string; creditCost: number; description?: string; category?: string }>, changedBy?: string, changeReason?: string): Promise<CreditPricingRecord[]>;

  /** 删除定价（设为未生效） */
  deactivate(routeKey: string, changedBy?: string, changeReason?: string): Promise<void>;

  /** 获取变更历史 */
  getHistory(routeKey: string, limit?: number): Promise<CreditPricingHistoryRecord[]>;

  /** 获取某分类下的定价 */
  getByCategory(category: string): Promise<CreditPricingRecord[]>;
}

export class PgCreditPricingRepository implements ICreditPricingRepository {
  private readonly table = nrm("credit_pricing");
  private readonly historyTable = nrm("credit_pricing_history");

  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  /** 获取所有生效的定价 */
  async getAllActive(): Promise<CreditPricingRecord[]> {
    const result = await this.queryClient.query(
      `SELECT route_key, credit_cost, description, category, is_active, created_at, updated_at
       FROM ${this.table}
       WHERE is_active = true
       ORDER BY category, route_key`,
    );
    return result.rows.map(this.mapRow);
  }

  /** 获取所有定价（包括未生效） */
  async getAll(): Promise<CreditPricingRecord[]> {
    const result = await this.queryClient.query(
      `SELECT route_key, credit_cost, description, category, is_active, created_at, updated_at
       FROM ${this.table}
       ORDER BY category, route_key`,
    );
    return result.rows.map(this.mapRow);
  }

  /** 根据 RouteKey 获取定价 */
  async getByRouteKey(routeKey: string): Promise<CreditPricingRecord | null> {
    const result = await this.queryClient.query(
      `SELECT route_key, credit_cost, description, category, is_active, created_at, updated_at
       FROM ${this.table}
       WHERE route_key = $1`,
      [routeKey],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 批量获取定价 */
  async getByRouteKeys(routeKeys: string[]): Promise<CreditPricingRecord[]> {
    if (routeKeys.length === 0) return [];
    const result = await this.queryClient.query(
      `SELECT route_key, credit_cost, description, category, is_active, created_at, updated_at
       FROM ${this.table}
       WHERE route_key = ANY($1)`,
      [routeKeys],
    );
    return result.rows.map(this.mapRow);
  }

  /** 设置定价（创建或更新） */
  async setPricing(
    routeKey: string,
    creditCost: number,
    description?: string,
    category?: string,
    changedBy?: string,
    changeReason?: string,
  ): Promise<CreditPricingRecord> {
    const now = Date.now();
    const effectiveCategory = category ?? "general";
    const effectiveDescription = description ?? null;

    // 查询现有定价
    const existing = await this.getByRouteKey(routeKey);

    if (existing) {
      // 更新
      await this.queryClient.query(
        `UPDATE ${this.table}
         SET credit_cost = $2, description = $3, category = $4, is_active = true, updated_at = $5
         WHERE route_key = $1`,
        [routeKey, creditCost, effectiveDescription, effectiveCategory, now],
      );

      // 记录变更历史
      await this.insertHistory(routeKey, existing.creditCost, creditCost, changedBy, changeReason, now);

      return {
        ...existing,
        creditCost,
        description: effectiveDescription,
        category: effectiveCategory,
        isActive: true,
        updatedAt: now,
      };
    }

    // 创建
    await this.queryClient.query(
      `INSERT INTO ${this.table} (route_key, credit_cost, description, category, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, $5, $5)`,
      [routeKey, creditCost, effectiveDescription, effectiveCategory, now],
    );

    // 记录变更历史（首次创建，oldCost 为 null）
    await this.insertHistory(routeKey, null, creditCost, changedBy, changeReason, now);

    return {
      routeKey,
      creditCost,
      description: effectiveDescription,
      category: effectiveCategory,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  /** 批量设置定价 */
  async setPricingBatch(
    pricings: Array<{ routeKey: string; creditCost: number; description?: string; category?: string }>,
    changedBy?: string,
    changeReason?: string,
  ): Promise<CreditPricingRecord[]> {
    const results: CreditPricingRecord[] = [];
    for (const p of pricings) {
      const result = await this.setPricing(p.routeKey, p.creditCost, p.description, p.category, changedBy, changeReason);
      results.push(result);
    }
    return results;
  }

  /** 删除定价（设为未生效） */
  async deactivate(routeKey: string, changedBy?: string, changeReason?: string): Promise<void> {
    const now = Date.now();
    const existing = await this.getByRouteKey(routeKey);
    if (!existing) return;

    await this.queryClient.query(
      `UPDATE ${this.table} SET is_active = false, updated_at = $2 WHERE route_key = $1`,
      [routeKey, now],
    );

    // 记录变更历史
    await this.insertHistory(routeKey, existing.creditCost, 0, changedBy, changeReason ?? "定价失效", now);
  }

  /** 获取变更历史 */
  async getHistory(routeKey: string, limit = 50): Promise<CreditPricingHistoryRecord[]> {
    const result = await this.queryClient.query(
      `SELECT id, route_key, old_cost, new_cost, change_reason, changed_by, changed_at
       FROM ${this.historyTable}
       WHERE route_key = $1
       ORDER BY changed_at DESC
       LIMIT $2`,
      [routeKey, limit],
    );
    return result.rows.map((row) => ({
      id: row.id as string,
      routeKey: row.route_key as string,
      oldCost: row.old_cost as number | null,
      newCost: row.new_cost as number,
      changeReason: row.change_reason as string | null,
      changedBy: row.changed_by as string | null,
      changedAt: row.changed_at as number,
    }));
  }

  /** 获取某分类下的定价 */
  async getByCategory(category: string): Promise<CreditPricingRecord[]> {
    const result = await this.queryClient.query(
      `SELECT route_key, credit_cost, description, category, is_active, created_at, updated_at
       FROM ${this.table}
       WHERE category = $1 AND is_active = true
       ORDER BY route_key`,
      [category],
    );
    return result.rows.map(this.mapRow);
  }

  /** 插入变更历史 */
  private async insertHistory(
    routeKey: string,
    oldCost: number | null,
    newCost: number,
    changedBy: string | undefined,
    changeReason: string | undefined,
    changedAt: number,
  ): Promise<void> {
    const id = `ch_${routeKey}_${changedAt}`;
    await this.queryClient.query(
      `INSERT INTO ${this.historyTable} (id, route_key, old_cost, new_cost, change_reason, changed_by, changed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, routeKey, oldCost, newCost, changeReason ?? null, changedBy ?? null, changedAt],
    );
  }

  /** 映射数据库行到记录对象 */
  private mapRow(row: Record<string, unknown>): CreditPricingRecord {
    return {
      routeKey: row.route_key as string,
      creditCost: row.credit_cost as number,
      description: row.description as string | null,
      category: row.category as string,
      isActive: row.is_active as boolean,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }
}