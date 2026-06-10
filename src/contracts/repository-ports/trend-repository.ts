/**
 * 热榜仓库端口
 */

import type { TrendEntry, TrendSyncJob } from "../types.js";

/** 热榜条目仓库端口 */
export interface ITrendEntryRepository {
  findById(id: string): Promise<TrendEntry | null>;
  list(): Promise<TrendEntry[]>;
  upsert(entry: TrendEntry): Promise<void>;
  delete(id: string): Promise<void>;
}

/** 热榜同步任务仓库端口 */
export interface ITrendSyncJobRepository {
  findById(id: string): Promise<TrendSyncJob | null>;
  list(): Promise<TrendSyncJob[]>;
  upsert(job: TrendSyncJob): Promise<void>;
  delete(id: string): Promise<void>;
}