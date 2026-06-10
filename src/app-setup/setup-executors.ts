/**
 * setup-executors.ts
 * Executor 集中注册
 *
 * 所有 executor 统一适配为 ExecutorFn 签名：
 * (pool, jobId, ctx, dispatcher) => Promise<void>
 */

import type { AppContext } from "../core/app-context.js";
import type { ExecutorFn } from "../core/executor-registry.js";
import type { Pool } from "pg";
import type { QueueDispatcher } from "../modules/queue-dispatcher.js";
import type { Resolution, GarmentAsset, PageSection } from "../contracts/types.js";
import { getLogger } from "../core/logger/index.js";
import { AppError } from "../core/errors.js";

const logger = getLogger("setup-executors");

/**
 * 集中注册所有 executor
 * @param ctx - 应用上下文（包含 executorRegistry）
 */
export async function setupExecutors(ctx: AppContext): Promise<void> {
  const registry = ctx.executorRegistry;

  // ========== Step2 Executor（角色五视图）==========
  registry.register("step2_five_view", wrapStep2FiveViewExecutor(ctx));
  registry.register("step2_batch_five_view", wrapStep2BatchExecutor(ctx));
  // 图片项目五视图（复用视频项目执行器，任务类型区分）
  registry.register("image_step2_five_view", wrapStep2FiveViewExecutor(ctx));
  registry.register("image_step2_batch_five_view", wrapStep2BatchExecutor(ctx));

  // ========== Step3 Executor（脚本 + 分镜）==========
  registry.register("step3_shot_prompt", wrapStep3ShotPromptExecutor(ctx));
  registry.register("step3_batch_preview", wrapStep3BatchPreviewExecutor(ctx));
  registry.register("step3_frame_preview", wrapStep3FramePreviewExecutor(ctx));
  registry.register("step3_scripts_generation", wrapStep3StrategyOrchestratorExecutor(ctx));
  registry.register("step3_library", wrapStep3StrategyExecutor(ctx, "library"));
  registry.register("step3_video", wrapStep3StrategyExecutor(ctx, "video"));
  registry.register("step3_realtime", wrapStep3StrategyExecutor(ctx, "realtime"));
  registry.register("step3_effectiveness", wrapStep3StrategyExecutor(ctx, "effectiveness"));
  registry.register("step3_custom", wrapStep3StrategyExecutor(ctx, "custom"));
  registry.register("step3_fashion", wrapStep3StrategyExecutor(ctx, "fashion"));
  registry.register("step3_emotion_archetype", wrapStep3StrategyExecutor(ctx, "emotion_archetype"));
  registry.register("step3_aesthetic", wrapStep3StrategyExecutor(ctx, "aesthetic"));
  registry.register("step3_product_showcase", wrapStep3StrategyExecutor(ctx, "product_showcase"));
  registry.register("step3_story_theme", wrapStep3StrategyExecutor(ctx, "story_theme"));
  registry.register("step3_resonance", wrapStep3StrategyExecutor(ctx, "resonance"));
  registry.register("step3_reverse_rewrite", wrapStep3ReverseRewriteExecutor(ctx));

  // ========== Step4 Executor（视频生成）==========
  registry.register("step4_video", wrapStep4VideoExecutor(ctx));
  registry.register("step4_clip_submit", wrapStep4ClipSubmitExecutor(ctx));
  registry.register("step4_clip_query", wrapStep4ClipQueryExecutor(ctx));

  // ========== Fission Executor（裂变任务）==========
  registry.register("step6_fission", wrapFissionParentExecutor(ctx));
  registry.register("step6_fission_new_story", wrapFissionNewStoryExecutor(ctx));
  registry.register("step6_fission_shot_prompts", wrapFissionShotPromptsExecutor(ctx));
  registry.register("step6_fission_item_image", wrapFissionItemImageExecutor(ctx));
  registry.register("step6_fission_item_video_submit", wrapFissionItemVideoSubmitExecutor(ctx));
  registry.register("step6_fission_item_video_query", wrapFissionItemVideoQueryExecutor(ctx));
  registry.register("step6_fission_combination", wrapFissionCombinationExecutor(ctx));

  // ========== Outfit Change Executor（换装）==========
  registry.register("outfit_change", wrapOutfitChangeExecutor(ctx));
  registry.register("outfit_change_understand", wrapOutfitUnderstandExecutor(ctx));
  registry.register("outfit_change_adapt_video_edit", wrapOutfitAdaptVideoEditExecutor(ctx));
  registry.register("outfit_change_gen_video_edit", wrapOutfitGenVideoEditExecutor(ctx));
  registry.register("outfit_change_gen_video_edit_query", wrapOutfitGenVideoEditQueryExecutor(ctx));

  // ========== Image Project Executor（图片项目）==========
  registry.register("image_step3_model_photo", wrapImageStep3Executor(ctx));
  registry.register("image_step3_model_plan", wrapImageStep3ModelPlanExecutor(ctx));
  registry.register("image_step3_single_photo", wrapImageStep3SinglePhotoExecutor(ctx));
  registry.register("image_step3_multi_person", wrapImageStep3MultiPersonExecutor(ctx));
  registry.register("image_step3_multi_person_plan", wrapImageStep3MultiPersonPlanExecutor(ctx));
  registry.register("image_step4_long_image_submit", wrapLongImageSubmitExecutor(ctx));
  registry.register("image_step4_long_image_query", wrapLongImageQueryExecutor(ctx));

  // ========== Other Executor（其他）==========
  // quality_scoring 已统一走 nrm_system_jobs，由 ScoringDaemon 消费，不再需要 async_jobs executor
  registry.register("llm_reverse", wrapLlmReverseExecutor(ctx));

  // ========== Action Transfer Executor（动作迁移）==========
  registry.register("action_transfer", wrapActionTransferExecutor(ctx));

  logger.info({ count: registry.size() }, "已注册 executor");
}

// ========== Executor 包装函数 ==========

function wrapStep2FiveViewExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { executeFiveViewJob } = await import("../modules/step2-five-view-job-executor.js");
    const { generateCharacterFiveView } = await import("../modules/character-five-view-generation-service.js");
    const { getAsyncJob } = await import("../service/async-job-service.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    const generator = async (_ctx: AppContext, character: any, options: any) => {
      const result = await generateCharacterFiveView(ctx, character || {}, options);
      return {
        imageUrl: result.imageUrl ?? "",
        prompt: result.prompt ?? undefined,
        model: result.model ?? undefined
      };
    };

    await executeFiveViewJob(ctx, job, generator, params.dispatcher);
  };
}

function wrapStep2BatchExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob, updateAsyncJobStage } = await import("../service/async-job-service.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    await updateAsyncJobStage(params.repos, params.jobId, "等待子任务完成", ctx.clock.now());
  };
}

function wrapStep3ShotPromptExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { executeShotPromptJob } = await import("../modules/step3-shot-prompt-executor.js");
    const { getAsyncJob } = await import("../service/async-job-service.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    await executeShotPromptJob(ctx, params.repos, params.jobId, job.userId, params.dispatcher);
  };
}

function wrapStep3BatchPreviewExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob, updateAsyncJobStage, createAsyncJob, finalizeAsyncJob, checkAndFinalizeParent } = await import("../service/async-job-service.js");
    const { JOB_TYPE_SHOT_PROMPT } = await import("../modules/step3-shot-prompt-executor.js");
    type ShotPromptJobInput = import("../modules/step3-shot-prompt-executor.js").ShotPromptJobInput;

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    // 【修复】先解析 parentJobId（单独解析，确保 catch 块可访问）
    let parentJobId: string | undefined;
    try {
      const partialInput = JSON.parse(job.input) as { parentJobId?: string };
      parentJobId = partialInput.parentJobId;
    } catch (parseErr) {
      logger.warn({ jobId: params.jobId, parseErr: parseErr instanceof Error ? parseErr.message : String(parseErr) }, "解析 job.input 中的 parentJobId 失败");
    }

    try {
      const input = JSON.parse(job.input) as {
        request?: {
          projectId?: string;
          userId?: string;
          frameIndexes?: number[];
          ratio?: string;
          resolution?: string;
          count?: number;
          characterReferenceImages?: string[];
          scriptDataId?: string;
        };
      };

      // 【修复】batch_preview 的 input 结构是 { request: {...} }，需要提取 request 内的字段
      // 构建 ShotPromptJobInput，确保 projectId 存在
      const request = input.request;
      if (!request?.projectId) {
        await finalizeAsyncJob(params.repos, params.jobId, "failed", null, {
          code: "MISSING_PROJECT_ID",
          message: "批量预览任务缺少 projectId",
        }, ctx.clock.now(), params.dispatcher);
        return;
      }

      await updateAsyncJobStage(params.repos, params.jobId, "生成提示词", ctx.clock.now());

      // 构建 shot_prompt 子任务的 input（扁平结构，符合 ShotPromptJobInput 定义）
      const shotPromptInput: ShotPromptJobInput = {
        projectId: request.projectId,
        scriptDataId: request.scriptDataId,
        parentJobId: params.jobId,
        frameIndexes: request.frameIndexes ?? [],
        ratio: request.ratio ?? "9:16",
        resolution: request.resolution ?? "2k",
        count: request.count ?? 4,
      };

      await createAsyncJob(params.repos, {
        userId: job.userId,
        jobType: JOB_TYPE_SHOT_PROMPT,
        input: JSON.stringify(shotPromptInput),
        projectId: job.projectId ?? undefined,
        parentJobId: params.jobId,
        now: ctx.clock.now(),
        initialStatus: "pending", // 【并发改造】子任务排队等待 QueueDispatcher 调度
      }, ctx.globalTaskConcurrencyService);

      await updateAsyncJobStage(params.repos, params.jobId, "等待子任务完成", ctx.clock.now());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ jobId: params.jobId, error: errorMessage }, "批量预览任务执行失败");
      await finalizeAsyncJob(params.repos, params.jobId, "failed", null, {
        code: "BATCH_PREVIEW_ERROR",
        message: errorMessage,
      }, ctx.clock.now(), params.dispatcher);

      if (parentJobId) {
        await checkAndFinalizeParent(params.repos, parentJobId, params.dispatcher, ctx.clock.now());
      }
    }
  };
}

function wrapStep3FramePreviewExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob, finalizeAsyncJob, checkAndFinalizeParent } = await import("../service/async-job-service.js");
    const {
      executeSingleFramePreviewJob,
      checkAndFinalizeBatchParent,
    } = await import("../modules/step3-batch-preview-orchestrator.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    // 【修复】先解析 parentJobId（单独解析，确保catch块可访问）
    let parentJobId: string | undefined;
    try {
      const partialInput = JSON.parse(job.input) as { parentJobId?: string };
      parentJobId = partialInput.parentJobId;
    } catch (parseErr) {
      logger.warn({ jobId: params.jobId, parseErr: parseErr instanceof Error ? parseErr.message : String(parseErr) }, "解析 job.input 中的 parentJobId 失败");
    }

    try {
      const input = JSON.parse(job.input) as {
        request?: import("../modules/step3-batch-preview-orchestrator.js").SingleFramePreviewRequest;
        frameImageId?: string;
        parentJobId?: string;
        frameIndex?: number;
        batchId?: string;
        count?: number;
      };

      // 获取用户和项目
      const user = await ctx.repos.users.findById(job.userId);
      if (!user) {
        await finalizeAsyncJob(params.repos, params.jobId, "failed", null, {
          code: "USER_NOT_FOUND",
          message: "用户不存在",
        }, ctx.clock.now(), params.dispatcher);
        return;
      }

      const project = await ctx.repos.projects.findById(job.projectId ?? "");
      if (!project) {
        await finalizeAsyncJob(params.repos, params.jobId, "failed", null, {
          code: "PROJECT_NOT_FOUND",
          message: "项目不存在",
        }, ctx.clock.now(), params.dispatcher);
        return;
      }

      // 根据角色年龄选择对应的 RouteKey（用于图片生成 + 积分扣除）
      const { ProviderRouteKeys, selectRouteKeyByAge } = await import("../contracts/provider-route-keys.js");
      const age = project.selectedRoleDirection?.age;
      const selectedRouteKey = selectRouteKeyByAge(
        age != null ? Number(age) : null,
        ProviderRouteKeys.STEP3_STORYBOARD_IMAGE_CHILD,
        ProviderRouteKeys.STEP3_STORYBOARD_IMAGE_ADULT,
      );

      // 创建 generator（简化版本，直接调用图片生成服务）
      const generator = async (genInput: {
        frameIndex: number;
        title: string;
        prompt: string;
        characterReferenceImages: string[];
        garmentReferenceImages: string[];
        ratio: import("../routes/project-route-shared.js").JimengImageRatio;
        resolution: import("../routes/project-route-shared.js").JimengImageResolution;
        count: number;
      }) => {
        const { requestLlmImageGenerationUrls } = await import("../services/media/image-generation-providers.js");
        const { resolveRouteProviderWithFallback } = await import("../services/llm/provider-resolver.js");
        const { buildStep3StoryboardFrameGenerationRequest } = await import("../modules/step3-storyboard-frame-generation-contract.js");

        const routeKeys: import("../contracts/provider-route-keys.js").ProviderRouteKey[] = [selectedRouteKey];
        const imageRoute = await resolveRouteProviderWithFallback(ctx, routeKeys);

        if (!imageRoute) {
          throw new Error("STEP3_STORYBOARD_IMAGE provider is not configured");
        }

        // 使用统一的请求构建函数，确保服饰参考图在前（主要参考），角色参考图在后（辅助参考）
        const generationRequest = buildStep3StoryboardFrameGenerationRequest({
          visualPrompt: genInput.prompt,
          garmentReferenceImages: genInput.garmentReferenceImages,
          characterReferenceImages: genInput.characterReferenceImages,
        });
        const result = await requestLlmImageGenerationUrls(imageRoute.provider, generationRequest.prompt, {
          mode: generationRequest.mode,
          images: generationRequest.images ?? [],
          negativePrompt: generationRequest.negativePrompt,
          ratio: genInput.ratio,
          resolution: genInput.resolution,
          count: genInput.count,
          debugOptions: {
            ctx,
            routeKey: imageRoute.routeKey,
            businessContext: `Step3 分镜预览图片生成（帧 ${genInput.frameIndex}）`,
            userId: job.userId,
            projectId: job.projectId ?? undefined,
          },
        });

        // 火山引擎豆包返回的 TOS URL 是临时的、会过期，必须立即转存到自己的 OSS
        const { persistImageSourceToStorage } = await import("../services/media/storage-persist.js");
        const persistedCandidates: string[] = [];
        for (const [idx, url] of result.urls.entries()) {
          const persisted = await persistImageSourceToStorage(
            ctx,
            url,
            `projects/${job.projectId}/step3/frame-${genInput.frameIndex}/batch-preview/candidate-${idx + 1}`,
            { persistRemote: true },
          );
          if (!persisted) {
            throw new Error(`分镜预览图转存 OSS 失败：projectId=${job.projectId}; frameIndex=${genInput.frameIndex}; candidateIndex=${idx + 1}`);
          }
          persistedCandidates.push(persisted);
        }

        return { candidates: persistedCandidates };
      };

      // 提取 parentJobId（用于失败时检查父任务完成）
      const parentJobId = input.parentJobId;

      // 分支 1：独立的单帧任务（有 request 参数）
      if (input.request) {
        // 注入 routeKey 用于积分扣除
        const requestWithRouteKey = { ...input.request, routeKey: selectedRouteKey };
        await executeSingleFramePreviewJob(params.repos, params.jobId, requestWithRouteKey, generator, ctx.repos, params.dispatcher, ctx);
      }
      // 分支 2：批量子任务（有 frameImageId + parentJobId）
      else if (input.frameImageId && parentJobId && input.frameIndex) {
        await executeBatchChildFramePreviewJob(
          ctx,
          job,
          {
            frameImageId: input.frameImageId,
            parentJobId,
            frameIndex: input.frameIndex,
            batchId: input.batchId,
            count: input.count ?? 4,
            routeKey: selectedRouteKey,
          },
          generator,
          params.dispatcher,
        );
        await checkAndFinalizeBatchParent(params.repos, parentJobId, params.dispatcher);
      }
      else {
        await finalizeAsyncJob(params.repos, params.jobId, "failed", null, {
          code: "INVALID_INPUT",
          message: "无法识别的任务类型",
        }, ctx.clock.now(), params.dispatcher);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ jobId: params.jobId, error: errorMessage }, "帧预览任务执行失败");
      await finalizeAsyncJob(params.repos, params.jobId, "failed", null, {
        code: "FRAME_PREVIEW_ERROR",
        message: errorMessage,
      }, ctx.clock.now(), params.dispatcher);

      // 【修复】检查父任务是否需要自动完成（parentJobId在try块外解析）
      if (parentJobId) {
        await checkAndFinalizeBatchParent(params.repos, parentJobId, params.dispatcher);
      }
    }
  };
}

/** 执行批量预览的子任务（从 frame_images 表读取业务参数） */
async function executeBatchChildFramePreviewJob(
  ctx: AppContext,
  job: import("../service/async-job-service.js").AsyncJobRecord,
  input: {
    frameImageId: string;
    parentJobId: string;
    frameIndex: number;
    batchId?: string;
    count?: number;
    routeKey?: string;
  },
  generator: import("../modules/step3-batch-preview-orchestrator.js").FramePreviewGenerator,
  dispatcher?: import("../modules/queue-dispatcher.js").QueueDispatcher,
): Promise<void> {
  const { updateAsyncJobStage, finalizeAsyncJob } = await import("../service/async-job-service.js");
  const { sanitizePromptForImageSafety, checkAndUpdateStoryboardPreviewCompleted } = await import("../modules/step3-batch-preview-orchestrator.js");

  const repos = ctx.repos as import("../repositories/pg/index.js").PgRepositoryCollection;
  const now = ctx.clock.now();

  // 更新状态为生成中
  await updateAsyncJobStage(repos, job.id, "生成中", now);

  // 从 frame_images 表查询业务参数
  const frameImageRecord = await repos.step3FrameImages.findById(input.frameImageId);
  if (!frameImageRecord) {
    await finalizeAsyncJob(repos, job.id, "failed", null, {
      code: "FRAME_IMAGE_NOT_FOUND",
      message: `frame_images 记录不存在: ${input.frameImageId}`,
    }, now, dispatcher);
    return;
  }

  const batches = frameImageRecord.batches as import("../service/step3-frame-images-db-service.js").Step3FrameImageBatch[];
  const latestBatch = batches[batches.length - 1];
  if (!latestBatch) {
    await finalizeAsyncJob(repos, job.id, "failed", null, {
      code: "NO_BATCH_FOUND",
      message: "frame_images 没有批次数据",
    }, now, dispatcher);
    return;
  }

  const prompt = frameImageRecord.image_prompt ?? `镜头 ${input.frameIndex}`;
  const ratio = (latestBatch.ratio ?? "9:16") as import("../routes/project-route-shared.js").JimengImageRatio;
  const resolution = (latestBatch.resolution ?? "2k") as import("../routes/project-route-shared.js").JimengImageResolution;
  const count = input.count ?? 4;

  // 从数据库实时查询参考图（不缓存到 batch）
  const project = await ctx.projectService.requireOwnerProject({ id: job.userId }, job.projectId ?? "");
  const { resolveProjectReferenceImages } = await import("../modules/project-reference-image-resolver.js");
  const referenceImages = await resolveProjectReferenceImages(ctx, project);

  try {
    const result = await generator({
      frameIndex: input.frameIndex,
      title: frameImageRecord.image_prompt ?? `镜头 ${input.frameIndex}`,
      prompt: sanitizePromptForImageSafety(prompt),
      characterReferenceImages: referenceImages.characterReferenceImages,
      garmentReferenceImages: referenceImages.garmentReferenceImages,
      ratio,
      resolution,
      count,
    });

    const now2 = ctx.clock.now();
    const updatedBatches = [...batches];
    const batchIdx = updatedBatches.findIndex((b) => b.batch_id === latestBatch.batch_id);
    if (batchIdx >= 0) {
      updatedBatches[batchIdx] = {
        ...updatedBatches[batchIdx]!,
        status: "succeeded",
        job_id: job.id,
        images: result.candidates.map((url: string, idx: number) => ({
          image_url: url,
          image_index: idx,
        })),
      };
    }

    await repos.step3FrameImages.updateBatchesSelectionAndStatus(
      frameImageRecord.id, updatedBatches, result.candidates[0] ?? null, "succeeded", now2,
    );

    await finalizeAsyncJob(repos, job.id, "completed", {
      frameIndex: input.frameIndex,
      candidates: result.candidates,
    }, null, now2, dispatcher);

    await checkAndUpdateStoryboardPreviewCompleted(job.projectId ?? "", ctx.repos);
  } catch (frameErr) {
    const errMsg = frameErr instanceof Error ? frameErr.message : "Unknown error";
    logger.error({ jobId: job.id, frameImageId: input.frameImageId, error: errMsg }, "帧图片生成失败");
    await finalizeAsyncJob(repos, job.id, "failed", null, {
      code: "FRAME_GENERATION_FAILED",
      message: errMsg,
    }, now, dispatcher);

    const updatedBatches = [...batches];
    const batchIdx = updatedBatches.findIndex((b) => b.batch_id === latestBatch.batch_id);
    if (batchIdx >= 0) {
      updatedBatches[batchIdx] = {
        ...updatedBatches[batchIdx]!,
        status: "failed",
        job_id: job.id,
      };
    }
    await repos.step3FrameImages.updateBatchesAndStatus(
      frameImageRecord.id, updatedBatches, "failed", now,
    );
  }
}

function wrapStep3StrategyExecutor(ctx: AppContext, _strategy: string): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob, finalizeAsyncJob } = await import("../service/async-job-service.js");
    const { checkAndFinalizeParent } = await import("../service/async-job-service.js");
    const { executeScriptGeneration } = await import("../modules/step3-script-orchestrator.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    try {
      // executeScriptGeneration 会从 job 中提取 type/project/user/excludeIds
      await executeScriptGeneration({
        repos: params.repos,
        jobId: params.jobId,
        ctx,
        dispatcher: params.dispatcher,
        onSave: async (snapshot, pid, uid) => {
          const { saveStep3ScriptsToDatabase } = await import("../routes/step3-candidate/index.js");
          await saveStep3ScriptsToDatabase(ctx, snapshot, pid, uid);
          // 评分任务由 DailyScoringScheduler 每天凌晨2点统一调度，不再实时触发
        },
      });

      // 子任务完成后，检查父任务状态
      if (job.parentJobId) {
        await checkAndFinalizeParent(params.repos, job.parentJobId, params.dispatcher, ctx.clock.now());
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ jobId: params.jobId, error: errorMessage }, "脚本生成任务执行失败");
      await finalizeAsyncJob(params.repos, params.jobId, "failed", null, {
        code: "SCRIPT_GENERATION_ERROR",
        message: errorMessage,
      }, ctx.clock.now(), params.dispatcher);

      if (job.parentJobId) {
        await checkAndFinalizeParent(params.repos, job.parentJobId, params.dispatcher, ctx.clock.now());
      }
    }
  };
}

function wrapStep3StrategyOrchestratorExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    // 子任务已由 startScriptsGenerationParent 预创建，每个子任务完成时通过
    // checkAndFinalizeParent 自动结算父任务，此处仅更新阶段状态
    const { getAsyncJob, updateAsyncJobStage } = await import("../service/async-job-service.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    await updateAsyncJobStage(params.repos, params.jobId, "等待策略完成", ctx.clock.now());
  };
}

function wrapStep4VideoExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob, findChildrenByParentId } = await import("../service/async-job-service.js");
    const { createStep4ClipSubmitJob } = await import("../routes/step4-video/advance-video-job.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    // 解析 input：只读标识字段
    const input = job.input ? JSON.parse(job.input) as {
      targetSceneIndex?: number;
      source?: string;
    } : {};

    // 解析 result：获取 totalClipCount（由 videoJobService.create 写入）
    const result = (job.result as { totalClipCount?: number }) ?? {};
    const totalClipCount = result.totalClipCount ?? 0;
    if (totalClipCount <= 0) {
      logger.warn({ jobId: params.jobId }, "Step4Video totalClipCount 为 0，跳过");
      return;
    }

    // 幂等检查：如果已有 Submit 子任务，说明已创建过，跳过
    const existingChildren = await findChildrenByParentId(params.repos, params.jobId);
    const submitChildren = existingChildren.filter(c => c.jobType === "step4_clip_submit");
    if (submitChildren.length > 0) {
      logger.info({ jobId: params.jobId, childCount: submitChildren.length }, "Step4Video 已有 Submit 子任务，跳过创建");
      return;
    }

    const user = await ctx.repos.users.findById(job.userId);
    if (!user) return;

    // 确定要创建 Submit 子任务的范围
    const isSingleRetry = typeof input.targetSceneIndex === "number";
    const sceneIndices = isSingleRetry
      ? [input.targetSceneIndex!]
      : Array.from({ length: totalClipCount }, (_, i) => i);

    // 预先查询 shot_prompts，用于填充 scene 的 clip_prompt
    const { getShotPromptsService, buildEnhancedVideoPrompt } = await import("../services/shot-prompts-service.js");
    const { SHOT_PROMPTS_TYPE } = await import("../contracts/shot-prompts-contract.js");
    const shotPromptsService = getShotPromptsService(ctx);
    const shotPrompts = await shotPromptsService.getActive(job.projectId ?? "", SHOT_PROMPTS_TYPE.ORIGIN);

    // 从 characterAnchors 构建服饰保留锚点（安全网：SPE 未生成时兜底注入）
    // 注入全部角色锚点：安全网仅当 SPE 完全遗漏时触发（regex 检测），SPE 已生成精确锚点则跳过
    type AnchorLike = { clothing_anchor?: string; clothing_features?: string[] | string };
    const retentionAnchors = (shotPrompts?.characterAnchors as AnchorLike[] | undefined | null)
      ?.filter((a): a is AnchorLike & Required<Pick<AnchorLike, "clothing_anchor" | "clothing_features">> => {
        if (!a.clothing_anchor) return false;
        if (!a.clothing_features) return false;
        // 仅允许 string 和 string[]，排除 object/null 等异常类型
        if (typeof a.clothing_features !== "string" && !Array.isArray(a.clothing_features)) return false;
        return true;
      })
      .map((a) => {
        // SPE 生成 string，TS contract 声明 string[]，安全处理两种类型
        const features = Array.isArray(a.clothing_features) ? a.clothing_features.join(", ") : a.clothing_features;
        return `Maintain wearing ${a.clothing_anchor}: ${features} from first frame throughout.`;
      });

    if (!retentionAnchors?.length && shotPrompts?.characterAnchors?.length) {
      logger.warn({ projectId: job.projectId, anchorCount: shotPrompts.characterAnchors.length }, "所有角色锚点缺少 clothing_anchor 或 clothing_features，安全网未生成");
    }

    // 批量任务：预先初始化 step4_video_scenes 记录（清空历史数据 + 预填 clip_prompt）
    if (!isSingleRetry) {
      for (let i = 0; i < totalClipCount; i++) {
        const shotId = i + 1;
        const shotItem = shotPrompts?.shots?.find(s => s.shot_id === shotId);
        if (!shotItem?.video_prompt) {
          logger.warn({ projectId: job.projectId, shotId, totalClipCount }, "分镜缺少 video_prompt，跳过 clip_prompt 预填");
        }
        const clipPrompt = shotItem?.video_prompt ? buildEnhancedVideoPrompt(shotItem.video_prompt, retentionAnchors) : null;
        await ctx.repos.step4VideoScenes.updateScene(
          job.projectId ?? "",
          i,
          { clipStatus: "pending", clipProgress: 0, variantUrls: [], selectedIndex: 0, clipPrompt },
          user.id,
        );
      }
    } else {
      // 单片段重试：也预填 clip_prompt
      const singleSceneIndex = input.targetSceneIndex!;
      const shotId = singleSceneIndex + 1;
      const shotItem = shotPrompts?.shots?.find(s => s.shot_id === shotId);
      const clipPrompt = shotItem?.video_prompt ? buildEnhancedVideoPrompt(shotItem.video_prompt, retentionAnchors) : null;
      if (clipPrompt) {
        await ctx.repos.step4VideoScenes.updateScene(
          job.projectId ?? "",
          singleSceneIndex,
          { clipPrompt },
          user.id,
        );
      }
    }

    // 为每个场景创建 Submit 子任务（只传最小标识）
    for (const sceneIndex of sceneIndices) {
      await createStep4ClipSubmitJob(params.repos, {
        videoJobId: params.jobId,
        userId: job.userId,
        projectId: job.projectId ?? "",
        sceneIndex,
        parentJobId: params.jobId,
      });
    }

    logger.info({ jobId: params.jobId, childCount: sceneIndices.length, isSingleRetry }, "Step4Video 父任务已创建 Submit 子任务");

    // 触发提升，让 Submit 子任务尽快开始
    await params.dispatcher.tryPromote();
  };
}

/** step6_fission 父任务执行器：纯协调，等待子任务完成 */
function wrapFissionParentExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob, updateAsyncJobStage } = await import("../service/async-job-service.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    // 裂变父任务只做协调，子任务（prep → sgen → item_image/item_video）自行推进
    // 父任务保持 running，等子任务全部完成后由 checkAndFinalizeParent 收尾
    await updateAsyncJobStage(params.repos, params.jobId, "等待子任务完成", ctx.clock.now());
  };
}

function wrapFissionNewStoryExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getFissionNewStoryExecutor } = await import("../modules/fission-video/fission-new-story-executor.js");
    const { getAsyncJob } = await import("../service/async-job-service.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    const user = await ctx.repos.users.findById(job.userId);
    if (!user) return;

    const executor = getFissionNewStoryExecutor();
    if (!executor) {
      logger.warn({ jobId: params.jobId }, "FissionNewStory executor 未注册，跳过");
      return;
    }

    await executor.execute(user, job.projectId ?? "", params.jobId);
  };
}

function wrapFissionShotPromptsExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getFissionShotPromptsExecutor } = await import("../modules/fission-video/fission-shot-prompts-executor.js");
    const { getAsyncJob } = await import("../service/async-job-service.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    const user = await ctx.repos.users.findById(job.userId);
    if (!user) return;

    const executor = getFissionShotPromptsExecutor();
    if (!executor) {
      logger.warn({ jobId: params.jobId }, "FissionShotPrompts executor 未注册，跳过");
      return;
    }

    await executor.execute(user, job.projectId ?? "", params.jobId);
  };
}

function wrapFissionItemImageExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getFissionItemImageExecutor } = await import("../modules/fission-video/fission-item-image-executor.js");
    const { getAsyncJob } = await import("../service/async-job-service.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    const user = await ctx.repos.users.findById(job.userId);
    if (!user) return;

    const executor = getFissionItemImageExecutor();
    if (!executor) {
      logger.warn({ jobId: params.jobId }, "FissionItemImage executor 未注册，跳过");
      return;
    }

    await executor.advanceOnce(user, job.projectId ?? "", params.jobId);
  };
}

function wrapFissionCombinationExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getFissionCombinationExecutor } = await import("../modules/fission-video/fission-combination-executor.js");
    const { getAsyncJob } = await import("../service/async-job-service.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    const user = await ctx.repos.users.findById(job.userId);
    if (!user) return;

    const executor = getFissionCombinationExecutor();
    if (!executor) {
      logger.warn({ jobId: params.jobId }, "FissionCombination executor 未注册，跳过");
      return;
    }

    await executor.advanceOnce(user, job.projectId ?? "", params.jobId);
  };
}

function wrapOutfitChangeExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob, updateAsyncJobStage } = await import("../service/async-job-service.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    // 父任务只更新状态为"等待子任务完成"，不创建任何子任务
    // understand 子任务由 orchestrator.ts 的 executeOutfitChangePipeline 创建
    // understand → adapt → gen 的依赖链由各 executor 自动推进
    // 每个子任务完成后会调用 checkAndFinalizeParent，最终完成父任务
    await updateAsyncJobStage(params.repos, params.jobId, "等待子任务完成", ctx.clock.now());
  };
}

function wrapOutfitUnderstandExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob } = await import("../service/async-job-service.js");
    const { executeOutfitUnderstandJob } = await import("../modules/video-step/step3-outfit-change/executor-handlers.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    await executeOutfitUnderstandJob(ctx, params.repos, job, params.dispatcher);
  };
}

function wrapOutfitAdaptVideoEditExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob } = await import("../service/async-job-service.js");
    const { executeOutfitAdaptVideoEditJob } = await import("../modules/video-step/step3-outfit-change/executor-handlers.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    await executeOutfitAdaptVideoEditJob(ctx, params.repos, job, params.dispatcher);
  };
}

function wrapOutfitGenVideoEditExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob } = await import("../service/async-job-service.js");
    const { executeOutfitGenVideoEditJob } = await import("../modules/video-step/step3-outfit-change/executor-handlers.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    await executeOutfitGenVideoEditJob(ctx, params.repos, job, params.dispatcher);
  };
}

function wrapOutfitGenVideoEditQueryExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob } = await import("../service/async-job-service.js");
    const { executeOutfitGenVideoEditQueryJob } = await import("../modules/video-step/step3-outfit-change/executor-handlers.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    await executeOutfitGenVideoEditQueryJob(ctx, params.repos, job, params.dispatcher);
  };
}

/**
 * 图片项目 Step3 主任务执行器
 * 任务类型: image_step3_model_photo (主图生成)
 *
 * 任务编排结构:
 * - 主任务: 等待所有子任务完成
 * - 子任务 1: image_step3_model_plan (规划方案) ← 第一个执行
 * - 子任务 2-N: image_step3_single_photo × N (图片生成) ← 依赖规划完成
 */
function wrapImageStep3Executor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob, updateAsyncJobStage, createAsyncJob } = await import("../service/async-job-service.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    const now = ctx.clock.now();

    try {
      const input = JSON.parse(job.input) as {
        projectId: string;
        outfitPlan?: {
          title?: string;
          styleName?: string;
          analysis?: string;
          optimizedPrompt?: string;
        };
        outfitSummary?: string;
        characterDescription?: string;
        garments?: Array<{ description?: string }>;
        referenceImages?: string[];
        photoCount?: number;
        backgroundStyle?: "solid" | "scene" | "balanced"; // 背景风格
      };

      const projectId = job.projectId ?? input.projectId;

      // === 创建规划子任务 ===
      await updateAsyncJobStage(params.repos, params.jobId, "创建规划任务", now);

      const planJobId = `image-step3-plan-${now}-${Math.random().toString(36).slice(2, 8)}`;
      await createAsyncJob(params.repos, {
        id: planJobId,
        userId: job.userId,
        jobType: "image_step3_model_plan",
        projectId,
        input: JSON.stringify({
          outfitPlan: input.outfitPlan,
          outfitSummary: input.outfitSummary,
          characterDescription: input.characterDescription,
          garments: input.garments,
          referenceImages: input.referenceImages,
          photoCount: input.photoCount,
          backgroundStyle: input.backgroundStyle, // 背景风格传递给规划子任务
          parentJobId: params.jobId, // 传递父任务 ID，供规划子任务创建图片生成子任务时使用
        }),
        now: ctx.clock.now(),
        parentJobId: params.jobId,
        initialStatus: "pending", // 规划子任务排队等待 QueueDispatcher 调度
      }, ctx.globalTaskConcurrencyService);

      // 主任务等待所有子任务完成（规划子任务 + 图片生成子任务）
      await updateAsyncJobStage(params.repos, params.jobId, "等待子任务完成", ctx.clock.now());

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ jobId: params.jobId, error: errorMessage }, "图片项目 Step3 主任务执行失败");
      const { finalizeAsyncJob, checkAndFinalizeParent } = await import("../service/async-job-service.js");
      await finalizeAsyncJob(params.repos, params.jobId, "failed", null, {
        code: "IMAGE_STEP3_MAIN_FAILED",
        message: errorMessage,
      }, ctx.clock.now(), params.dispatcher);

      if (job.parentJobId) {
        await checkAndFinalizeParent(params.repos, job.parentJobId, params.dispatcher, ctx.clock.now());
      }
    }
  };
}

/**
 * 图片项目 Step3 规划子任务执行器
 * 任务类型: image_step3_model_plan (规划方案)
 *
 * 执行流程:
 * 1. LLM 规划模特图姿势和背景（调用 image_project_step3_model_plan skill）
 * 2. 创建 photos 占位记录
 * 3. 创建 N 个 image_step3_single_photo 子任务（dependsOn 指向自己）
 * 4. finalizeAsyncJob + checkAndFinalizeParent
 */
function wrapImageStep3ModelPlanExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob, updateAsyncJobStage, createAsyncJob, finalizeAsyncJob, checkAndFinalizeParent } = await import("../service/async-job-service.js");
    const { resolveRouteProviderWithFallback } = await import("../services/llm/provider-resolver.js");
    const { ProviderRouteKeys } = await import("../contracts/provider-route-keys.js");
    const { requestLlmPlainText } = await import("../services/llm/llm-transport.js");
    const { extractJsonObject } = await import("../services/utils/json-utils.js");
    const { SkillLoader } = await import("../services/skills/skill-loader.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    const now = ctx.clock.now();

    try {
      const input = JSON.parse(job.input) as {
        projectId: string;
        outfitPlan?: {
          title?: string;
          styleName?: string;
          analysis?: string;
          optimizedPrompt?: string;
        };
        outfitSummary?: string;
        characterDescription?: string;
        garments?: Array<{ description?: string }>;
        referenceImages?: string[];
        parentJobId?: string; // 父任务 ID（主任务）
        photoCount?: number;
        backgroundStyle?: "solid" | "scene" | "balanced"; // 背景风格
      };

      const projectId = job.projectId ?? input.projectId;
      const parentJobId = input.parentJobId ?? job.parentJobId;

      await updateAsyncJobStage(params.repos, params.jobId, "规划中", now);

      // 根据角色年龄选择成人/儿童版 skill
      const project = await ctx.repos.projects.findById(projectId);
      const selectedCharId = project?.selectedCharacterId;
      let isChildCharacter = false;
      if (selectedCharId) {
        const character = await ctx.repos.libraryCharacters.findById(selectedCharId);
        if (character?.age) {
          const { isChildAge } = await import("../contracts/provider-route-keys.js");
          isChildCharacter = isChildAge(Number(character.age));
        }
      }

      // === Stage 1: LLM 规划 ===
      const promptVariables = {
        outfitTitle: input.outfitPlan?.title ?? "",
        styleName: input.outfitPlan?.styleName ?? "",
        analysis: input.outfitPlan?.analysis ?? input.outfitSummary ?? "",
        optimizedPrompt: input.outfitPlan?.optimizedPrompt ?? "",
        characterDescription: input.characterDescription ?? "",
        targetPhotoCount: input.photoCount ?? 10,
        garments: input.garments ?? [],
        backgroundStyle: input.backgroundStyle ?? "balanced", // 背景风格传递给 Skill
      };

      const skillLoader = new SkillLoader();
      const PROMPT_CODE_STEP3_PLAN = isChildCharacter
        ? "image_project_step3_model_plan_child"
        : "image_project_step3_model_plan";
      const { system: systemPrompt, user: renderedUserPrompt } = await skillLoader.render(PROMPT_CODE_STEP3_PLAN, promptVariables);

      const ROUTE_KEY_STEP3_PLAN = isChildCharacter
        ? ProviderRouteKeys.IMAGE_PROJECT_STEP3_MODEL_PLAN_CHILD
        : ProviderRouteKeys.IMAGE_PROJECT_STEP3_MODEL_PLAN_ADULT;
      const llmProvider = await resolveRouteProviderWithFallback(ctx, [ROUTE_KEY_STEP3_PLAN]);
      if (!llmProvider) {
        throw new Error(`${ROUTE_KEY_STEP3_PLAN} provider is not configured`);
      }

      const llmText = await requestLlmPlainText(llmProvider.provider, systemPrompt, renderedUserPrompt, 0.3, {
        ctx,
        routeKey: ROUTE_KEY_STEP3_PLAN,
        userId: job.userId,
        businessContext: `图片项目 Step3 模特图规划 (skill=${PROMPT_CODE_STEP3_PLAN})`,
        projectId,
      });

      const planJson = extractJsonObject(llmText);
      if (!planJson || !Array.isArray(planJson.photos)) {
        throw new Error("AI 返回的规划方案格式不正确");
      }

      interface PlanItem {
        poseLabel: string;
        bgLabel: string;
        posePrompt?: string;
        bgPrompt?: string;
      }
      const isValidPlanItem = (item: unknown): item is PlanItem => {
        if (typeof item !== "object" || item === null) return false;
        const obj = item as Record<string, unknown>;
        return typeof obj.poseLabel === "string" && typeof obj.bgLabel === "string";
      };

      const planItems = (planJson.photos as unknown[]).filter(isValidPlanItem);
      if (planItems.length === 0) {
        throw new Error("AI 返回的规划方案中没有有效的条目");
      }

      const maxCount = input.photoCount ?? 10;
      const clampedPlan = planItems.slice(0, maxCount);

      // === Stage 2: 创建 photos 占位 ===
      const minOrder = await ctx.repos.modelPhotos.findMinSortOrder(projectId);
      const photos = clampedPlan.map((item, index) => ({
        id: `mp-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        projectId,
        imageUrl: null,
        poseLabel: item.poseLabel,
        bgLabel: item.bgLabel,
        isSelected: false,
        status: "generating" as const, // 规划完成即标记为生成中，避免前端显示"排队中"
        errorMessage: null,
        order: minOrder - index - 1,
        createdAt: now,
        updatedAt: now,
      }));

      await ctx.repos.modelPhotos.bulkCreate(photos);

      // 照片创建后再更新 stage，避免 SSE 推送过早导致前端刷新时照片还没创建
      await updateAsyncJobStage(params.repos, params.jobId, "创建照片占位", ctx.clock.now());

      // === Stage 3: 为每张 photo 创建图片生成子任务 ===
      await updateAsyncJobStage(params.repos, params.jobId, "创建生成任务", ctx.clock.now());

      const garmentDescriptions = input.garments?.map((g) => g.description).filter((d): d is string => !!d) ?? [];

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const planItem = clampedPlan[i];
        const photoJobId = `image-step3-sp-${now}-${i}-${Math.random().toString(36).slice(2, 8)}`;

        await createAsyncJob(params.repos, {
          id: photoJobId,
          userId: job.userId,
          jobType: "image_step3_single_photo",
          projectId,
          input: JSON.stringify({
            photoId: photo.id,
            poseLabel: photo.poseLabel,
            bgLabel: photo.bgLabel,
            posePrompt: planItem?.posePrompt,
            bgPrompt: planItem?.bgPrompt,
            garmentDescriptions,
            referenceImages: input.referenceImages ?? [],
            outfitAnalysis: input.outfitPlan?.analysis ?? input.outfitSummary ?? undefined,
            characterDescription: input.characterDescription ?? undefined,
          }),
          now: ctx.clock.now(),
          parentJobId: parentJobId ?? undefined, // 图片生成子任务的父任务是主任务，不是规划子任务
          dependsOn: [params.jobId], // 图片生成子任务依赖规划子任务
          initialStatus: "pending", // 图片生成子任务排队等待，依赖规划子任务完成后才能执行
        }, ctx.globalTaskConcurrencyService);
      }

      // === Stage 4: 完成规划子任务 ===
      await finalizeAsyncJob(params.repos, params.jobId, "completed", {
        planCount: clampedPlan.length,
        photoIds: photos.map((p) => p.id),
      }, null, ctx.clock.now(), params.dispatcher);

      // 检查父任务（主任务）是否可以结算
      if (parentJobId) {
        await checkAndFinalizeParent(params.repos, parentJobId, params.dispatcher, ctx.clock.now());
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ jobId: params.jobId, error: errorMessage }, "图片项目 Step3 规划子任务执行失败");
      await finalizeAsyncJob(params.repos, params.jobId, "failed", null, {
        code: "IMAGE_STEP3_PLAN_FAILED",
        message: errorMessage,
      }, ctx.clock.now(), params.dispatcher);

      // 失败时检查父任务是否需要自动完成
      if (job.parentJobId) {
        await checkAndFinalizeParent(params.repos, job.parentJobId, params.dispatcher, ctx.clock.now());
      }
    }
  };
}

function wrapImageStep3SinglePhotoExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob, finalizeAsyncJob, updateAsyncJobStage, checkAndFinalizeParent } = await import("../service/async-job-service.js");
    const { requestLlmImageGenerationUrl } = await import("../services/media/image-generation-providers.js");
    const { resolveRouteProviderWithFallback } = await import("../services/llm/provider-resolver.js");
    const { ProviderRouteKeys } = await import("../contracts/provider-route-keys.js");
    const { readImageBytesFromSource, optimizeImageBuffer } = await import("../services/media/storage-persist.js");
    const { compositeLogo } = await import("../services/logo-composite-service.js");
    const { createHash } = await import("node:crypto");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    try {
      const input = JSON.parse(job.input) as {
        photoId: string;
        poseLabel: string;
        bgLabel: string;
        posePrompt?: string;
        bgPrompt?: string;
        garmentDescriptions?: string[];
        referenceImages?: string[];
        outfitAnalysis?: string;
        characterDescription?: string;
        characterIds?: string[];
        colorAssignments?: Record<string, string>;
      };

      await updateAsyncJobStage(params.repos, params.jobId, "生成中", ctx.clock.now());
      await ctx.repos.modelPhotos.updateFields(input.photoId, { status: "generating" });

      const imageProvider = await resolveRouteProviderWithFallback(ctx, [ProviderRouteKeys.IMAGE_PROJECT_STEP3_MODEL_PHOTO]);
      if (!imageProvider) {
        throw new Error("IMAGE_PROJECT_STEP3_MODEL_PHOTO provider is not configured");
      }

      // 构建提示词
      const garmentDescForGen = input.garmentDescriptions && input.garmentDescriptions.length > 0
        ? `\n服饰要求：${input.garmentDescriptions.join("；")}`
        : "";
      const outfitDescForGen = input.outfitAnalysis
        ? `\n搭配方案：${input.outfitAnalysis}`
        : "";
      const characterDescForGen = input.characterDescription
        ? `\n角色特征：${input.characterDescription}`
        : "";

      // 多人模式颜色强化：将 colorAssignments 转为每个角色的精确颜色约束
      let colorEnforcement = "";
      if (input.colorAssignments && Object.keys(input.colorAssignments).length > 0) {
        // 查询每个角色对应的变体颜色名
        const charColorEntries: Array<{ charId: string; color: string; isMain: boolean }> = [];
        for (const [charId, assetId] of Object.entries(input.colorAssignments)) {
          try {
            const asset = await ctx.repos.garmentAssets.findById(assetId);
            if (asset) {
              const color = asset.variantColor ?? asset.mainColor ?? "";
              const isMain = !charId.startsWith("ai_");
              charColorEntries.push({ charId, color, isMain });
            }
          } catch { /* ignore */ }
        }
        if (charColorEntries.length > 0) {
          const mainEntry = charColorEntries.find(e => e.isMain);
          const otherEntries = charColorEntries.filter(e => !e.isMain);
          const parts: string[] = [];
          if (mainEntry && mainEntry.color) {
            parts.push(`The main character (with reference face, ${mainEntry.charId}) MUST wear ${mainEntry.color}`);
          }
          // 每个 AI 角色单独声明颜色
          for (const entry of otherEntries) {
            if (entry.color) {
              parts.push(`The other character (${entry.charId}) MUST wear ${entry.color}`);
            }
          }
          if (parts.length > 0) {
            colorEnforcement = `\nColor enforcement: ${parts.join(". ")}.`;
          }
        }
      }

      const combinedPrompt = input.posePrompt && input.bgPrompt
        ? `${input.posePrompt} ${input.bgPrompt}${garmentDescForGen}${outfitDescForGen}${characterDescForGen}${colorEnforcement}`.trim()
        : `${input.poseLabel} ${input.bgLabel}${garmentDescForGen}${outfitDescForGen}${characterDescForGen}${colorEnforcement}`.trim();

      // 图片生成
      const genOptions: { mode?: "text_to_image" | "image_to_image"; images?: string[]; ratio?: string } = {
        ratio: "1:1",
      };

      if (input.referenceImages && input.referenceImages.length > 0) {
        genOptions.mode = "image_to_image";
        genOptions.images = input.referenceImages;
      }

      const TIMEOUT_MS = 900_000;
      const generationPromise = requestLlmImageGenerationUrl(imageProvider.provider, combinedPrompt, {
        ...genOptions,
        debugOptions: {
          ctx,
          routeKey: imageProvider.routeKey,
          businessContext: `图片项目 Step3 模特图生成（${input.poseLabel}）`,
          userId: job.userId,
          projectId: job.projectId ?? undefined,
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("图片生成超时（15 分钟未返回）")), TIMEOUT_MS),
      );

      const imageResult = await Promise.race([generationPromise, timeoutPromise]);

      // 下载图片到 Buffer
      const { bytes: imageBytes } = await readImageBytesFromSource(imageResult.url, ctx.configService.get().imageDownloadTimeoutMs);
      if (imageBytes.length < 1) {
        throw new Error("EMPTY_IMAGE_BYTES: 生成的图片数据为空");
      }

      // 检查是否有 Logo 配置
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      let finalImageBytes: Buffer = Buffer.from(imageBytes) as Buffer;
      const log = getLogger("image-step3-executor");

      // 查询项目扩展信息
      log.info({ projectId: job.projectId }, "[Logo合成] 查询项目扩展信息");
      const extInfo = await ctx.repos.imageProjectExt.findByProjectId(job.projectId ?? "");
      log.info({
        projectId: job.projectId,
        hasExtInfo: !!extInfo,
        logoUrl: extInfo?.logoUrl,
        logoPosition: extInfo?.logoPosition,
        logoWidthRatio: extInfo?.logoWidthRatio,
        logoMinWidth: extInfo?.logoMinWidth,
        logoMaxWidth: extInfo?.logoMaxWidth,
        logoMargin: extInfo?.logoMargin,
        logoOpacity: extInfo?.logoOpacity,
      }, "[Logo合成] 扩展信息查询结果");

      if (extInfo?.logoUrl) {
        log.info({
          projectId: job.projectId,
          logoUrl: extInfo.logoUrl,
          position: extInfo.logoPosition,
          widthRatio: extInfo.logoWidthRatio,
          minWidth: extInfo.logoMinWidth,
          maxWidth: extInfo.logoMaxWidth,
          margin: extInfo.logoMargin,
          opacity: extInfo.logoOpacity,
        }, "[Logo合成] 开始合成 Logo");

        try {
          // 合成 Logo
          const beforeSize = finalImageBytes.length;
          finalImageBytes = await compositeLogo(finalImageBytes, {
            logoSource: extInfo.logoUrl,
            position: extInfo.logoPosition,
            widthRatio: extInfo.logoWidthRatio,
            minWidth: extInfo.logoMinWidth,
            maxWidth: extInfo.logoMaxWidth,
            margin: extInfo.logoMargin,
            opacity: extInfo.logoOpacity,
          });
          const afterSize = finalImageBytes.length;
          log.info({
            projectId: job.projectId,
            beforeSize,
            afterSize,
            sizeChanged: afterSize !== beforeSize,
          }, "[Logo合成] Logo 合成成功");
        } catch (logoError) {
          // Logo 合成失败不阻断主流程，使用原图
          log.error({
            projectId: job.projectId,
            logoUrl: extInfo.logoUrl,
            error: logoError instanceof Error ? logoError.message : String(logoError),
            stack: logoError instanceof Error ? logoError.stack : undefined,
          }, "[Logo合成] Logo 合成失败，使用原图");
        }
      } else {
        log.info({ projectId: job.projectId }, "[Logo合成] 无 Logo 配置，跳过合成");
      }

      // 优化图片：限制尺寸 + 转换 WebP 格式（解决 OSS 20MB 限制）
      const { buffer: optimizedBytes, contentType: optimizedContentType } = await optimizeImageBuffer(finalImageBytes);

      // 持久化图片到 OSS
      if (!ctx.storage) {
        throw new Error("STORAGE_NOT_INITIALIZED: 对象存储未初始化");
      }
      const digest = createHash("sha256").update(optimizedBytes).digest("hex");
      const key = `media/sha256/${digest.slice(0, 2)}/${digest}.jpg`;
      await ctx.storage.putObject(key, optimizedBytes, optimizedContentType);
      const persistedUrl = await ctx.storage.getSignedUrl(key);

      // 更新模特图状态
      await ctx.repos.modelPhotos.updateFields(input.photoId, { imageUrl: persistedUrl, status: "success" });

      // 完成任务
      await finalizeAsyncJob(params.repos, params.jobId, "completed", {
        photoId: input.photoId,
        poseLabel: input.poseLabel,
      }, null, ctx.clock.now(), params.dispatcher);

      // 检查父任务
      if (job.parentJobId) {
        await checkAndFinalizeParent(params.repos, job.parentJobId, params.dispatcher, ctx.clock.now());
      }
    } catch (error) {
      const rawErrorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ jobId: params.jobId, error: rawErrorMessage }, "图片项目单张模特图生成失败");

      // 转换为用户友好的错误信息
      const userFriendlyMessage = rawErrorMessage.includes("socket hang up")
        ? "网络连接中断，请稍后重试"
        : rawErrorMessage.includes("ETIMEDOUT") || rawErrorMessage.includes("timeout") || rawErrorMessage.includes("超时")
          ? "图片生成超时，请稍后重试"
          : rawErrorMessage.includes("rate_limit") || rawErrorMessage.includes("429")
            ? "服务繁忙，请稍后重试"
            : rawErrorMessage.includes("EMPTY_IMAGE_BYTES")
              ? "生成的图片数据异常"
              : rawErrorMessage.includes("STORAGE_NOT_INITIALIZED")
                ? "存储服务异常，请联系管理员"
                : rawErrorMessage.includes("provider")
                  ? "AI 生成服务暂时不可用"
                  : "图片生成失败，请稍后重试";

      // 解析 photoId
      let photoId: string | undefined;
      let poseLabel: string | undefined;
      try {
        const input = JSON.parse(job.input) as { photoId?: string; poseLabel?: string };
        photoId = input.photoId;
        poseLabel = input.poseLabel;
      } catch (parseErr) {
        logger.warn({ jobId: params.jobId, parseErr: parseErr instanceof Error ? parseErr.message : String(parseErr) }, "解析 job.input 中的 photoId 失败");
      }

      // 失败时自动删除模特图 + 通知用户
      if (photoId) {
        try {
          // 先更新状态为失败（让前端短暂看到失败状态）
          await ctx.repos.modelPhotos.updateFields(photoId, {
            status: "failed",
            errorMessage: userFriendlyMessage,
          });

          // 推送失败通知（告诉用户哪张失败了）
          const { sseManager } = await import("../modules/sse-manager.js");
          sseManager.pushToUser(job.userId, {
            type: "model_photo_failed",
            jobId: params.jobId,
            jobType: "image_step3_single_photo",
            photoId,
            poseLabel: poseLabel ?? "模特图",
            errorMessage: userFriendlyMessage,
            projectId: job.projectId ?? undefined,
            timestamp: ctx.clock.now(),
          });

          // 自动删除失败的模特图（不占位）
          await ctx.repos.modelPhotos.deleteById(photoId);
        } catch (deleteErr) {
          logger.warn({ jobId: params.jobId, photoId, error: deleteErr instanceof Error ? deleteErr.message : String(deleteErr) }, "删除失败模特图失败");
        }
      }

      await finalizeAsyncJob(params.repos, params.jobId, "failed", null, {
        code: "IMAGE_STEP3_SINGLE_FAILED",
        message: `${userFriendlyMessage}${rawErrorMessage ? ` | ${rawErrorMessage}` : ""}`,
      }, ctx.clock.now(), params.dispatcher);

      if (job.parentJobId) {
        await checkAndFinalizeParent(params.repos, job.parentJobId, params.dispatcher, ctx.clock.now());
      }
    }
  };
}

function wrapLlmReverseExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob, finalizeAsyncJob } = await import("../service/async-job-service.js");
    const { getLlmReverseExecutor } = await import("../routes/reverse-square-routes.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    const executor = getLlmReverseExecutor();
    if (!executor) {
      await finalizeAsyncJob(params.repos, params.jobId, "failed", null, {
        code: "EXECUTOR_NOT_READY",
        message: "LLM 反推执行器未初始化",
      }, ctx.clock.now(), params.dispatcher);
      return;
    }

    await executor({
      pool: params.pool,
      jobId: job.id,
      ctx: params.ctx,
      dispatcher: params.dispatcher,
      repos: params.repos,
    });
  };
}

function wrapStep3ReverseRewriteExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob, finalizeAsyncJob, checkAndFinalizeParent } = await import("../service/async-job-service.js");
    const { getReverseRewriteExecutor } = await import("../routes/step3-candidate/index.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    const executor = getReverseRewriteExecutor();
    if (!executor) {
      await finalizeAsyncJob(params.repos, params.jobId, "failed", null, {
        code: "EXECUTOR_NOT_READY",
        message: "反推改写执行器未初始化",
      }, ctx.clock.now(), params.dispatcher);
      return;
    }

    try {
      const input = JSON.parse(job.input) as { projectId: string };
      await executor({
        pool: params.pool,
        jobId: job.id,
        projectId: input.projectId,
        userId: job.userId,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ jobId: params.jobId, error: errorMessage }, "逆向脚本重写任务执行失败");
      await finalizeAsyncJob(params.repos, params.jobId, "failed", null, {
        code: "REVERSE_REWRITE_ERROR",
        message: errorMessage,
      }, ctx.clock.now(), params.dispatcher);

      if (job.parentJobId) {
        await checkAndFinalizeParent(params.repos, job.parentJobId, params.dispatcher, ctx.clock.now());
      }
    }
  };
}

// ========== Step4 Clip Submit/Query Executor Wrapper ==========

function wrapStep4ClipSubmitExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; dispatcher: QueueDispatcher }) => {
    const { executeStep4ClipSubmitJob } = await import("../routes/step4-video/step4-clip-submit-executor.js");
    const { getAsyncJob } = await import("../service/async-job-service.js");
    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;
    await executeStep4ClipSubmitJob(ctx, params.repos, job, params.dispatcher);
  };
}

function wrapStep4ClipQueryExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; dispatcher: QueueDispatcher }) => {
    const { executeStep4ClipQueryJob } = await import("../routes/step4-video/step4-clip-query-executor.js");
    const { getAsyncJob } = await import("../service/async-job-service.js");
    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;
    await executeStep4ClipQueryJob(ctx, params.repos, job, params.dispatcher);
  };
}

// ========== Fission Item Video Submit/Query Executor Wrapper ==========

function wrapFissionItemVideoSubmitExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; dispatcher: QueueDispatcher }) => {
    const { getFissionItemVideoSubmitExecutor, registerFissionItemVideoSubmitExecutor, FissionItemVideoSubmitExecutor } = await import("../modules/fission-video/fission-item-video-submit-executor.js");
    const { getAsyncJob } = await import("../service/async-job-service.js");
    let executor = getFissionItemVideoSubmitExecutor();
    if (!executor) {
      executor = new FissionItemVideoSubmitExecutor(ctx, params.dispatcher);
      registerFissionItemVideoSubmitExecutor(executor);
    }
    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;
    const user = await ctx.repos.users.findById(job.userId);
    if (!user) return;
    const input = JSON.parse(job.input);
    await executor.advanceOnce(user, input.projectId, params.jobId);
  };
}

function wrapFissionItemVideoQueryExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; dispatcher: QueueDispatcher }) => {
    const { getFissionItemVideoQueryExecutor, registerFissionItemVideoQueryExecutor, FissionItemVideoQueryExecutor } = await import("../modules/fission-video/fission-item-video-query-executor.js");
    const { getAsyncJob } = await import("../service/async-job-service.js");
    let executor = getFissionItemVideoQueryExecutor();
    if (!executor) {
      executor = new FissionItemVideoQueryExecutor(ctx, params.dispatcher);
      registerFissionItemVideoQueryExecutor(executor);
    }
    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;
    const user = await ctx.repos.users.findById(job.userId);
    if (!user) return;
    const input = JSON.parse(job.input);
    await executor.advanceOnce(user, input.projectId, params.jobId);
  };
}

// ========== Action Transfer Executor Wrapper ==========

function wrapActionTransferExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob: getJob } = await import("../service/async-job-service.js");
    const { executeActionTransferJob } = await import("../modules/action-transfer/orchestrator.js");

    const job = await getJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    await executeActionTransferJob(ctx, params.repos, job, params.dispatcher);
  };
}

// ========== Long Image Submit/Query Executor Wrapper（万相营造长图）==========

function wrapLongImageSubmitExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; dispatcher: QueueDispatcher }) => {
    const { executeLongImageSubmitJob } = await import("../routes/image-project/step4-long-image-submit-executor.js");
    const { getAsyncJob } = await import("../service/async-job-service.js");
    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;
    await executeLongImageSubmitJob(ctx, params.repos, job, params.dispatcher);
  };
}

function wrapLongImageQueryExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; dispatcher: QueueDispatcher }) => {
    const { executeLongImageQueryJob } = await import("../routes/image-project/step4-long-image-query-executor.js");
    const { getAsyncJob } = await import("../service/async-job-service.js");
    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;
    await executeLongImageQueryJob(ctx, params.repos, job, params.dispatcher);
  };
}

// ============================================================================
// 多人模特图执行器链（图片项目 Step3 多人模式）
// ============================================================================

/**
 * 多人模特图主任务执行器
 * 任务类型: image_step3_multi_person
 * 编排：主任务 → image_step3_multi_person_plan（规划）→ image_step3_single_photo × N
 */
function wrapImageStep3MultiPersonExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob, updateAsyncJobStage, createAsyncJob, finalizeAsyncJob, checkAndFinalizeParent } = await import("../service/async-job-service.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    const now = ctx.clock.now();

    try {
      const input = JSON.parse(job.input) as { projectId: string };
      const projectId = job.projectId ?? input.projectId;

      await updateAsyncJobStage(params.repos, params.jobId, "创建多人规划任务", now);

      const planJobId = `image-step3-mpp-${now}-${Math.random().toString(36).slice(2, 8)}`;
      await createAsyncJob(params.repos, {
        id: planJobId,
        userId: job.userId,
        jobType: "image_step3_multi_person_plan",
        projectId,
        input: JSON.stringify({ ...JSON.parse(job.input), parentJobId: params.jobId }),
        now: ctx.clock.now(),
        parentJobId: params.jobId,
        initialStatus: "pending",
      }, ctx.globalTaskConcurrencyService);

      await updateAsyncJobStage(params.repos, params.jobId, "等待多人规划完成", ctx.clock.now());

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ jobId: params.jobId, error: errorMessage }, "图片项目多人模特图主任务执行失败");
      await finalizeAsyncJob(params.repos, params.jobId, "failed", null, {
        code: "IMAGE_STEP3_MULTI_PERSON_MAIN_FAILED",
        message: errorMessage,
      }, ctx.clock.now(), params.dispatcher);

      if (job.parentJobId) {
        await checkAndFinalizeParent(params.repos, job.parentJobId, params.dispatcher, ctx.clock.now());
      }
    }
  };
}

/**
 * 多人模特图规划子任务执行器
 * 任务类型: image_step3_multi_person_plan
 * 流程：skill 规划 → 解析 JSON → 创建 N 个 image_step3_single_photo 子任务
 */
function wrapImageStep3MultiPersonPlanExecutor(ctx: AppContext): ExecutorFn {
  return async (params: { pool: Pool; repos: import("../repositories/pg/index.js").PgRepositoryCollection; jobId: string; ctx: AppContext; dispatcher: QueueDispatcher }) => {
    const { getAsyncJob, updateAsyncJobStage, createAsyncJob, finalizeAsyncJob, checkAndFinalizeParent } = await import("../service/async-job-service.js");
    const { resolveRouteProviderWithFallback } = await import("../services/llm/provider-resolver.js");
    const { ProviderRouteKeys } = await import("../contracts/provider-route-keys.js");
    const { requestLlmPlainText } = await import("../services/llm/llm-transport.js");
    const { extractJsonObject } = await import("../services/utils/json-utils.js");
    const { SkillLoader } = await import("../services/skills/skill-loader.js");

    const job = await getAsyncJob(params.repos, params.jobId, () => ctx.clock.now());
    if (!job || job.status !== "running") return;

    const now = ctx.clock.now();

    try {
      const input = JSON.parse(job.input) as {
        projectId: string;
        characters: Array<{
          characterId: string;
          gender: string;
          age?: string;
          description: string;
          assignedVariantAssetId?: string;
          assignedColor?: string;
          referenceImageUrl?: string;
        }>;
        garmentVariants: Array<{ assetId: string; colorName: string; description: string }>;
        outfitPlan?: { title?: string; styleName?: string; analysis?: string; optimizedPrompt?: string };
        outfitSummary?: string;
        garments?: Array<{ description?: string }>;
        referenceImages?: string[];
        parentJobId?: string;
        photoCount?: number;
        backgroundStyle?: "solid" | "scene" | "balanced";
      };

      const projectId = job.projectId ?? input.projectId;
      const parentJobId = input.parentJobId ?? job.parentJobId;

      await updateAsyncJobStage(params.repos, params.jobId, "多人规划中", now);

      // 调用 skill 生成多人规划
      const promptVariables = {
        characters: input.characters.map(c => ({
          characterId: c.characterId,
          gender: c.gender,
          age: c.age ?? "",
          description: c.description,
          assignedVariantAssetId: c.assignedVariantAssetId ?? "",
          assignedColor: c.assignedColor ?? "",
        })),
        garmentVariants: input.garmentVariants,
        outfitTitle: input.outfitPlan?.title ?? "",
        styleName: input.outfitPlan?.styleName ?? "",
        analysis: input.outfitPlan?.analysis ?? input.outfitSummary ?? "",
        targetPhotoCount: input.photoCount ?? 6,
        backgroundStyle: input.backgroundStyle ?? "balanced",
      };

      const skillLoader = new SkillLoader();
      const { system: systemPrompt, user: renderedUserPrompt } = await skillLoader.render(
        "image_project_step3_multi_person_plan",
        promptVariables,
      );

      const ROUTE_KEY = ProviderRouteKeys.IMAGE_PROJECT_STEP3_MULTI_PERSON_PLAN;
      const llmProvider = await resolveRouteProviderWithFallback(ctx, [ROUTE_KEY]);
      if (!llmProvider) {
        throw new Error(`${ROUTE_KEY} provider is not configured`);
      }

      const llmText = await requestLlmPlainText(llmProvider.provider, systemPrompt, renderedUserPrompt, 0.3, {
        ctx,
        routeKey: ROUTE_KEY,
        userId: job.userId,
        businessContext: `图片项目 Step3 多人模特图规划`,
        projectId,
      });

      const planJson = extractJsonObject(llmText);
      if (!planJson || !Array.isArray(planJson.photos)) {
        throw new Error("AI 返回的多人规划方案格式不正确");
      }

      // 解析多人规划项
      interface MultiPersonPlanCharacterPose {
        characterId: string;
        variantAssetId: string;
        colorName: string;
        posePrompt: string;
        position: string;
      }
      interface MultiPersonPlanItem {
        poseLabel: string;
        bgLabel: string;
        interactionType: string;
        characterPoses: MultiPersonPlanCharacterPose[];
        bgPrompt: string;
      }

      const isValidMultiPlanItem = (item: unknown): item is MultiPersonPlanItem => {
        if (!item || typeof item !== "object") return false;
        const obj = item as Record<string, unknown>;
        return typeof obj.poseLabel === "string" && typeof obj.bgLabel === "string" && Array.isArray(obj.characterPoses) && obj.characterPoses.length > 0;
      };

      const planItems = (planJson.photos as unknown[]).filter(isValidMultiPlanItem);
      if (planItems.length === 0) {
        throw new Error("AI 返回的多人规划方案中没有有效的条目");
      }

      // 校验主角色颜色锁定：主角色必须在所有照片中使用第一个变体
      const mainCharacterId = input.characters[0]?.characterId;
      const mainVariantAssetId = input.characters[0]?.assignedVariantAssetId;
      if (mainCharacterId && mainVariantAssetId) {
        for (const item of planItems) {
          for (const cp of item.characterPoses) {
            if (cp.characterId === mainCharacterId && cp.variantAssetId && cp.variantAssetId !== mainVariantAssetId) {
              cp.variantAssetId = mainVariantAssetId;
            }
          }
        }
      }

      const maxCount = input.photoCount ?? 6;
      const clampedPlan = planItems.slice(0, maxCount);

      // 创建 photos 占位
      const minOrder = await ctx.repos.modelPhotos.findMinSortOrder(projectId);

      const photos = clampedPlan.map((item, index) => {
        const colorAssignments: Record<string, string> = {};
        const planCharacterIds: string[] = [];
        for (const cp of item.characterPoses) {
          if (cp.characterId && cp.variantAssetId) {
            colorAssignments[cp.characterId] = cp.variantAssetId;
          }
          if (cp.characterId) {
            planCharacterIds.push(cp.characterId);
          }
        }
        return {
          id: `mp-mp-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          projectId,
          imageUrl: null,
          poseLabel: item.poseLabel,
          bgLabel: item.bgLabel,
          isSelected: false,
          status: "generating" as const,
          errorMessage: null,
          order: minOrder - index - 1,
          characterIds: planCharacterIds.length > 0 ? planCharacterIds : undefined,
          colorAssignments: Object.keys(colorAssignments).length > 0 ? colorAssignments : undefined,
          createdAt: now,
          updatedAt: now,
        };
      });

      await ctx.repos.modelPhotos.bulkCreate(photos);
      await updateAsyncJobStage(params.repos, params.jobId, "创建多人照片占位", ctx.clock.now());

      // 为每张 photo 创建图片生成子任务
      await updateAsyncJobStage(params.repos, params.jobId, "创建多人生成任务", ctx.clock.now());
      const garmentDescriptions = input.garments?.map((g) => g.description).filter((d): d is string => !!d) ?? [];

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const planItem = clampedPlan[i];
        const allPosePrompts = planItem.characterPoses.map(cp => cp.posePrompt).filter(Boolean).join(" ");
        const photoJobId = `image-step3-mpsp-${now}-${i}-${Math.random().toString(36).slice(2, 8)}`;

        await createAsyncJob(params.repos, {
          id: photoJobId,
          userId: job.userId,
          jobType: "image_step3_single_photo",
          projectId,
          input: JSON.stringify({
            photoId: photo.id,
            poseLabel: photo.poseLabel,
            bgLabel: photo.bgLabel,
            posePrompt: allPosePrompts || planItem.poseLabel,
            bgPrompt: planItem.bgPrompt ?? planItem.bgLabel,
            garmentDescriptions,
            referenceImages: input.referenceImages ?? [],
            outfitAnalysis: input.outfitPlan?.analysis ?? input.outfitSummary ?? undefined,
            characterDescription: input.characters.map(c => c.description).join("；"),
            characterIds: photo.characterIds,
            colorAssignments: photo.colorAssignments,
          }),
          now: ctx.clock.now(),
          parentJobId: parentJobId ?? undefined,
          dependsOn: [params.jobId],
          initialStatus: "pending",
        }, ctx.globalTaskConcurrencyService);
      }

      await finalizeAsyncJob(params.repos, params.jobId, "completed", {
        planCount: clampedPlan.length,
        photoIds: photos.map((p) => p.id),
      }, null, ctx.clock.now(), params.dispatcher);

      if (parentJobId) {
        await checkAndFinalizeParent(params.repos, parentJobId, params.dispatcher, ctx.clock.now());
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ jobId: params.jobId, error: errorMessage }, "多人模特图规划子任务执行失败");
      await finalizeAsyncJob(params.repos, params.jobId, "failed", null, {
        code: "IMAGE_STEP3_MULTI_PERSON_PLAN_FAILED",
        message: errorMessage,
      }, ctx.clock.now(), params.dispatcher);

      if (job.parentJobId) {
        await checkAndFinalizeParent(params.repos, job.parentJobId, params.dispatcher, ctx.clock.now());
      }
    }
  };
}