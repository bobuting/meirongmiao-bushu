/**
 * action-transfer-routes.ts
 * AnimateAnyone 动作迁移 API 路由
 *
 * 端点：
 * - POST /action-transfer/tasks         — 创建动作迁移任务
 * - GET  /action-transfer/tasks/:taskId — 查询任务详情
 * - GET  /action-transfer/tasks         — 查询任务列表
 * - POST /action-transfer/tasks/:taskId/cancel — 取消任务
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { CreateActionTransferTaskInput, ActionSourceType } from "../contracts/action-transfer-contract.js";
import { AppError } from "../core/errors.js";
import { requireUser } from "../services/auth/route-guards.js";
import { getLogger } from "../core/logger/index.js";
import { createAsyncJob } from "../service/async-job-service.js";
import {
  createActionTransferTask,
  findActionTransferTaskById,
  findActionTransferTaskByProjectId,
  queryActionTransferTasksByUser,
  updateActionTransferTaskStatus,
  updateActionTransferTaskFields,
} from "../repositories/pg/action-transfer-tasks-pg-repository.js";

const log = getLogger("action-transfer-routes");

/** 路由依赖 */
export interface ActionTransferRouteDeps {
  ctx: AppContext;
}

/**
 * 注册动作迁移 API 路由
 */
export async function registerActionTransferRoutes(
  app: FastifyInstance,
  deps: ActionTransferRouteDeps
): Promise<void> {
  const { ctx } = deps;

  // ===========================================================================
  // POST /action-transfer/tasks
  // 创建动作迁移任务
  // ===========================================================================
  app.post("/action-transfer/tasks", async (request, reply) => {
    const user = await requireUser(ctx, request);
    const body = request.body as {
      projectId: string;
      actionSourceType: ActionSourceType;
      sourceVideoUrl?: string;
      builtinTemplateId?: string;
      targetImageUrl: string;
      prompt?: string;
      durationSec?: number;
      backgroundMode?: "image" | "video";
    };

    // 验证必填字段
    if (!body.projectId) {
      throw new AppError(400, "MISSING_PROJECT_ID", "项目 ID 不能为空");
    }
    if (!body.targetImageUrl) {
      throw new AppError(400, "MISSING_TARGET_IMAGE_URL", "目标图片 URL 不能为空");
    }
    if (!body.actionSourceType) {
      throw new AppError(400, "MISSING_ACTION_SOURCE_TYPE", "动作来源类型不能为空");
    }

    // 验证动作来源参数
    if (body.actionSourceType === "upload_video" && !body.sourceVideoUrl) {
      throw new AppError(400, "MISSING_SOURCE_VIDEO_URL", "上传视频模式必须提供 sourceVideoUrl");
    }
    if (body.actionSourceType === "builtin_template" && !body.builtinTemplateId) {
      throw new AppError(400, "MISSING_BUILTIN_TEMPLATE_ID", "内置模板模式必须提供 builtinTemplateId");
    }

    // 检查项目是否已有任务
    const existingTask = await findActionTransferTaskByProjectId(ctx.pool, body.projectId);
    if (existingTask) {
      throw new AppError(409, "TASK_ALREADY_EXISTS", "该项目已存在动作迁移任务");
    }

    const now = Date.now();

    const taskInput: CreateActionTransferTaskInput = {
      projectId: body.projectId,
      userId: user.id,
      actionSourceType: body.actionSourceType,
      sourceVideoUrl: body.sourceVideoUrl,
      builtinTemplateId: body.builtinTemplateId,
      targetImageUrl: body.targetImageUrl,
      prompt: body.prompt,
      durationSec: body.durationSec,
      backgroundMode: body.backgroundMode,
    };

    // 创建任务记录
    const task = await createActionTransferTask(ctx.pool, taskInput, now);

    // 创建父异步任务
    const jobResult = await createAsyncJob(ctx.repos, {
      userId: user.id,
      jobType: "action_transfer",
      input: JSON.stringify({ taskId: task.taskId }),
      now,
      projectId: body.projectId,
      initialStatus: "pending",
    }, ctx.globalTaskConcurrencyService);

    if ("error" in jobResult) {
      return reply.code(429).send({ code: jobResult.errorCode, message: jobResult.error });
    }

    const parentJobId = jobResult.jobId;

    // 更新 asyncJobId
    await updateActionTransferTaskFields(ctx.pool, task.taskId, { asyncJobId: parentJobId }, now);

    // 更新项目状态
    await ctx.repos.projects.updateStatus(body.projectId, "FILMING");

    // 任务已创建为 pending，QueueDispatcher 会自动调度执行

    return reply.send({
      success: true,
      data: {
        taskId: task.taskId,
        asyncJobId: parentJobId,
        status: "pending",
      },
    });
  });

  // ===========================================================================
  // GET /action-transfer/tasks/:taskId
  // 查询任务详情
  // ===========================================================================
  app.get("/action-transfer/tasks/:taskId", async (request, reply) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { taskId: string };

    const task = await findActionTransferTaskById(ctx.pool, params.taskId);
    if (!task) {
      throw new AppError(404, "TASK_NOT_FOUND", "任务不存在");
    }
    if (task.userId !== user.id) {
      throw new AppError(403, "TASK_ACCESS_DENIED", "无权访问此任务");
    }

    return reply.send({ success: true, data: task });
  });

  // ===========================================================================
  // GET /action-transfer/tasks
  // 查询任务列表
  // ===========================================================================
  app.get("/action-transfer/tasks", async (request, reply) => {
    const user = await requireUser(ctx, request);
    const query = request.query as { projectId?: string; status?: string; limit?: number; offset?: number };

    if (query.projectId) {
      // 按 projectId 查询单条
      const task = await findActionTransferTaskByProjectId(ctx.pool, query.projectId);
      return reply.send({
        success: true,
        data: task ? [task] : [],
      });
    }

    // 按用户查询列表
    const { items, total } = await queryActionTransferTasksByUser(ctx.pool, user.id, {
      limit: query.limit ? parseInt(String(query.limit), 10) : 50,
      offset: query.offset ? parseInt(String(query.offset), 10) : 0,
      status: query.status as any,
    });

    return reply.send({ success: true, data: { items, total } });
  });

  // ===========================================================================
  // POST /action-transfer/tasks/:taskId/cancel
  // 取消任务
  // ===========================================================================
  app.post("/action-transfer/tasks/:taskId/cancel", async (request, reply) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { taskId: string };

    const task = await findActionTransferTaskById(ctx.pool, params.taskId);
    if (!task) {
      throw new AppError(404, "TASK_NOT_FOUND", "任务不存在");
    }
    if (task.userId !== user.id) {
      throw new AppError(403, "TASK_ACCESS_DENIED", "无权取消此任务");
    }

    const cancellableStatuses = ["pending", "detecting", "detected", "template_generating", "template_generated", "generating"];
    if (!cancellableStatuses.includes(task.status)) {
      throw new AppError(400, "TASK_NOT_CANCELLABLE", `任务状态为 ${task.status}，无法取消`);
    }

    await updateActionTransferTaskStatus(ctx.pool, params.taskId, "cancelled", Date.now());

    return reply.send({
      success: true,
      data: { taskId: params.taskId, status: "cancelled" },
    });
  });

  log.info("动作迁移 API 路由已注册");
}
