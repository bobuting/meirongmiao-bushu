/**
 * 裂变故事分镜服务
 * 处理裂变故事分镜的数据库操作
 * 使用传统字段模式
 */

import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import type { PgFissionStoryboardRepository, FissionStoryboardRecord } from "../../repositories/pg/fission-storyboard-pg-repository.js";
import type { FissionStoryboard, FissionStoryboardPayload } from "../../contracts/types.js";

/**
 * 裂变故事分镜服务接口
 */
export interface IFissionStoryboardService {
  listAll(): Promise<FissionStoryboard[]>;
  getById(id: string): Promise<FissionStoryboard | null>;
  getByProjectId(projectId: string): Promise<FissionStoryboard | null>;
  listByCreator(creatorId: string): Promise<FissionStoryboard[]>;
  existsByProjectId(projectId: string): Promise<boolean>;
  create(storyboard: FissionStoryboard): Promise<FissionStoryboard>;
  update(storyboard: FissionStoryboard): Promise<FissionStoryboard>;
  delete(id: string): Promise<boolean>;
}

/**
 * 裂变故事分镜服务实现
 */
export class FissionStoryboardService implements IFissionStoryboardService {
  private repo: PgFissionStoryboardRepository;

  constructor(repos: PgRepositoryCollection) {
    this.repo = repos.fissionStoryboards;
  }

  private recordToFissionStoryboard(record: FissionStoryboardRecord): FissionStoryboard {
    // 从传统字段重建 payload
    const payload: FissionStoryboardPayload = {
      characterInfo: {
        name: record.characterName ?? undefined,
        description: record.characterDescription ?? undefined,
        avatar: record.characterAvatar ?? undefined,
      },
      oldStory: record.oldStory ?? "",
      newStory: record.newStory ?? "",
      storyboardImages: record.storyboardImages ?? [],
      storyboardVideos: record.storyboardVideos ?? [],
    };

    return {
      id: record.id,
      projectId: record.projectId,
      creatorId: record.creatorId,
      fissionType: record.fissionType as FissionStoryboard["fissionType"],
      payload,
      status: record.status as FissionStoryboard["status"],
      errorMessage: record.errorMessage,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private storyboardToRecord(storyboard: FissionStoryboard): FissionStoryboardRecord {
    const p = storyboard.payload;
    return {
      id: storyboard.id,
      projectId: storyboard.projectId,
      creatorId: storyboard.creatorId,
      fissionType: storyboard.fissionType,
      characterName: p.characterInfo?.name ?? null,
      characterDescription: p.characterInfo?.description ?? null,
      characterAvatar: p.characterInfo?.avatar ?? null,
      oldStory: p.oldStory ?? null,
      newStory: p.newStory ?? null,
      storyboardImages: p.storyboardImages ?? [],
      storyboardVideos: p.storyboardVideos ?? [],
      status: storyboard.status,
      errorMessage: storyboard.errorMessage,
      createdAt: storyboard.createdAt,
      updatedAt: storyboard.updatedAt,
    };
  }

  async listAll(): Promise<FissionStoryboard[]> {
    const records = await this.repo.listAll();
    return records.map((r) => this.recordToFissionStoryboard(r));
  }

  async getById(id: string): Promise<FissionStoryboard | null> {
    const record = await this.repo.findById(id);
    if (!record) return null;
    return this.recordToFissionStoryboard(record);
  }

  async getByProjectId(projectId: string): Promise<FissionStoryboard | null> {
    const record = await this.repo.findByProjectId(projectId);
    if (!record) return null;
    return this.recordToFissionStoryboard(record);
  }

  async listByCreator(creatorId: string): Promise<FissionStoryboard[]> {
    const records = await this.repo.listByCreatorId(creatorId);
    return records.map((r) => this.recordToFissionStoryboard(r));
  }

  async existsByProjectId(projectId: string): Promise<boolean> {
    return this.repo.existsByProjectId(projectId);
  }

  async create(storyboard: FissionStoryboard): Promise<FissionStoryboard> {
    const record = this.storyboardToRecord(storyboard);
    await this.repo.createRecord(record);
    return storyboard;
  }

  async update(storyboard: FissionStoryboard): Promise<FissionStoryboard> {
    const record = this.storyboardToRecord(storyboard);
    await this.repo.updateRecord(record);
    return storyboard;
  }

  async delete(id: string): Promise<boolean> {
    return this.repo.deleteById(id);
  }
}
