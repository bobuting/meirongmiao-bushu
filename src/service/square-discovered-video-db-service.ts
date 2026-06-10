/**
 * 创作广场发现视频数据库服务
 * 委托 PgSquareDiscoveredVideoRepository 执行数据库操作
 */

import type { PgSquareDiscoveredVideoRepository } from "../repositories/pg/square-discovered-video-pg-repository.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("square-discovered-video-db-service");

/** 发现视频状态（从 repo 重新导出） */
export type DiscoveredVideoStatus = 'pending' | 'classified' | 'approved' | 'reversing' | 'reversed' | 'published' | 'rejected' | 'failed';

/** 发现视频信息（与 repo record 兼容） */
export interface SquareDiscoveredVideo {
  id: string;
  awemeId: string;
  creatorTargetId: string;
  secUid: string;
  videoUrl: string;
  coverUrl: string;
  description: string;
  duration: number;
  likesCount: number;
  commentsCount: number;
  shareCount: number;
  playCount: number;
  publishTime: number;
  category: string;
  classificationResult: string;
  classificationScore: number;
  status: DiscoveredVideoStatus;
  squareTemplateId: string | null;
  reverseScriptText: string;
  reverseError: string;
  createdAt: number;
  updatedAt: number;
}

/** 插入发现视频输入参数（从 repo 重新导出） */
export type InsertDiscoveredVideoInput = {
  awemeId: string;
  creatorTargetId: string;
  secUid: string;
  videoUrl?: string;
  coverUrl?: string;
  description?: string;
  duration?: number;
  likesCount?: number;
  commentsCount?: number;
  shareCount?: number;
  playCount?: number;
  publishTime?: number;
};

/**
 * 创作广场发现视频服务
 * 委托 PgSquareDiscoveredVideoRepository 执行所有数据库操作
 */
export class SquareDiscoveredVideoService {
  constructor(private readonly repo: PgSquareDiscoveredVideoRepository) {}

  /**
   * 分页查询发现视频列表（Admin 管理用）
   * 关联达人表获取昵称
   */
  async listPaginated(opts: {
    page: number;
    pageSize: number;
    status?: string;
  }): Promise<{ data: (SquareDiscoveredVideo & { creatorNickname: string | null })[]; total: number }> {
    return this.repo.listPaginatedWithCreatorNickname(opts);
  }

  /** 根据 awemeId 查找发现视频 */
  async findByAwemeId(awemeId: string): Promise<SquareDiscoveredVideo | null> {
    return this.repo.findByAwemeId(awemeId);
  }

  /** 批量检查 awemeId 是否已存在 */
  async batchCheckAwemeIds(awemeIds: string[]): Promise<Set<string>> {
    return this.repo.batchCheckAwemeIds(awemeIds);
  }

  /** 插入新的发现视频 */
  async insert(input: InsertDiscoveredVideoInput): Promise<SquareDiscoveredVideo> {
    const result = await this.repo.insert(input);
    log.info({ id: result.id, awemeId: input.awemeId, creatorTargetId: input.creatorTargetId }, "Inserted discovered video");
    return result;
  }

  /** 根据状态列出发现视频，按创建时间升序 */
  async listByStatus(status: DiscoveredVideoStatus, limit: number): Promise<SquareDiscoveredVideo[]> {
    return this.repo.listByStatus(status, limit);
  }

  /** 按达人分散 + 互动量加权选择候选视频 */
  async listByStatusDistributed(status: DiscoveredVideoStatus, limit: number): Promise<SquareDiscoveredVideo[]> {
    return this.repo.listByStatusDistributed(status, limit);
  }

  /** 更新视频状态，支持额外字段 */
  async updateStatus(id: string, status: DiscoveredVideoStatus, extra?: Record<string, unknown>): Promise<void> {
    await this.repo.updateStatus(id, status, extra);
    log.info({ id, status }, "Updated video status");
  }

  /** 更新视频的封面和播放地址 */
  async updateUrls(id: string, coverUrl: string, videoUrl: string): Promise<void> {
    await this.repo.updateUrls(id, coverUrl, videoUrl);
    log.info({ id, hasCover: !!coverUrl, hasVideo: !!videoUrl }, "Updated video URLs");
  }

  /** 更新分类结果 */
  async updateClassification(id: string, category: string, score: number, result: string, newStatus: DiscoveredVideoStatus): Promise<void> {
    await this.repo.updateClassification(id, category, score, result, newStatus);
    log.info({ id, category, status: newStatus }, "Updated video classification");
  }

  /** 更新逆向结果（清理 markdown 包裹，返回清理后的文本） */
  async updateReverseResult(id: string, scriptText: string, newStatus: DiscoveredVideoStatus): Promise<string> {
    const cleanText = await this.repo.updateReverseResult(id, scriptText, newStatus);
    log.info({ id, status: newStatus }, "Updated video reverse result");
    return cleanText;
  }

  /** 标记为已发布 */
  async markPublished(id: string, templateId: string): Promise<void> {
    await this.repo.markPublished(id, templateId);
    log.info({ id, templateId }, "Marked video as published");
  }

  /** 标记为失败 */
  async markFailed(id: string, error: string): Promise<void> {
    await this.repo.markFailed(id, error);
    log.error({ id, error }, "Marked video as failed");
  }
}
