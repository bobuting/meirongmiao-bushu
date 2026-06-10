/**
 * 项目-视频音乐关联仓库端口
 */

import type { ProjectVideoMusic } from "../types.js";

/** 批量保存输入 */
export interface BatchSaveProjectVideoMusicInput {
  musicId: string;
  musicUrl: string;
  volume?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  /** 音乐标题 */
  title?: string | null;
  /** 氛围标签数组 */
  atmospheres?: string[];
  /** 艺术家 */
  artist?: string | null;
  /** 时长（秒） */
  durationSec?: number | null;
  /** 封面图URL */
  coverUrl?: string | null;
}

/** 更新参数 */
export interface ProjectVideoMusicUpdatePatch {
  volume?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}

/** 项目-视频音乐关联仓库端口 */
export interface IProjectVideoMusicRepository {
  /** 根据项目ID获取所有关联记录 */
  listByProject(projectId: string): Promise<ProjectVideoMusic[]>;

  /** 获取项目选中的音乐（is_selected=true） */
  getSelected(projectId: string): Promise<ProjectVideoMusic | null>;

  /** 根据ID获取单条记录 */
  findById(id: string): Promise<ProjectVideoMusic | null>;

  /** 批量保存（覆盖旧数据） */
  batchSave(
    projectId: string,
    musics: BatchSaveProjectVideoMusicInput[],
    selectedMusicId?: string | null,
  ): Promise<ProjectVideoMusic[]>;

  /** 选择音乐（设置 is_selected=true，其他设为 false） */
  select(projectId: string, id: string): Promise<ProjectVideoMusic>;

  /** 清空选择（所有 is_selected 设为 false） */
  clearSelection(projectId: string): Promise<void>;

  /** 更新音乐参数 */
  update(id: string, patch: ProjectVideoMusicUpdatePatch): Promise<ProjectVideoMusic>;

  /** 删除记录 */
  delete(id: string): Promise<void>;

  /** 删除项目所有记录 */
  deleteByProjectId(projectId: string): Promise<void>;
}