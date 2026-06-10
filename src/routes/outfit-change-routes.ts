/**
 * outfit-change-routes.ts
 * 服装换装视频生成 API 路由
 *
 * 7 个端点：
 * - PUT  /outfit-change/draft — 创建或更新 draft（Step1-3 中间选择持久化）
 * - GET  /outfit-change/draft — 查询项目的 draft 记录
 * - POST /outfit-change/tasks — 创建换装项目（升级 draft 或新建）
 * - GET  /outfit-change/tasks/:taskId — 查询任务详情
 * - GET  /outfit-change/tasks — 查询任务列表（支持 projectId 过滤）
 * - POST /outfit-change/tasks/:taskId/cancel — 取消任务
 * - GET  /outfit-change/tasks/:taskId/result — 获取生成结果
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { OutfitChangeProjectInput, OutfitChangeProjectStatus, OutfitChangeProjectRecord } from "../contracts/outfit-change-contract.js";
import type { OutfitChangeDraftPatch } from "../repositories/pg/outfit-change-project-pg-repository.js";
import { AppError } from "../core/errors.js";
import { requireUser } from "../services/auth/route-guards.js";
import { getLogger } from "../core/logger/index.js";
import { executeOutfitChangePipeline } from "../modules/video-step/step3-outfit-change/orchestrator.js";
import { createAsyncJob, finalizeAsyncJob } from "../service/async-job-service.js";
import { sseManager } from "../modules/sse-manager.js";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";
import { extractFrameAtTime } from "../utils/video-frame-extract.js";
import { getOssService } from "../service/oss/oss-service.js";
import type { OssUploadResult } from "../service/oss/oss-service.js";
import { getFinalVideosDbService } from "../service/final-videos-db-service.js";

const log = getLogger("outfit-change-routes");

/** 路由依赖 */
export interface OutfitChangeRouteDeps {
  ctx: AppContext;
}

export async function registerOutfitChangeRoutes(
  app: FastifyInstance,
  deps: OutfitChangeRouteDeps
): Promise<void> {
  const { ctx } = deps;
  const repo = ctx.repos.outfitChangeProjects;
  const repos = ctx.repos;

  // PUT /outfit-change/draft — 创建或更新 draft
  app.put("/outfit-change/draft", async (request, reply) => {
    const user = await requireUser(ctx, request);

    const body = request.body as {
      projectId: string;
      sourceVideoUrl?: string | null;
      builtinTemplateId?: string | null;
      targetOutfitId?: string | null;
      characterId?: string | null;
    };

    if (!body.projectId) {
      throw new AppError(400, "MISSING_PROJECT_ID", "项目 ID 不能为空");
    }

    const patch: OutfitChangeDraftPatch = {};
    if (body.sourceVideoUrl !== undefined) patch.sourceVideoUrl = body.sourceVideoUrl;
    if (body.builtinTemplateId !== undefined) patch.builtinTemplateId = body.builtinTemplateId;
    if (body.targetOutfitId !== undefined) patch.targetOutfitId = body.targetOutfitId;
    if (body.characterId !== undefined) patch.characterId = body.characterId;

    // 保存源视频时：提取首帧截图持久化到 OSS，写入 cover_image_url
    if (body.sourceVideoUrl) {
      try {
        const frame = await extractFrameAtTime(body.sourceVideoUrl, 0, "jpg");
        const jpegBuffer = await sharp(frame.frameBytes).jpeg({ quality: 80 }).toBuffer();
        if (ctx.storage) {
          const ossService = getOssService(ctx.storage);
          const coverKey = join("outfit-change", body.projectId, "cover-frame.jpg");
          const uploadResult: OssUploadResult = await ossService.upload(coverKey, jpegBuffer, "image/jpeg");
          if (uploadResult.success && uploadResult.url) {
            await repos.projects.updateThumbnailAndCover(body.projectId, body.sourceVideoUrl, uploadResult.url);
          } else {
            await repos.projects.updateThumbnail(body.projectId, body.sourceVideoUrl);
          }
        }
      } catch (frameError) {
        log.warn({ projectId: body.projectId, error: frameError instanceof Error ? frameError.message : String(frameError) }, "源视频首帧提取失败，跳过封面设置");
        await repos.projects.updateThumbnail(body.projectId, body.sourceVideoUrl);
      }
    }

    // 角色选择时更新项目封面为角色缩略图
    if (body.characterId) {
      const charRow = await repos.libraryCharacters.findThumbnailUrlsById(body.characterId);
      const coverUrl = charRow?.thumbnail_url || charRow?.five_view_oss_image_url || null;
      if (coverUrl) {
        await repos.projects.updateCoverImage(body.projectId, coverUrl);
      }
    }

    // 服饰选择时更新项目服饰主图
    if (body.targetOutfitId) {
      const garmentRow = await repos.garmentAssets.findMainImageUrlById(body.targetOutfitId);
      if (garmentRow?.main_image_url) {
        await repos.projects.updateGarmentImage(body.projectId, garmentRow.main_image_url);
      }
    }

    // 查找已有 draft
    const existing = await repo.findDraftByProjectId(body.projectId);

    let draft: OutfitChangeProjectRecord;
    if (existing) {
      if (Object.keys(patch).length > 0) {
        await repo.updateDraftFields(existing.taskId, patch);
      }
      draft = (await repo.findById(existing.taskId))!;
    } else {
      draft = await repo.createDraft(body.projectId, user.id, patch);
    }

    log.info({ taskId: draft.taskId, projectId: body.projectId, patch }, "保存 draft");

    return reply.send({
      success: true,
      data: {
        taskId: draft.taskId,
        projectId: draft.projectId,
        sourceVideoUrl: draft.sourceVideoUrl,
        builtinTemplateId: draft.builtinTemplateId,
        targetOutfitId: draft.targetOutfitId,
        characterId: draft.characterId,
        status: draft.status,
      },
    });
  });

  // GET /outfit-change/draft — 查询项目的换装记录
  app.get("/outfit-change/draft", async (request, reply) => {
    const user = await requireUser(ctx, request);

    const query = request.query as { projectId: string };
    if (!query.projectId) {
      throw new AppError(400, "MISSING_PROJECT_ID", "项目 ID 不能为空");
    }

    const draft = await repo.findDraftByProjectId(query.projectId);
    const record = draft || await repo.findByProjectId(query.projectId);

    if (!record) {
      return reply.send({ success: true, data: null });
    }

    if (record.userId && record.userId !== user.id) {
      throw new AppError(403, "DRAFT_ACCESS_DENIED", "无权访问此记录");
    }

    return reply.send({
      success: true,
      data: {
        taskId: record.taskId,
        projectId: record.projectId,
        sourceVideoUrl: record.sourceVideoUrl,
        builtinTemplateId: record.builtinTemplateId,
        targetOutfitId: record.targetOutfitId,
        characterId: record.characterId,
        status: record.status,
      },
    });
  });

  // POST /outfit-change/tasks — 创建换装项目
  app.post("/outfit-change/tasks", async (request, reply) => {
    const user = await requireUser(ctx, request);

    const body = request.body as OutfitChangeProjectInput;

    if (!body.sourceVideoUrl && !body.builtinTemplateId) {
      throw new AppError(400, "MISSING_SOURCE", "必须提供 sourceVideoUrl 或 builtinTemplateId");
    }
    if (body.sourceVideoUrl && body.builtinTemplateId) {
      throw new AppError(400, "DUPLICATE_SOURCE", "sourceVideoUrl 和 builtinTemplateId 不能同时提供");
    }
    if (!body.targetOutfitId) {
      throw new AppError(400, "MISSING_TARGET_OUTFIT_ID", "服装 ID 不能为空");
    }
    if (!body.projectId) {
      throw new AppError(400, "MISSING_PROJECT_ID", "项目 ID 不能为空");
    }

    if (body.characterId) {
      if (!body.characterType) {
        throw new AppError(400, "MISSING_CHARACTER_TYPE", "角色类型不能为空");
      }
      if (body.characterType !== "library" && body.characterType !== "generated") {
        throw new AppError(400, "INVALID_CHARACTER_TYPE", "角色类型必须是 library 或 generated");
      }
    }

    const taskInput: OutfitChangeProjectInput = { ...body, userId: user.id };

    const existingDraft = await repo.findDraftByProjectId(body.projectId);
    let taskId: string;

    if (existingDraft) {
      taskId = existingDraft.taskId;
      await repo.upgradeDraftToProject(taskId, taskInput);
      log.info({ taskId, projectId: body.projectId }, "升级 draft 为正式任务");
    } else {
      taskId = `oc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const now = Date.now();
      await repo.create({
        taskId,
        input: taskInput,
        status: "pending",
        projectId: body.projectId,
        userId: user.id,
        sourceVideoUrl: body.sourceVideoUrl,
        builtinTemplateId: body.builtinTemplateId,
        targetOutfitId: body.targetOutfitId,
        characterId: body.characterId,
        createdAt: now,
        updatedAt: now,
      });
      log.info({ taskId, projectId: body.projectId }, "创建新换装项目");
    }

    const jobResult = await createAsyncJob(ctx.repos, {
      userId: user.id,
      jobType: "outfit_change",
      input: JSON.stringify({ taskId, ...taskInput }),
      now: Date.now(),
      projectId: taskInput.projectId,
      initialStatus: "pending",
    }, ctx.globalTaskConcurrencyService);

    if ("error" in jobResult) {
      return reply.code(429).send({ code: jobResult.errorCode, message: jobResult.error });
    }

    const parentJobId = jobResult.jobId;

    await repos.projects.updateStatus(body.projectId, "FILMING");
    log.info({ projectId: body.projectId }, "同步更新 nrm_projects 状态为 FILMING");

    void executeOutfitChangePipeline(ctx, { taskId, input: taskInput, parentJobId })
      .then((result) => {
        if (result.success) {
          log.info({ taskId, parentJobId }, "流水线启动成功");
        } else {
          log.error({ taskId, parentJobId, error: result.error }, "流水线启动失败");
        }
      })
      .catch((err) => {
        log.error({ taskId, parentJobId, error: err instanceof Error ? err.message : String(err) }, "流水线启动异常");
      });

    return reply.send({
      success: true,
      data: { taskId, asyncJobId: parentJobId, status: "pending" },
    });
  });

  // GET /outfit-change/tasks/:taskId — 查询任务详情
  app.get("/outfit-change/tasks/:taskId", async (request, reply) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { taskId: string };

    const task = await repo.findById(params.taskId);
    if (!task) throw new AppError(404, "TASK_NOT_FOUND", "任务不存在");
    if (task.input.userId !== user.id) throw new AppError(403, "TASK_ACCESS_DENIED", "无权访问此任务");

    return reply.send({
      success: true,
      data: {
        taskId: task.taskId,
        status: task.status,
        input: task.input,
        stage0Result: task.stage0Result,
        stage1Result: task.stage1Result,
        stage2Result: task.stage2Result,
        stage3Result: task.stage3Result,
        errorMessage: task.errorMessage,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
    });
  });

  // GET /outfit-change/tasks — 查询任务列表
  app.get("/outfit-change/tasks", async (request, reply) => {
    const user = await requireUser(ctx, request);

    const query = request.query as { projectId?: string; status?: OutfitChangeProjectStatus; limit?: number };
    const limit = Math.min(query.limit ?? 50, 100);

    const allStatuses: OutfitChangeProjectStatus[] = [
      "pending", "capturing", "captured", "understanding", "understood",
      "adapting", "adapted", "generating", "succeeded", "failed", "cancelled"
    ];

    let tasks: OutfitChangeProjectRecord[] = [];
    if (query.status) {
      tasks = await repo.findByStatus(query.status);
    } else {
      for (const s of allStatuses) {
        const statusTasks = await repo.findByStatus(s);
        tasks.push(...statusTasks);
      }
    }

    if (query.projectId) {
      tasks = tasks.filter((t) => t.input.projectId === query.projectId);
    }

    tasks = tasks.filter((t) => t.input.userId === user.id);
    tasks.sort((a, b) => b.createdAt - a.createdAt);
    tasks = tasks.slice(0, limit);

    return reply.send({
      success: true,
      data: {
        items: tasks.map((task) => ({
          taskId: task.taskId,
          status: task.status,
          projectId: task.input.projectId,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        })),
        total: tasks.length,
      },
    });
  });

  // POST /outfit-change/tasks/:taskId/cancel — 取消任务
  app.post("/outfit-change/tasks/:taskId/cancel", async (request, reply) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { taskId: string };

    const task = await repo.findById(params.taskId);
    if (!task) throw new AppError(404, "TASK_NOT_FOUND", "任务不存在");
    if (task.input.userId !== user.id) throw new AppError(403, "TASK_ACCESS_DENIED", "无权取消此任务");

    const cancellableStatuses: OutfitChangeProjectStatus[] = ["pending", "capturing", "captured", "understanding", "understood", "adapting", "adapted", "generating"];
    if (!cancellableStatuses.includes(task.status)) {
      throw new AppError(400, "TASK_NOT_CANCELLABLE", `任务状态为 ${task.status}，无法取消`);
    }

    const now = Date.now();
    await repo.updateStatus(params.taskId, "cancelled");

    const asyncJob = await repos.asyncJobs.findByTaskIdAndPending(params.taskId);
    if (asyncJob) {
      await finalizeAsyncJob(ctx.repos, asyncJob.id, "failed", null, { code: "USER_CANCELLED", message: "用户取消任务" }, now, ctx.queueDispatcher);

      sseManager.pushToUser(asyncJob.user_id, {
        type: "job_failed",
        jobId: asyncJob.id,
        jobType: asyncJob.job_type,
        status: "failed",
        error: { code: "USER_CANCELLED", message: "用户取消任务" },
        timestamp: now,
      });

      log.info({ taskId: params.taskId, asyncJobId: asyncJob.id, userId: user.id }, "取消任务并更新 async_job");
    } else {
      log.info({ taskId: params.taskId, userId: user.id, previousStatus: task.status }, "取消任务（无关联 async_job）");
    }

    return reply.send({ success: true, data: { taskId: params.taskId, status: "cancelled" } });
  });

  // GET /outfit-change/tasks/:taskId/result — 获取生成结果
  app.get("/outfit-change/tasks/:taskId/result", async (request, reply) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { taskId: string };

    const task = await repo.findById(params.taskId);
    if (!task) throw new AppError(404, "TASK_NOT_FOUND", "任务不存在");
    if (task.input.userId !== user.id) throw new AppError(403, "TASK_ACCESS_DENIED", "无权访问此任务");
    if (task.status !== "succeeded") throw new AppError(400, "TASK_NOT_COMPLETED", `任务状态为 ${task.status}，尚未完成`);
    if (!task.stage3Result) throw new AppError(500, "TASK_RESULT_MISSING", "任务结果数据缺失");

    const stage3Result = task.stage3Result;
    const generatedVideoUrl = stage3Result && 'generatedVideoUrl' in stage3Result ? stage3Result.generatedVideoUrl : undefined;
    const frameCount = stage3Result && 'frameCount' in stage3Result ? stage3Result.frameCount : undefined;
    const consistencyScores = stage3Result && 'consistencyScores' in stage3Result ? stage3Result.consistencyScores : undefined;
    const generationTime = stage3Result && 'generationTime' in stage3Result ? stage3Result.generationTime : undefined;

    return reply.send({
      success: true,
      data: {
        taskId: params.taskId,
        status: task.status,
        generatedVideoUrl,
        frameCount,
        consistencyScores,
        generationTime,
        stage0Result: task.stage0Result,
        stage1Result: task.stage1Result,
        stage2Result: task.stage2Result,
      },
    });
  });

  // POST /outfit-change/tasks/:taskId/complete-merge — 合并完成后更新状态
  app.post("/outfit-change/tasks/:taskId/complete-merge", async (request, reply) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { taskId: string };
    const body = request.body as { mergedVideoUrl: string; durationSec?: number };

    if (!body.mergedVideoUrl) {
      throw new AppError(400, "MISSING_MERGED_VIDEO_URL", "合并视频 URL 不能为空");
    }

    const task = await repo.findById(params.taskId);
    if (!task) throw new AppError(404, "TASK_NOT_FOUND", "任务不存在");
    if (task.input.userId !== user.id) throw new AppError(403, "TASK_ACCESS_DENIED", "无权操作此任务");
    if (task.status !== "ready_for_merge") throw new AppError(400, "TASK_NOT_READY_FOR_MERGE", `任务状态为 ${task.status}，尚未准备好合并`);

    const now = Date.now();
    await repo.updateStatus(params.taskId, "succeeded");

    const projectId = task.input.projectId;
    if (projectId) {
      const coverImageUrl = `${body.mergedVideoUrl}?x-oss-process=video/snapshot,t_0,f_jpg,w_800,h_0,m_fast`;
      await repos.projects.updateStatusAndExport(projectId, "READY_TO_PUBLISH", body.mergedVideoUrl, coverImageUrl, body.durationSec ?? 0, now);
      log.info({ projectId, taskId: params.taskId, mergedVideoUrl: body.mergedVideoUrl }, "同步更新 nrm_projects 状态为 READY_TO_PUBLISH");
    }

    const finalVideosService = getFinalVideosDbService(ctx.repos);
    await finalVideosService.create({
      projectId: projectId!,
      videoType: "outfit_merge",
      videoUrl: body.mergedVideoUrl,
      durationSec: body.durationSec ?? 0,
      coverImageUrl: `${body.mergedVideoUrl}?x-oss-process=video/snapshot,t_0,f_jpg,w_800,h_0,m_fast`,
      creatorId: user.id,
    });
    log.info({ projectId, taskId: params.taskId, mergedVideoUrl: body.mergedVideoUrl }, "写入成片记录到 nrm_final_videos");

    await repos.asyncJobs.updateResultByTaskId(
      params.taskId,
      JSON.stringify({ finalVideoUrl: body.mergedVideoUrl, totalDuration: body.durationSec ?? 0 }),
      now,
      "outfit_change",
    );
    log.info({ taskId: params.taskId, mergedVideoUrl: body.mergedVideoUrl }, "更新 outfit_change 任务 result（finalVideoUrl）");

    return reply.send({
      success: true,
      data: { taskId: params.taskId, status: "succeeded", mergedVideoUrl: body.mergedVideoUrl },
    });
  });

  log.info("服装换装 API 路由已注册");
}
