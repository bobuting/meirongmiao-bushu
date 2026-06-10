/**
 * Step2 五视图生成任务执行器
 *
 * 将五视图生成集成到全局任务队列 (nrm_async_jobs)
 * - job_type: step2_five_view
 * - 支持任务状态追踪、取消、重试
 * - 前端通过全局任务队列轮询获取进度
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { getLogger } from "../core/logger/index.js";
import {
  createAsyncJob,
  updateAsyncJobStage,
  finalizeAsyncJob,
  getAsyncJob,
  type AsyncJobRecord,
} from "../service/async-job-service.js";
import type { PgRepositoryCollection as ReposCollection } from "../repositories/pg/index.js";

const log = getLogger("step2-five-view-job-executor");
import type { AppContext } from "../core/app-context.js";
import type { GlobalTaskConcurrencyService } from "./global-task-concurrency-service.js";
import type { LibraryCharacter } from "../contracts/types.js";
import type { QueueDispatcher } from "./queue-dispatcher.js";
import { buildCharacterName } from "../utils/character-naming.js";
import { getOutfitDescription } from "../utils/outfit-description.js";

// ========== 类型定义 ==========

/** 五视图任务的 job_type（视频项目） */
export const JOB_TYPE_FIVE_VIEW = "step2_five_view";

/** 五视图任务的 job_type（图片项目） */
export const JOB_TYPE_IMAGE_FIVE_VIEW = "image_step2_five_view";

/** 批量五视图任务的 job_type（视频项目） */
export const JOB_TYPE_BATCH_FIVE_VIEW = "step2_batch_five_view";

/** 批量五视图任务的 job_type（图片项目） */
export const JOB_TYPE_IMAGE_BATCH_FIVE_VIEW = "image_step2_batch_five_view";

/** 五视图生成请求参数 */
export interface FiveViewJobRequest {
  projectId: string;
  userId: string;
  /** 生成槽位 (1-3)，用于多角色场景 */
  slot?: number;
  /** 角色ID（重试模式：已有角色，重新生成五视图） */
  characterId?: string;
  /** 已创建的五视图记录 ID（批量模式：路由层预创建，执行器只更新） */
  fiveViewId?: string;
  /** 提示词覆盖（可选） */
  promptOverride?: string;
}

/** 五视图生成器回调（路由层注入） */
export type FiveViewGenerator = (ctx: AppContext, character: LibraryCharacter | null, options: {
  projectId: string;
  characterId?: string;
  /** 已存在的五视图记录 ID（传入时只更新该记录，不创建新记录） */
  existingViewId?: string;
}) => Promise<{
  imageUrl: string;
  prompt?: string;
  model?: string;
}>;

/** 五视图任务结果 */
export interface FiveViewJobResult {
  characterId: string;
  characterName: string;
  imageUrl: string;
  slot?: number;
}

// ========== 任务启动 ==========

/**
 * 启动五视图生成任务
 * 如果已有进行中的任务，返回现有任务ID
 */
export async function startFiveViewJob(
  repos: ReposCollection,
  request: FiveViewJobRequest,
  concurrencyService?: GlobalTaskConcurrencyService,
): Promise<{ jobId: string; running: boolean; queuePosition?: number }> {
  const now = Date.now();

  // 检查是否已有进行中的任务（同一项目 + 同一 slot）
  const existingJob = await repos.asyncJobs.findActiveByProjectTypeAndSlot(
    request.projectId,
    JOB_TYPE_FIVE_VIEW,
    request.slot ?? null,
  );
  if (existingJob) {
    // 已有任务，返回其 ID（pending 或 running 都视为已有）
    const isRunning = existingJob.status === "running";
    return { jobId: existingJob.id, running: isRunning };
  }

  const jobId = randomUUID();

  // 创建任务记录（带并发检查）
  const result = await createAsyncJob(repos, {
    id: jobId,
    userId: request.userId,
    jobType: JOB_TYPE_FIVE_VIEW,
    input: JSON.stringify({
      projectId: request.projectId,
      slot: request.slot ?? null,
      characterId: request.characterId ?? null,
      fiveViewId: request.fiveViewId ?? null,
      promptOverride: request.promptOverride ?? null,
    }),
    now,
    projectId: request.projectId,
    initialStatus: "pending", // 【并发改造】统一模式：pending 由 QueueDispatcher 调度
  }, concurrencyService);

  if ("error" in result) {
    throw new Error(`[${result.errorCode}] ${result.error}`);
  }

  return { jobId: result.jobId, running: result.running, queuePosition: result.queuePosition };
}

/**
 * 启动图片项目五视图生成任务
 * 如果已有进行中的任务，返回现有任务ID
 */
export async function startImageFiveViewJob(
  repos: ReposCollection,
  request: FiveViewJobRequest,
  concurrencyService?: GlobalTaskConcurrencyService,
): Promise<{ jobId: string; running: boolean; queuePosition?: number }> {
  const now = Date.now();

  // 检查是否已有进行中的任务（同一项目 + 同一 slot）
  const existingJob = await repos.asyncJobs.findActiveByProjectTypeAndSlot(
    request.projectId,
    JOB_TYPE_IMAGE_FIVE_VIEW,
    request.slot ?? null,
  );
  if (existingJob) {
    // 已有任务，返回其 ID（pending 或 running 都视为已有）
    const isRunning = existingJob.status === "running";
    return { jobId: existingJob.id, running: isRunning };
  }

  const jobId = randomUUID();

  // 创建任务记录（带并发检查）
  const result = await createAsyncJob(repos, {
    id: jobId,
    userId: request.userId,
    jobType: JOB_TYPE_IMAGE_FIVE_VIEW,
    input: JSON.stringify({
      projectId: request.projectId,
      slot: request.slot ?? null,
      characterId: request.characterId ?? null,
      fiveViewId: request.fiveViewId ?? null,
      promptOverride: request.promptOverride ?? null,
    }),
    now,
    projectId: request.projectId,
    initialStatus: "pending",
  }, concurrencyService);

  if ("error" in result) {
    throw new Error(`[${result.errorCode}] ${result.error}`);
  }

  return { jobId: result.jobId, running: result.running, queuePosition: result.queuePosition };
}

/**
 * 解析异步任务行（用于 repo 返回的原始行）
 */
function parseAsyncJobRow(row: Record<string, unknown>): AsyncJobRecord {
  return {
    id: row.id as string,
    jobType: (row.job_type as string) || JOB_TYPE_FIVE_VIEW,
    userId: row.user_id as string,
    projectId: (row.project_id as string | null) || null,
    input: row.input as string,
    status: row.status as AsyncJobRecord["status"],
    stage: (row.stage as string | null) || null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    result: (row.result as Record<string, unknown> | null) || null,
    error: (row.error as { code: string; message: string } | null) || null,
    parentJobId: (row.parent_job_id as string | null) ?? null,
    dependsOn: row.depends_on as string[] | null ?? null,
    executionMode: (row.execution_mode as "once" | "poll") || "once",
  };
}

// ========== 任务执行 ==========

/**
 * 执行五视图生成任务
 * 由 QueueDispatcher 调度触发
 *
 * 流程说明：
 * - 批量生成：路由层已创建角色 + 五视图记录，执行器只更新现有记录
 * - 单独任务：执行器创建新角色 + 新五视图记录（保留原有逻辑）
 */
export async function executeFiveViewJob(
  ctx: AppContext,
  job: AsyncJobRecord,
  generator: FiveViewGenerator,
  dispatcher?: QueueDispatcher,
): Promise<void> {
  const repos = ctx.repos as ReposCollection;
  const input = JSON.parse(job.input) as {
    projectId: string;
    slot?: number;
    characterId?: string;
    fiveViewId?: string;
    promptOverride?: string;
  };

  // QueueDispatcher 已在 tryPromote 中获取 advisory lock，executor 无需重复获取

  // 更新状态为 running
  await updateAsyncJobStage(repos, job.id, "生成中", ctx.clock.now());

  try {
    // 判断模式：批量生成（已有角色） vs 单独任务（创建新角色）
    const isBatchMode = Boolean(input.characterId && input.fiveViewId);

    if (isBatchMode) {
      // ========== 批量生成模式：generator 完全负责角色数据更新，执行器只负责调度 ==========
      const character = await ctx.repos.libraryCharacters.findById(input.characterId!);
      if (!character) {
        throw new Error(`角色 ${input.characterId} 不存在`);
      }

      // 调用五视图生成器（generator 内部更新五视图记录 + 角色图片 + 角色状态）
      const view = await generator(ctx, character, {
        projectId: input.projectId,
        characterId: input.characterId,
        existingViewId: input.fiveViewId,
      });

      if (!view.imageUrl) {
        // 更新五视图记录为 failed（generator 异常时需要手动更新）
        const failedView = await ctx.repos.characterFiveViews.findById(input.fiveViewId!);
        if (failedView) {
          await ctx.repos.characterFiveViews.update({
            ...failedView,
            status: "failed",
            errorMessage: "五视图生成未返回图片",
            updatedAt: ctx.clock.now(),
          });
        }
        // 更新角色状态为 failed（让前端能看到失败）
        await ctx.repos.libraryCharacters.updateStatus(input.characterId!, "failed", ctx.clock.now());
        throw new Error("五视图生成未返回图片");
      }

      // generator 已完成所有角色数据更新，执行器只更新项目关联表
      await ctx.repos.projectCharacters.updateTimestampByProjectAndCharacter(
        input.projectId,
        input.characterId!,
        ctx.clock.now(),
      );

      // 更新任务结果
      await finalizeAsyncJob(repos, job.id, "completed", {
        characterId: input.characterId!,
        characterName: character.name,
        imageUrl: view.imageUrl,
        slot: input.slot,
      }, null, ctx.clock.now(), dispatcher);

    } else {
      // ========== 单独任务模式：创建新角色（保留原有逻辑） ==========
      const view = await generator(ctx, null, {
        projectId: input.projectId,
        characterId: input.characterId,
      });

      if (!view.imageUrl) {
        throw new Error("五视图生成未返回图片");
      }

      // 创建角色并关联项目
      const result = await createCharacterAndAssociate(
        ctx,
        job.userId,
        input.projectId,
        view.imageUrl,
        input.slot,
      );

      // 更新任务结果
      await finalizeAsyncJob(repos, job.id, "completed", {
        characterId: result.characterId,
        characterName: result.characterName,
        imageUrl: result.imageUrl,
        slot: input.slot,
      }, null, ctx.clock.now(), dispatcher);
    }

    // 【并发改造】检查父任务是否需要自动完成
    if (job.parentJobId) {
      log.debug({ jobId: job.id, parentJobId: job.parentJobId }, "[FiveViewJob] 子任务完成，检查父任务");
      await checkAndFinalizeParentJob(ctx, job.parentJobId, dispatcher);
    } else {
      // 单独任务：更新项目状态（根据项目类型选择正确的状态）
      const project = await ctx.repos.projects.findById(input.projectId);
      const targetStatus = project?.projectKind === "image" ? "IMAGE_CHARACTER_VIEW_READY" : "CHARACTER_VIEW_READY";
      await ctx.repos.projects.updateStatus(input.projectId, targetStatus);
    }

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    const errStack = error instanceof Error ? error.stack : undefined;
    const errName = error instanceof Error ? error.name : "Unknown";

    log.error({
      jobId: job.id,
      errorName: errName,
      errorMessage: errMsg,
      errorStack: errStack,
      characterId: input.characterId,
      fiveViewId: input.fiveViewId,
    }, "[FiveViewJob] 任务执行失败");

    // 批量模式异常时：更新角色和五视图状态为 failed
    if (input.characterId && input.fiveViewId) {
      try {
        // 更新五视图为 failed
        const existingView = await ctx.repos.characterFiveViews.findById(input.fiveViewId);
        if (existingView) {
          await ctx.repos.characterFiveViews.update({
            ...existingView,
            status: "failed",
            errorMessage: errMsg,
            updatedAt: ctx.clock.now(),
          });
        }
        // 更新角色为 failed
        await ctx.repos.libraryCharacters.updateStatus(input.characterId, "failed", ctx.clock.now());
      } catch (updateErr) {
        log.error({ updateErr }, "[FiveViewJob] 更新失败状态异常");
      }
    }

    await finalizeAsyncJob(repos, job.id, "failed", null, {
      code: "FIVE_VIEW_GENERATION_FAILED",
      message: errMsg,
    }, ctx.clock.now(), dispatcher);

    // 子任务失败时也要检查父任务是否需要自动完成
    if (job.parentJobId) {
      await checkAndFinalizeParentJob(ctx, job.parentJobId, dispatcher);
    }
  }
}

/**
 * 创建角色并关联到项目
 * 同时将角色预设信息写入角色表
 */
async function createCharacterAndAssociate(
  ctx: AppContext,
  userId: string,
  projectId: string,
  imageUrl: string,
  slot?: number,
): Promise<FiveViewJobResult> {
  // 获取项目信息用于命名角色和提取预设信息
  const project = await ctx.repos.projects.findById(projectId);
  if (!project) {
    throw new Error("项目不存在");
  }

  // 提取角色预设信息
  const roleDirection = project.selectedRoleDirection as Record<string, unknown> | null;
  const gender = (typeof roleDirection?.gender === "string" && (roleDirection.gender === "male" || roleDirection.gender === "female"))
    ? roleDirection.gender
    : null;
  const age = typeof roleDirection?.age === "number" ? roleDirection.age : null;
  const slotNum = slot ?? 1;

  // 查询搭配方案 title
  const outfitPlan = project.selectedOutfitPlanId
    ? await ctx.repos.outfitPlans.findById(project.selectedOutfitPlanId)
    : null;
  // 构建服饰描述
  const outfitDescResult = await getOutfitDescription(ctx, projectId);

  const characterName = buildCharacterName({
    outfitDescription: outfitDescResult.description,
    outfitPlanTitle: outfitPlan?.title,
    gender,
    age,
    slot: slotNum,
  });

  // 从 selectedRoleDirection 提取预设字段并映射到角色表
  const ethnicity = typeof roleDirection?.ethnicityOrRegion === "string" ? roleDirection.ethnicityOrRegion : null;
  const style = Array.isArray(roleDirection?.styleWords) && roleDirection.styleWords.length > 0
    ? (roleDirection.styleWords as string[]).filter(Boolean).join(", ")
    : null;

  // 创建角色（包含预设信息）
  const created = await ctx.characterLibraryService.create({ id: userId } as any, {
    name: characterName,
    kind: "image",
    fiveViewOssImageUrl: imageUrl,
    tags: ["step2-result", "auto-generated"],
    // 写入角色预设信息
    ethnicity,
    gender,
    age,
    style,
  });

  // 补建五视图记录
  try {
    const now = ctx.clock.now();
    const viewRecord = {
      id: randomUUID(),
      characterId: created.id,
      imageUrl,
      status: "ready" as const,
      isActive: false,
      prompt: null,
      model: null,
      generationParams: null,
      errorMessage: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await ctx.repos.characterFiveViews.create(viewRecord);
    await ctx.repos.characterFiveViews.setActive(created.id, viewRecord.id);
  } catch (fiveViewErr) {
    // 五视图记录创建失败不影响主流程
    log.error({ fiveViewErr, characterId: created.id }, "[FiveViewJob] 角色五视图记录创建失败");
  }

  // 清除该 slot 上原有角色的关联（软删除旧记录）
  if (slot !== undefined && slot !== null) {
    await ctx.repos.projectCharacters.softDeleteBySlot(projectId, slot, ctx.clock.now());
  }

  // 将角色关联到项目
  const now = ctx.clock.now();
  await ctx.repos.projectCharacters.create({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    projectId,
    libraryCharacterId: created.id,
    role: "main",
    isSelected: true,
    sourceType: "generated",
    generationSlot: slot ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deletedBy: null,
  });

  return {
    characterId: created.id,
    characterName: created.name,
    imageUrl,
    slot,
  };
}

// ========== 任务推进 ==========

/**
 * 推进五视图任务（由全局任务队列轮询触发）
 * 检查 pending 状态的任务并执行
 */
export async function advanceFiveViewJobs(
  ctx: AppContext,
  generator: FiveViewGenerator,
): Promise<void> {
  // 查询所有 pending 状态的五视图任务
  const rows = await ctx.repos.asyncJobs.findPendingByJobType(JOB_TYPE_FIVE_VIEW, 10);

  for (const row of rows) {
    const job = parseAsyncJobRow(row as Record<string, unknown>);
    await executeFiveViewJob(ctx, job, generator);
  }
}

// ========== 父任务自动完成逻辑 ==========

/**
 * 检查父任务的所有子任务状态
 * 如果所有子任务都已完成（或失败），标记父任务为 completed
 */
async function checkAndFinalizeParentJob(
  ctx: AppContext,
  parentJobId: string,
  dispatcher?: QueueDispatcher,
): Promise<void> {
  // 1. 查询父任务的所有子任务
  const children = await ctx.repos.asyncJobs.findChildrenByParentId(parentJobId);
  if (children.length === 0) {
    return; // 无子任务，不需要处理
  }

  // 2. 统计子任务状态
  const completedCount = children.filter(r => r.status === 'completed').length;
  const failedCount = children.filter(r => r.status === 'failed').length;
  const totalCount = children.length;

  // 3. 检查是否所有子任务都已完成（completed 或 failed）
  const allFinished = completedCount + failedCount === totalCount;

  if (!allFinished) {
    log.debug({ parentJobId, remaining: totalCount - completedCount - failedCount }, "[FiveViewJob] 父任务还有子任务进行中");
    return;
  }

  // 4. 所有子任务完成 → 标记父任务为 completed
  log.info({ parentJobId, completedCount, failedCount }, "[FiveViewJob] 父任务所有子任务完成");

  await finalizeAsyncJob(ctx.repos, parentJobId, "completed", {
    total: totalCount,
    completedCount,
    failedCount,
  }, null, ctx.clock.now(), dispatcher);

  // 5. 更新项目状态（只要有成功的就推进）
  if (completedCount > 0) {
    // 从父任务 input 获取 projectId
    const parentJob = await getAsyncJob(ctx.repos, parentJobId, () => ctx.clock.now());
    if (parentJob?.projectId) {
      const project = await ctx.repos.projects.findById(parentJob.projectId);
      const targetStatus = project?.projectKind === "image" ? "IMAGE_CHARACTER_VIEW_READY" : "CHARACTER_VIEW_READY";
      await ctx.repos.projects.updateStatus(parentJob.projectId, targetStatus);
    }
  }
}
