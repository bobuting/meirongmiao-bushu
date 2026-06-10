/**
 * 裂变任务分镜项 Service
 * 封装分镜任务项的业务逻辑，自动同步主表计数器
 */

import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import {
  PgFissionTaskItemRepository,
  type FissionTaskItemRecord,
  type FissionTaskType,
  type FissionItemStatus,
  type BatchCreateResult,
} from "../../repositories/pg/fission-task-item-pg-repository.js";
import { FissionVideoStatusService } from "../../service/services-sub.js";
import type { BusinessConfigService } from "../business-config-service.js";

// ========== 类型定义 ==========

/** 任务进度统计 */
export interface TaskProgress {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  processing: number;
}

/** 分镜项进度信息 */
export interface StoryboardItemProgress {
  itemIndex: number;
  taskType: FissionTaskType;
  imageStatus: FissionItemStatus;
  videoStatus: FissionItemStatus;
  imageUrl: string | null;
  videoUrl: string | null;
  videoTaskId: string | null; // LLM 视频生成任务ID
  imageErrorMessage: string | null;
  videoErrorMessage: string | null;
}

/** 任务进度详情 */
export interface TaskProgressDetail {
  imageVideo: TaskProgress;
  newStory: TaskProgress;
  items: StoryboardItemProgress[];
}

/** 重试失败项的结果 */
export interface ResetFailedItemsResult {
  resetCount: number;
}

// ========== Service 接口 ==========

export interface IFissionTaskItemsService {
  /** 初始化任务项（批量创建，幂等） */
  initializeTaskItems(
    fissionVideoStatusId: string,
    imageVideoCount: number,
    newStoryCount: number
  ): Promise<{ imageVideo: BatchCreateResult; newStory: BatchCreateResult }>;

  /** 初始化任务项（指定 itemIndex，用于随机位置插入场景） */
  initializeTaskItemsWithIndexes(
    fissionVideoStatusId: string,
    imageVideoIndexes: number[],
    newStoryIndexes: number[]
  ): Promise<{ imageVideo: BatchCreateResult; newStory: BatchCreateResult }>;

  /** 获取待处理的分镜项 */
  getPendingItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]>;

  /** 获取失败的分镜项 */
  getFailedItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]>;

  /** 更新图片状态并同步主表计数 */
  updateImageStatus(
    id: string,
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    input: {
      imageUrl?: string;
      imagePath?: string;
      status: FissionItemStatus;
      errorMessage?: string;
    }
  ): Promise<FissionTaskItemRecord>;

  /** 更新视频状态并同步主表计数 */
  updateVideoStatus(
    id: string,
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    input: {
      videoUrl?: string;
      videoPath?: string;
      status: FissionItemStatus;
      errorMessage?: string;
      videoTaskId?: string | null; // LLM 视频生成任务ID
    }
  ): Promise<FissionTaskItemRecord>;

  /** 获取任务进度详情 */
  getTaskProgress(fissionVideoStatusId: string): Promise<TaskProgressDetail>;

  /** 重置失败项为待处理状态（用于重试），返回重试结果 */
  resetFailedItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    itemIds?: string[]
  ): Promise<ResetFailedItemsResult>;

  /** 获取指定类型的所有任务项 */
  getItemsByType(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]>;

  /** 获取所有任务项（不分类型） */
  getAllItems(fissionVideoStatusId: string): Promise<FissionTaskItemRecord[]>;
}

// ========== Service 实现 ==========

export class FissionTaskItemsService implements IFissionTaskItemsService {
  private repository: PgFissionTaskItemRepository;
  private statusService: FissionVideoStatusService;
  private businessConfigService?: BusinessConfigService;

  constructor(
    repos: PgRepositoryCollection,
    statusService: FissionVideoStatusService,
    businessConfigService?: BusinessConfigService
  ) {
    this.repository = repos.fissionTaskItems;
    this.statusService = statusService;
    this.businessConfigService = businessConfigService;
  }

  async initializeTaskItems(
    fissionVideoStatusId: string,
    imageVideoCount: number,
    newStoryCount: number
  ): Promise<{ imageVideo: BatchCreateResult; newStory: BatchCreateResult }> {
    // 批量创建图生视频任务项
    const imageVideo = await this.repository.batchCreate(
      fissionVideoStatusId,
      "image_video",
      imageVideoCount
    );

    // 批量创建新故事任务项
    const newStory = await this.repository.batchCreate(
      fissionVideoStatusId,
      "new_story",
      newStoryCount
    );

    // 更新主表计数器
    await this.statusService.update(fissionVideoStatusId, {
      imageVideoTotal: imageVideoCount,
      imageVideoCompleted: 0,
      imageVideoFailed: 0,
      newStoryTotal: newStoryCount,
      newStoryCompleted: 0,
      newStoryFailed: 0,
    });

    return { imageVideo, newStory };
  }

  async initializeTaskItemsWithIndexes(
    fissionVideoStatusId: string,
    imageVideoIndexes: number[],
    newStoryIndexes: number[]
  ): Promise<{ imageVideo: BatchCreateResult; newStory: BatchCreateResult }> {
    const imageVideo = await this.repository.batchCreateWithIndexes(
      fissionVideoStatusId,
      "image_video",
      imageVideoIndexes
    );

    const newStory = await this.repository.batchCreateWithIndexes(
      fissionVideoStatusId,
      "new_story",
      newStoryIndexes
    );

    await this.statusService.update(fissionVideoStatusId, {
      imageVideoTotal: imageVideoIndexes.length,
      imageVideoCompleted: 0,
      imageVideoFailed: 0,
      newStoryTotal: newStoryIndexes.length,
      newStoryCompleted: 0,
      newStoryFailed: 0,
    });

    return { imageVideo, newStory };
  }

  async getPendingItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]> {
    return this.repository.listPendingItems(fissionVideoStatusId, taskType);
  }

  async getFailedItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]> {
    return this.repository.listFailedItems(fissionVideoStatusId, taskType);
  }

  async updateImageStatus(
    id: string,
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    input: {
      imageUrl?: string;
      imagePath?: string;
      status: FissionItemStatus;
      errorMessage?: string;
    }
  ): Promise<FissionTaskItemRecord> {
    // 更新分镜项状态
    const record = await this.repository.updateImageStatus(id, {
      imageUrl: input.imageUrl,
      imagePath: input.imagePath,
      imageStatus: input.status,
      imageErrorMessage: input.errorMessage,
    });

    // 同步更新主表计数器
    await this.syncProgressCounters(fissionVideoStatusId, taskType);

    return record;
  }

  async updateVideoStatus(
    id: string,
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    input: {
      videoUrl?: string;
      videoPath?: string;
      status: FissionItemStatus;
      errorMessage?: string;
      videoTaskId?: string | null;
    }
  ): Promise<FissionTaskItemRecord> {
    // 更新分镜项状态
    const record = await this.repository.updateVideoStatus(id, {
      videoUrl: input.videoUrl,
      videoPath: input.videoPath,
      videoStatus: input.status,
      videoErrorMessage: input.errorMessage,
      videoTaskId: input.videoTaskId,
    });

    // 同步更新主表计数器
    await this.syncProgressCounters(fissionVideoStatusId, taskType);

    return record;
  }

  async getTaskProgress(fissionVideoStatusId: string): Promise<TaskProgressDetail> {
    const items = await this.repository.listByFissionStatusId(fissionVideoStatusId);

    const imageVideoItems = items.filter((item) => item.taskType === "image_video");
    const newStoryItems = items.filter((item) => item.taskType === "new_story");

    const calculateProgress = (taskItems: FissionTaskItemRecord[]): TaskProgress => {
      const total = taskItems.length;
      let completed = 0;
      let failed = 0;
      let pending = 0;
      let processing = 0;

      for (const item of taskItems) {
        // 视频完成才算整体完成
        if (item.videoStatus === "completed") {
          completed++;
        } else if (item.videoStatus === "failed") {
          // 视频失败 = 任务失败
          failed++;
        } else if (item.imageStatus === "failed") {
          // 图片失败导致视频无法执行，计入失败
          failed++;
        } else if (item.videoStatus === "processing") {
          processing++;
        } else {
          // videoStatus === "pending" 且 imageStatus !== "failed"
          pending++;
        }
      }

      return { total, completed, failed, pending, processing };
    };

    const storyboardItems: StoryboardItemProgress[] = items.map((item) => ({
      itemIndex: item.itemIndex,
      taskType: item.taskType,
      imageStatus: item.imageStatus,
      videoStatus: item.videoStatus,
      imageUrl: item.imageUrl,
      videoUrl: item.videoUrl,
      videoTaskId: item.videoTaskId,
      imageErrorMessage: item.imageErrorMessage,
      videoErrorMessage: item.videoErrorMessage,
    }));

    return {
      imageVideo: calculateProgress(imageVideoItems),
      newStory: calculateProgress(newStoryItems),
      items: storyboardItems,
    };
  }

  async resetFailedItems(
    fissionVideoStatusId: string,
    taskType: FissionTaskType,
    itemIds?: string[]
  ): Promise<{ resetCount: number }> {
    const failedItems = await this.repository.listFailedItems(fissionVideoStatusId, taskType);

    // 前端传递的是 itemIndex（数字索引），需要转换为数字匹配
    const itemIndexList = itemIds?.map(id => parseInt(id, 10));

    const itemsToReset = itemIndexList
      ? failedItems.filter((item) => itemIndexList.includes(item.itemIndex))
      : failedItems;

    let resetCount = 0;
    for (const item of itemsToReset) {
      // 只重置视频状态（不重置图片状态，图片失败时不允许视频重试）
      await this.repository.updateVideoStatus(item.id, {
        videoStatus: "pending",
        videoErrorMessage: undefined,
      });
      resetCount++;
    }

    // 同步更新主表计数器
    await this.syncProgressCounters(fissionVideoStatusId, taskType);

    return { resetCount };
  }

  async getItemsByType(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<FissionTaskItemRecord[]> {
    return this.repository.listByFissionStatusIdAndType(fissionVideoStatusId, taskType);
  }

  async getAllItems(fissionVideoStatusId: string): Promise<FissionTaskItemRecord[]> {
    return this.repository.listByFissionStatusId(fissionVideoStatusId);
  }

  /** 同步主表进度计数器 */
  private async syncProgressCounters(
    fissionVideoStatusId: string,
    taskType: FissionTaskType
  ): Promise<void> {
    const items = await this.repository.listByFissionStatusIdAndType(
      fissionVideoStatusId,
      taskType
    );

    let completed = 0;
    let failed = 0;

    for (const item of items) {
      if (item.videoStatus === "completed") {
        completed++;
      } else if (item.videoStatus === "failed" || item.imageStatus === "failed") {
        // 视频失败或图片失败都计入失败
        failed++;
      }
    }

    const updateData =
      taskType === "image_video"
        ? { imageVideoCompleted: completed, imageVideoFailed: failed }
        : { newStoryCompleted: completed, newStoryFailed: failed };

    await this.statusService.update(fissionVideoStatusId, updateData);
  }
}

// ========== 工厂函数 ==========

export function createFissionTaskItemsService(
  repos: PgRepositoryCollection,
  statusService: FissionVideoStatusService,
  businessConfigService?: BusinessConfigService
): IFissionTaskItemsService {
  return new FissionTaskItemsService(repos, statusService, businessConfigService);
}
