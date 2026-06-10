/**
 * AnimateAnyone 动作迁移流程编排器（Executor 模式）
 *
 * 由 QueueDispatcher 调度执行，三步流程：
 *   1. 图片合规检测（同步）
 *   2. 动作模板生成（异步，仅上传视频模式）
 *   3. 视频生成（异步）
 */

import type { Pool } from "pg";
import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import type { AppContext } from "../../core/app-context.js";
import type { QueueDispatcher } from "../queue-dispatcher.js";
import type {
  ActionTransferStatus,
  ErrorStage,
} from "../../contracts/action-transfer-contract.js";
import type { AsyncJobRecord } from "../../service/async-job-service.js";
import {
  updateActionTransferTaskStatus,
  updateActionTransferTaskFields,
  findActionTransferTaskById,
} from "../../repositories/pg/action-transfer-tasks-pg-repository.js";
import {
  incrementTemplatePopularity,
  findActionTemplateById,
} from "../../repositories/pg/action-templates-pg-repository.js";
import { resolveRouteProvider } from "../../services/llm/provider-resolver.js";
import { ProviderRouteKeys, type ProviderRouteKey } from "../../contracts/provider-route-keys.js";
import type { ResolvedRouteProvider } from "../../services/llm/provider-resolver.js";
import {
  animateAnyoneDetectImage,
  createAnimateAnyoneTemplateTask,
  queryAnimateAnyoneTemplateTask,
  createAnimateAnyoneVideoTask,
  queryAnimateAnyoneVideoTask,
} from "../../service/llm/llm-animate-anyone.js";
import {
  getAsyncJob,
  updateAsyncJobStage,
  finalizeAsyncJob,
} from "../../service/async-job-service.js";
import { sseManager } from "../sse-manager.js";
import { getLogger } from "../../core/logger/index.js";
import { AppError } from "../../core/errors.js";

const log = getLogger("action-transfer-orchestrator");

/** 轮询配置 */
const POLL_INTERVAL_MS = 5000;  // 5 秒轮询间隔
const POLL_MAX_ATTEMPTS = 120;   // 最多 120 次（10 分钟）

// ---------------------------------------------------------------------------
// Executor 入口（由 QueueDispatcher 调用）
// ---------------------------------------------------------------------------

/**
 * 动作迁移 executor 入口
 *
 * 从 async job 中提取 taskId → 查数据库获取完整参数 → 执行三步流水线
 */
export async function executeActionTransferJob(
  ctx: AppContext,
  repos: PgRepositoryCollection,
  job: AsyncJobRecord,
  dispatcher: QueueDispatcher,
): Promise<void> {
  const parentJobId = job.id;
  const now = ctx.clock.now();

  // 解析 input，失败时直接 finalizeAsyncJob
  let taskId: string;
  try {
    const input = JSON.parse(job.input) as { taskId: string };
    taskId = input.taskId;
  } catch (parseError) {
    const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
    log.error({ parentJobId, error: errorMsg }, "编排器: 解析 job.input 失败");
    await finalizeAsyncJob(repos, parentJobId, "failed", null, {
      code: "INVALID_JOB_INPUT",
      message: `任务输入格式错误: ${errorMsg}`,
    }, now, dispatcher);
    return;
  }

  // 从数据库查任务详情（input 只传最小 ID）
  const task = await findActionTransferTaskById(ctx.pool, taskId);
  if (!task) {
    await finalizeAsyncJob(repos, parentJobId, "failed", null, {
      code: "TASK_NOT_FOUND",
      message: `任务不存在: ${taskId}`,
    }, now, dispatcher);
    return;
  }

  const userId = task.userId;

  log.info({ taskId, parentJobId, projectId: task.projectId, actionSourceType: task.actionSourceType }, "编排器: 启动动作迁移流水线");

  // 检查任务是否已被取消
  if (task.status === "cancelled") {
    log.info({ taskId }, "编排器: 任务已取消，跳过执行");
    await finalizeAsyncJob(repos, parentJobId, "failed", null, {
      code: "TASK_CANCELLED",
      message: "任务已取消",
    }, now, dispatcher);
    return;
  }

  try {
    // ========================================================================
    // Step 1: 图片合规检测
    // ========================================================================
    await updateStage(ctx.pool, repos, taskId, parentJobId, "detecting", "正在检测图片合规性...", now, ctx);

    const detectProvider = await resolveProviderOrThrow(ctx, ProviderRouteKeys.ANIMATE_ANYONE_DETECT);
    const detectResult = await animateAnyoneDetectImage(detectProvider, task.targetImageUrl);

    // 保存检测结果
    await updateActionTransferTaskFields(ctx.pool, taskId, {
      imageValid: detectResult.valid,
      imageCheckResult: {
        valid: detectResult.valid,
        reason: detectResult.reason,
        suggestions: detectResult.suggestions,
      },
    }, ctx.clock.now());

    if (!detectResult.valid) {
      const errorMsg = detectResult.reason || "图片不符合规范";
      await failTask(ctx.pool, repos, taskId, parentJobId, userId, errorMsg, "detecting", ctx.clock.now(), dispatcher);
      return;
    }

    log.info({ taskId }, "编排器: 图片检测通过");
    await updateStage(ctx.pool, repos, taskId, parentJobId, "detected", "图片检测通过", ctx.clock.now(), ctx);

    // ========================================================================
    // Step 2: 获取动作模板
    // ========================================================================
    let templateId: string;
    let templateDuration: number;

    if (task.actionSourceType === "upload_video") {
      await updateStage(ctx.pool, repos, taskId, parentJobId, "template_generating", "正在从视频提取动作模板...", ctx.clock.now(), ctx);

      const templateProvider = await resolveProviderOrThrow(ctx, ProviderRouteKeys.ANIMATE_ANYONE_TEMPLATE);
      const createResult = await createAnimateAnyoneTemplateTask(templateProvider, task.sourceVideoUrl!);

      const pollResult = await pollAsyncTask(
        () => queryAnimateAnyoneTemplateTask(templateProvider, createResult.taskId),
        "模板生成",
        taskId,
        async () => {
          const t = await findActionTransferTaskById(ctx.pool, taskId);
          return t?.status === "cancelled";
        },
      );

      if (!pollResult.success || !pollResult.templateId) {
        const errorMsg = pollResult.error || "模板生成失败";
        await failTask(ctx.pool, repos, taskId, parentJobId, userId, errorMsg, "template_generating", ctx.clock.now(), dispatcher);
        return;
      }

      templateId = pollResult.templateId;
      templateDuration = pollResult.duration ?? 0;

      await updateActionTransferTaskFields(ctx.pool, taskId, {
        templateId,
        templateDurationSec: templateDuration,
      }, ctx.clock.now());

      log.info({ taskId, templateId, templateDuration }, "编排器: 模板生成完成");
    } else {
      const template = await findActionTemplateById(ctx.pool, task.builtinTemplateId!);

      if (!template || !template.isActive) {
        const errorMsg = "模板不存在或已禁用";
        await failTask(ctx.pool, repos, taskId, parentJobId, userId, errorMsg, "template_generating", ctx.clock.now(), dispatcher);
        return;
      }

      templateId = template.aliTemplateId!;
      templateDuration = template.durationSec;

      if (!templateId) {
        const errorMsg = "模板缺少阿里云模板 ID";
        await failTask(ctx.pool, repos, taskId, parentJobId, userId, errorMsg, "template_generating", ctx.clock.now(), dispatcher);
        return;
      }

      await incrementTemplatePopularity(ctx.pool, template.id);

      await updateActionTransferTaskFields(ctx.pool, taskId, {
        templateId,
        templateDurationSec: templateDuration,
      }, ctx.clock.now());

      log.info({ taskId, templateId, builtinTemplateId: task.builtinTemplateId }, "编排器: 使用内置模板");
    }

    await updateStage(ctx.pool, repos, taskId, parentJobId, "template_generated", "动作模板就绪", ctx.clock.now(), ctx);

    // ========================================================================
    // Step 3: 视频生成
    // ========================================================================
    await updateStage(ctx.pool, repos, taskId, parentJobId, "generating", "正在生成视频...", ctx.clock.now(), ctx);

    const videoProvider = await resolveProviderOrThrow(ctx, ProviderRouteKeys.ANIMATE_ANYONE_VIDEO_GENERATION);
    const videoCreateResult = await createAnimateAnyoneVideoTask(
      videoProvider,
      task.targetImageUrl,
      templateId,
      {
        prompt: task.prompt ?? undefined,
        duration: task.durationSec || templateDuration,
        backgroundMode: task.backgroundMode as "image" | "video" | undefined,
      }
    );

    const videoPollResult = await pollAsyncTask(
      () => queryAnimateAnyoneVideoTask(videoProvider, videoCreateResult.taskId),
      "视频生成",
      taskId,
      async () => {
        const t = await findActionTransferTaskById(ctx.pool, taskId);
        return t?.status === "cancelled";
      },
    );

    if (!videoPollResult.success || !videoPollResult.videoUrl) {
      const errorMsg = videoPollResult.error || "视频生成失败";
      await failTask(ctx.pool, repos, taskId, parentJobId, userId, errorMsg, "generating", ctx.clock.now(), dispatcher);
      return;
    }

    // 保存视频结果
    await updateActionTransferTaskFields(ctx.pool, taskId, {
      resultVideoUrl: videoPollResult.videoUrl,
      resultDurationSec: videoPollResult.duration,
      resultWidth: videoPollResult.width,
      resultHeight: videoPollResult.height,
    }, ctx.clock.now());

    // ========================================================================
    // 完成
    // ========================================================================
    await updateActionTransferTaskStatus(ctx.pool, taskId, "succeeded", ctx.clock.now());

    // 更新项目状态为 READY_TO_PUBLISH
    await repos.projects.updateStatusAndExport(task.projectId, 'READY_TO_PUBLISH', videoPollResult.videoUrl, '', videoPollResult.duration ?? 0, ctx.clock.now());

    await finalizeAsyncJob(repos, parentJobId, "completed", {
      videoUrl: videoPollResult.videoUrl,
      duration: videoPollResult.duration,
      width: videoPollResult.width,
      height: videoPollResult.height,
    }, null, ctx.clock.now(), dispatcher);

    // SSE 通知（finalizeAsyncJob 内部也会推，这里推业务层额外信息）
    sseManager.pushToUser(userId, {
      type: "job_completed",
      jobId: parentJobId,
      jobType: "action_transfer",
      status: "completed",
      timestamp: ctx.clock.now(),
    });

    log.info({ taskId, videoUrl: videoPollResult.videoUrl }, "编排器: 动作迁移流水线完成");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error({ taskId, parentJobId, error: errorMsg }, "编排器: 动作迁移流水线失败");
    await failTask(ctx.pool, repos, taskId, parentJobId, userId, errorMsg, "generating", ctx.clock.now(), dispatcher);
  }
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 解析 Provider，失败时抛错 */
async function resolveProviderOrThrow(
  ctx: AppContext,
  routeKey: ProviderRouteKey
): Promise<ResolvedRouteProvider> {
  const provider = await resolveRouteProvider(ctx, routeKey);
  if (!provider) {
    throw new AppError(500, "PROVIDER_NOT_FOUND", `未找到 routeKey=${routeKey} 的 Provider 配置`);
  }
  return provider;
}

/** 更新阶段状态 + SSE 通知 */
async function updateStage(
  pool: Pool,
  repos: PgRepositoryCollection,
  taskId: string,
  parentJobId: string,
  status: ActionTransferStatus,
  message: string,
  now: number,
  ctx: AppContext,
): Promise<void> {
  await updateActionTransferTaskStatus(ctx.pool, taskId, status, now);
  await updateAsyncJobStage(repos, parentJobId, message, now);
}

/** 标记任务失败 */
async function failTask(
  pool: Pool,
  repos: PgRepositoryCollection,
  taskId: string,
  parentJobId: string,
  userId: string,
  errorMessage: string,
  errorStage: ErrorStage,
  now: number,
  dispatcher: QueueDispatcher,
): Promise<void> {
  await updateActionTransferTaskStatus(pool, taskId, "failed", now);
  await updateActionTransferTaskFields(pool, taskId, {
    errorMessage,
    errorStage,
  }, now);

  await finalizeAsyncJob(repos, parentJobId, "failed", null, {
    code: "PIPELINE_ERROR",
    message: errorMessage,
  }, now, dispatcher);

  sseManager.pushToUser(userId, {
    type: "job_failed",
    jobId: parentJobId,
    jobType: "action_transfer",
    status: "failed",
    error: { code: "PIPELINE_ERROR", message: errorMessage },
    timestamp: now,
  });
}

/** 轮询查询结果（通用） */
interface PollResult {
  success: boolean;
  templateId?: string;
  duration?: number;
  videoUrl?: string;
  width?: number;
  height?: number;
  error?: string;
}

async function pollAsyncTask(
  queryFn: () => Promise<{
    status: "pending" | "succeeded" | "failed";
    templateId?: string;
    duration?: number;
    videoUrl?: string;
    width?: number;
    height?: number;
    error?: { code: string; message: string };
  }>,
  stageName: string,
  taskId: string,
  isCancelled?: () => Promise<boolean>,
): Promise<PollResult> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    // 检查是否已取消
    if (isCancelled && await isCancelled()) {
      return { success: false, error: "任务已取消" };
    }

    const result = await queryFn();

    if (result.status === "succeeded") {
      return {
        success: true,
        templateId: result.templateId,
        duration: result.duration,
        videoUrl: result.videoUrl,
        width: result.width,
        height: result.height,
      };
    }

    if (result.status === "failed") {
      return {
        success: false,
        error: result.error?.message || `${stageName}失败`,
      };
    }

    log.debug({ taskId, stageName, attempt: attempt + 1 }, `${stageName}轮询中...`);
    await sleep(POLL_INTERVAL_MS);
  }

  return { success: false, error: `${stageName}超时（${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000}秒）` };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
