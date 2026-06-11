/**
 * Step4 视频片段 Submit 执行器
 *
 * Submit 任务：提交视频生成 → 创建 Query 子任务 → 保持 running 等待 Query 完成后由 checkAndFinalizeParent 自动 finalize
 * 同步返回（罕见）时直接 finalize，不需要 Query。
 *
 * 数据来源：executor 自行从数据库查询，不依赖 job input 中的业务数据。
 */

import type { AppContext } from "../../core/app-context.js";
import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import type { AsyncJobRecord } from "../../service/async-job-service.js";
import type { QueueDispatcher } from "../../modules/queue-dispatcher.js";
import { getLogger } from "../../core/logger/index.js";
import { ProviderRouteKeys, selectRouteKeyByAge } from "../../contracts/provider-route-keys.js";
import { resolveRouteProvider } from "../../services/llm/provider-resolver.js";
import { createVideoTask } from "../../service/llm/llm-video.js";
import { AppError } from "../../core/errors.js";
import {
  finalizeAsyncJob,
  updateAsyncJobStage,
  checkAndFinalizeParent,
} from "../../service/async-job-service.js";
import { persistVideoSourceToStorage } from "../../services/media/storage-persist.js";
import {
  createLlmDebugRecord,
  finalizeLlmDebugRecordSuccess,
  finalizeLlmDebugRecordError,
} from "../../services/llm/llm-debug-recorder.js";
import { advanceProjectStatusIfAllScenesHaveVideo } from "./scene-status-advance.js";
import { refineStep4Prompt } from "../../modules/step4-prompt-refiner.js";
import {
  type Step4ClipSubmitJobInput,
  type Step4ClipSubmitJobResult,
  buildStep4ClipQueryJobId,
  createStep4ClipQueryJob,
} from "./advance-video-job.js";
import { normalizeVideoReferenceImageUrl } from "../../service/llm/llm-video.js";
import { persistImageSourceToStorage } from "../../services/media/storage-persist.js";

const log = getLogger("step4-clip-submit-executor");

/**
 * 执行 step4_clip_submit 任务
 * 1. 从数据库查询提示词、分镜图、参考图、时长
 * 2. 提交视频生成到外部 API
 * 3. 同步返回 → finalize completed
 * 4. 异步返回 → 创建 Query 子任务 → 保持 running(stage=生成中) 等待 checkAndFinalizeParent
 */
export async function executeStep4ClipSubmitJob(
  ctx: AppContext,
  repos: PgRepositoryCollection,
  job: AsyncJobRecord,
  dispatcher: QueueDispatcher,
): Promise<void> {
  const now = ctx.clock.now();
  const pool = ctx.pool;
  const input = JSON.parse(job.input) as Step4ClipSubmitJobInput;

  log.info({ jobId: job.id, sceneIndex: input.sceneIndex, projectId: input.projectId }, "Step4 Clip Submit 开始");

  let debugRecord: { auditId: string; startedAt: number } | null = null;
  let freezeId: string | null = null;
  // 配对标识：Submit 和 Query 共享，用于调试气泡配对展示
  const pairId = `pair-${job.id}`;

  try {
    // ========== 从数据库查询所有业务数据 ==========

    // 1. 获取项目信息（角色年龄，用于选择 RouteKey）
    const project = await ctx.repos.projects.findById(input.projectId);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", `项目 ${input.projectId} 不存在`);
    }

    // 2. 从 nrm_step4_video_scenes 读取预填的 clip_prompt
    const sceneRecord = await ctx.repos.step4VideoScenes.findByProjectAndScene(input.projectId, input.sceneIndex);
    let clipPrompt = sceneRecord?.clipPrompt ?? "";
    if (!clipPrompt) {
      throw new AppError(400, "NO_CLIP_PROMPT", `分镜 ${input.sceneIndex + 1} 缺少视频提示词，请先生成分镜提示词`);
    }

    // 2.5 重试时（clipGeneration > 0）调用提示词优化
    // 主流程失败必须报错阻断，禁止静默降级
    const clipGeneration = sceneRecord?.clipGeneration ?? 0;
    if (clipGeneration > 0) {
      // 更新 stage 为"优化中"，让前端能看到优化状态
      await updateAsyncJobStage(repos, job.id, "优化中", now);

      const previousError = sceneRecord?.errorMessage ?? null;
      const refineResult = await refineStep4Prompt(ctx, {
        originalPrompt: clipPrompt,
        errorMessage: previousError,
        projectId: input.projectId,
        sceneIndex: input.sceneIndex,
        retryCount: clipGeneration,
      });

      if (refineResult.needsRefinement && refineResult.refinedPrompt !== clipPrompt) {
        const originalPrompt = clipPrompt;
        clipPrompt = refineResult.refinedPrompt;

        // 更新场景的提示词
        await ctx.repos.step4VideoScenes.updateScene(input.projectId, input.sceneIndex, {
          clipPrompt,
        }, job.userId);

        // 持久化优化记录
        await ctx.repos.step4PromptRefinements.create({
          projectId: input.projectId,
          sceneIndex: input.sceneIndex,
          generation: clipGeneration,
          originalPrompt,
          refinedPrompt: clipPrompt,
          errorMessage: previousError,
          analysis: refineResult.analysis,
          changesSummary: refineResult.changesSummary,
          routeKey: ProviderRouteKeys.STEP4_PROMPT_REFINER,
        });

        log.info({
          sceneIndex: input.sceneIndex,
          generation: clipGeneration,
          analysis: refineResult.analysis.slice(0, 100),
        }, "提示词优化完成");
      }
    }

    // 3. 查询分镜图（nrm_step3_frame_images，frame_index 从 1 开始）
    const rawFrameImageUrl = await ctx.repos.step3FrameImages.findSelectedImageUrlByFrameIndex(input.projectId, input.sceneIndex + 1) ?? "";
    // 持久化分镜图到 OSS
    let clipImageUrl = "";
    if (rawFrameImageUrl) {
      clipImageUrl = await persistClipImage(ctx, rawFrameImageUrl, input.projectId, input.sceneIndex);
    }

    // 4. 查询分镜时长（从脚本 shot_breakdown 获取）
    const clipDurationSeconds = await resolveClipDuration(ctx, input.projectId, input.sceneIndex);

    // 5. 查询参考图（角色五视图 + 服饰平铺图）
    const { characterReferenceImages, garmentReferenceImages } = await resolveReferenceImages(ctx, input.projectId);

    // ========== 提交视频生成 ==========

    const age = project.selectedRoleDirection?.age;
    const routeKey = selectRouteKeyByAge(
      age != null ? Number(age) : null,
      ProviderRouteKeys.STEP4_CLIP_VIDEO_GENERATION_CHILD,
      ProviderRouteKeys.STEP4_CLIP_VIDEO_GENERATION_ADULT,
    );

    const provider = await resolveRouteProvider(ctx, routeKey);
    if (!provider) {
      throw new AppError(503, "PROVIDER_POLICY_MISSING", `${routeKey} provider 未配置`);
    }

    // 冻结积分（管理后台配了价格才生效，未配置则跳过）
    const creditCost = await ctx.creditPricingService.getCost(routeKey);
    if (creditCost > 0) {
      freezeId = await ctx.creditService.freeze(job.userId, creditCost, {
        routeKey,
        operation: "step4_clip_video_generation",
        projectId: input.projectId,
      });
    }

    // 服饰参考图在前（主要参考），角色参考图在后（辅助参考）
    // 第一张图对构图影响最大，确保服饰细节（logo、图案）优先保持
    const referenceImages = [
      ...(garmentReferenceImages ?? []),
      ...(characterReferenceImages ?? []),
    ];

    // 发起前创建审计记录（发起时创建，返回时更新，保证及时性）
    debugRecord = createLlmDebugRecord(ctx, {
      routeKey,
      businessContext: `Step4 分镜${input.sceneIndex + 1}视频生成(提交)`,
      requestId: pairId,
      projectId: input.projectId,
      userId: job.userId,
      asyncJobId: job.id,
      messages: [
        { role: "prompt", content: clipPrompt },
        ...(referenceImages.length > 0 ? [{ role: "reference_images", content: referenceImages.join('\n') }] : []),
        ...(clipImageUrl ? [{ role: "first_frame", content: clipImageUrl }] : []),
      ],
      provider,
      hasMedia: clipImageUrl || referenceImages.length > 0 ? "image" : null,
    });

    const createResult = await createVideoTask(provider, clipPrompt, {
      imageUrl: clipImageUrl,
      referenceImages,
      garmentImages: garmentReferenceImages ?? [],
      characterImages: characterReferenceImages ?? [],
      duration: clipDurationSeconds,
    });

    // 视频任务提交成功，扣减冻结积分
    if (freezeId) {
      try {
        await ctx.creditService.deductFrozen(job.userId, freezeId, creditCost);
      } catch {
        log.warn({ jobId: job.id, freezeId }, "冻结积分扣减失败（视频已生成）");
      }
    }

    // 处理结果：同步返回 vs 异步返回
    if (createResult.videoUrl) {
      // 同步返回（罕见）：直接更新场景，不需要 Query
      log.info({ jobId: job.id, sceneIndex: input.sceneIndex }, "视频生成同步返回");

      const ossUrl = await persistVideoSourceToStorage(ctx, createResult.videoUrl, "media/step4-clip");
      log.info({ jobId: job.id, sceneIndex: input.sceneIndex, ossUrl: ossUrl.slice(0, 100) }, "视频已转存到 OSS");

      const currentScene = await ctx.repos.step4VideoScenes.findByProjectAndScene(input.projectId, input.sceneIndex);
      const existingUrls = currentScene?.variantUrls ?? [];
      const updatedVariantUrls = existingUrls.includes(ossUrl) ? existingUrls : [...existingUrls, ossUrl];

      await ctx.repos.step4VideoScenes.updateScene(input.projectId, input.sceneIndex, {
        clipStatus: "completed",
        clipUrl: ossUrl,
        externalTaskId: null,
        variantUrls: updatedVariantUrls,
      }, job.userId);

      await advanceProjectStatusIfAllScenesHaveVideo(ctx, input.projectId);

      const auditInfo = createResult.auditInfo;
      finalizeLlmDebugRecordSuccess(ctx, {
        auditId: debugRecord.auditId,
        startedAt: debugRecord.startedAt,
        actualModel: provider.model,
        responseText: `同步返回视频; videoUrl=${createResult.videoUrl.slice(0, 300)}`,
        actualEndpoint: auditInfo?.actualEndpoint ?? undefined,
        requestHeadersJson: auditInfo?.requestHeadersJson,
        requestBodyJson: auditInfo?.requestBodyJson,
      });

      const submitResult: Step4ClipSubmitJobResult = { videoTaskId: null, routeKey, pairId };
      await finalizeAsyncJob(repos, job.id, "completed", submitResult as unknown as Record<string, unknown>, null, now, dispatcher);

      if (job.parentJobId) {
        await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, now);
      }
      return;
    }

    if (!createResult.taskId) {
      throw new AppError(502, "VIDEO_EMPTY_RESULT", "创建任务未返回 taskId 或 videoUrl");
    }

    // 异步模式：Submit 保持 running（stage = "生成中"），等待 Query 完成后由 checkAndFinalizeParent 自动 finalize
    log.info({ jobId: job.id, sceneIndex: input.sceneIndex, taskId: createResult.taskId }, "视频生成已提交，创建 Query 任务");

    // 提交成功，finalize 调试气泡（避免 Submit 记录永远 pending）
    const auditInfo = createResult.auditInfo;
    finalizeLlmDebugRecordSuccess(ctx, {
      auditId: debugRecord.auditId,
      startedAt: debugRecord.startedAt,
      actualModel: provider.model,
      responseText: `异步提交成功; taskId=${createResult.taskId}`,
      actualEndpoint: auditInfo?.actualEndpoint ?? undefined,
      requestHeadersJson: auditInfo?.requestHeadersJson,
      requestBodyJson: auditInfo?.requestBodyJson,
    });

    await ctx.repos.step4VideoScenes.updateScene(input.projectId, input.sceneIndex, {
      clipStatus: "generating",
      externalTaskId: createResult.taskId,
    }, job.userId);

    const submitResult: Step4ClipSubmitJobResult = {
      videoTaskId: createResult.taskId,
      debugAuditId: debugRecord.auditId,
      debugStartedAt: debugRecord.startedAt,
      submitAuditInfo: {
        actualEndpoint: createResult.auditInfo?.actualEndpoint,
        requestHeadersJson: createResult.auditInfo?.requestHeadersJson,
        requestBodyJson: createResult.auditInfo?.requestBodyJson,
      },
      routeKey,
      pairId,
    };
    await updateAsyncJobStage(repos, job.id, "生成中", now, submitResult as unknown as Record<string, unknown>);

    await createStep4ClipQueryJob(repos, {
      videoJobId: input.videoJobId,
      userId: job.userId,
      projectId: input.projectId,
      sceneIndex: input.sceneIndex,
      parentJobId: job.id,
      videoTaskId: createResult.taskId,
    });

    await ctx.queueDispatcher.tryPromote();

    log.info({ queryJobId: buildStep4ClipQueryJobId(input.videoJobId, input.sceneIndex), taskId: createResult.taskId }, "Step4 Clip Query 任务创建成功");

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ jobId: job.id, sceneIndex: input.sceneIndex, error: errorMessage }, "Step4 Clip Submit 失败");

    if (freezeId) {
      await ctx.creditService.unfreeze(job.userId, freezeId).catch((e) => {
        log.error({ userId: job.userId, freezeId, error: e instanceof Error ? e.message : String(e) }, "积分解冻失败，需人工排查");
      });
    }

    if (debugRecord) {
      const errorCode = error instanceof AppError ? (error.code ?? "STEP4_CLIP_SUBMIT_ERROR") : "STEP4_CLIP_SUBMIT_ERROR";
      // 从异常中提取审计信息（createVideoTask 在抛出异常时携带）
      const auditInfoFromError = error instanceof AppError
        ? (error.extras?.auditInfo as { actualEndpoint?: string; requestHeadersJson?: string; requestBodyJson?: string } | undefined)
        : undefined;
      finalizeLlmDebugRecordError(ctx, {
        auditId: debugRecord.auditId,
        startedAt: debugRecord.startedAt,
        errorCode,
        errorMessage,
        actualEndpoint: auditInfoFromError?.actualEndpoint ?? undefined,
        requestHeadersJson: auditInfoFromError?.requestHeadersJson,
        requestBodyJson: auditInfoFromError?.requestBodyJson,
      });
    }

    await ctx.repos.step4VideoScenes.updateScene(input.projectId, input.sceneIndex, {
      clipStatus: "failed",
      errorMessage,
    }, job.userId);

    await finalizeAsyncJob(repos, job.id, "failed", null, {
      code: "STEP4_CLIP_SUBMIT_ERROR",
      message: errorMessage,
    }, now, dispatcher);

    if (job.parentJobId) {
      await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, now);
    }
  }
}

// ========== 数据查询辅助函数 ==========

/** 持久化分镜图到 OSS */
async function persistClipImage(
  ctx: AppContext,
  rawUrl: string,
  projectId: string,
  sceneIndex: number,
): Promise<string> {
  const normalizedSourceUrl = String(rawUrl ?? "").trim();
  if (!normalizedSourceUrl) return "";

  let nextUrl = normalizeVideoReferenceImageUrl(normalizedSourceUrl) ?? "";
  try {
    const persisted = await persistImageSourceToStorage(
      ctx,
      normalizedSourceUrl,
      `projects/${projectId}/step4/clip-images/clip-${sceneIndex + 1}`,
      { persistRemote: true, dedupeByContent: true },
    );
    nextUrl = normalizeVideoReferenceImageUrl(persisted) ?? nextUrl;
  } catch (error) {
    log.warn({ err: error, projectId, sceneIndex }, "step4 clip image persistence failed, keep original reference");
  }
  return nextUrl;
}

/** 查询分镜时长 */
async function resolveClipDuration(
  ctx: AppContext,
  projectId: string,
  sceneIndex: number,
): Promise<number | undefined> {
  try {
    const { getScriptsDataDbService } = await import("../../service/scripts-data-db-service.js");
    const scriptsService = getScriptsDataDbService(ctx.repos);
    const scriptRecord = await scriptsService.getConfirmedScript(projectId)
      ?? await scriptsService.getSelectedScript(projectId);
    if (!scriptRecord) return undefined;

    const { parseVideoScriptsContentsWithShots } = await import("../../modules/video-step/step3-video-script/content-parser.js");
    const parsed = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, [scriptRecord]);
    const shotBreakdown = parsed[0]?.parsed?.shot_breakdown ?? [];
    const rawDuration = shotBreakdown[sceneIndex]?.timecode?.duration_seconds;
    // 分镜最低 4 秒，低于此值 clamp 到 4
    const MIN_CLIP_DURATION = 4;
    const duration = (typeof rawDuration === "number" && rawDuration > 0)
      ? Math.max(rawDuration, MIN_CLIP_DURATION)
      : undefined;
    if (typeof rawDuration === "number" && rawDuration < MIN_CLIP_DURATION) {
      log.info({ sceneIndex, rawDuration, clampedTo: MIN_CLIP_DURATION }, "分镜时长低于最低要求，已自动补齐");
    }
    return duration;
  } catch (error) {
    log.warn({ err: error, projectId, sceneIndex }, "查询分镜时长失败");
    return undefined;
  }
}

/** 查询参考图（角色五视图 + 服饰平铺图） */
async function resolveReferenceImages(
  ctx: AppContext,
  projectId: string,
): Promise<{ characterReferenceImages: string[]; garmentReferenceImages: string[] }> {
  const projectContext = await ctx.projectContextService.getProjectContext(projectId, {
    includeCharacterFiveView: true,
    includeGarmentImages: true,
  });

  const characterUrl = projectContext.character?.fiveViewOssImageUrl;
  if (!characterUrl) {
    throw new AppError(400, "NO_CHARACTER_REFERENCE_IMAGE", "项目缺少角色参考图，请先在 Step2 完成角色定妆（生成五视图）");
  }

  const garmentFlatLayUrls = projectContext.garments
    .map((g) => g.flatLayImageUrl)
    .filter(Boolean);
  if (garmentFlatLayUrls.length === 0) {
    throw new AppError(400, "NO_GARMENT_FLAT_LAY_IMAGE", "项目缺少服饰平铺图，请先在 Step1 上传服饰图片");
  }

  const characterReferenceImages = [characterUrl].map(normalizeVideoReferenceImageUrl).filter(Boolean) as string[];
  const garmentReferenceImages = garmentFlatLayUrls.slice(0, 3)
    .map(normalizeVideoReferenceImageUrl)
    .filter(Boolean) as string[];

  return { characterReferenceImages, garmentReferenceImages };
}
