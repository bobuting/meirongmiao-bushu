/**
 * 裂变视频任务服务
 *
 * 接入全局任务队列（nrm_async_jobs），提供裂变任务的创建、查询、更新操作。
 * 使用 GlobalTaskConcurrencyService 进行原子并发检查。
 */

import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import { getLogger } from "../../core/logger/index.js";
import type { GlobalTaskConcurrencyService } from "../global-task-concurrency-service.js";
import type { QueueDispatcher } from "../queue-dispatcher.js";
import {
  createAsyncJob,
  getAsyncJob,
  finalizeAsyncJob,
  updateAsyncJobResult,
  findActiveJobByProjectAndType,
  findLatestJobByProjectAndType,
  type AsyncJobRecord,
} from "../../service/async-job-service.js";

const logger = getLogger("fission-job-service");

/** 裂变任务类型标识（父任务） */
export const FISSION_JOB_TYPE = "step6_fission";

/** 裂变新故事生成任务类型 */
export const FISSION_NEW_STORY_JOB_TYPE = "step6_fission_new_story";

/** 裂变分镜提示词生成任务类型 */
export const FISSION_SHOT_PROMPTS_JOB_TYPE = "step6_fission_shot_prompts";

/** 裂变分镜图片生成子任务类型 */
export const FISSION_ITEM_IMAGE_JOB_TYPE = "step6_fission_item_image";

/** 裂变分镜视频提交任务类型（Submit：提交视频生成） */
export const FISSION_ITEM_VIDEO_SUBMIT_JOB_TYPE = "step6_fission_item_video_submit";

/** 裂变分镜视频查询子任务类型（Query：轮询视频状态） */
export const FISSION_ITEM_VIDEO_QUERY_JOB_TYPE = "step6_fission_item_video_query";

/** 裂变组合方案生成任务类型 */
export const FISSION_COMBINATION_JOB_TYPE = "step6_fission_combination";

/** 位置映射（B/C 类在新故事中的 shot_id 分布） */
export interface FissionPositionMap {
  insertPositions: number[];
  originalPositions: number[];
  totalShotCount: number;
}

/** 裂变新故事生成任务输入 */
export interface FissionNewStoryJobInput {
  projectId: string;
  fissionPositionMap?: FissionPositionMap;
}

/** 裂变分镜提示词生成任务输入 */
export interface FissionShotPromptsJobInput {
  projectId: string;
  fissionPositionMap?: FissionPositionMap;
  fissionVideoStatusId: string;
  imageVideoCount: number;
  newStoryCount: number;
  fissionContext: Record<string, unknown>;
  /** step6_fission 父任务 ID */
  parentJobId: string;
}

/** 裂变任务结果（存储在 nrm_async_jobs.result JSONB 中） */
export interface FissionJobResult {
  [key: string]: unknown;
  fissionVideoStatusId: string;
  imageVideoCount: number;
  newStoryCount: number;
  completedItems: number;
  failedItems: number;
  totalItems: number;
  stage?: "storyboard_gen" | "finalizing";
  partialError?: string;
  /** 子任务 ID 列表（shot_prompts 创建的 image/video/combination job） */
  childJobIds?: string[];
}

/** 裂变任务输入参数 */
export interface FissionJobInput {
  fissionVideoStatusId: string;
  imageVideoCount: number;
  newStoryCount: number;
  fissionContext: Record<string, unknown>;
  fissionPositionMap?: FissionPositionMap;
}

// ========== 分镜图片/视频子任务类型 ==========

/** 分镜图片生成任务输入 */
export interface FissionItemImageJobInput {
  fissionVideoStatusId: string;
  projectId: string;
  itemIndex: number;
  taskType: "image_video" | "new_story";
  keyframePrompt: string;
  characterImageUrl: string | null;
  outfitImageUrl: string | null;
  /** 裂变父任务 job id（用于 checkAndFinalizeParent） */
  parentJobId: string;
}

/** 分镜图片生成任务结果 */
export interface FissionItemImageJobResult {
  [key: string]: unknown;
  imageUrl: string | null;
  imagePath: string | null;
  errorMessage?: string;
}

/** 分镜视频生成任务输入 */
export interface FissionItemVideoJobInput {
  fissionVideoStatusId: string;
  projectId: string;
  itemIndex: number;
  taskType: "image_video" | "new_story";
  videoPrompt: string;
  characterImageUrl: string | null;
  outfitImageUrl: string | null;
  /** 裂变父任务 job id（用于 checkAndFinalizeParent） */
  parentJobId: string;
}

/** 分镜视频生成任务结果（Submit） */
export interface FissionItemVideoJobResult {
  [key: string]: unknown;
  videoTaskId: string | null;
  errorMessage?: string;
  /** 调试气泡记录ID（Submit 阶段创建，供 Query 阶段复用） */
  debugAuditId?: string;
  /** 调试气泡记录开始时间戳 */
  debugStartedAt?: number;
  /** 冻结积分ID（Submit 冻结后传递给 Query，由 Query 完成最终扣减/解冻） */
  freezeId?: string | null;
  /** 配对标识（以 "pair-" 开头），用于调试气泡 Submit-Query 配对展示 */
  pairId?: string;
}

/** 分镜视频查询任务输入（Query） */
export interface FissionItemVideoQueryJobInput {
  fissionVideoStatusId: string;
  projectId: string;
  itemIndex: number;
  taskType: "image_video" | "new_story";
  videoTaskId: string;
  parentJobId: string;
  /** Submit 阶段冻结的积分ID，由 Query 完成最终扣减/解冻 */
  freezeId?: string | null;
}

/** 分镜视频查询任务结果（Query） */
export interface FissionItemVideoQueryJobResult {
  [key: string]: unknown;
  videoUrl: string | null;
  videoPath: string | null;
  errorMessage?: string;
}

// ========== 组合方案任务类型 ==========

/** 组合方案生成任务输入 */
export interface FissionCombinationJobInput {
  fissionVideoStatusId: string;
  projectId: string;
  fissionCount: number;
  /** step6_fission 父任务 ID */
  parentJobId: string;
}

/** 组合方案生成任务结果 */
export interface FissionCombinationJobResult {
  [key: string]: unknown;
  combinationCount: number;
  errorMessage?: string;
}

export class FissionJobService {
  constructor(
    private readonly repos: PgRepositoryCollection,
    private readonly concurrencyService: GlobalTaskConcurrencyService,
  ) {}

  async create(
    userId: string,
    projectId: string,
    input: FissionJobInput,
    now: number,
  ): Promise<{ jobId: string } | { error: string; errorCode: string }> {
    const jobId = crypto.randomUUID();

    const result = await createAsyncJob(
      this.repos,
      {
        id: jobId,
        userId,
        jobType: FISSION_JOB_TYPE,
        projectId,
        input: JSON.stringify(input),
        now,
        initialStatus: "pending", // 【并发改造】统一模式：pending 由 QueueDispatcher 调度
      },
      this.concurrencyService,
    );

    if ("error" in result) {
      logger.warn({ userId, projectId, errorCode: result.errorCode }, "裂变任务创建被并发控制拒绝");
      return result;
    }

    logger.info({ jobId: result.jobId, userId, projectId }, "裂变任务创建成功");
    return result;
  }

  async getJob(jobId: string, now: () => number): Promise<AsyncJobRecord | null> {
    return getAsyncJob(this.repos, jobId, now);
  }

  async updateResult(jobId: string, partialResult: Partial<FissionJobResult>, now: number): Promise<void> {
    await updateAsyncJobResult(this.repos, jobId, partialResult, now);
  }

  async complete(jobId: string, result: FissionJobResult, now: number, dispatcher?: QueueDispatcher): Promise<void> {
    await finalizeAsyncJob(this.repos, jobId, "completed", result, null, now, dispatcher);
    logger.info({ jobId, completedItems: result.completedItems }, "裂变任务完成");
  }

  async fail(jobId: string, error: { code: string; message: string }, result: FissionJobResult | null, now: number, dispatcher?: QueueDispatcher): Promise<void> {
    await finalizeAsyncJob(this.repos, jobId, "failed", result, error, now, dispatcher);
    logger.error({ jobId, error }, "裂变任务失败");
  }

  async findActiveJob(projectId: string): Promise<AsyncJobRecord | null> {
    return findActiveJobByProjectAndType(this.repos, projectId, FISSION_JOB_TYPE);
  }

  async findLatestJob(projectId: string): Promise<AsyncJobRecord | null> {
    return findLatestJobByProjectAndType(this.repos, projectId, FISSION_JOB_TYPE);
  }

  // ========== 任务图（父+子任务） ==========

  /**
   * 创建裂变任务图：父任务 + new_story + shot_prompts 子任务
   * - new_story 和 shot_prompts 同时创建
   * - shot_prompts depends_on new_story（由 QueueDispatcher 自动调度）
   * - shot_prompts 完成后由其 executor 创建 image/video_submit/combination 任务
   */
  async createFissionJobGraph(
    userId: string,
    projectId: string,
    input: FissionJobInput,
    now: number,
  ): Promise<{ parentJobId: string; newStoryJobId: string; shotPromptsJobId: string } | { error: string; errorCode: string }> {
    // 1. 创建父任务（经过并发检查）
    const parentResult = await createAsyncJob(
      this.repos,
      {
        userId,
        jobType: FISSION_JOB_TYPE,
        projectId,
        input: JSON.stringify(input),
        now,
        initialStatus: "pending",
      },
      this.concurrencyService,
    );

    if ("error" in parentResult) {
      logger.warn({ userId, projectId, errorCode: parentResult.errorCode }, "裂变父任务创建被并发控制拒绝");
      return parentResult;
    }

    const parentJobId = parentResult.jobId;

    // 2. 创建 new_story 子任务
    const newStoryInput: FissionNewStoryJobInput = {
      projectId,
      fissionPositionMap: input.fissionPositionMap,
    };
    const newStoryResult = await createAsyncJob(
      this.repos,
      {
        userId,
        jobType: FISSION_NEW_STORY_JOB_TYPE,
        projectId,
        input: JSON.stringify(newStoryInput),
        now,
        parentJobId,
        initialStatus: "pending",
      },
      this.concurrencyService,
    );

    if ("error" in newStoryResult) {
      logger.warn({ userId, projectId, errorCode: newStoryResult.errorCode }, "new_story 子任务创建被并发控制拒绝");
      return { parentJobId, newStoryJobId: "", shotPromptsJobId: "" };
    }

    // 3. 创建 shot_prompts 子任务（depends_on new_story）
    const shotPromptsInput: FissionShotPromptsJobInput = {
      projectId,
      fissionPositionMap: input.fissionPositionMap,
      fissionVideoStatusId: input.fissionVideoStatusId,
      imageVideoCount: input.imageVideoCount,
      newStoryCount: input.newStoryCount,
      fissionContext: input.fissionContext,
      parentJobId,
    };
    const shotPromptsResult = await createAsyncJob(
      this.repos,
      {
        userId,
        jobType: FISSION_SHOT_PROMPTS_JOB_TYPE,
        projectId,
        input: JSON.stringify(shotPromptsInput),
        now,
        parentJobId,
        dependsOn: [newStoryResult.jobId],
        initialStatus: "pending",
      },
      this.concurrencyService,
    );

    if ("error" in shotPromptsResult) {
      logger.warn({ userId, projectId, errorCode: shotPromptsResult.errorCode }, "shot_prompts 子任务创建被并发控制拒绝");
      return { parentJobId, newStoryJobId: newStoryResult.jobId, shotPromptsJobId: "" };
    }

    logger.info(
      { parentJobId, newStoryJobId: newStoryResult.jobId, shotPromptsJobId: shotPromptsResult.jobId, userId, projectId },
      "裂变任务图创建成功（父 + new_story + shot_prompts）",
    );

    return {
      parentJobId,
      newStoryJobId: newStoryResult.jobId,
      shotPromptsJobId: shotPromptsResult.jobId,
    };
  }
}
