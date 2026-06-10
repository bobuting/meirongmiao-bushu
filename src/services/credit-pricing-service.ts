/**
 * 积分定价服务
 * 从数据库读取定价配置，提供缓存机制
 */

import type { Pool } from "pg";
import type { ICreditPricingRepository, CreditPricingRecord } from "../repositories/pg/credit-pricing-pg-repository.js";
import { PgCreditPricingRepository } from "../repositories/pg/credit-pricing-pg-repository.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("credit-pricing-service");

/** 积分定价缓存（RouteKey → 积分成本） */
type PricingCache = Record<string, number>;

/** 积分定价服务接口 */
export interface ICreditPricingService {
  /** 获取所有生效的定价（返回 RouteKey → 成本映射） */
  getPricingMap(): Promise<PricingCache>;

  /** 获取单个 RouteKey 的定价 */
  getCost(routeKey: string): Promise<number>;

  /** 刷新缓存 */
  refreshCache(): Promise<void>;

  /** 设置定价（管理后台使用） */
  setPricing(routeKey: string, creditCost: number, description?: string, category?: string, changedBy?: string, changeReason?: string): Promise<CreditPricingRecord>;

  /** 批量设置定价（管理后台使用） */
  setPricingBatch(pricings: Array<{ routeKey: string; creditCost: number; description?: string; category?: string }>, changedBy?: string, changeReason?: string): Promise<CreditPricingRecord[]>;

  /** 获取所有定价详情（管理后台使用） */
  getAllPricingDetails(): Promise<CreditPricingRecord[]>;

  /** 失效定价（管理后台使用） */
  deactivatePricing(routeKey: string, changedBy?: string, changeReason?: string): Promise<void>;

  /** 获取变更历史（管理后台使用） */
  getHistory(routeKey: string, limit?: number): Promise<Array<{ oldCost: number | null; newCost: number; changedBy: string | null; changedAt: number; changeReason: string | null }>>;
}

export class CreditPricingService implements ICreditPricingService {
  private readonly repo: ICreditPricingRepository;
  private cache: PricingCache | null = null;
  private cacheUpdatedAt: number = 0;
  /** 缓存有效期（5分钟） */
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(pool: Pool) {
    this.repo = new PgCreditPricingRepository(pool);
  }

  /** 获取所有生效的定价（返回 RouteKey → 成本映射） */
  async getPricingMap(): Promise<PricingCache> {
    // 检查缓存是否有效
    if (this.cache && Date.now() - this.cacheUpdatedAt < this.CACHE_TTL_MS) {
      return this.cache;
    }

    // 从数据库加载
    await this.refreshCache();
    return this.cache!;
  }

  /** 获取单个 RouteKey 的定价 */
  async getCost(routeKey: string): Promise<number> {
    const map = await this.getPricingMap();
    return map[routeKey] ?? 0;
  }

  /** 刷新缓存 */
  async refreshCache(): Promise<void> {
    try {
      const records = await this.repo.getAllActive();
      this.cache = {};
      for (const record of records) {
        this.cache[record.routeKey] = record.creditCost;
      }
      this.cacheUpdatedAt = Date.now();
      log.debug({ count: records.length }, "积分定价缓存已刷新");
    } catch (error) {
      log.error({ error }, "积分定价缓存刷新失败");
      throw error;
    }
  }

  /** 设置定价（管理后台使用） */
  async setPricing(
    routeKey: string,
    creditCost: number,
    description?: string,
    category?: string,
    changedBy?: string,
    changeReason?: string,
  ): Promise<CreditPricingRecord> {
    const result = await this.repo.setPricing(routeKey, creditCost, description, category, changedBy, changeReason);
    // 更新缓存
    if (this.cache) {
      this.cache[routeKey] = creditCost;
    }
    log.info({ routeKey, creditCost, changedBy }, "积分定价已更新");
    return result;
  }

  /** 批量设置定价（管理后台使用） */
  async setPricingBatch(
    pricings: Array<{ routeKey: string; creditCost: number; description?: string; category?: string }>,
    changedBy?: string,
    changeReason?: string,
  ): Promise<CreditPricingRecord[]> {
    const results = await this.repo.setPricingBatch(pricings, changedBy, changeReason);
    // 刷新缓存
    await this.refreshCache();
    log.info({ count: pricings.length, changedBy }, "积分定价批量更新");
    return results;
  }

  /** 获取所有定价详情（管理后台使用） */
  async getAllPricingDetails(): Promise<CreditPricingRecord[]> {
    return await this.repo.getAll();
  }

  /** 失效定价（管理后台使用） */
  async deactivatePricing(routeKey: string, changedBy?: string, changeReason?: string): Promise<void> {
    await this.repo.deactivate(routeKey, changedBy, changeReason);
    // 更新缓存
    if (this.cache) {
      delete this.cache[routeKey];
    }
    log.info({ routeKey, changedBy }, "积分定价已失效");
  }

  /** 获取变更历史（管理后台使用） */
  async getHistory(
    routeKey: string,
    limit = 50,
  ): Promise<Array<{ oldCost: number | null; newCost: number; changedBy: string | null; changedAt: number; changeReason: string | null }>> {
    const records = await this.repo.getHistory(routeKey, limit);
    return records.map((r) => ({
      oldCost: r.oldCost,
      newCost: r.newCost,
      changedBy: r.changedBy,
      changedAt: r.changedAt,
      changeReason: r.changeReason,
    }));
  }
}

/** 创建积分定价服务实例 */
export function createCreditPricingService(pool: Pool): ICreditPricingService {
  return new CreditPricingService(pool);
}