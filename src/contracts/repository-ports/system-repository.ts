/**
 * 系统仓库端口（配置、死信、背景音乐）
 */

import type { AppConfig, DeadLetter, VideoMusic } from "../types.js";

/** 系统配置仓库端口 */
export interface IConfigRepository {
  get(): Promise<AppConfig | null>;
  upsert(config: AppConfig): Promise<void>;
}

/** 死信仓库端口 */
export interface IDeadLetterRepository {
  findById(id: string): Promise<DeadLetter | null>;
  findByResourceId(resourceId: string): Promise<DeadLetter[]>;
  list(): Promise<DeadLetter[]>;
  upsert(deadLetter: DeadLetter): Promise<void>;
  delete(id: string): Promise<void>;
}

/** 背景音乐仓库端口 */
export interface IVideoMusicRepository {
  findById(id: string): Promise<VideoMusic | null>;
  list(): Promise<VideoMusic[]>;
  upsert(music: VideoMusic): Promise<void>;
  delete(id: string): Promise<void>;
}

/** 业务模块配置仓库端口 */
export interface IBusinessConfigRepository {
  /** 获取指定模块配置 */
  get(module: string): Promise<Record<string, unknown> | null>;
  /** 创建或更新模块配置 */
  upsert(module: string, config: Record<string, unknown>, description?: string, updatedBy?: string): Promise<void>;
  /** 获取所有模块配置 */
  listAll(): Promise<{ module: string; config: Record<string, unknown>; description: string | null }[]>;
  /** 删除模块配置 */
  delete(module: string): Promise<boolean>;
}