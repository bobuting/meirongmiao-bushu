/**
 * AppConfig 缓存服务
 * 提供同步读取 + 异步写入的配置访问
 */

import type { AppConfig } from "../../contracts/types.js";
import type { IConfigRepository } from "../../contracts/repository-ports/system-repository.js";

export class AppConfigService {
  private cache: AppConfig;
  private configRepo: IConfigRepository | null = null;

  constructor(initialConfig: AppConfig) {
    this.cache = { ...initialConfig };
  }

  /** 设置配置仓库（用于持久化），并从数据库加载已保存的配置 */
  async setRepository(repo: IConfigRepository): Promise<void> {
    this.configRepo = repo;
    // 从数据库加载已保存的配置，合并到缓存
    const savedConfig = await repo.get();
    if (savedConfig) {
      this.cache = { ...this.cache, ...savedConfig };
    }
  }

  /** 同步读取（从缓存） */
  get(): Readonly<AppConfig> {
    return this.cache;
  }

  /** 异步写入（更新缓存并持久化到数据库） */
  async update(patch: Partial<AppConfig>): Promise<void> {
    this.cache = { ...this.cache, ...patch };
    // 持久化到数据库
    if (this.configRepo) {
      await this.configRepo.upsert(this.cache);
    }
  }
}