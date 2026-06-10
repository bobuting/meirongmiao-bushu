/**
 * step3-batch-preview-orchestrator.ts
 * Step3 批量分镜预览后端编排器
 *
 * 核心职责：
 * 1. 接收前端批量预览请求，创建父任务（step3_batch_preview）
 * 2. 后台执行：创建提示词子任务 → 等待完成 → 创建帧预览子任务 → 等待完成
 * 3. 通过 nrm_async_jobs 的 stage 字段实时更新进度
 *
 * 数据流设计：
 * - nrm_async_jobs.input 只存最小标识（frameImageId）
 * - 业务参数存储在 nrm_step3_frame_images 表
 * - 执行时从 nrm_step3_frame_images 查询业务参数
 *
 * 编排流程（两阶段子任务）：
 * 阶段0：创建提示词子任务(step3_shot_prompt) → 等待完成
 * 阶段1：创建帧预览子任务(step3_frame_preview) → 等待完成
 * 阶段2：父任务完成
 */

import type { AppContext } from "../core/app-context.js";
import type { GlobalTaskConcurrencyService } from "./global-task-concurrency-service.js";
import type { QueueDispatcher } from "./queue-dispatcher.js";
import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import {
  createAsyncJob,
  updateAsyncJobStage,
  finalizeAsyncJob,
  getAsyncJob,
} from "../service/async-job-service.js";
import type {
  JimengImageRatio,
  JimengImageResolution,
} from "../routes/project-route-shared.js";
import {
  getStep3FrameImagesDbService,
  type Step3FrameImageBatch,
} from "../service/step3-frame-images-db-service.js";
import { randomUUID } from "node:crypto";
import { getLogger } from "../core/logger/index.js";
import { sseManager } from "./sse-manager.js";
import { AppError } from "../core/errors.js";

const logger = getLogger("step3-batch-preview");

// ========== 类型定义 ==========

/** 批量预览请求参数 */
export interface BatchPreviewRequest {
  projectId: string;
  userId: string;
  /** 要生成的帧索引列表 */
  frameIndexes: number[];
  /** 图片比例 */
  ratio: JimengImageRatio;
  /** 图片分辨率 */
  resolution: JimengImageResolution;
  /** 每帧生成候选数 */
  count: number;
  /** 角色参考图（五视图）- 必传 */
  characterReferenceImages: string[];
  /** 服饰参考图（平铺图）- 必传 */
  garmentReferenceImages: string[];
  /** 已确认脚本的 ID，用于自动生成专业提示词 */
  scriptDataId?: string;
}

/** 单帧生成器回调（路由层注入，桥接 generateSingleStep3FramePreview） */
export type FramePreviewGenerator = (input: {
  frameIndex: number;
  title: string;
  prompt: string;
  /** 角色参考图（五视图） */
  characterReferenceImages: string[];
  /** 服饰参考图（平铺图） */
  garmentReferenceImages: string[];
  ratio: JimengImageRatio;
  resolution: JimengImageResolution;
  count: number;
}) => Promise<{ candidates: string[] }>;

/** 单帧预览请求参数 */
export interface SingleFramePreviewRequest {
  projectId: string;
  userId: string;
  frameIndex: number;
  title: string;
  prompt: string;
  /** 角色参考图（五视图） */
  characterReferenceImages: string[];
  /** 服饰参考图（平铺图） */
  garmentReferenceImages: string[];
  ratio: JimengImageRatio;
  resolution: JimengImageResolution;
  count: number;
  /** 图片生成 RouteKey（用于积分扣减） */
  routeKey?: string;
}

/** 批量预览任务的 job_type */
export const JOB_TYPE_BATCH_PREVIEW = "step3_batch_preview";
/** 单帧预览任务的 job_type */
export const JOB_TYPE_FRAME_PREVIEW = "step3_frame_preview";
/** 专业提示词任务的 job_type（从执行器导入） */
export { JOB_TYPE_SHOT_PROMPT } from "./step3-shot-prompt-executor.js";

// ========== 批量预览主流程 ==========

/**
 * 启动批量预览任务（支持排队）
 * 编排器内部自动处理专业提示词：查询已有 → 没有则生成
 * 返回 { jobId, running, queuePosition }，running=false 表示排队中
 */
export async function startBatchPreviewJobWithDeps(
  ctx: AppContext,
  request: BatchPreviewRequest,
  concurrencyService?: GlobalTaskConcurrencyService,
): Promise<{ jobId: string; running: boolean; queuePosition?: number }> {
  const now = Date.now();
  const repos = ctx.repos;
  logger.info({
    projectId: request.projectId,
    characterRefCount: request.characterReferenceImages?.length ?? 0,
    garmentRefCount: request.garmentReferenceImages?.length ?? 0,
    characterRefs: request.characterReferenceImages,
    garmentRefs: request.garmentReferenceImages,
  }, "startBatchPreviewJobWithDeps: request parameters");

  // 必传校验：角色五视图和服饰平铺图不能为空
  if (!request.characterReferenceImages || request.characterReferenceImages.length === 0) {
    throw new AppError(400, "CHARACTER_REFERENCE_MISSING", "角色五视图图片缺失，请先完成角色定妆");
  }
  if (!request.garmentReferenceImages || request.garmentReferenceImages.length === 0) {
    throw new AppError(400, "GARMENT_REFERENCE_MISSING", "服饰平铺图缺失，请先完成服饰选择");
  }

  // 创建任务（带并发检查）
  const result = await createAsyncJob(repos, {
    id: randomUUID(),
    userId: request.userId,
    jobType: JOB_TYPE_BATCH_PREVIEW,
    input: JSON.stringify({
      request: {
        projectId: request.projectId,
        userId: request.userId,
        frameIndexes: request.frameIndexes,
        ratio: request.ratio,
        resolution: request.resolution,
        count: request.count,
        characterReferenceImages: request.characterReferenceImages,
        garmentReferenceImages: request.garmentReferenceImages,
        scriptDataId: request.scriptDataId,
      },
    }),
    now,
    projectId: request.projectId,
    initialStatus: "pending", // 【并发改造】统一模式：pending 由 QueueDispatcher 调度
  }, concurrencyService);

  if ("error" in result) {
    throw new Error(`[${result.errorCode}] ${result.error}`);
  }

  const { jobId, running, queuePosition } = result;

  // 任务执行统一由 QueueDispatcher.invokeExecutors 触发
  // ExecutorRegistry 中注册的 executor 会自动执行
  // 此处不再直接调用 executeBatchPreviewJob，避免与 executor 双重执行

  return { jobId, running, queuePosition };
}

/**
 * 批量预览后台编排主函数
 * 【两阶段子任务改造】
 * 1. 检查是否已有专业提示词 → 有则跳过提示词子任务
 * 2. 无则创建提示词子任务 → 等待完成 → 创建帧预览子任务
 * 3. 等待所有帧预览子任务完成 → finalize 父任务
 */
export async function executeBatchPreviewJob(
  ctx: AppContext,
  parentJobId: string,
  request: BatchPreviewRequest,
  generator: FramePreviewGenerator,
): Promise<void> {
  const repos = ctx.repos;
  const { JOB_TYPE_SHOT_PROMPT } = await import("./step3-shot-prompt-executor.js");

  try {
    // 检查是否已被停止
    const parent = await getAsyncJob(repos, parentJobId, () => Date.now());
    if (!parent || parent.stage === "stopping") {
      await finalizeBatchParent(repos, parentJobId, 0, 0, request.frameIndexes.length, "stopped");
      return;
    }

    // 查询是否已有专业提示词
    const shotPromptMap = await checkExistingShotPrompts(ctx, request.projectId);

    if (shotPromptMap && shotPromptMap.size > 0) {
      // 已有提示词：直接创建帧预览子任务
      logger.info({ projectId: request.projectId, shotsFound: shotPromptMap.size }, "已有专业提示词，跳过提示词子任务");

      // 创建帧预览子任务
      const childJobIds = await createFrameChildJobs(repos, parentJobId, request, shotPromptMap, ctx.globalTaskConcurrencyService);

      // 更新父任务状态为"等待帧子任务完成"
      await updateAsyncJobStage(repos, parentJobId, "等待子任务完成", Date.now(), {
        totalFrames: request.frameIndexes.length,
        completedFrames: 0,
        failedFrames: 0,
        childJobIds,
      });

      logger.info({ parentJobId, childCount: childJobIds.length }, "帧预览子任务已创建");
    } else {
      // 无提示词：创建提示词子任务
      logger.info({ projectId: request.projectId }, "无专业提示词，创建提示词子任务");

      await updateAsyncJobStage(repos, parentJobId, "生成提示词中", Date.now());

      const shotPromptInput = {
        projectId: request.projectId,
        scriptDataId: request.scriptDataId,
        parentJobId,
        frameIndexes: request.frameIndexes,
        ratio: request.ratio,
        resolution: request.resolution,
        count: request.count,
      };
      const shotPromptResult = await createAsyncJob(
        repos,
        {
          userId: request.userId,
          jobType: JOB_TYPE_SHOT_PROMPT,
          input: JSON.stringify(shotPromptInput),
          now: Date.now(),
          projectId: request.projectId,
          parentJobId,
          initialStatus: "pending", // 【并发改造】子任务排队等待 QueueDispatcher 调度
        },
        ctx.globalTaskConcurrencyService, // 使用并发服务，自动触发回调链
      );

      if ("error" in shotPromptResult) {
        logger.error({ error: shotPromptResult.error }, "提示词子任务创建被拒绝");
        await finalizeBatchParent(repos, parentJobId, 0, 0, request.frameIndexes.length, shotPromptResult.error);
        return;
      }

      // 父任务等待提示词子任务完成后继续（由 executeShotPromptJob 调用 continueBatchParentAfterShotPrompt）
      logger.info({ parentJobId, shotPromptJobId: shotPromptResult.jobId }, "提示词子任务已创建，等待完成");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ err: error, jobId: parentJobId }, "批量预览执行异常");
    await finalizeBatchParent(repos, parentJobId, 0, 0, request.frameIndexes.length, errorMessage);
  }
}

// ========== 阶段 0：查询专业提示词 ==========

/**
 * 查询项目已有的专业提示词（只查询，不生成）
 * 返回 shot_id → prompt 的映射，若无则返回 null
 */
async function checkExistingShotPrompts(
  ctx: AppContext,
  projectId: string,
): Promise<Map<number, string> | null> {
  const { getShotPromptsService } = await import("../services/shot-prompts-service.js");
  const { SHOT_PROMPTS_TYPE } = await import("../contracts/shot-prompts-contract.js");
  const shotPromptsService = getShotPromptsService(ctx);

  const existing = await shotPromptsService.getActive(projectId, SHOT_PROMPTS_TYPE.ORIGIN);
  if (existing && existing.shots.length > 0) {
    const map = new Map<number, string>();
    for (const shot of existing.shots) {
      if (shot.shot_id != null && shot.keyframe_prompt?.prompt) {
        map.set(shot.shot_id, shot.keyframe_prompt.prompt);
      }
    }
    logger.info({ projectId, shotsFound: map.size }, "使用已有专业提示词");
    return map;
  }

  return null;
}

// ========== 阶段 1：创建子任务（排队中） ==========

/**
 * 为每帧创建 frame_images 记录和对应的 async_job
 */
async function createFrameChildJobs(
  repos: PgRepositoryCollection,
  parentJobId: string,
  request: BatchPreviewRequest,
  shotPromptMap: Map<number, string>,
  concurrencyService: GlobalTaskConcurrencyService | undefined,
): Promise<string[]> {
  const now = Date.now();
  const frameImagesService = getStep3FrameImagesDbService(repos);

  await updateAsyncJobStage(repos, parentJobId, "排队中", now, {
    totalFrames: request.frameIndexes.length,
    completedFrames: 0,
    failedFrames: 0,
  });

  const childJobIds: string[] = [];

  for (let i = 0; i < request.frameIndexes.length; i++) {
    const frameIndex = request.frameIndexes[i]!;

    // 从 shotPromptMap 获取专业提示词（由 ensureShotPrompts 生成）
    const generatedPrompt = shotPromptMap.get(frameIndex)
      ?? `镜头 ${frameIndex} 场景参考图`;
    const sanitizedPrompt = sanitizePromptForImageSafety(generatedPrompt);

    // 创建 frame_images 记录
    const batchId = randomUUID();
    const batch: Step3FrameImageBatch = {
      batch_id: batchId,
      ratio: request.ratio,
      resolution: request.resolution,
      status: "pending",
      created_at: now,
      images: [],
    };

    const frameImageRecord = await frameImagesService.appendBatch({
      project_id: request.projectId,
      user_id: request.userId,
      frame_index: frameIndex,
      image_prompt: sanitizedPrompt,
      batch,
      select_first: false,
    });

    // 创建 async_job，input 只存 frameImageId
    // 【并发改造】子任务通过并发服务创建，自动排队等待提升
    const inputObj = {
      frameImageId: frameImageRecord.id,
      parentJobId,
      frameIndex,
      batchId,
      count: request.count,
    };
    const childResult = await createAsyncJob(
      repos,
      {
        userId: request.userId,
        jobType: JOB_TYPE_FRAME_PREVIEW,
        input: JSON.stringify(inputObj),
        now,
        projectId: request.projectId,
        parentJobId,
        initialStatus: "pending", // 【并发改造】子任务排队等待 QueueDispatcher 调度
      },
      concurrencyService, // 使用并发服务，自动触发回调链
    );
    if ("error" in childResult) {
      logger.warn({ frameIndex, error: childResult.error }, "子任务创建被拒绝（队列已满）");
      continue; // 跳过此帧，继续其他帧
    }
    childJobIds.push(childResult.jobId);
  }

  return childJobIds;
}

// ========== 阶段 2：生成专业提示词 ==========

/**
 * 清洗 prompt 中可能触发 AI 平台内容安全过滤器的不安全描述
 * 强制替换年龄相关敏感词，作为 LLM 提示词规则的代码层兜底
 */
function sanitizePromptForImageSafety(prompt: string): string {
  // 替换 "Young girl/boy about N-N years old" 模式
  let sanitized = prompt.replace(
    /[Yy]oung\s+(girl|boy|child)\s+about\s+\d+[\s-]*\d*\s*(years?\s*old)?/g,
    "Youthful character, adolescent appearance",
  );
  // 替换 "N-N years old" 独立出现的年龄数字
  sanitized = sanitized.replace(
    /\b\d+\s*[-~到至]\s*\d+\s*years?\s*old\b/gi,
    "youthful appearance",
  );
  // 替换 "Young girl/boy" 组合（无年龄数字）
  sanitized = sanitized.replace(
    /\b[Yy]oung\s+(girl|boy)\b/g,
    "youthful character",
  );
  return sanitized;
}

// ========== 单帧任务 ==========

/**
 * 启动单帧预览任务（支持并发控制）
 * 改造后：通过并发服务创建任务，超并发时排队等待
 */
export async function startSingleFramePreviewJob(
  _pool: unknown,
  request: SingleFramePreviewRequest,
  generator: FramePreviewGenerator,
  concurrencyService: GlobalTaskConcurrencyService | undefined,
  dispatcher: QueueDispatcher | undefined,
  repos: PgRepositoryCollection,
): Promise<{ jobId: string; running: boolean; queuePosition?: number }> {
  const now = Date.now();

  // 【并发改造】使用并发服务创建任务
  const result = await createAsyncJob(repos, {
    userId: request.userId,
    jobType: JOB_TYPE_FRAME_PREVIEW,
    input: JSON.stringify({
      frameImageId: null, // 稍后更新
      frameIndex: request.frameIndex,
      batchId: null, // 稍后生成
      request: {
        projectId: request.projectId,
        userId: request.userId,
        frameIndex: request.frameIndex,
        title: request.title,
        prompt: request.prompt,
        characterReferenceImages: request.characterReferenceImages,
        garmentReferenceImages: request.garmentReferenceImages,
        ratio: request.ratio,
        resolution: request.resolution,
        count: request.count,
      },
    }),
    now,
    projectId: request.projectId,
    initialStatus: "pending", // 【并发改造】统一模式：pending 由 QueueDispatcher 调度
  }, concurrencyService);

  if ("error" in result) {
    throw new Error(`[${result.errorCode}] ${result.error}`);
  }

  const { jobId, running, queuePosition } = result;

  // 只有获得执行槽位时才立即执行，排队时由 QueueDispatcher 提升后触发
  if (running) {
    // 后台执行
    executeSingleFramePreviewJob(repos, jobId, request, generator, repos, dispatcher, undefined)
      .catch(async (err: unknown) => {
        logger.error({ err, jobId }, "单帧预览执行失败");
        await finalizeAsyncJob(repos, jobId, "failed", null, {
          code: "FRAME_GENERATION_FAILED",
          message: err instanceof Error ? err.message : String(err),
        }, Date.now(), dispatcher);
      });
  }

  return { jobId, running, queuePosition };
}

// ========== 停止任务 ==========

/**
 * 停止批量预览任务
 * 1. 设置父任务 stage 为 "stopping"，worker 在下一帧前检查并退出
 * 2. 将所有 pending 状态的子任务标记为 failed，前端可显示失败状态并支持重试
 */
export async function stopBatchPreviewJob(
  _pool: unknown,
  parentJobId: string,
  repos: PgRepositoryCollection,
): Promise<void> {
  const now = Date.now();
  await updateAsyncJobStage(repos, parentJobId, "stopping", now, {
    stopping: true,
  });

  // 查询父任务 input 获取 projectId（用于定位子任务）
  const parent = await getAsyncJob(repos, parentJobId, () => now);
  if (!parent?.projectId) return;

  // 将所有 pending 状态的子任务标记为 failed，并推送 SSE 信号
  const failedRows = await repos.asyncJobs.failPendingChildrenByParentJobId(
    parent.projectId,
    parentJobId,
    JOB_TYPE_FRAME_PREVIEW,
    { code: "STOPPED_BY_USER", message: "用户已停止批量生成" },
    now,
  );

  // 推送 SSE 信号
  for (const row of failedRows) {
    sseManager.pushToUser(row.user_id, {
      type: "job_failed",
      jobId: row.id,
      jobType: row.job_type,
      status: "failed",
      error: { code: "STOPPED_BY_USER", message: "用户已停止批量生成" },
      timestamp: now,
    });
  }
}

// ========== 辅助函数 ==========

/** 检查项目所有分镜是否都至少有一张预览图，如果是则更新项目状态 */
async function checkAndUpdateStoryboardPreviewCompleted(
  projectId: string,
  repos: PgRepositoryCollection,
): Promise<void> {
  const currentStatus = await repos.projects.findStatusById(projectId);

  // 只在脚本相关状态才需要检查（包括反推项目的 SCRIPT_GENERATED）
  // 反推项目由 AI 自动生成并确认脚本，状态可能是 SCRIPT_GENERATED
  const allowedStatuses = ["SCRIPT_GENERATED", "SCRIPT_SELECTED", "SCRIPT_CONFIRMED", "STORYBOARDING"];
  if (!currentStatus || !allowedStatuses.includes(currentStatus)) {
    return;
  }

  // 查询该项目的已确认脚本对应的分镜数量
  // 1. 找到项目的已确认脚本
  const scriptDataId = await repos.scriptData.findConfirmedIdByProject(projectId);
  if (!scriptDataId) {
    return;
  }

  // 2. 统计该脚本的分镜数量
  const totalFrames = await repos.shotBreakdowns.countByScriptDataId(scriptDataId);
  if (totalFrames === 0) {
    return;
  }

  // 查询有预览图的帧数量
  const framesWithImages = await repos.step3FrameImages.countFramesWithSucceededImages(projectId);

  // 所有帧都有预览图时更新状态
  if (framesWithImages >= totalFrames) {
    await repos.projects.updateStatus(projectId, "STORYBOARD_PREVIEW_COMPLETED");
  }
}

/** 将所有帧的批次状态标记为失败（父任务异常时调用） */
async function markAllFrameBatchesAsFailed(
  repos: PgRepositoryCollection,
  projectId: string,
  frameIndexes: number[],
  errorMessage: string,
): Promise<void> {
  const frameImagesService = getStep3FrameImagesDbService(repos);
  const now = Date.now();

  for (const frameIndex of frameIndexes) {
    const record = await frameImagesService.findByProjectAndFrame(projectId, frameIndex);
    if (!record) continue;

    // 更新最新批次的状态为 failed
    const updatedBatches = record.batches.map((batch, idx) => {
      if (idx === record.batches.length - 1 && batch.status === "pending") {
        return { ...batch, status: "failed" as const };
      }
      return batch;
    });

    await repos.step3FrameImages.updateBatchesAndStatus(record.id, updatedBatches, "failed", now);
  }
}

/** Finalize 父任务，汇总完成/失败数 */
async function finalizeBatchParent(
  repos: PgRepositoryCollection,
  parentJobId: string,
  completedCount: number,
  failedCount: number,
  totalFrames: number,
  errorMessage?: string,
  dispatcher?: QueueDispatcher,
): Promise<void> {
  const now = Date.now();
  const allFailed = totalFrames > 0 && completedCount === 0;
  if (errorMessage || allFailed) {
    await finalizeAsyncJob(repos, parentJobId, "failed", null, {
      code: "BATCH_PREVIEW_FAILED",
      message: errorMessage ?? (failedCount > 0
        ? `${failedCount}/${totalFrames} 帧生成失败`
        : "任务未生成任何帧"),
    }, now, dispatcher);
  } else {
    await finalizeAsyncJob(repos, parentJobId, "completed", {
      totalFrames,
      completedFrames: completedCount,
      failedFrames: failedCount,
    }, failedCount > 0 ? {
      code: "PARTIAL_FAILURE",
      message: `${failedCount}/${totalFrames} 帧生成失败`,
    } : null, now, dispatcher);
  }
}

/**
 * 【并发改造】检查并完成批量父任务
 * 当所有子任务完成时，自动 finalize 父任务
 * 由 QueueDispatcher 在每个子任务完成后调用
 */
export async function checkAndFinalizeBatchParent(
  repos: PgRepositoryCollection,
  parentJobId: string,
  dispatcher: QueueDispatcher | undefined,
): Promise<void> {
  // 查询父任务
  const parent = await getAsyncJob(repos, parentJobId, () => Date.now());
  if (!parent || parent.status !== "running") {
    return; // 父任务已完成或不存在
  }

  // 查询所有子任务状态
  const childrenStatuses = await repos.asyncJobs.findChildrenStatusByParentId(parentJobId, JOB_TYPE_FRAME_PREVIEW);

  const completedCount = childrenStatuses.filter((r: { status: string }) => r.status === "completed").length;
  const failedCount = childrenStatuses.filter((r: { status: string }) => r.status === "failed").length;
  const pendingCount = childrenStatuses.filter((r: { status: string }) => r.status === "pending").length;
  const runningCount = childrenStatuses.filter((r: { status: string }) => r.status === "running").length;
  const total = childrenStatuses.length;

  // 所有子任务完成（completed + failed）时，finalize 父任务
  if (pendingCount === 0 && runningCount === 0) {
    await finalizeBatchParent(repos, parentJobId, completedCount, failedCount, total, undefined, dispatcher);
    logger.info({ parentJobId, completedCount, failedCount, total }, "批量父任务已完成");
  }
}

/** 导出辅助函数供 QueueDispatcher 使用 */
export { sanitizePromptForImageSafety, checkAndUpdateStoryboardPreviewCompleted };

// ========== 单帧任务执行函数 ==========

/**
 * 执行单帧预览任务（QueueDispatcher 提升后触发）
 * 1. 创建 frame_images 记录
 * 2. 执行图片生成
 * 3. 生成成功后扣减积分
 * 4. 更新结果并完成任务
 */
export async function executeSingleFramePreviewJob(
  _reposOrPool: unknown,
  jobId: string,
  request: SingleFramePreviewRequest,
  generator: FramePreviewGenerator,
  repos: PgRepositoryCollection,
  dispatcher?: QueueDispatcher,
  _ctx?: AppContext,
): Promise<void> {
  const now = Date.now();
  const batchId = randomUUID();

  // 更新状态为生成中
  await updateAsyncJobStage(repos, jobId, "生成中", now);

  const frameImagesService = getStep3FrameImagesDbService(repos);
  const batch: Step3FrameImageBatch = {
    batch_id: batchId,
    ratio: request.ratio,
    resolution: request.resolution,
    status: "pending",
    created_at: now,
    images: [],
  };

  // 创建/更新 frame_images 记录
  const frameImageRecord = await frameImagesService.appendBatch({
    project_id: request.projectId,
    user_id: request.userId,
    frame_index: request.frameIndex,
    image_prompt: request.prompt,
    batch,
    select_first: false,
  });

  // 更新 async_job 的 input（补充 frameImageId 和 batchId）
  const inputObj = {
    frameImageId: frameImageRecord.id,
    frameIndex: request.frameIndex,
    batchId,
  };
  await repos.asyncJobs.updateInput(jobId, inputObj);

  // 执行图片生成
  const result = await generator({
    frameIndex: request.frameIndex,
    title: request.title,
    prompt: sanitizePromptForImageSafety(request.prompt),
    characterReferenceImages: request.characterReferenceImages,
    garmentReferenceImages: request.garmentReferenceImages,
    ratio: request.ratio,
    resolution: request.resolution,
    count: request.count,
  });

  // 更新 frame_images 表的批次结果
  const updatedBatches = frameImageRecord.batches.map((b) =>
    b.batch_id === batchId
      ? {
          ...b,
          status: "succeeded" as const,
          job_id: jobId,
          images: result.candidates.map((url, idx) => ({
            image_url: url,
            image_index: idx,
          })),
        }
      : b,
  );

  // 使用仓库方法更新批次结果
  await repos.step3FrameImages.updateBatchesAndSelection(
    frameImageRecord.id,
    updatedBatches,
    batchId,
    result.candidates[0] ?? null,
    0,
    Date.now(),
  );

  // 完成任务
  await finalizeAsyncJob(repos, jobId, "completed", {
    frameIndex: request.frameIndex,
    candidates: result.candidates,
  }, null, Date.now(), dispatcher);

  // 检查是否所有帧都有预览图，如果是则更新项目状态
  if (repos) {
    await checkAndUpdateStoryboardPreviewCompleted(request.projectId, repos);
  }
}
