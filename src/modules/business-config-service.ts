/**
 * 业务模块配置服务
 * 提供按模块读取业务配置的能力
 */

import type { Pool } from "pg";
import type { IBusinessConfigRepository } from "../contracts/repository-ports/system-repository.js";
import { getLogger } from "../core/logger/index.js";
import { PgBusinessConfigRepository } from "../repositories/pg/business-config-pg-repository.js";
import {
  type BusinessModule,
  type BusinessConfigMap,
  getDefaultConfigForModule,
} from "../contracts/business-config-contract.js";

const log = getLogger("business-config-service");

/** 缓存项 */
interface CacheEntry {
  data: Record<string, unknown>;
  version: number;
}

/**
 * 业务配置服务
 * 带内存缓存 + 版本号热更新，启动时从数据库加载
 */
export class BusinessConfigService {
  private cache = new Map<string, CacheEntry>();
  private globalVersion = 0;
  private repository: IBusinessConfigRepository;

  constructor(pool: Pool) {
    this.repository = new PgBusinessConfigRepository(pool);
  }

  /** 初始化：从数据库加载所有配置到缓存 */
  async initialize(): Promise<void> {
    const rows = await this.repository.listAll();
    for (const row of rows) {
      this.cache.set(row.module, {
        data: row.config,
        version: ++this.globalVersion,
      });
    }
  }

  /** 获取指定模块配置（带默认值回退） */
  get<M extends BusinessModule>(
    module: M,
    defaults: BusinessConfigMap[M]
  ): BusinessConfigMap[M] {
    const cached = this.cache.get(module);
    if (!cached) {
      // 缓存为空，触发懒加载
      void this.refreshModule(module);
      return defaults;
    }
    // 缓存有效，直接返回合并结果
    return { ...defaults, ...cached.data } as BusinessConfigMap[M];
  }

  /** 直接获取原始配置（无默认值） */
  getRaw(module: BusinessModule): Record<string, unknown> | null {
    const cached = this.cache.get(module);
    return cached?.data ?? null;
  }

  /** 懒加载刷新单个模块配置 */
  private async refreshModule(module: BusinessModule): Promise<void> {
    try {
      const config = await this.repository.get(module);
      if (config) {
        this.cache.set(module, {
          data: config,
          version: ++this.globalVersion,
        });
      }
    } catch (e) {
      log.warn({ e, module }, "[BusinessConfig] 刷新模块失败");
    }
  }

  /** 更新指定模块配置（与默认值合并后写入，避免部分字段丢失） */
  async update(
    module: string,
    config: Record<string, unknown>,
    description?: string,
    updatedBy?: string,
  ): Promise<void> {
    // 获取模块默认值作为基础，合并传入的字段（避免只传 enabled 时丢失 minScore 等字段）
    const defaults = getDefaultConfigForModule(module as BusinessModule) as unknown as Record<string, unknown>;
    const merged = { ...defaults, ...this.getRaw(module as BusinessModule) ?? {}, ...config };

    await this.repository.upsert(module, merged, description, updatedBy);
    this.globalVersion++;
    this.cache.set(module, {
      data: merged,
      version: this.globalVersion,
    });
  }

  /** 获取所有模块配置列表 */
  async listAll(): Promise<{ module: string; config: Record<string, unknown>; description: string | null }[]> {
    return this.repository.listAll();
  }
}
