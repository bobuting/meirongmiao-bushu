/**
 * Skills 提示词管理系统 - 缓存层
 *
 * 提供 Skill 加载缓存，减少文件系统 I/O
 */

import type { Skill } from './skill-types.js';
import { getLogger } from "../../core/logger/index.js";

const log = getLogger("skill-cache");

/**
 * 缓存项
 */
interface CacheEntry {
  skill: Skill;
  loadedAt: number;
  accessCount: number;
  lastAccessAt: number;
}

/**
 * 缓存统计
 */
export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  totalAccess: number;
}

/**
 * Skill 缓存管理器
 */
export class SkillCache {
  private cache = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds

  constructor(options: { maxSize?: number; ttl?: number } = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.ttl = options.ttl ?? 5 * 60 * 1000; // 默认 5 分钟
  }

  /**
   * 获取缓存的 Skill
   */
  get(code: string): Skill | undefined {
    const entry = this.cache.get(code);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // 检查是否过期
    const now = Date.now();
    if (now - entry.loadedAt > this.ttl) {
      this.cache.delete(code);
      this.misses++;
      return undefined;
    }

    // 更新访问统计
    entry.accessCount++;
    entry.lastAccessAt = now;
    this.hits++;

    return entry.skill;
  }

  /**
   * 设置缓存
   */
  set(code: string, skill: Skill): void {
    // 如果缓存已满，移除最少使用的项
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(code, {
      skill,
      loadedAt: now,
      accessCount: 1,
      lastAccessAt: now
    });
  }

  /**
   * 删除缓存项
   */
  delete(code: string): boolean {
    return this.cache.delete(code);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    const totalAccess = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: totalAccess > 0 ? this.hits / totalAccess : 0,
      totalAccess
    };
  }

  /**
   * 移除最少使用的缓存项（LRU）
   */
  private evictLRU(): void {
    let lruCode: string | undefined;
    let lruAccessCount = Infinity;
    let lruLastAccessAt = Infinity;

    for (const [code, entry] of this.cache.entries()) {
      // 优先移除访问次数少的
      if (entry.accessCount < lruAccessCount) {
        lruCode = code;
        lruAccessCount = entry.accessCount;
        lruLastAccessAt = entry.lastAccessAt;
      } else if (entry.accessCount === lruAccessCount && entry.lastAccessAt < lruLastAccessAt) {
        // 访问次数相同时，移除最久未访问的
        lruCode = code;
        lruLastAccessAt = entry.lastAccessAt;
      }
    }

    if (lruCode) {
      this.cache.delete(lruCode);
    }
  }

  /**
   * 预热缓存（批量加载常用 Skills）
   */
  async warmup(loader: { load: (code: string) => Promise<Skill> }, codes: string[]): Promise<void> {
    const promises = codes.map(async (code) => {
      try {
        const skill = await loader.load(code);
        this.set(code, skill);
      } catch (error) {
        log.warn({ skillCode: code, error }, "Failed to warmup skill");
      }
    });

    await Promise.all(promises);
  }
}
