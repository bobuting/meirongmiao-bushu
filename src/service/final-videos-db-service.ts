/**
 * 成片服务
 * 管理 Step4 成片和裂变成片的 CRUD 操作
 *
 * 薄封装层：委托给 PgFinalVideoRepository。
 * 保留公共 API 不变，最小化调用方改动。
 */

import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import type {
  FinalVideoRecord,
  FinalVideoType,
  CreateFinalVideoParams,
} from "../repositories/pg/final-video-pg-repository.js";

// 重新导出类型，保持调用方 import 路径兼容
export type { FinalVideoType, CreateFinalVideoParams, FinalVideoRecord };

/**
 * 成片数据库服务
 */
export class FinalVideosDbService {
  constructor(private repos: PgRepositoryCollection) {}

  /** 创建成片记录 */
  async create(params: CreateFinalVideoParams): Promise<FinalVideoRecord> {
    return this.repos.finalVideos.create(params);
  }

  /** 按项目ID查询所有成片 */
  async findByProjectId(projectId: string, limit?: number): Promise<FinalVideoRecord[]> {
    return this.repos.finalVideos.findByProjectId(projectId, limit);
  }

  /** 按项目ID和类型查询成片 */
  async findByProjectIdAndType(projectId: string, videoType: string): Promise<FinalVideoRecord[]> {
    return this.repos.finalVideos.findByProjectIdAndType(projectId, videoType as import("../repositories/pg/final-video-pg-repository.js").FinalVideoType);
  }

  /** 按ID查询成片 */
  async findById(id: string): Promise<FinalVideoRecord | null> {
    return this.repos.finalVideos.findById(id);
  }

  /** 获取项目最新的 Step4 成片 */
  async findLatestStep4Video(projectId: string): Promise<FinalVideoRecord | null> {
    return this.repos.finalVideos.findLatestStep4Video(projectId);
  }

  /** 软删除成片 */
  async softDelete(id: string): Promise<void> {
    return this.repos.finalVideos.softDelete(id);
  }

  /** 按项目ID软删除所有成片 */
  async softDeleteByProjectId(projectId: string): Promise<void> {
    return this.repos.finalVideos.softDeleteByProjectId(projectId);
  }
}

/**
 * 创建服务实例的工厂函数
 */
let serviceInstance: FinalVideosDbService | null = null;

export function getFinalVideosDbService(repos: PgRepositoryCollection): FinalVideosDbService {
  if (!serviceInstance) {
    serviceInstance = new FinalVideosDbService(repos);
  }
  return serviceInstance;
}
