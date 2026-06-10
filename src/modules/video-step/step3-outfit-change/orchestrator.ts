/**
 * 服装换装流水线编排器（Executor 模式重构版）
 *
 * 功能：
 * - 创建 understand 子任务（pending 状态），由 QueueDispatcher 驱动执行
 * - understand 完成后自动创建 adapt 子任务
 * - adapt 完成后自动创建 gen 子任务
 * - gen 完成后自动合并结果
 *
 * 数据流：
 * - stage0/stage1/stage2/stage3 结果存储在 outfit_change_tasks 表
 * - executor 从 DB 读取上游结果，执行后写入 DB
 */

import type { AppContext } from "../../../core/app-context.js";
import type {
  OutfitChangeProjectInput,
} from "../../../contracts/outfit-change-contract.js";
import { createAsyncJob, updateAsyncJobStage } from "../../../service/async-job-service.js";
import { getLogger } from "../../../core/logger/index.js";
import { randomUUID } from "node:crypto";

const log = getLogger("outfit-change-orchestrator");

// ============================================================================
// 编排器输入输出类型
// ============================================================================

/** 编排器输入 */
export interface OrchestratorInput {
  /** 任务ID */
  taskId: string;
  /** 任务输入参数 */
  input: OutfitChangeProjectInput;
  /** 父异步任务ID（由路由层创建） */
  parentJobId: string;
}

/** 编排器输出 */
export interface OrchestratorOutput {
  /** 执行成功标识 */
  success: boolean;
  /** 任务ID */
  taskId: string;
  /** 错误信息（失败时填充） */
  error?: string;
}

// ============================================================================
// 主函数
// ============================================================================

/**
 * 启动服装换装流水线
 *
 * 流水线逻辑：
 * ```
 * 父任务 (outfit_change) → 创建 understand 子任务（pending）
 *   → understand executor 执行 Stage0+Stage1 → 创建 N 个 adapt 子任务
 *   → adapt executor 执行换帧 → 创建 gen 子任务
 *   → gen executor 执行生成 → 合并结果 → 完成父任务
 * ```
 *
 * @param ctx 应用上下文
 * @param input 编排器输入参数
 * @returns 编排器输出结果
 */
export async function executeOutfitChangePipeline(
  ctx: AppContext,
  input: OrchestratorInput
): Promise<OrchestratorOutput> {
  const { parentJobId } = input;

  log.info(
    {
      taskId: input.taskId,
      parentJobId,
      projectId: input.input.projectId,
      userId: input.input.userId,
    },
    "编排器: 启动服装换装流水线（Executor 模式）"
  );

  const repos = ctx.repos as import("../../../repositories/pg/index.js").PgRepositoryCollection;
  const now = ctx.clock.now();

  try {
    // 更新父任务状态
    await updateAsyncJobStage(repos, parentJobId, "创建理解任务", now);

    // 创建 understand 子任务（pending 状态，由 QueueDispatcher 驱动执行）
    // 不预设 ID，让 concurrencyService 生成实际 ID
    const understandJobResult = await createAsyncJob(repos, {
      userId: input.input.userId,
      jobType: "outfit_change_understand",
      input: JSON.stringify({ taskId: input.taskId }),
      now: ctx.clock.now(),
      projectId: input.input.projectId,
      parentJobId,
      initialStatus: "pending", // 关键：pending 状态，由 QueueDispatcher 驱动
    }, ctx.globalTaskConcurrencyService);

    const understandJobId = "jobId" in understandJobResult ? understandJobResult.jobId : "unknown";

    await updateAsyncJobStage(repos, parentJobId, "等待理解完成", now);

    log.info(
      { taskId: input.taskId, parentJobId, understandJobId },
      "编排器: understand 子任务已创建，等待 QueueDispatcher 驱动执行"
    );

    return {
      success: true,
      taskId: input.taskId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    log.error(
      { taskId: input.taskId, parentJobId, error: errorMessage },
      "编排器: 启动流水线失败"
    );

    return {
      success: false,
      taskId: input.taskId,
      error: errorMessage,
    };
  }
}
