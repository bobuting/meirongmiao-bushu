/**
 * 服务接口子模块
 * 包含 FissionVideoStatusService 等服务接口定义和实现
 */

import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import {
  FissionStatus,
  FissionStoryboardSourceType,
  type FissionVideoStatusRecord,
  type CreateFissionVideoStatusInput,
  type UpdateFissionVideoStatusInput,
  type UpdateProgressInput,
  type NewStoryJson,
} from "../modules/fission-video/fission-video-config.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("services-sub");

/**
 * 裂变视频状态服务接口
 */
export interface IFissionVideoStatusService {
  listAll(): Promise<FissionVideoStatusRecord[]>;
  getById(id: string): Promise<FissionVideoStatusRecord | null>;
  listByProject(projectId: string): Promise<FissionVideoStatusRecord[]>;
  listByCreator(creatorId: string): Promise<FissionVideoStatusRecord[]>;
  create(input: CreateFissionVideoStatusInput, creatorId: string): Promise<FissionVideoStatusRecord>;
  update(id: string, input: UpdateFissionVideoStatusInput): Promise<FissionVideoStatusRecord>;
  delete(id: string): Promise<boolean>;
  updateProgress(id: string, input: UpdateProgressInput): Promise<FissionVideoStatusRecord>;
  updateAtmospheres(id: string, atmospheres: string[]): Promise<FissionVideoStatusRecord>;
  /** 更新新故事JSON数据（旧数据兼容） */
  updateNewStoryJson(projectId: string, newStoryJson: NewStoryJson): Promise<FissionVideoStatusRecord>;
  /** 更新新故事脚本ID（存储在 nrm_script_data 表） */
  updateNewStoryScriptId(projectId: string, scriptId: string): Promise<FissionVideoStatusRecord>;
  /** 根据项目ID获取或创建状态记录 */
  getOrCreateByProject(projectId: string, creatorId: string): Promise<FissionVideoStatusRecord>;
  /** 追加错误信息到 error_msg 字段（不替换） */
  appendErrorMsg(projectId: string, errorMsg: string): Promise<FissionVideoStatusRecord>;
  /** 更新异步状态 */
  updateAsyncStatus(
    projectId: string,
    update: {
      newStoryAsyncStatus?: 'pending' | 'processing' | 'completed' | 'failed';
      shotPromptsAsyncStatus?: 'pending' | 'processing' | 'completed' | 'failed';
      asyncFailedStage?: 'new_story' | 'shot_prompts';
      asyncErrorMessage?: string;
    }
  ): Promise<FissionVideoStatusRecord>;
}

/**
 * 裂变视频状态服务实现
 */
export class FissionVideoStatusService implements IFissionVideoStatusService {
  private repos: Pick<PgRepositoryCollection, 'fissionVideoStatus'>;

  constructor(repos: Pick<PgRepositoryCollection, 'fissionVideoStatus'>) {
    this.repos = repos;
  }

  /**
   * 获取所有裂变视频状态记录
   */
  async listAll(): Promise<FissionVideoStatusRecord[]> {
    return this.repos.fissionVideoStatus.listAll();
  }

  /**
   * 根据ID获取裂变视频状态记录
   */
  async getById(id: string): Promise<FissionVideoStatusRecord | null> {
    return this.repos.fissionVideoStatus.getById(id);
  }

  /**
   * 根据项目ID获取裂变视频状态记录列表
   */
  async listByProject(projectId: string): Promise<FissionVideoStatusRecord[]> {
    return this.repos.fissionVideoStatus.listByProject(projectId);
  }

  /**
   * 根据创建者ID获取裂变视频状态记录列表
   */
  async listByCreator(creatorId: string): Promise<FissionVideoStatusRecord[]> {
    return this.repos.fissionVideoStatus.listByCreator(creatorId);
  }

  /**
   * 创建裂变视频状态记录
   */
  async create(input: CreateFissionVideoStatusInput, creatorId: string): Promise<FissionVideoStatusRecord> {
    return this.repos.fissionVideoStatus.createRecord(input, creatorId);
  }

  /**
   * 更新裂变视频状态记录
   */
  async update(id: string, input: UpdateFissionVideoStatusInput): Promise<FissionVideoStatusRecord> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`裂变视频状态记录不存在: ${id}`);
    }

    await this.repos.fissionVideoStatus.updateRecord(id, input);

    const now = Date.now();
    return {
      ...existing,
      fissionCount: input.fissionCount ?? existing.fissionCount,
      completedCount: input.completedCount ?? existing.completedCount,
      status: input.status ?? existing.status,
      consumedCredits: input.consumedCredits ?? existing.consumedCredits,
      imageVideoTotal: input.imageVideoTotal ?? existing.imageVideoTotal,
      imageVideoCompleted: input.imageVideoCompleted ?? existing.imageVideoCompleted,
      imageVideoFailed: input.imageVideoFailed ?? existing.imageVideoFailed,
      newStoryTotal: input.newStoryTotal ?? existing.newStoryTotal,
      newStoryCompleted: input.newStoryCompleted ?? existing.newStoryCompleted,
      newStoryFailed: input.newStoryFailed ?? existing.newStoryFailed,
      updatedAt: now,
    };
  }

  /**
   * 删除裂变视频状态记录
   */
  async delete(id: string): Promise<boolean> {
    return this.repos.fissionVideoStatus.deleteRecord(id);
  }

  /**
   * 更新进度（原子操作）
   */
  async updateProgress(id: string, input: UpdateProgressInput): Promise<FissionVideoStatusRecord> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`裂变视频状态记录不存在: ${id}`);
    }

    await this.repos.fissionVideoStatus.updateProgress(id, input);

    const now = Date.now();
    return {
      ...existing,
      completedCount: (input.completedCountDelta ?? 0) + existing.completedCount,
      consumedCredits: (input.consumedCreditsDelta ?? 0) + existing.consumedCredits,
      status: input.status ?? existing.status,
      updatedAt: now,
    };
  }

  /**
   * 更新氛围字段
   */
  async updateAtmospheres(id: string, atmospheres: string[]): Promise<FissionVideoStatusRecord> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`裂变视频状态记录不存在: ${id}`);
    }

    await this.repos.fissionVideoStatus.updateAtmospheres(id, atmospheres);

    return {
      ...existing,
      atmospheres,
      updatedAt: Date.now(),
    };
  }

  /**
   * 更新新故事JSON数据
   */
  async updateNewStoryJson(projectId: string, newStoryJson: NewStoryJson): Promise<FissionVideoStatusRecord> {
    const existing = await this.listByProject(projectId);
    if (existing.length === 0) {
      throw new Error(`裂变视频状态记录不存在，项目ID: ${projectId}`);
    }

    const record = existing[0];
    await this.repos.fissionVideoStatus.updateNewStoryJson(record.id, newStoryJson);

    return {
      ...record,
      newStoryJson,
      updatedAt: Date.now(),
    };
  }

  /**
   * 更新新故事脚本ID
   */
  async updateNewStoryScriptId(projectId: string, scriptId: string): Promise<FissionVideoStatusRecord> {
    const existing = await this.listByProject(projectId);
    if (existing.length === 0) {
      throw new Error(`裂变视频状态记录不存在，项目ID: ${projectId}`);
    }

    const record = existing[0];
    await this.repos.fissionVideoStatus.updateNewStoryScriptId(record.id, scriptId);

    return {
      ...record,
      newStoryScriptId: scriptId,
      updatedAt: Date.now(),
    };
  }

  /**
   * 根据项目ID获取或创建状态记录
   */
  async getOrCreateByProject(projectId: string, creatorId: string): Promise<FissionVideoStatusRecord> {
    const existing = await this.listByProject(projectId);
    if (existing.length > 0) {
      return existing[0];
    }
    return this.create({ projectId }, creatorId);
  }

  /**
   * 追加错误信息到 error_msg 字段（不替换已有内容）
   */
  async appendErrorMsg(projectId: string, errorMsg: string): Promise<FissionVideoStatusRecord> {
    const existing = await this.listByProject(projectId);
    if (existing.length === 0) {
      throw new Error(`裂变视频状态记录不存在，项目ID: ${projectId}`);
    }

    const record = existing[0];
    await this.repos.fissionVideoStatus.appendErrorMsg(record.id, errorMsg);

    const timestamp = new Date().toISOString();
    const newEntry = `[${timestamp}] ${errorMsg}`;
    const updatedErrorMsg = record.errorMsg
      ? `${record.errorMsg}\n${newEntry}`
      : newEntry;

    return {
      ...record,
      errorMsg: updatedErrorMsg,
      updatedAt: Date.now(),
    };
  }

  /**
   * 更新异步状态字段
   */
  async updateAsyncStatus(
    projectId: string,
    update: {
      newStoryAsyncStatus?: 'pending' | 'processing' | 'completed' | 'failed';
      shotPromptsAsyncStatus?: 'pending' | 'processing' | 'completed' | 'failed';
      asyncFailedStage?: 'new_story' | 'shot_prompts' | null;
      asyncErrorMessage?: string | null;
    }
  ): Promise<FissionVideoStatusRecord> {
    const existing = await this.listByProject(projectId);
    if (existing.length === 0) {
      throw new Error(`裂变视频状态记录不存在，项目ID: ${projectId}`);
    }

    const record = existing[0];
    await this.repos.fissionVideoStatus.updateAsyncStatus(record.id, update);

    return {
      ...record,
      newStoryAsyncStatus: update.newStoryAsyncStatus ?? record.newStoryAsyncStatus,
      shotPromptsAsyncStatus: update.shotPromptsAsyncStatus ?? record.shotPromptsAsyncStatus,
      asyncFailedStage: update.asyncFailedStage ?? record.asyncFailedStage,
      asyncErrorMessage: update.asyncErrorMessage ?? record.asyncErrorMessage,
      updatedAt: Date.now(),
    };
  }
}

// 重新导出类型供外部使用
export type {
  FissionVideoStatusRecord,
  CreateFissionVideoStatusInput,
  UpdateFissionVideoStatusInput,
  UpdateProgressInput,
} from "../modules/fission-video/fission-video-config.js";

/**
 * 分镜组合类型枚举
 */
export type FissionStoryboardCombinationType = '原始分镜' | '图生视频' | '新故事分镜' | '裂变组合';

/**
 * 获取分镜组合的配置选项
 */
interface GetCombinationsOptions {
  /** 目标每组分镜数，默认 3 */
  targetGroupSize?: number;
}

/**
 * 分镜组合返回结果
 */
export interface FissionStoryboardCombination {
  /** 分镜列表 */
  storyboardList: StoryboardItem[];
  /** 组合id = storyboardFlag拼接 */
  combinationId: string;
  /** 组合类型：原始分镜/图生视频/新故事 */
  combinationType: FissionStoryboardCombinationType;
  /** 背景音乐列表（匹配到的） */
  backgroundMusics?: VideoMusicInfo[];
}

/**
 * 分镜项（组合中的单个分镜）
 * 替代废弃的 FissionStoryboardSubRecord
 */
export interface StoryboardItem {
  id: string;
  storyboardUrl: string;
  storyboardPath: string;
  storyboardFlag: string;
  storyboardSource: FissionStoryboardSourceType;
  projectId: string;
  fissionId: string;
  creatorId: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 背景音乐信息
 */
export interface VideoMusicInfo {
  id: string;
  title: string;
  musicUrl: string;
  atmospheres: string[];
  duration: number | null;
}

/**
 * 分镜子表服务接口
 */
export interface IFissionStoryboardSubService {
  /**
   * 获取分镜组合列表
   */
  getCombinations(
    projectId: string,
    fissionCount: number,
    options?: GetCombinationsOptions
  ): Promise<FissionStoryboardCombination[]>;
  /**
   * 获取项目的氛围列表
   */
  getAtmospheres(projectId: string): Promise<string[]>;
  /**
   * 根据氛围获取匹配的背景音乐
   */
  getMatchedMusics(atmospheres: string[]): Promise<VideoMusicInfo[]>;
}

/**
 * 分镜子表服务实现
 */
export class FissionStoryboardSubService implements IFissionStoryboardSubService {
  private repos: Pick<PgRepositoryCollection,
    | 'fissionVideoStatus'
    | 'fissionTaskItems'
    | 'step4VideoScenes'
    | 'fissionVideos'
    | 'scriptData'
    | 'videoMusics'
  >;

  constructor(repos: Pick<PgRepositoryCollection,
    | 'fissionVideoStatus'
    | 'fissionTaskItems'
    | 'step4VideoScenes'
    | 'fissionVideos'
    | 'scriptData'
    | 'videoMusics'
  >) {
    this.repos = repos;
  }

  /**
   * Fisher-Yates 洗牌算法：随机打乱数组顺序
   */
  private shuffleArray<T>(arr: T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * 获取分镜组合列表
   */
  async getCombinations(
    projectId: string,
    fissionCount: number,
    _options?: GetCombinationsOptions
  ): Promise<FissionStoryboardCombination[]> {
    // 1. 获取 fissionVideoStatusId
    const fissionVideoStatusId = await this.repos.fissionVideoStatus.findIdByProject(projectId);
    if (!fissionVideoStatusId) return [];

    // 2. A组：原始分镜视频
    const aRows = await this.repos.step4VideoScenes.findCompletedClipUrls(projectId);
    const aItems = aRows.map(r => ({ index: r.sceneIndex, url: r.clipUrl }));

    // 3. B组：图生视频
    const bRows = await this.repos.fissionTaskItems.findCompletedVideoUrls(fissionVideoStatusId, 'image_video');
    const bItems = bRows.map(r => ({ index: r.itemIndex, url: r.videoUrl }));

    // 4. C组：新故事视频
    const cRows = await this.repos.fissionTaskItems.findCompletedVideoUrls(fissionVideoStatusId, 'new_story');
    const cItems = cRows.map(r => ({ index: r.itemIndex, url: r.videoUrl }));

    // 检查素材是否为空
    if (aItems.length === 0 && bItems.length === 0 && cItems.length === 0) return [];

    // 5. 获取背景音乐
    const matchedMusics = await this.getMatchedMusicsByScript(projectId);
    const shuffledMusics = matchedMusics.length > 0 ? this.shuffleArray([...matchedMusics]) : [];
    let musicIndex = 0;

    // 7. 已使用的 combinationId
    const usedCombinationIds = new Set<string>();
    const activeStoryboardIds = await this.repos.fissionVideos.listActiveStoryboardIds(projectId);
    for (const id of activeStoryboardIds) {
      usedCombinationIds.add(id);
    }

    const combinations: FissionStoryboardCombination[] = [];
    const maxAttempts = fissionCount * 5;
    let attempts = 0;

    const targetCount = fissionCount;

    // 8. 生成组合
    while (combinations.length < targetCount && attempts < maxAttempts) {
      attempts++;

      const minCount = aItems.length;
      const maxCount = aItems.length + cItems.length;
      const totalCount = Math.floor(minCount + Math.random() * (maxCount - minCount + 1));

      const rand1 = Math.random();
      const rand2 = Math.random();
      const rand3 = Math.random();
      const randSum = rand1 + rand2 + rand3;
      let cCount = Math.round(totalCount * rand1 / randSum);
      let bCount = Math.round(totalCount * rand2 / randSum);
      let aCount = totalCount - cCount - bCount;

      cCount = Math.max(0, cCount);
      bCount = Math.max(0, bCount);
      aCount = Math.max(0, aCount);

      if (cCount + bCount + aCount > totalCount) {
        aCount = totalCount - cCount - bCount;
      }

      const shuffledC = this.shuffleArray([...cItems]);
      const selectedC = shuffledC.slice(0, cCount);

      const shuffledB = this.shuffleArray([...bItems]);
      const selectedB = shuffledB.slice(0, bCount);
      const bPositions = new Set(selectedB.map(item => item.index));

      const availableA = aItems.filter(item => !bPositions.has(item.index));
      const shuffledA = this.shuffleArray(availableA);
      const selectedA = shuffledA.slice(0, aCount);

      // 如果某个池素材不足，从其他池补充
      const actualCount = selectedC.length + selectedB.length + selectedA.length;
      if (actualCount < totalCount && actualCount > 0) {
        const remaining = totalCount - actualCount;
        const remainingC = shuffledC.slice(cCount, cCount + remaining);
        if (remainingC.length > 0) {
          selectedC.push(...remainingC.slice(0, remaining));
        } else {
          const remainingB = shuffledB.slice(bCount, bCount + remaining);
          if (remainingB.length > 0) {
            const existingAPositions = new Set(selectedA.map(item => item.index));
            for (const item of remainingB) {
              if (!existingAPositions.has(item.index) && selectedB.length < bCount + remaining) {
                selectedB.push(item);
              }
            }
          }
        }
      }

      const selected: Array<{ storyboardUrl: string; storyboardFlag: string; source: string }> = [];
      for (const item of selectedC) {
        selected.push({
          storyboardUrl: item.url,
          storyboardFlag: `new_story-${item.index}`,
          source: 'new_story',
        });
      }
      for (const item of selectedB) {
        selected.push({
          storyboardUrl: item.url,
          storyboardFlag: `image_video-${item.index}`,
          source: 'image_video',
        });
      }
      for (const item of selectedA) {
        selected.push({
          storyboardUrl: item.url,
          storyboardFlag: `original-${item.index}`,
          source: 'original',
        });
      }

      if (selected.length === 0) continue;

      const shuffledSelected = this.shuffleArray(selected);

      const combinationId = shuffledSelected.map(s => s.storyboardFlag).join('-');
      if (usedCombinationIds.has(combinationId)) continue;
      usedCombinationIds.add(combinationId);

      const music = shuffledMusics.length > 0
        ? [shuffledMusics[musicIndex++ % shuffledMusics.length]]
        : undefined;

      combinations.push({
        storyboardList: shuffledSelected.map(s => ({
          id: s.storyboardFlag,
          storyboardUrl: s.storyboardUrl,
          storyboardPath: '',
          storyboardFlag: s.storyboardFlag,
          storyboardSource: s.source as FissionStoryboardSourceType,
          projectId,
          fissionId: fissionVideoStatusId,
          creatorId: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })),
        combinationId,
        combinationType: '裂变组合',
        backgroundMusics: music,
      });
    }

    return combinations;
  }

  /**
   * 根据脚本情绪获取背景音乐（替代 atmosphere 关键词分析）
   */
  private async getMatchedMusicsByScript(projectId: string): Promise<VideoMusicInfo[]> {
    try {
      const emotion = await this.repos.scriptData.findPrimaryEmotionByProject(projectId);
      if (emotion) {
        return this.getMatchedMusics([emotion]);
      }
    } catch {
      // 查询失败，回退到默认
    }
    return this.getMatchedMusics([]);
  }

  /**
   * 获取项目的氛围列表
   */
  async getAtmospheres(projectId: string): Promise<string[]> {
    return this.repos.fissionVideoStatus.getAtmospheres(projectId);
  }

  /**
   * 根据氛围获取匹配的背景音乐
   */
  async getMatchedMusics(atmospheres: string[]): Promise<VideoMusicInfo[]> {
    if (atmospheres.length === 0) {
      return this.getSunshineMusics();
    }

    try {
      const rows = await this.repos.videoMusics.findByAtmospheres(atmospheres);

      if (rows.length === 0) {
        return this.getSunshineMusics();
      }

      const shuffled = this.shuffleArray(rows);
      return shuffled.map(row => ({
        id: row.id,
        title: row.title,
        musicUrl: row.musicUrl,
        atmospheres: row.atmospheres,
        duration: row.durationSec,
      }));
    } catch (error) {
      log.error({ error }, '[getMatchedMusics] 查询失败');
      return this.getSunshineMusics();
    }
  }

  /**
   * 获取阳光类型的背景音乐
   */
  private async getSunshineMusics(): Promise<VideoMusicInfo[]> {
    try {
      const rows = await this.repos.videoMusics.findSunshineMusics();
      const shuffled = this.shuffleArray(rows);
      return shuffled.map(row => ({
        id: row.id,
        title: row.title,
        musicUrl: row.musicUrl,
        atmospheres: row.atmospheres,
        duration: row.durationSec,
      }));
    } catch (error) {
      log.error({ error }, '[getSunshineMusics] 查询失败');
      return [];
    }
  }
}

// ========== 导出裂变任务项服务 ==========
export {
  createFissionTaskItemsService,
  type IFissionTaskItemsService,
  type TaskProgress,
  type TaskProgressDetail,
  type StoryboardItemProgress,
  type ResetFailedItemsResult,
} from "../modules/fission-video/fission-task-items-service.js";

export {
  type FissionTaskItemRecord,
  type FissionTaskType,
  type FissionItemStatus,
  type BatchCreateResult,
  type CreateFissionTaskItemInput,
  type UpdateImageStatusInput,
  type UpdateVideoStatusInput,
} from "../repositories/pg/fission-task-item-pg-repository.js";
