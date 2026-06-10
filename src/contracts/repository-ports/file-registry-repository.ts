/**
 * 文件注册仓库端口
 */

import type { FileRegistryRecord, FileRegistryFilters, FileStorageStats } from "../file-registry-contract.js";

/** 文件注册仓库接口 */
export interface IFileRegistryRepository {
  /** 根据 ID 查找 */
  findById(id: string): Promise<FileRegistryRecord | null>;

  /** 根据存储路径查找 */
  findByStorageKey(storageKey: string): Promise<FileRegistryRecord | null>;

  /** 根据 SHA256 查找 */
  findBySha256(sha256: string, driver: string): Promise<FileRegistryRecord | null>;

  /** 插入记录 */
  insert(record: FileRegistryRecord): Promise<void>;

  /** 更新记录 */
  update(record: FileRegistryRecord): Promise<void>;

  /** Upsert（按 SHA256 + driver 唯一约束，返回记录） */
  upsertReturning(record: FileRegistryRecord): Promise<FileRegistryRecord>;

  /** 增加引用计数 */
  incrementRefCount(id: string): Promise<void>;

  /** 减少引用计数 */
  decrementRefCount(id: string): Promise<number>;

  /** 查询零引用文件 */
  findZeroRefFiles(options: {
    olderThanDays?: number;
    businessDomain?: string;
    limit?: number;
  }): Promise<FileRegistryRecord[]>;

  /** 分页查询 */
  findByFilters(filters: FileRegistryFilters): Promise<{ items: FileRegistryRecord[]; total: number }>;

  /** 删除零引用记录（仅允许删除零引用文件，返回是否删除成功） */
  deleteIfUnreferenced(id: string): Promise<boolean>;

  /** 获取存储统计 */
  getStorageStats(): Promise<FileStorageStats>;

  /** 按 ID 批量查询 */
  findByIds(ids: string[]): Promise<FileRegistryRecord[]>;
}