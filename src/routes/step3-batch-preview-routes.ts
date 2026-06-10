/**
 * step3-batch-preview-routes.ts
 * Step3 批量分镜预览 API 路由
 *
 * 端点：
 * - POST /projects/:projectId/storyboards/batch-preview       启动批量任务
 * - POST /projects/:projectId/storyboards/batch-preview/stop   停止批量任务
 * - POST /projects/:projectId/storyboards/frame-preview-v2     单帧任务（走全局队列）
 *
 * 批量预览编排流程：
 * 阶段0：自动生成专业提示词（若无） → 阶段1：创建子任务 → 阶段2：逐帧生图
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { ProjectRouteDeps, JimengImageRatio, JimengImageResolution } from "./project-route-shared.js";
import type { Step3Helpers } from "./step3-candidate-helpers.js";

import { AppError } from "../core/errors.js";
import { requireUser } from "../services/auth/route-guards.js";
import { resolveProjectReferenceImages } from "../modules/project-reference-image-resolver.js";
import { findActiveJobByProjectAndType, getAsyncJob } from "../service/async-job-service.js";
import {
  startBatchPreviewJobWithDeps,
  stopBatchPreviewJob,
  startSingleFramePreviewJob,
  JOB_TYPE_BATCH_PREVIEW,
  type SingleFramePreviewRequest,
} from "../modules/step3-batch-preview-orchestrator.js";

/**
 * 注册 Step3 批量分镜预览路由
 */
export function registerStep3BatchPreviewRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ProjectRouteDeps,
  helpers: Step3Helpers,
): void {
  const { normalizeJimengImageRatio, normalizeJimengImageResolution } = deps;
  const { generateSingleStep3FramePreview } = helpers;

  /**
   * 桥接 generateSingleStep3FramePreview 到 FramePreviewGenerator 回调
   * generateSingleStep3FramePreview 需要 project + user，这里通过闭包注入
   */
  const createGeneratorBridge = (
    project: Parameters<typeof generateSingleStep3FramePreview>[0],
    user: Parameters<typeof generateSingleStep3FramePreview>[1],
  ) => async (input: {
    frameIndex: number;
    title: string;
    prompt: string;
    characterReferenceImages: string[];
    garmentReferenceImages: string[];
    ratio: JimengImageRatio;
    resolution: JimengImageResolution;
    count: number;
  }): Promise<{ candidates: string[] }> => {
    const result = await generateSingleStep3FramePreview(
      project,
      user,
      {
        frameIndex: input.frameIndex,
        title: input.title,
        prompt: input.prompt,
        characterReferenceImages: input.characterReferenceImages,
        garmentReferenceImages: input.garmentReferenceImages,
        generationRatio: input.ratio,
        generationResolution: input.resolution,
        count: input.count,
      },
    );
    return { candidates: result.result.candidates };
  };

  // ===========================================================================
  // POST /projects/:projectId/storyboards/batch-preview
  // 启动批量分镜预览任务
  // ===========================================================================

  app.post("/projects/:projectId/storyboards/batch-preview", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as {
      frameIndexes?: number[];
    } | undefined) ?? {};

    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 防重复：检查是否已有 running 的批量任务
    const existingJob = await findActiveJobByProjectAndType(ctx.repos, project.id, JOB_TYPE_BATCH_PREVIEW);
    if (existingJob) {
      throw new AppError(409, "BATCH_ALREADY_RUNNING", "已有批量任务正在运行，请等待完成或停止后再创建");
    }

    const frameIndexes = Array.isArray(body.frameIndexes)
      ? body.frameIndexes.filter((idx) => Number.isInteger(idx) && idx > 0)
      : [];
    if (frameIndexes.length === 0) {
      throw new AppError(400, "INVALID_FRAME_INDEXES", "frameIndexes 不能为空");
    }

    const ratio: JimengImageRatio = "9:16";
    const resolution: JimengImageResolution = "2k";
    const count = 1;
    const [referenceImages, scriptDataId] = await Promise.all([
      resolveProjectReferenceImages(ctx, project),
      resolveConfirmedScriptDataId(ctx, project.id),
    ]);

    // DEBUG: 记录参考图信息
    app.log.info({
      projectId: project.id,
      characterRefCount: referenceImages.characterReferenceImages.length,
      garmentRefCount: referenceImages.garmentReferenceImages.length,
      characterRefs: referenceImages.characterReferenceImages,
      garmentRefs: referenceImages.garmentReferenceImages,
    }, "batch-preview: resolveProjectReferenceImages result");

    const result = await startBatchPreviewJobWithDeps(
      ctx,
      {
        projectId: project.id,
        userId: user.id,
        frameIndexes,
        ratio,
        resolution,
        count,
        characterReferenceImages: referenceImages.characterReferenceImages,
        garmentReferenceImages: referenceImages.garmentReferenceImages,
        scriptDataId,
      },
      ctx.globalTaskConcurrencyService,
    );

    return { jobId: result.jobId, status: result.running ? "running" : "queued", queuePosition: result.queuePosition };
  });

  // ===========================================================================
  // POST /projects/:projectId/storyboards/batch-preview/stop
  // 停止批量分镜预览任务
  // ===========================================================================

  app.post("/projects/:projectId/storyboards/batch-preview/stop", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as { jobId?: string } | undefined) ?? {};

    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 查找当前 running 的批量任务
    const activeJob = await findActiveJobByProjectAndType(ctx.repos, project.id, JOB_TYPE_BATCH_PREVIEW);
    const targetJobId = body.jobId ?? activeJob?.id;
    if (!targetJobId) {
      throw new AppError(404, "NO_ACTIVE_BATCH_JOB", "没有正在运行的批量任务");
    }

    await stopBatchPreviewJob(ctx.pool, targetJobId, ctx.repos);

    return { success: true, jobId: targetJobId };
  });

  // ===========================================================================
  // POST /projects/:projectId/storyboards/frame-preview-v2
  // 单帧预览任务（走全局队列，替代旧的 frame-preview-jobs）
  // ===========================================================================

  app.post("/projects/:projectId/storyboards/frame-preview-v2", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as {
      frameIndex?: number;
    } | undefined) ?? {};

    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    const frameIndex = Number(body.frameIndex);
    if (!Number.isInteger(frameIndex) || frameIndex < 1) {
      throw new AppError(400, "INVALID_FRAME_INDEX", "frameIndex 必须为正整数");
    }

    // 查询参考图和提示词
    const [referenceImages, prompt] = await Promise.all([
      resolveProjectReferenceImages(ctx, project),
      resolveFramePrompt(ctx, project.id, frameIndex),
    ]);

    // 单帧重试必须有专业提示词（由批量预览生成）
    if (!prompt) {
      throw new AppError(400, "SHOT_PROMPT_NOT_FOUND", "请先执行批量分镜预览生成专业提示词，再重试单帧");
    }

    const title = `镜头 ${frameIndex}`;
    const ratio: JimengImageRatio = "9:16";
    const resolution: JimengImageResolution = "2k";
    const count = 1;

    const generator = createGeneratorBridge(project, user);

    // 【并发改造】使用并发服务创建任务，超并发时排队等待
    const result = await startSingleFramePreviewJob(ctx.pool, {
      projectId: project.id,
      userId: user.id,
      frameIndex,
      title,
      prompt,
      characterReferenceImages: referenceImages.characterReferenceImages,
      garmentReferenceImages: referenceImages.garmentReferenceImages,
      ratio,
      resolution,
      count,
    }, generator, ctx.globalTaskConcurrencyService, undefined, ctx.repos);

    return {
      jobId: result.jobId,
      status: result.running ? "running" : "pending",
      queuePosition: result.queuePosition,
    };
  });
}

/**
 * 查询项目的已确认脚本 scriptDataId，用于自动生成专业提示词
 */
async function resolveConfirmedScriptDataId(
  ctx: AppContext,
  projectId: string,
): Promise<string | undefined> {
  try {
    const { getScriptsDataDbService } = await import("../service/scripts-data-db-service.js");
    const scriptsDbService = getScriptsDataDbService(ctx.repos);
    const scriptData = await scriptsDbService.getConfirmedScript(projectId);
    return scriptData?.id ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * 查询指定帧的专业提示词
 * 单帧重试必须先有专业提示词（由批量预览生成）
 * @returns 专业提示词，不存在时返回 null
 */
async function resolveFramePrompt(
  ctx: AppContext,
  projectId: string,
  frameIndex: number,
): Promise<string | null> {
  try {
    const { getShotPromptsService } = await import("../services/shot-prompts-service.js");
    const { SHOT_PROMPTS_TYPE } = await import("../contracts/shot-prompts-contract.js");
    const shotPromptsService = getShotPromptsService(ctx);
    const record = await shotPromptsService.getActive(projectId, SHOT_PROMPTS_TYPE.ORIGIN);
    if (record) {
      const shot = record.shots.find((s) => s.shot_id === frameIndex);
      if (shot?.keyframe_prompt?.prompt?.trim()) {
        return shot.keyframe_prompt.prompt.trim();
      }
    }
  } catch {
    // 查询失败返回 null
  }
  return null;
}
