/**
 * 创作广场创作者目标数据库服务
 * 委托 PgSquareCreatorTargetRepository 执行数据库操作
 */

import type { PgSquareCreatorTargetRepository } from "../repositories/pg/square-creator-target-pg-repository.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("square-creator-target-db-service");

/** 创作者内容类型（从 repo 重新导出） */
export type CreatorContentType = 'aesthetic' | 'fashion_film' | 'scene';

/** 创作者来源（从 repo 重新导出） */
export type CreatorSource = 'discovery' | 'manual';

/** 创作者目标信息（与 repo record 兼容） */
export interface SquareCreatorTarget {
  id: string;
  secUid: string;
  nickname: string;
  avatarUrl: string;
  fansCount: number;
  contentType: CreatorContentType;
  enabled: boolean;
  confidenceScore: number;
  source: CreatorSource;
  discoveryKeywords: string;
  llmEvaluation: string;
  lastSyncedAt: number;
  syncIntervalHours: number;
  videoCount: number;
  createdAt: number;
  updatedAt: number;
}

/** 创建/更新创作者目标输入参数 */
export type UpsertCreatorTargetInput = {
  secUid: string;
  nickname: string;
  avatarUrl?: string;
  fansCount?: number;
  contentType: CreatorContentType;
  confidenceScore?: number;
  source?: CreatorSource;
  discoveryKeywords?: string;
  llmEvaluation?: string;
};

/**
 * 创作广场创作者目标服务
 * 委托 PgSquareCreatorTargetRepository 执行所有数据库操作
 */
export class SquareCreatorTargetService {
  constructor(private readonly repo: PgSquareCreatorTargetRepository) {}

  /** 根据 secUid 查找创作者目标 */
  async findBySecUid(secUid: string): Promise<SquareCreatorTarget | null> {
    return this.repo.findBySecUid(secUid);
  }

  /** 分页查询达人列表（Admin 管理用） */
  async listPaginated(opts: {
    page: number;
    pageSize: number;
    contentType?: string;
    enabled?: boolean;
    source?: string;
  }): Promise<{ data: SquareCreatorTarget[]; total: number }> {
    return this.repo.listPaginated(opts);
  }

  /** 获取到期需要同步的达人列表 */
  async listDueForSync(limit: number): Promise<SquareCreatorTarget[]> {
    return this.repo.listDueForSync(limit);
  }

  /** 创建或更新创作者目标（upsert） */
  async upsert(input: UpsertCreatorTargetInput): Promise<SquareCreatorTarget> {
    return this.repo.upsertCreator(input);
  }

  /** 更新最后同步时间 */
  async updateLastSynced(id: string): Promise<void> {
    await this.repo.updateLastSynced(id);
  }

  /** 禁用创作者目标 */
  async disable(id: string): Promise<void> {
    await this.repo.disable(id);
    log.info({ id }, "Disabled creator target");
  }

  /** 增加视频计数 */
  async incrementVideoCount(id: string): Promise<void> {
    await this.repo.incrementVideoCount(id);
  }
}
