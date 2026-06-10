/**
 * 视频裂变服务
 * 处理裂变视频的数据库操作
 */

import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import type { FissionVideo } from "../../contracts/types.js";
import type { AppContext } from "../../core/app-context.js";
import { getVideoMusicByScript, type GetVideoMusicResult } from "../video-music/video-music-service-atmospheres.js";

/**
 * 视频裂变服务接口
 */
export interface IFissionVideoService {
  listAll(): Promise<FissionVideo[]>;
  getById(id: string): Promise<FissionVideo | null>;
  listByCreator(creatorId: string): Promise<FissionVideo[]>;
  listByProject(projectId: string, includeDeprecated?: boolean): Promise<FissionVideo[]>;
  create(video: FissionVideo): Promise<FissionVideo>;
  update(video: FissionVideo): Promise<FissionVideo>;
  /** 弃用视频（软删除） */
  deprecate(id: string, userId: string): Promise<boolean>;
  getVideoMusicByProjectScript(ctx: AppContext, projectId: string, scriptText: string): Promise<GetVideoMusicResult>;
}

/**
 * 视频裂变服务实现
 */
export class FissionVideoService implements IFissionVideoService {
  private repos: PgRepositoryCollection;

  constructor(repos: PgRepositoryCollection) {
    this.repos = repos;
  }

  /**
   * 获取所有裂变视频
   */
  async listAll(): Promise<FissionVideo[]> {
    return this.repos.fissionVideos.listAllFull();
  }

  /**
   * 根据ID获取裂变视频
   */
  async getById(id: string): Promise<FissionVideo | null> {
    return this.repos.fissionVideos.getFullById(id);
  }

  /**
   * 根据创建者ID获取裂变视频列表
   */
  async listByCreator(creatorId: string): Promise<FissionVideo[]> {
    return this.repos.fissionVideos.listFullByCreator(creatorId);
  }

  /**
   * 根据项目ID获取裂变视频列表
   * @param projectId 项目ID
   * @param includeDeprecated 是否包含已弃用的视频，默认 false
   */
  async listByProject(projectId: string, includeDeprecated: boolean = false): Promise<FissionVideo[]> {
    return this.repos.fissionVideos.listFullByProject(projectId, includeDeprecated);
  }

  /**
   * 创建裂变视频
   */
  async create(video: FissionVideo): Promise<FissionVideo> {
    return this.repos.fissionVideos.createFull(video);
  }

  /**
   * 更新裂变视频
   */
  async update(video: FissionVideo): Promise<FissionVideo> {
    return this.repos.fissionVideos.updateFull(video);
  }

  /**
   * 弃用裂变视频（软删除）
   * 设置 is_deprecated = true，记录弃用时间和操作者
   */
  async deprecate(id: string, userId: string): Promise<boolean> {
    return this.repos.fissionVideos.deprecate(id, userId);
  }

  /**
   * 根据故事脚本获取音乐
   * @param ctx 应用上下文
   * @param projectId 项目ID（预留）
   * @param scriptText 故事脚本
   */
  async getVideoMusicByProjectScript(
    ctx: AppContext,
    _projectId: string,
    scriptText: string,
  ): Promise<GetVideoMusicResult> {
    return getVideoMusicByScript(ctx, scriptText, ctx.pool);
  }
}
