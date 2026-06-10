/**
 * Step4 Video 路由注册
 * 视频任务创建、状态查询、完成确认 + 导出
 *
 * 从 project-routes.ts (L3283-3757) 提取
 * 视频生成执行已迁移到 Submit-Query 分离模式（step4_clip_submit + step4_clip_query）
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { ProjectRouteDeps } from "../project-route-shared.js";

import { AppError } from "../../core/errors.js";
import { requireUser } from "../../services/auth/route-guards.js";
import {
  getAsyncJob,
  updateAsyncJobResult,
  findStep4VideoJobsByProjectId,
} from "../../service/async-job-service.js";
import {
  parseStep4VideoJob,
} from "../../service/step4-video-job-adapter.js";

/**
}

/**
 * 注册 Step5 Video 相关路由
 *
 * 路由列表:
 * - POST /projects/:projectId/storyboards/layout (分镜排序)
 * - POST /projects/:projectId/video-jobs (创建视频任务)
 * - GET  /projects/:projectId/video-jobs (列出视频任务)
 * - GET  /projects/:projectId/video-jobs/:jobId (查询单个视频任务)
 * - POST /projects/:projectId/video-jobs/:jobId/complete (完成视频任务)
 * - POST /projects/:projectId/export (导出项目)
 */
export function registerStep5VideoRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ProjectRouteDeps,
): void {

  // ===========================================================================
  // 路由注册
  // ===========================================================================

  // POST /projects/:projectId/storyboards/layout — 分镜排序
  app.post("/projects/:projectId/storyboards/layout", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as { frameIds?: unknown } | undefined) ?? {};
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
    const requestedFrameIds = Array.isArray(body.frameIds)
      ? body.frameIds
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index)
      : [];
    // 从 nrm_step3_frame_images 查询帧数据（nrm_storyboard_frames 已删除）
    const frameRecords = await ctx.repos.step3FrameImages.findByProject(project.id);
    const projectFrames = frameRecords.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      index: row.frame_index ?? 0,
      imageUrl: row.selected_image_url ?? "",
      variants: [row.selected_image_url ?? ""] as string[],
      selectedVariantIndex: 0 as number,
    }));
    const frameById = new Map(projectFrames.map((item) => [item.id, item] as const));
    const nextFrames = requestedFrameIds
      .map((frameId) => frameById.get(frameId) ?? null)
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const keepIdSet = new Set(nextFrames.map((item) => item.id));
    // 删除未选中的帧
    for (const frame of projectFrames) {
      if (!keepIdSet.has(frame.id)) {
        await ctx.repos.step3FrameImages.delete(frame.id);
      }
    }
    // 更新选中帧的排序
    for (const [index, frame] of nextFrames.entries()) {
      await ctx.repos.step3FrameImages.updateFrameIndex(frame.id, index + 1);
    }
    project.updatedAt = ctx.clock.now();
    return {
      frames: nextFrames,
    };
  });

  // POST /projects/:projectId/video-jobs — 创建视频任务
  // 前端只需传 source（auto/manual）和 targetSceneIndex（单片段重试时）
  // 所有业务数据由 parent executor / submit executor 从数据库查询
  app.post("/projects/:projectId/video-jobs", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as
      | {
        source?: unknown;
        targetSceneIndex?: unknown;
      }
      | undefined) ?? {};

    const source = body.source === "auto" || body.source === "manual" ? body.source : "manual";
    const rawTargetSceneIndex = body.targetSceneIndex;
    const targetSceneIndex = typeof rawTargetSceneIndex === "number" && Number.isFinite(rawTargetSceneIndex) && rawTargetSceneIndex >= 0
      ? rawTargetSceneIndex
      : undefined;

    try {
      const job = await ctx.videoJobService.create(user, params.projectId, {
        source,
        targetSceneIndex,
      });

      // 【并发改造】子任务创建由 step4_video 父任务执行器负责（幂等）
      // POST 路由只创建父任务，然后触发 tryPromote 让父任务执行器运行
      try {
        ctx.queueDispatcher.tryPromote().catch((promoteErr) => {
          app.log.warn({ err: promoteErr }, `[Step4] tryPromote 失败，任务将由周期扫描处理`);
        });
      } catch (asyncJobError) {
        app.log.error({ err: asyncJobError }, `[Step4] tryPromote 失败`);
      }

      // 单片段任务：设置 clipGeneration 并初始化场景（父任务执行器创建 Submit 子任务前需要）
      if (typeof targetSceneIndex === "number") {
        const sceneBeforeRetry = await ctx.repos.step4VideoScenes.findByProjectAndScene(
          params.projectId,
          targetSceneIndex,
        );
        const newGeneration = (sceneBeforeRetry?.clipGeneration ?? 0) + 1;
        await ctx.repos.step4VideoScenes.updateScene(
          params.projectId,
          targetSceneIndex,
          {
            clipStatus: "generating",
            clipProgress: 0,
            externalTaskId: null,
            clipGeneration: newGeneration, // ✅ 修复：更新 clip_generation 字段
          },
          user.id,
        );

        await updateAsyncJobResult(ctx.repos, job.id, { clipGeneration: newGeneration }, ctx.clock.now());
        const refreshedRecord = await getAsyncJob(ctx.repos, job.id, () => ctx.clock.now());
        const updatedJob = refreshedRecord ? parseStep4VideoJob(refreshedRecord) : job;

        app.log.info({ targetSceneIndex, sceneGen: sceneBeforeRetry?.clipGeneration ?? 0, jobClipGeneration: newGeneration }, `[Step4] 单片段重试`);
        return updatedJob;
      }

      return job;
    } catch (error) {
      throw error;
    }
  });

  // GET /projects/:projectId/video-jobs — 列出视频任务
  app.get("/projects/:projectId/video-jobs", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
    const records = await findStep4VideoJobsByProjectId(ctx.repos, project.id);
    const jobs = records
      .map(parseStep4VideoJob)
      .filter((job) => job.userId === user.id)
      .sort((a, b) => b.startedAt - a.startedAt);
    // 【并发改造】批量任务由 QueueDispatcher 管理 step4_clip_submit 子任务，不再在 GET 路由推进父任务
    // 单片段重试任务也无需推进，QueueDispatcher 会自动调度其 step4_clip_submit 子任务
    return { jobs };
  });

  // GET /projects/:projectId/video-jobs/:jobId — 查询单个视频任务
  app.get("/projects/:projectId/video-jobs/:jobId", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string; jobId: string };
    app.log.debug({ projectId: params.projectId, jobId: params.jobId }, `[Step4] GET /projects/:projectId/video-jobs/:jobId 入口`);
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
    const record = await getAsyncJob(ctx.repos, params.jobId, () => ctx.clock.now());
    if (!record) {
      throw new AppError(404, "NOT_FOUND", "Job not found");
    }
    const job = parseStep4VideoJob(record);
    if (job.userId !== user.id || job.projectId !== project.id) {
      throw new AppError(403, "FORBIDDEN", "Job owner only");
    }
    app.log.info({ jobId: job.id, status: job.status, completedClipCount: job.completedClipCount, totalClipCount: job.totalClipCount, targetSceneIndex: job.targetSceneIndex }, `[Step4] 任务查询`);
    // 【并发改造】批量任务由 QueueDispatcher 管理 step4_clip_submit 子任务，不在 GET 路由推进
    // 单片段重试任务（有 targetSceneIndex）也无需推进，QueueDispatcher 会自动调度其 step4_clip_submit 子任务
    const refreshedRecord = await getAsyncJob(ctx.repos, job.id, () => ctx.clock.now());
    const updatedJob = refreshedRecord ? parseStep4VideoJob(refreshedRecord) : job;
    return updatedJob;
  });

  // POST /projects/:projectId/video-jobs/:jobId/complete — 完成视频任务
  app.post("/projects/:projectId/video-jobs/:jobId/complete", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string; jobId: string };
    const body = request.body as {
      status: "succeeded" | "failed" | "timeout";
      durationMinutes: number;
    };
    const job = await ctx.videoJobService.complete(user, params.projectId, params.jobId, body);
    return job;
  });
}
