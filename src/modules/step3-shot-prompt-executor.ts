/**
 * step3-shot-prompt-executor.ts
 * Step3 专业提示词生成子任务执行器
 *
 * 职责：
 * - 作为批量预览父任务的第一阶段子任务
 * - 执行专业提示词生成（调用 shotPromptsService）
 * - 完成后通知父任务继续创建帧预览子任务
 */

import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import type { AppContext } from "../core/app-context.js";
import type { QueueDispatcher } from "./queue-dispatcher.js";
import { randomUUID } from "node:crypto";
import { getLogger } from "../core/logger/index.js";
import { SHOT_PROMPTS_TYPE } from "../contracts/shot-prompts-contract.js";
import { getShotPromptsService } from "../services/shot-prompts-service.js";
import {
  getAsyncJob,
  updateAsyncJobStage,
  finalizeAsyncJob,
  checkAndFinalizeParent,
} from "../service/async-job-service.js";

const logger = getLogger("step3-shot-prompt-executor");

/** 专业提示词任务的 job_type */
export const JOB_TYPE_SHOT_PROMPT = "step3_shot_prompt";

/** 提示词子任务输入（只传最小标识，executor 自行查数据库） */
export interface ShotPromptJobInput {
  /** 项目 ID */
  projectId: string;
  /** 已确认脚本的 ID */
  scriptDataId?: string;
  /** 父任务 ID（批量预览） */
  parentJobId: string;
  /** 帧索引列表（用于创建帧预览子任务） */
  frameIndexes: number[];
  /** 图片比例（帧预览参数） */
  ratio: string;
  /** 图片分辨率（帧预览参数） */
  resolution: string;
  /** 每帧生成候选数（帧预览参数） */
  count: number;
}

/**
 * 执行专业提示词生成子任务
 * 由 QueueDispatcher promote 后触发
 */
export async function executeShotPromptJob(
  ctx: AppContext,
  repos: PgRepositoryCollection,
  jobId: string,
  userId: string,
  dispatcher?: QueueDispatcher,
): Promise<void> {
  const now = Date.now();

  const job = await getAsyncJob(repos, jobId, () => now);
  if (!job || job.status !== "running") {
    logger.warn({ jobId }, "任务不存在或非 running 状态");
    return;
  }

  const input = JSON.parse(job.input) as ShotPromptJobInput;

  // 更新阶段
  await updateAsyncJobStage(repos, jobId, "生成中", now);

  try {
    // 从数据库查询项目参考图（角色五视图 + 服饰平铺图）
    const { resolveProjectReferenceImages } = await import("../modules/project-reference-image-resolver.js");
    const project = await ctx.projectService.requireOwnerProject({ id: userId }, input.projectId);
    const referenceImages = await resolveProjectReferenceImages(ctx, project);

    // 调用服务生成提示词
    const shotPromptsService = getShotPromptsService(ctx);
    const record = await shotPromptsService.generateAndSave(
      {
        projectId: input.projectId,
        scriptDataId: input.scriptDataId,
        characterReferenceImages: referenceImages.characterReferenceImages,
        garmentReferenceImages: referenceImages.garmentReferenceImages,
      },
      SHOT_PROMPTS_TYPE.ORIGIN,
      userId,
    );

    // 构建 shot_id → prompt 映射
    const shotPromptMap = new Map<number, string>();
    for (const shot of record.shots) {
      if (shot.shot_id != null && shot.keyframe_prompt?.prompt) {
        shotPromptMap.set(shot.shot_id, shot.keyframe_prompt.prompt);
      }
    }

    logger.info(
      { jobId, projectId: input.projectId, shotsCount: record.shots.length },
      "专业提示词生成完成",
    );

    // 通知父任务：触发创建帧预览子任务（必须在 finalizeAsyncJob 之前，否则 dispatcher 会提前 finalize 父任务）
    if (input.parentJobId) {
      await continueBatchParentAfterShotPrompt(ctx, repos, input.parentJobId, shotPromptMap, input, userId);
    }

    // 完成子任务（放在最后，finalize 会触发 dispatcher.tryPromote()）
    await finalizeAsyncJob(repos, jobId, "completed", {
      projectId: input.projectId,
      shotsCount: record.shots.length,
      recordId: record.id,
      shotPromptMap: Array.from(shotPromptMap.entries()),
    }, null, Date.now(), dispatcher);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, jobId }, "专业提示词生成失败");

    await finalizeAsyncJob(repos, jobId, "failed", null, {
      code: "SHOT_PROMPT_GENERATION_FAILED",
      message: errorMessage,
    }, Date.now(), dispatcher);

    // 【修复】失败时检查父任务是否需要自动完成
    if (input.parentJobId && dispatcher) {
      await checkAndFinalizeParent(repos, input.parentJobId, dispatcher, Date.now());
    }
  }
}

/**
 * 提示词子任务完成后，继续父任务流程：
 * 1. 预创建 frame_images 记录（状态 pending）
 * 2. 创建帧预览子任务
 * 子任务执行时只需填充图片结果，不再创建记录
 */
async function continueBatchParentAfterShotPrompt(
  ctx: AppContext,
  repos: PgRepositoryCollection,
  parentJobId: string,
  shotPromptMap: Map<number, string>,
  input: ShotPromptJobInput,
  userId: string,
): Promise<void> {
  logger.info({ parentJobId, frameIndexes: input.frameIndexes, shotPromptCount: shotPromptMap.size }, "开始继续父任务流程，创建帧预览子任务");

  const {
    JOB_TYPE_FRAME_PREVIEW,
    sanitizePromptForImageSafety,
  } = await import("./step3-batch-preview-orchestrator.js");
  const { getStep3FrameImagesDbService } = await import("../service/step3-frame-images-db-service.js");
  const { createAsyncJob } = await import("../service/async-job-service.js");
  // 需要静态导入类型
  type Step3FrameImageBatch = import("../service/step3-frame-images-db-service.js").Step3FrameImageBatch;

  const now = Date.now();
  const parent = await getAsyncJob(repos, parentJobId, () => now);

  if (!parent || parent.status !== "running") {
    logger.warn({ parentJobId, parentStatus: parent?.status }, "父任务不存在或已完成");
    return;
  }

  // 检查是否已被停止
  if (parent.stage === "stopping") {
    logger.info({ parentJobId }, "父任务已被停止，不再创建帧子任务");
    return;
  }

  const frameIndexes = input.frameIndexes;
  const ratio = input.ratio as "9:16" | "16:9" | "1:1";
  const resolution = input.resolution as "1k" | "2k" | "4k";
  const count = input.count;
  const frameImagesService = getStep3FrameImagesDbService(ctx.repos);

  const childJobIds: string[] = [];

  // 预创建 frame_images 记录 + 创建帧预览子任务
  for (const frameIndex of frameIndexes) {
    // 从专业提示词获取 keyframe_prompt
    const generatedPrompt = shotPromptMap.get(frameIndex) ?? `镜头 ${frameIndex} 场景参考图`;
    const sanitizedPrompt = sanitizePromptForImageSafety(generatedPrompt);

    // 预创建 batch（状态 pending，等待子任务填充结果）
    const batchId = randomUUID();
    const batch: Step3FrameImageBatch = {
      batch_id: batchId,
      ratio,
      resolution,
      status: "pending",
      created_at: now,
      images: [], // 空，等待子任务填充
    };

    // 创建 frame_images 记录
    const frameImageRecord = await frameImagesService.appendBatch({
      project_id: input.projectId,
      user_id: userId,
      frame_index: frameIndex,
      image_prompt: sanitizedPrompt,
      batch,
      select_first: false,
    });

    // 创建帧预览子任务（使用 concurrencyService 触发回调链）
    const childInput = {
      frameImageId: frameImageRecord.id,
      parentJobId,
      frameIndex,
      batchId,
      count,
    };
    const childResult = await createAsyncJob(
      repos,
      {
        userId,
        jobType: JOB_TYPE_FRAME_PREVIEW,
        input: JSON.stringify(childInput),
        now,
        projectId: input.projectId,
        parentJobId,
        initialStatus: "pending", // 【并发改造】子任务排队等待 QueueDispatcher 调度
      },
      ctx.globalTaskConcurrencyService,
    );
    if ("error" in childResult) {
      logger.warn({ frameIndex, error: childResult.error }, "帧预览子任务创建被拒绝，跳过");
      continue;
    }
    childJobIds.push(childResult.jobId);
  }

  // 更新父任务状态为"等待帧子任务完成"
  await updateAsyncJobStage(repos, parentJobId, "等待子任务完成", now, {
    totalFrames: frameIndexes.length,
    completedFrames: 0,
    failedFrames: 0,
    childJobIds,
  });

  logger.info({ parentJobId, childCount: childJobIds.length }, "提示词完成，frame_images 已预创建，帧预览子任务已创建");
}
