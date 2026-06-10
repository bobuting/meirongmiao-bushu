/**
 * 通用异步任务服务
 * 基于 nrm_async_jobs 表，提供任务类型无关的 CRUD 操作。
 * 不同业务（LLM 反推、五视图生成等）通过 job_type 字段区分。
 *
 * 【Phase 3 数据层迁移】所有 pool.query 已迁移至 PgAsyncJobRepository。
 */

import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import { getLogger } from "../core/logger/index.js";
import { sseManager } from "../modules/sse-manager.js";
import type { GlobalTaskConcurrencyService, JobCreatedResult, JobRejectedResult } from "../modules/global-task-concurrency-service.js";
import type { QueueDispatcher } from "../modules/queue-dispatcher.js";

const logger = getLogger("async-job");

// ========== 类型定义 ==========

/** 任务状态 */
export type AsyncJobStatus = "pending" | "running" | "completed" | "failed" | "expired";

/** 通用异步任务记录 */
export interface AsyncJobRecord {
  id: string;
  jobType: string;
  userId: string;
  /** 关联项目 ID（Step3 等业务需要） */
  projectId: string | null;
  input: string;
  status: AsyncJobStatus;
  /** 当前处理阶段（running 时有效），不同 job_type 自定义阶段值 */
  stage: string | null;
  createdAt: number;
  updatedAt: number;
  result: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  /** 父任务 ID，NULL 表示顶层任务 */
  parentJobId: string | null;
  /** 依赖的 job id 数组，全部 completed 后才可 promote */
  dependsOn: string[] | null;
  /** 执行模式: "once" = 执行一次, "poll" = 需轮询外部 API */
  executionMode: "once" | "poll";
}

/** 任务过期时间（2 小时） */
export const ASYNC_JOB_TTL_MS = 2 * 60 * 60 * 1000;

// ========== DB 操作函数 ==========

/** 从 DB 行解析为 AsyncJobRecord */
export function parseAsyncJobRow(row: Record<string, unknown>): AsyncJobRecord {
  return {
    id: row.id as string,
    jobType: (row.job_type as string) || "llm_reverse",
    userId: row.user_id as string,
    projectId: (row.project_id as string | null) || null,
    input: row.input as string,
    status: row.status as AsyncJobStatus,
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

/** 创建新任务（支持原子并发检查，超并发时排队） */
export async function createAsyncJob(
  repos: PgRepositoryCollection,
  params: {
    /** 任务 ID（有 concurrencyService 时由服务生成，可省略） */
    id?: string;
    userId: string;
    jobType: string;
    input: string;
    now: number;
    /** 关联项目 ID（可选） */
    projectId?: string;
    /** 是否对用户可见（默认 true），后台系统任务设为 false */
    visibleToUser?: boolean;
    /** 父任务 ID（子任务场景） */
    parentJobId?: string;
    /** 依赖的 job id 数组（全部 completed 后才可 promote） */
    dependsOn?: string[];
    /** 初始状态（默认 'running'，依赖任务可设为 'pending'） */
    initialStatus?: "pending" | "running";
    /** 执行模式（默认 "once"）；Query 任务传 "poll" */
    executionMode?: "once" | "poll";
  },
  /** 并发控制服务（可选），提供时使用原子并发检查并自动生成 ID */
  concurrencyService?: GlobalTaskConcurrencyService,
): Promise<JobCreatedResult | JobRejectedResult> {
  const aj = repos.asyncJobs;

  // 如果提供并发控制服务，使用原子检查 + 创建（超并发时排队）
  if (concurrencyService) {
    const inputObj = JSON.parse(params.input) as Record<string, unknown>;
    const result = await concurrencyService.createJobWithConcurrencyCheck(
      params.userId,
      params.jobType,
      params.projectId ?? null,
      inputObj,
      params.now,
      params.parentJobId,
      params.dependsOn,
      params.initialStatus, // 【并发改造】传递 initialStatus 给 concurrencyService
      params.executionMode,
    );

    // 推送 SSE 信号（创建成功且对用户可见）
    if ("jobId" in result) {
      sseManager.pushToUser(params.userId, {
        type: "job_created",
        jobId: result.jobId,
        jobType: params.jobType,
        timestamp: params.now,
      });
    }

    return result;
  }

  // 无并发控制服务时，id 必须由调用方提供
  if (!params.id) {
    throw new Error("createAsyncJob: id is required when concurrencyService is not provided");
  }

  // 原有逻辑：直接创建（无并发检查）
  const visible = params.visibleToUser !== false;
  const status = params.initialStatus ?? "running";
  await aj.insertJob({
    id: params.id,
    userId: params.userId,
    jobType: params.jobType,
    projectId: params.projectId ?? null,
    input: params.input,
    status,
    now: params.now,
    visibleToUser: visible,
    parentJobId: params.parentJobId ?? null,
    dependsOn: params.dependsOn ?? null,
    executionMode: params.executionMode ?? "once",
  });

  // 推送 SSE 信号（仅对用户可见的任务）
  if (visible) {
    sseManager.pushToUser(params.userId, {
      type: "job_created",
      jobId: params.id,
      jobType: params.jobType,
      timestamp: params.now,
    });
  }

  return { jobId: params.id, running: status === "running", queuePosition: 0 };
}

/** 清理过期任务 */
export async function purgeExpiredAsyncJobs(repos: PgRepositoryCollection, now: () => number): Promise<void> {
  const cutoff = now() - ASYNC_JOB_TTL_MS;
  await repos.asyncJobs.purgeExpired(cutoff);
}

/** 查询单个任务（含过期处理） */
export async function getAsyncJob(
  repos: PgRepositoryCollection,
  jobId: string,
  now: () => number,
): Promise<AsyncJobRecord | null> {
  const aj = repos.asyncJobs;
  const row = await aj.findByIdFullRow(jobId);
  if (!row) return null;

  const job = parseAsyncJobRow(row);
  if (now() - job.updatedAt > ASYNC_JOB_TTL_MS) {
    if (job.status !== "expired") {
      const expiredAt = now();
      await aj.markExpired(jobId, expiredAt);
      logger.warn({ jobId, jobType: job.jobType, userId: job.userId }, "任务已过期");

      // 推送 SSE 信号
      sseManager.pushToUser(job.userId, {
        type: "job_failed",
        jobId,
        jobType: job.jobType,
        status: "failed",
        error: { code: "EXPIRED", message: "任务已过期" },
        timestamp: expiredAt,
      });
    }
    return { ...job, status: "expired" };
  }
  return job;
}

/** 查询用户所有任务（仅返回用户可见任务） */
export async function getUserAsyncJobs(
  repos: PgRepositoryCollection,
  userId: string,
  limit: number = 50,
): Promise<AsyncJobRecord[]> {
  const rows = await repos.asyncJobs.findVisibleByUserId(userId, limit);
  return rows.map(parseAsyncJobRow);
}

/** 更新任务阶段（不改变 status，由 tryPromote 或 createAsyncJob 管理） */
export async function updateAsyncJobStage(
  repos: PgRepositoryCollection,
  jobId: string,
  stage: string,
  now: number,
  partialResult?: Record<string, unknown>,
): Promise<void> {
  const aj = repos.asyncJobs;
  if (partialResult && Object.keys(partialResult).length > 0) {
    await aj.updateStageAndResult(jobId, stage, partialResult, now);
  } else {
    await aj.updateStage(jobId, stage, now);
  }

  // 推送 SSE 信号（查询 userId 和 jobType）
  try {
    const userInfo = await aj.findUserInfoById(jobId);
    if (userInfo) {
      sseManager.pushToUser(userInfo.user_id, {
        type: "job_updated",
        jobId,
        jobType: userInfo.job_type,
        timestamp: now,
      });
    }
  } catch (err) {
    logger.error({ jobId, err }, "推送 SSE 信号失败");
  }
}

/** 设置任务最终状态（completed / failed），释放槽位后触发队列提升 */
export async function finalizeAsyncJob(
  repos: PgRepositoryCollection,
  jobId: string,
  status: "completed" | "failed",
  result: Record<string, unknown> | null,
  error: { code: string; message: string } | null,
  now: number,
  /** 队列调度器（可选），提供时任务完成后触发 pending → running 提升 */
  dispatcher?: QueueDispatcher,
): Promise<void> {
  const aj = repos.asyncJobs;
  const rowCount = await aj.finalizeJob(
    jobId,
    status,
    JSON.stringify(result),
    JSON.stringify(error),
    now,
  );

  // UPDATE 影响 0 行 = 任务已被其他 executor 终结，跳过重复通知
  if (rowCount === 0) {
    logger.warn({ jobId, status }, "任务已由其他 executor 终结，跳过重复 finalize");
    return;
  }

  // 推送 SSE 信号（查询 userId 和 jobType）
  try {
    const userInfo = await aj.findUserInfoById(jobId);
    if (userInfo) {
      sseManager.pushToUser(userInfo.user_id, {
        type: status === "completed" ? "job_completed" : "job_failed",
        jobId,
        jobType: userInfo.job_type,
        status,
        error: error ?? undefined,
        timestamp: now,
      });
    }
  } catch (err) {
    logger.error({ jobId, err }, "推送 SSE 信号失败");
  }

  // 任务完成/失败，释放 running 槽位，尝试提升排队任务
  if (dispatcher) {
    await dispatcher.tryPromote().catch((err) => {
      logger.error({ jobId, err }, "任务完成后触发队列提升失败");
    });
  }
}

/** 按项目 ID 查询任务（Step3 等业务使用，仅返回用户可见任务） */
export async function getJobsByProjectId(
  repos: PgRepositoryCollection,
  projectId: string,
): Promise<AsyncJobRecord[]> {
  const rows = await repos.asyncJobs.findVisibleByProjectId(projectId);
  return rows.map(parseAsyncJobRow);
}

/** 查找项目指定类型的进行中任务（pending / running） */
export async function findActiveJobByProjectAndType(
  repos: PgRepositoryCollection,
  projectId: string,
  jobType: string,
): Promise<AsyncJobRecord | null> {
  const row = await repos.asyncJobs.findActiveByProjectAndType(projectId, jobType);
  return row ? parseAsyncJobRow(row) : null;
}

/** 查找项目指定类型的最新一条任务（不管状态） */
export async function findLatestJobByProjectAndType(
  repos: PgRepositoryCollection,
  projectId: string,
  jobType: string,
): Promise<AsyncJobRecord | null> {
  const row = await repos.asyncJobs.findLatestByProjectAndTypeFull(projectId, jobType);
  return row ? parseAsyncJobRow(row) : null;
}

/** 合并更新 result JSONB（保留已有字段） */
export async function updateAsyncJobResult(
  repos: PgRepositoryCollection,
  jobId: string,
  partialResult: Record<string, unknown>,
  now: number,
): Promise<void> {
  await repos.asyncJobs.mergeResult(jobId, partialResult, now);
}

/**
 * 仅更新 result 中指定 key，不覆盖其他字段（如 completedClipCount）。
 * 用于 retry/排队等只改 retryNotBefore/enqueuedAt 的路径，避免用过期数据覆盖进度字段。
 * value 为 null 时会删除该 key（用 #- 操作符）。
 */
export async function updateAsyncJobResultKeys(
  repos: PgRepositoryCollection,
  jobId: string,
  keys: Record<string, unknown>,
  now: number,
): Promise<void> {
  await repos.asyncJobs.updateResultKeys(jobId, keys, now);
}

/** 只更新 status 字段（不触及其他列） */
export async function updateAsyncJobStatus(
  repos: PgRepositoryCollection,
  jobId: string,
  status: AsyncJobStatus,
  now: number,
): Promise<void> {
  await repos.asyncJobs.updateStatus(jobId, status, now);
}

/** 查询所有活跃的 step4_video 任务 */
export async function findActiveStep4VideoJobs(repos: PgRepositoryCollection): Promise<AsyncJobRecord[]> {
  const rows = await repos.asyncJobs.findActiveStep4VideoJobs();
  return rows.map(parseAsyncJobRow);
}

/** 按项目查询 step4_video 任务 */
export async function findStep4VideoJobsByProjectId(repos: PgRepositoryCollection, projectId: string): Promise<AsyncJobRecord[]> {
  const rows = await repos.asyncJobs.findStep4VideoJobsByProjectId(projectId);
  return rows.map(parseAsyncJobRow);
}

/** 取消项目指定前缀的进行中任务（status pending/running → failed） */
export async function cancelActiveJobsByTypePrefix(
  repos: PgRepositoryCollection,
  projectId: string,
  jobTypePrefix: string,
  now: number,
): Promise<number> {
  const aj = repos.asyncJobs;
  const errorJson = JSON.stringify({ code: "CANCELLED_BY_LOCK", message: "脚本已锁定，任务自动取消" });
  const cancelled = await aj.cancelActiveByTypePrefix(projectId, jobTypePrefix, errorJson, now);
  const count = cancelled.length;
  if (count > 0) {
    logger.info({ projectId, jobTypePrefix, count }, "取消进行中的任务");

    // 推送 SSE 信号
    for (const row of cancelled) {
      sseManager.pushToUser(row.user_id, {
        type: "job_failed",
        jobId: row.id,
        jobType: row.job_type,
        status: "failed",
        error: { code: "CANCELLED_BY_LOCK", message: "脚本已锁定，任务自动取消" },
        timestamp: now,
      });
    }
  }
  return count;
}

/** 查询父任务的所有子任务 */
export async function findChildrenByParentId(
  repos: PgRepositoryCollection,
  parentJobId: string,
): Promise<AsyncJobRecord[]> {
  const rows = await repos.asyncJobs.findChildrenByParentIdFull(parentJobId);
  return rows.map(parseAsyncJobRow);
}

/**
 * 子任务完成/失败后检查父任务状态
 * - 每次调用时更新父任务进度（completedChildCount / totalChildCount）
 * - 全部子任务 terminal → 聚合结果 → finalize 父任务 → 递归检查祖父任务
 * - 子任务失败 → 将依赖该失败任务的 pending 兄弟也标记为 failed
 */
export async function checkAndFinalizeParent(
  repos: PgRepositoryCollection,
  parentJobId: string,
  dispatcher?: QueueDispatcher,
  now?: number,
): Promise<void> {
  const aj = repos.asyncJobs;
  const resolvedNow = now ?? Date.now();
  const children = await findChildrenByParentId(repos, parentJobId);
  if (children.length === 0) return;

  const totalChildCount = children.length;
  const completedChildCount = children.filter((c) => c.status === "completed").length;
  const failedChildCount = children.filter((c) => c.status === "failed").length;

  // 更新父任务进度（即使未全部完成也更新，让前端实时展示进度）
  await aj.mergeResult(parentJobId, { completedChildCount, totalChildCount, failedChildCount }, resolvedNow);

  // 推送 SSE 进度信号
  try {
    const parentInfo = await aj.findParentInfoById(parentJobId);
    if (parentInfo) {
      sseManager.pushToUser(parentInfo.user_id, {
        type: "job_updated",
        jobId: parentJobId,
        jobType: parentInfo.job_type,
        timestamp: resolvedNow,
        progress: { completedChildCount, totalChildCount, failedChildCount },
      });
    }
  } catch (err) {
    logger.error({ parentJobId, err }, "推送父任务进度 SSE 信号失败");
  }

  // 收集已 failed 的子任务 ID，用于失败传播
  const failedIds = new Set(
    children.filter((c) => c.status === "failed").map((c) => c.id),
  );

  // 失败传播：将 depends_on 包含 failed ID 的 pending 子任务也标记为 failed
  if (failedIds.size > 0) {
    for (const child of children) {
      if (child.status !== "pending") continue;
      const deps = child.dependsOn;
      if (!deps) continue;
      const dependsOnFailed = deps.some((depId) => failedIds.has(depId));
      if (dependsOnFailed) {
        const errorJson = JSON.stringify({
          code: "DEPENDENCY_FAILED",
          message: "依赖的上游任务已失败，本任务自动取消",
        });
        await aj.markChildFailed(child.id, errorJson, resolvedNow);
        logger.info({ jobId: child.id, parentJobId, failedDep: deps.find((d) => failedIds.has(d)) }, "依赖失败传播，标记子任务为 failed");

        // 推送 SSE 信号
        sseManager.pushToUser(child.userId, {
          type: "job_failed",
          jobId: child.id,
          jobType: child.jobType,
          status: "failed",
          error: { code: "DEPENDENCY_FAILED", message: "依赖的上游任务已失败，本任务自动取消" },
          timestamp: resolvedNow,
        });
      }
    }
  }

  // 重新查询子任务状态（失败传播可能改变了状态）
  const updatedChildren = await findChildrenByParentId(repos, parentJobId);
  const allTerminal = updatedChildren.every(
    (c) => c.status === "completed" || c.status === "failed",
  );
  if (!allTerminal) return;

  // 聚合子任务结果
  const anyFailed = updatedChildren.some((c) => c.status === "failed");
  const aggregatedResult: Record<string, unknown> = {
    childResults: updatedChildren.map((c) => ({
      jobId: c.id,
      jobType: c.jobType,
      status: c.status,
      result: c.result,
      error: c.error,
    })),
    completedChildCount: updatedChildren.filter((c) => c.status === "completed").length,
    failedChildCount: updatedChildren.filter((c) => c.status === "failed").length,
    totalChildCount: updatedChildren.length,
  };

  // 聚合错误信息
  const aggregatedError = anyFailed
    ? {
        code: "CHILD_JOB_FAILED",
        message: updatedChildren
          .filter((c) => c.status === "failed" && c.error)
          .map((c) => `${c.jobType}: ${c.error!.message}`)
          .join("; "),
      }
    : null;

  // 获取父任务自身的 parent_job_id（用于递归结算）
  let grandparentJobId: string | null = null;
  try {
    const parentRow = await aj.getParentJobId(parentJobId);
    grandparentJobId = parentRow ?? null;
  } catch { /* ignore */ }

  await finalizeAsyncJob(
    repos,
    parentJobId,
    anyFailed ? "failed" : "completed",
    aggregatedResult,
    aggregatedError,
    resolvedNow,
    dispatcher,
  );

  logger.info(
    { parentJobId, finalStatus: anyFailed ? "failed" : "completed", childCount: updatedChildren.length },
    "父任务已 finalize",
  );

  // === Step3 完成后自动更新项目状态 ===
  // 当 image_step3_model_photo 任务完成（全部子任务完成）时，更新项目状态为 IMAGE_MODEL_PHOTOS_READY
  if (!anyFailed) {
    try {
      // 查询父任务类型和项目 ID
      const parentJobInfo = await aj.findJobTypeAndProjectId(parentJobId);
      if (parentJobInfo?.job_type === "image_step3_model_photo" && parentJobInfo?.project_id) {
        const projectId = parentJobInfo.project_id;
        // 跨表更新项目状态
        await repos.projects.updateStatus(projectId, "IMAGE_MODEL_PHOTOS_READY");
        logger.info({ projectId, parentJobId }, "Step3 任务完成，更新项目状态为 IMAGE_MODEL_PHOTOS_READY");
      }
    } catch (err) {
      logger.error({ parentJobId, err }, "更新项目状态失败");
    }
  }

  // 递归结算：父任务 finalize 后，继续检查祖父任务
  if (grandparentJobId) {
    await checkAndFinalizeParent(repos, grandparentJobId, dispatcher, resolvedNow);
  }
}

/**
 * 启动时恢复孤立父任务
 * server 重启后，内存中的 setInterval / async IIFE 丢失，
 * 父任务会卡在 running 状态。此函数扫描并收尾。
 *
 * 策略：
 * - 有 DB 级子任务且全部 terminal → checkAndFinalizeParent（聚合结果）
 * - 有子任务但仍有 running → 不动（等子任务正常完成后触发 checkAndFinalizeParent）
 * - 无 DB 级子任务（如 step2_batch_five_view）→ finalize 为 failed
 */
export async function recoverOrphanedParentJobs(
  repos: PgRepositoryCollection,
  dispatcher: QueueDispatcher,
  now: () => number,
): Promise<{ recovered: number; finalized: number }> {
  const cutoff = now() - 5000;
  const rows = await repos.asyncJobs.findOrphanedRunningParentJobs(cutoff);

  if (rows.length === 0) return { recovered: 0, finalized: 0 };

  let recovered = 0;
  let finalized = 0;

  for (const parent of rows) {
    const children = await findChildrenByParentId(repos, parent.id);

    if (children.length > 0) {
      const allTerminal = children.every((c) => c.status === "completed" || c.status === "failed");
      if (allTerminal) {
        await checkAndFinalizeParent(repos, parent.id, dispatcher, now());
        recovered++;
      }
      // 仍有 running 子任务 → 等子任务完成后自行触发 checkAndFinalizeParent
    } else {
      // 无 DB 级子任务（内存顺序执行模式，如 step2_batch_five_view）
      await finalizeAsyncJob(repos, parent.id, "failed", null, {
        code: "SERVER_RESTARTED",
        message: "服务器重启导致任务中断，请重试",
      }, now(), dispatcher);
      finalized++;
    }
  }

  logger.info({ total: rows.length, recovered, finalized }, "启动恢复孤立父任务完成");
  return { recovered, finalized };
}
