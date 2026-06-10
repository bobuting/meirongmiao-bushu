/**
 * executor-handlers.ts
 * Outfit change 子任务执行器处理函数
 *
 * 执行逻辑（video-edit 模式）：
 * 1. understand: Stage1 → 预创建 N 个 segmentVideos 记录 → 创建 N 个 video-edit adapt 子任务
 * 2. adapt_video_edit: 分割视频 + 生成参考图 → UPDATE segmentVideo 记录 → 检查是否全部完成 → 创建 gen_video_edit 子任务
 * 3. gen_video_edit: Omni-Video 编辑 → UPDATE segmentVideo 记录 → 检查是否全部完成 → 触发合并
 */

import type { AppContext } from "../../../core/app-context.js";
import type { PgRepositoryCollection } from "../../../repositories/pg/index.js";
import type { AsyncJobRecord } from "../../../service/async-job-service.js";
import type { Stage1Input } from "./stage1-video-understand.js";
import type { QueueDispatcher } from "../../../modules/queue-dispatcher.js";
import type { Stage3VideoEditInput } from "./stage3-video-edit-generation.js";
import type { ActionSegment } from "../../../contracts/outfit-change-contract.js";
import { executeStage1 } from "./index.js";
import { submitOmniVideoEdit, queryOmniVideoEditStatus, finalizeVideoEditAudit } from "./stage3-video-edit-generation.js";
import { clampSegmentDuration } from "./stage2-video-edit-adapt.js";
import { updateAsyncJobStage, createAsyncJob, finalizeAsyncJob, checkAndFinalizeParent } from "../../../service/async-job-service.js";
import { resolveRouteProvider } from "../../../services/llm/provider-resolver.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { requestLlmImageGenerationUrl } from "../../../services/media/image-generation-providers.js";
import { splitVideoBySegments, getVideoDuration, getVideoResolution, extractVideoKeyframes } from "../../../utils/video-split.js";
import { AppError } from "../../../core/errors.js";
import { getLogger } from "../../../core/logger/index.js";
import { extractFrameAtTime } from "../../../utils/video-frame-extract.js";
import { getOssService, type OssUploadResult } from "../../../service/oss/oss-service.js";
import { join } from "node:path";
import { SkillLoader } from "../../../services/skills/skill-loader.js";
import { findActionTemplateById } from "../../../repositories/pg/action-templates-pg-repository.js";
import {
  createAnimateAnyoneVideoTask,
  queryAnimateAnyoneVideoTask,
} from "../../../service/llm/llm-animate-anyone.js";
import type { ResolvedRouteProvider } from "../../../services/llm/provider-resolver.js";

const log = getLogger("outfit-change-executor-handlers");

// ============================================================================
// 辅助函数：构建详细服装信息描述（确保一致性）
// ============================================================================

/** 构建服装信息描述（参考角色五视图生成服务） */
function buildOutfitInfo(garment: {
  name: string;
  description?: string;
  category?: string;
  color?: string;
  material?: string;
}): string {
  const parts: string[] = [];

  // 服装名称
  parts.push(`服装名称: ${garment.name}`);

  // 分类（上装/下装/鞋子/配饰）
  if (garment.category) {
    const categoryLabels: Record<string, string> = {
      top: "上装",
      bottom: "下装",
      shoes: "鞋子",
      accessory: "配饰",
    };
    const label = categoryLabels[garment.category] || garment.category;
    parts.push(`分类: ${label}`);
  }

  // 颜色（关键一致性信息）
  if (garment.color) {
    parts.push(`颜色: ${garment.color}`);
  }

  // 材质（关键一致性信息）
  if (garment.material) {
    parts.push(`材质: ${garment.material}`);
  }

  // 详细描述
  if (garment.description) {
    parts.push(`详细描述: ${garment.description}`);
  }

  return parts.join("\n");
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 将远程媒体 URL 下载并持久化到 OSS
 * LLM 服务商（参考图）和 Kling（编辑视频）返回的 URL 是临时链接，必须转存到自己的 OSS
 *
 * @param timeoutMs 下载超时时间（毫秒），默认 120000（2分钟）
 */
async function persistMediaToOss(
  storage: import("../../../contracts/object-storage.js").IObjectStorageAdapter,
  remoteUrl: string,
  ossKey: string,
  contentType: string,
  timeoutMs: number = 120000,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(remoteUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new AppError(
        502,
        "MEDIA_DOWNLOAD_FAILED",
        `下载媒体失败: HTTP ${response.status} ${remoteUrl.slice(0, 100)}`,
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const ossService = getOssService(storage);
    const uploadResult: OssUploadResult = await ossService.upload(ossKey, buffer, contentType);
    if (!uploadResult.success) {
      throw new AppError(502, "OSS_UPLOAD_FAILED", `媒体上传 OSS 失败: ${uploadResult.message}`);
    }
    return uploadResult.url;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// 辅助函数：无角色时从源视频提取首帧作为角色参考图
// ============================================================================

async function extractCharacterFrameFromVideo(
  ctx: AppContext,
  sourceVideoUrl: string,
  projectId: string
): Promise<string> {
  log.info({ projectId }, "未选择角色，从源视频提取首帧作为角色参考图");

  const frame = await extractFrameAtTime(sourceVideoUrl, 0, "jpg");
  if (!ctx.storage) throw new Error("对象存储未初始化");
  const ossService = getOssService(ctx.storage);
  const ossKey = `outfit-change/${projectId}/character-frame-${Date.now()}.jpg`;
  const uploadResult = await ossService.upload(ossKey, frame.frameBytes, frame.mimeType);

  log.info({ projectId, url: uploadResult.url }, "源视频首帧提取并上传完成");
  return uploadResult.url;
}

/**
 * 获取角色图片 URL
 * - 有 characterId：从角色库获取
 * - 无 characterId：提取源视频首帧
 */
async function resolveCharacterImageUrl(
  ctx: AppContext,
  repos: PgRepositoryCollection,
  taskRecord: { input: { characterId?: string; characterType?: string; sourceVideoUrl?: string; projectId: string }; builtinTemplateId?: string | null }
): Promise<string> {
  if (taskRecord.input.characterId && taskRecord.input.characterType === "library") {
    const character = await ctx.repos.libraryCharacters.findById(taskRecord.input.characterId);
    if (!character) {
      throw new Error(`Character not found: ${taskRecord.input.characterId}`);
    }
    return character.thumbnailUrl;
  }

  // 模板模式：使用模板缩略图作为角色参考
  if (taskRecord.builtinTemplateId) {
    const template = await findActionTemplateById(ctx.pool, taskRecord.builtinTemplateId);
    if (template?.thumbnailUrl) {
      return template.thumbnailUrl;
    }
    // 模板没有缩略图，使用占位符
    return "placeholder://template/no-thumbnail";
  }

  // 视频模式：无角色库角色，提取源视频首帧
  const sourceVideoUrl = taskRecord.input.sourceVideoUrl;
  if (!sourceVideoUrl) {
    throw new Error("视频模式下必须有 sourceVideoUrl");
  }
  return extractCharacterFrameFromVideo(ctx, sourceVideoUrl, taskRecord.input.projectId);
}

// ============================================================================
// 关键点提取：从 Stage 1 骨架数据取分段起始帧的关键点
// ============================================================================

/** 视频生成/编辑完成后：检查所有分镜完成 → 设置 ready_for_merge 状态
 * 前端检测到 ready_for_merge 后手动触发合并（WebCodecos）
 * Submit-Query 嵌套模式：不直接 finalize 任何 async job
 * 父任务的 finalize 由 checkAndFinalizeParent 级联自动完成
 */
async function handleGenComplete(
  ctx: AppContext,
  repos: PgRepositoryCollection,
  taskRecord: NonNullable<Awaited<ReturnType<typeof ctx.repos.outfitChangeProjects.findById>>>,
  stage1Result: NonNullable<typeof taskRecord.stage1Result>,
  taskId: string,
  now: number,
): Promise<void> {
  const totalSegments = stage1Result.actionSegments.length;
  const completedGens = await ctx.repos.segmentVideos.countCompletedByTaskId(taskId);

  if (completedGens < totalSegments) {
    return;
  }

  log.info({ taskId, completedGens, totalSegments }, "所有 gen 完成，设置 ready_for_merge 状态");

  const generateResults = await ctx.repos.segmentVideos.findByTaskId(taskId);
  generateResults.sort((a, b) => a.segmentIndex - b.segmentIndex);

  // 不自动合并，只更新状态为 ready_for_merge
  await ctx.repos.outfitChangeProjects.updateStatus(taskId, "ready_for_merge");

  // 更新项目状态为 FILMING（等待前端合并）
  const projectId = taskRecord.input.projectId;
  if (projectId) {
    await ctx.repos.projects.updateStatus(projectId, "FILMING");
    log.info({ projectId, taskId }, "同步更新 nrm_projects 状态为 FILMING（等待前端合并）");
  }

  // 更新 outfit_change 父任务的 result（前端通过任务队列获取）
  // 提供所有分镜视频 URL，供前端 WebCodecos 合并
  const videoEditFrames = generateResults.map((r) => ({
    segmentIndex: r.segmentIndex,
    sourceVideoUrl: r.sourceVideoUrl,
    sourceVideoThumbnails: r.sourceVideoThumbnails || [],
    referenceImageUrl: r.referenceImageUrl,
    editedVideoUrl: r.videoUrl,
  }));

  const totalDuration = generateResults.reduce((sum, r) => sum + (r.duration || 0), 0);

  await ctx.repos.asyncJobs.updateResultByTaskId(
    taskId,
    JSON.stringify({
      videoEditFrames,
      totalDuration: Math.round(totalDuration),
      readyForMerge: true,  // 标记：等待前端合并
    }),
    now,
    "outfit_change",
  );
  log.info({ taskId, frameCount: videoEditFrames.length }, "更新 outfit_change 任务 result（ready_for_merge）");
}

/**
 * 执行 outfit_change_understand 任务
 * Stage 0: 参考图采集
 * Stage 1: 视频理解（视频模式）或直接使用模板动作（模板模式）
 * 完成后创建 N 个 adapt 子任务
 */
export async function executeOutfitUnderstandJob(
  ctx: AppContext,
  repos: PgRepositoryCollection,
  job: AsyncJobRecord,
  dispatcher: QueueDispatcher
): Promise<void> {
  const input = JSON.parse(job.input) as { taskId: string };
  const taskId = input.taskId;
  const now = ctx.clock.now();

  const repository = ctx.repos.outfitChangeProjects;

  try {
    const taskRecord = await repository.findById(taskId);
    if (!taskRecord) {
      throw new Error(`Task not found: ${taskId}`);
    }

    await updateAsyncJobStage(repos, job.id, "understanding", now);
    await repository.updateStatus(taskId, "understanding");

    // 判断模式：视频模式 vs 模板模式
    const builtinTemplateId = taskRecord.builtinTemplateId;
    const isTemplateMode = !!builtinTemplateId;
    const sourceVideoUrl = taskRecord.sourceVideoUrl;

    let actionSegments: ActionSegment[];

    if (isTemplateMode) {
      // 模板模式：从模板获取动作数据
      log.info({ taskId, builtinTemplateId }, "模板模式：使用内置模板动作");

      const template = await findActionTemplateById(ctx.pool, builtinTemplateId!);
      if (!template) {
        throw new Error(`Template not found: ${builtinTemplateId}`);
      }

      // 模板生成单个动作片段（覆盖整个模板时长）
      actionSegments = [{
        startTime: 0,
        endTime: template.durationSec,
        description: template.description || template.name,
        actionType: template.category,
        keyframes: [],  // 模板模式不需要关键帧分析
      }];

      // 存储 stage1 结果（模板信息）
      await repository.updateStageResult(taskId, "stage1", {
        poseSequence: [],  // 模板模式不需要姿态序列
        actionSegments,
        duration: template.durationSec,
        fps: 30,  // 默认帧率
        templateInfo: {
          id: template.id,
          name: template.name,
          category: template.category,
          aliTemplateId: template.aliTemplateId,
          durationSec: template.durationSec,
        },
      });

      log.info({ taskId, templateId: builtinTemplateId, actionSegmentCount: 1 }, "模板模式：动作数据已获取");
    } else {
      // 视频模式：执行 Stage1 视频理解
      if (!sourceVideoUrl) {
        throw new Error("视频模式下必须有 sourceVideoUrl");
      }

      const stage1Input: Stage1Input = {
        sourceVideoUrl,
        projectId: taskRecord.input.projectId,
        userId: taskRecord.input.userId,
      };

      const stage1Output = await executeStage1(ctx, stage1Input);
      await repository.updateStageResult(taskId, "stage1", stage1Output.result);
      actionSegments = stage1Output.result.actionSegments;

      log.info({ taskId, jobId: job.id, actionSegmentCount: actionSegments.length }, "视频模式：Stage 1 视频理解完成");
    }

    const segmentCount = actionSegments.length;

    // 完成 understand 任务
    await finalizeAsyncJob(repos, job.id, "completed", { actionSegmentCount: segmentCount, isTemplateMode }, null, now, dispatcher);

    // 预创建 N 个 segmentVideos 记录
    await ctx.repos.segmentVideos.batchCreate(taskId, segmentCount);
    log.info({ taskId, segmentCount }, "预创建 segmentVideos 记录");

    // 创建 N 个 video-edit adapt 子任务
    log.info({ taskId, parentJobId: job.parentJobId, segmentCount, isTemplateMode }, "创建 video-edit adapt 子任务");

    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
      await createAsyncJob(repos, {
        userId: job.userId,
        jobType: "outfit_change_adapt_video_edit",
        input: JSON.stringify({ taskId, segmentIndex, isTemplateMode }),
        now: ctx.clock.now(),
        projectId: job.projectId ?? undefined,
        parentJobId: job.parentJobId ?? undefined,
        initialStatus: "pending",
      }, ctx.globalTaskConcurrencyService);
    }

    // 检查父任务状态
    if (job.parentJobId) {
      await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, now);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ taskId, jobId: job.id, error: errorMessage }, "Understand 任务失败");
    await repository.updateStatus(taskId, "failed");
    await finalizeAsyncJob(repos, job.id, "failed", null, {
      code: "OUTFIT_UNDERSTAND_ERROR",
      message: errorMessage,
    }, ctx.clock.now(), dispatcher);

    // 【修复】失败时检查父任务是否需要自动完成
    if (job.parentJobId) {
      await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, ctx.clock.now());
    }
  }
}


/** 查询任务超时时间（10 分钟） */
const QUERY_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * 执行 outfit_change_adapt_video_edit 任务（video-edit 模式）
 *
 * 流程拆分（让前端能尽早看到切片视频）：
 * 1. 视频模式：切片 → 立即存储切片视频 URL
 * 2. 模板模式：跳过切片，使用模板预览视频
 * 3. 参考图生成 → 再次存储参考图 URL
 * 4. 检查是否所有 adapt 完成 → 创建 gen_video_edit 子任务
 */
export async function executeOutfitAdaptVideoEditJob(
  ctx: AppContext,
  repos: PgRepositoryCollection,
  job: AsyncJobRecord,
  dispatcher: QueueDispatcher
): Promise<void> {
  const input = JSON.parse(job.input) as { taskId: string; segmentIndex: number; isTemplateMode?: boolean };
  const taskId = input.taskId;
  const segmentIndex = input.segmentIndex;
  const isTemplateMode = input.isTemplateMode ?? false;
  const now = ctx.clock.now();
  const segmentLabel = `分镜${segmentIndex + 1}`;

  const repository = ctx.repos.outfitChangeProjects;

  try {
    await updateAsyncJobStage(repos, job.id, "splitting", now);

    const taskRecord = await repository.findById(taskId);
    if (!taskRecord) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // 从 stage1 结果获取 actionSegments
    const stage1Result = taskRecord.stage1Result;
    if (!stage1Result) {
      throw new Error(`Stage1 result not found for task: ${taskId}`);
    }

    const actionSegment = stage1Result.actionSegments[segmentIndex];
    if (!actionSegment) {
      throw new Error(`Action segment not found at index ${segmentIndex}`);
    }

    // 验证对象存储配置
    if (!ctx.storage) {
      throw new AppError(502, "STORAGE_NOT_CONFIGURED", "对象存储未配置，无法执行视频处理");
    }

    let segmentVideoUrl: string;
    let thumbnails: Array<{ url: string; timeMs: number }> = [];

    if (isTemplateMode) {
      // 模板模式：不需要切片，使用模板的预览视频作为 segment 视频
      log.info({ taskId, segmentIndex }, "模板模式：跳过视频切片");

      // 获取模板信息
      const templateInfo = stage1Result.templateInfo;
      if (!templateInfo) {
        throw new Error("模板模式下缺少 templateInfo");
      }

      // 模板只有一个 segment，使用模板预览视频 URL（如果有）
      const template = await findActionTemplateById(ctx.pool, taskRecord.builtinTemplateId!);
      if (template?.previewVideoUrl) {
        segmentVideoUrl = template.previewVideoUrl;
      } else {
        // 如果没有预览视频，设置一个占位符 URL（后续生成时会替换）
        segmentVideoUrl = `template://placeholder/${templateInfo.id}`;
      }

      log.info({ segmentIndex, segmentVideoUrl: segmentVideoUrl.slice(0, 100) }, `${segmentLabel}: 模板模式 - 使用预览视频`);
    } else {
      // 视频模式：切片
      const sourceVideoUrl = taskRecord.sourceVideoUrl;
      if (!sourceVideoUrl) {
        throw new Error("视频模式下必须有 sourceVideoUrl");
      }

      // ===== Step 1: 钳位时长并切片 =====
      const rawDuration = actionSegment.endTime - actionSegment.startTime;
      const clamped = clampSegmentDuration(rawDuration);
      const adjustedSegment: ActionSegment = {
        ...actionSegment,
        endTime: actionSegment.startTime + clamped,
      };

      if (clamped !== rawDuration) {
        log.info(
          { segmentIndex, rawDuration, clampedDuration: clamped },
          `${segmentLabel}: 时长钳位 ${rawDuration}s → ${clamped}s`
        );
      }

      log.info({ segmentIndex, startTime: adjustedSegment.startTime, duration: clamped }, `${segmentLabel}: 视频切片`);

      const splitLogger = {
        info: (obj: unknown, msg: string) => log.info(obj as Record<string, unknown>, msg),
        warn: (obj: unknown, msg: string) => log.warn(obj as Record<string, unknown>, msg),
        error: (obj: unknown, msg: string) => log.error(obj as Record<string, unknown>, msg),
      };

      // 切片视频（分辨率自动缩放到 700-2160px）
      const splitResult = await splitVideoBySegments(
        ctx.storage,
        sourceVideoUrl,
        [adjustedSegment],
        taskRecord.input.projectId,
        splitLogger,
        segmentIndex,
        2160,  // maxDimension - Kling Omni-Video 最大边长限制
        700    // minWidth - Kling Omni-Video 最小宽度限制
      );

      segmentVideoUrl = splitResult.segmentUrls[0];
      if (!segmentVideoUrl) {
        throw new AppError(502, "SEGMENT_SPLIT_FAILED", `${segmentLabel}切片失败`);
      }

      log.info({ segmentIndex, segmentVideoUrl: segmentVideoUrl.slice(0, 100) }, `${segmentLabel}: 切片完成`);

      // ===== Step 2: 提取关键帧截图并存储（前端可显示持久化截图） =====
      try {
        const splitLogger = {
          info: (obj: unknown, msg: string) => log.info(obj as Record<string, unknown>, msg),
          warn: (obj: unknown, msg: string) => log.warn(obj as Record<string, unknown>, msg),
          error: (obj: unknown, msg: string) => log.error(obj as Record<string, unknown>, msg),
        };

        const keyframeResult = await extractVideoKeyframes(
          ctx.storage,
          segmentVideoUrl,
          taskRecord.input.projectId,
          segmentIndex,
          3, // 提取 3 张关键帧：开头、中间、结尾
          splitLogger
        );
        thumbnails = keyframeResult.thumbnails;
      } catch (thumbError) {
        const errorMsg = thumbError instanceof Error ? thumbError.message : String(thumbError);
        log.warn({ segmentIndex, error: errorMsg }, `${segmentLabel}: 关键帧提取失败，继续执行`);
        // thumbnails 保持为空数组，前端 fallback 到 OSS 实时截图
      }
    }

    const videoId = `sv_${taskId}_${segmentIndex}`;
    await ctx.repos.segmentVideos.updateSourceVideoWithThumbnails(
      videoId,
      segmentVideoUrl,
      thumbnails
    );

    // 更新任务阶段为"生成参考图"
    await updateAsyncJobStage(repos, job.id, "generating_reference", ctx.clock.now());

    // ===== Step 3: 获取服装和角色图片，生成参考图 =====
    const garment = await ctx.repos.garmentAssets.findById(taskRecord.input.targetOutfitId);
    if (!garment) {
      throw new Error(`Garment not found: ${taskRecord.input.targetOutfitId}`);
    }
    // 优先使用平铺图（flatLayImageUrl）作为服装参考，确保视觉一致性
    // 平铺图展示服装完整细节（颜色、纹理、款式），比主图更适合作为换装参考
    const garmentFlatLayUrl = garment.flatLayImageUrl;
    const garmentMainImageUrl = garment.mainImageUrl;
    const garmentName = garment.name || "目标服装";
    const garmentDescription = garment.description || "";
    const garmentCategory = garment.category || "";
    const garmentMainColor = garment.mainColor || "";
    const garmentMaterial = garment.material || "";

    // 构建详细服装信息描述（参考角色五视图生成服务的 outfitInfo）
    const outfitInfo = buildOutfitInfo({
      name: garmentName,
      description: garmentDescription,
      category: garmentCategory,
      color: garmentMainColor,
      material: garmentMaterial,
    });

    const characterImageUrl = await resolveCharacterImageUrl(ctx, repos, taskRecord);

    const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.OUTFIT_CHANGE_IMAGE_GENERATION);
    if (!provider) {
      throw new AppError(502, "ADAPT_SEGMENT_NO_PROVIDER", "未配置换装图像生成 Provider");
    }

    // 使用 Skill 系统加载参考图生成提示词（确保服装一致性）
    const skillLoader = new SkillLoader();
    const skill = await skillLoader.load("outfit_change_reference_image");
    const { user } = await skill.render({
      garmentName,
      garmentDescription: outfitInfo,
      segmentIndex,
      actionType: actionSegment.actionType,
    });

    // 构建参考图数组：平铺图优先，确保服装细节一致
    // 顺序：1. 服装平铺图（主要） 2. 角色图（辅助）
    const referenceImages: string[] = [];
    if (garmentFlatLayUrl) {
      referenceImages.push(garmentFlatLayUrl);
    }
    if (characterImageUrl && !referenceImages.includes(characterImageUrl)) {
      referenceImages.push(characterImageUrl);
    }
    // 如果没有平铺图，回退到主图
    if (referenceImages.length === 0 && garmentMainImageUrl) {
      referenceImages.push(garmentMainImageUrl);
    }

    log.info(
      { segmentIndex, referenceCount: referenceImages.length, hasFlatLay: Boolean(garmentFlatLayUrl) },
      `${segmentLabel}: 参考图准备完成`
    );

    const refGenResult = await requestLlmImageGenerationUrl(provider, user, {
      mode: "image_to_image",
      images: referenceImages,
      ratio: "9:16",
      debugOptions: {
        ctx,
        routeKey: ProviderRouteKeys.OUTFIT_CHANGE_IMAGE_GENERATION,
        businessContext: `换装视频编辑 - ${segmentLabel}参考图`,
        userId: taskRecord.input.userId,
        projectId: taskRecord.input.projectId,
      },
    });

    const rawReferenceImageUrl = refGenResult.url;
    if (!rawReferenceImageUrl) {
      throw new AppError(502, "REFERENCE_IMAGE_FAILED", `${segmentLabel}参考图生成失败`);
    }

    // 持久化参考图到 OSS（LLM 服务商返回的 URL 是临时链接）
    const refOssKey = join("outfit-change", taskRecord.input.projectId, "reference", `segment_${segmentIndex}_ref.png`);
    const referenceImageUrl = await persistMediaToOss(ctx.storage!, rawReferenceImageUrl, refOssKey, "image/png");
    log.info({ segmentIndex, ossUrl: referenceImageUrl.slice(0, 100) }, `${segmentLabel}: 参考图已持久化到 OSS`);

    // ===== Step 4: 存储参考图 URL =====
    await ctx.repos.segmentVideos.updateReferenceImage(videoId, referenceImageUrl);

    log.info(
      { taskId, jobId: job.id, segmentIndex, segmentVideoUrl: segmentVideoUrl.slice(0, 100), referenceImageUrl: referenceImageUrl.slice(0, 100) },
      `${segmentLabel}: Video-edit adapt 完成`
    );

    // 完成当前任务
    await finalizeAsyncJob(repos, job.id, "completed", {
      segmentIndex,
      segmentVideoUrl,
      sourceVideoThumbnails: thumbnails,
      referenceImageUrl,
    }, null, ctx.clock.now(), dispatcher);

    // 使用原子计数检查是否所有 adapt 完成
    const totalSegments = stage1Result.actionSegments.length;
    const completedAdapts = await ctx.repos.segmentVideos.countSourceReadyByTaskId(taskId);

    if (completedAdapts >= totalSegments) {
      log.info({ taskId, parentJobId: job.parentJobId, completedAdapts, totalSegments }, "所有 video-edit adapt 完成，创建 gen_video_edit 子任务");

      // 获取完整的 adapt 结果用于创建 gen 任务
      const adaptResults = await ctx.repos.segmentVideos.findByTaskId(taskId);
      adaptResults.sort((a, b) => a.segmentIndex - b.segmentIndex);

      // 创建 N 个 gen_video_edit 子任务
      for (const r of adaptResults) {
        await createAsyncJob(repos, {
          userId: job.userId,
          jobType: "outfit_change_gen_video_edit",
          input: JSON.stringify({
            taskId,
            segmentIndex: r.segmentIndex,
            segmentVideoUrl: r.sourceVideoUrl!,
            referenceImageUrl: r.referenceImageUrl!,
            isTemplateMode,  // 传递模板模式标志
          }),
          now: ctx.clock.now(),
          projectId: job.projectId ?? undefined,
          parentJobId: job.parentJobId ?? undefined,
          initialStatus: "pending",
        }, ctx.globalTaskConcurrencyService);
      }
    }

    // 检查父任务状态
    if (job.parentJobId) {
      await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, ctx.clock.now());
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ taskId, jobId: job.id, segmentIndex, error: errorMessage }, `${segmentLabel}: Video-edit adapt 任务失败`);

    // 更新对应的 segmentVideo 状态为 failed
    const videoId = `sv_${taskId}_${segmentIndex}`;
    await ctx.repos.segmentVideos.updateStatus(videoId, "failed", errorMessage);

    await finalizeAsyncJob(repos, job.id, "failed", null, {
      code: "OUTFIT_ADAPT_VIDEO_EDIT_ERROR",
      message: errorMessage,
    }, ctx.clock.now(), dispatcher);

    // 失败时检查父任务是否需要自动完成
    if (job.parentJobId) {
      await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, ctx.clock.now());
    }
  }
}

/**
 * 执行 outfit_change_gen_video_edit 任务（Submit 阶段）
 *
 * 两种模式：
 * - 视频模式：提交 Kling Omni-Video API → 创建 Query 子任务
 * - 模板模式：提交 AnimateAnyone API → 创建 Query 子任务
 */
export async function executeOutfitGenVideoEditJob(
  ctx: AppContext,
  repos: PgRepositoryCollection,
  job: AsyncJobRecord,
  dispatcher: QueueDispatcher
): Promise<void> {
  const input = JSON.parse(job.input) as {
    taskId: string;
    segmentIndex: number;
    segmentVideoUrl: string;
    referenceImageUrl: string;
    isTemplateMode?: boolean;
  };
  const taskId = input.taskId;
  const segmentIndex = input.segmentIndex;
  const isTemplateMode = input.isTemplateMode ?? false;
  const now = ctx.clock.now();

  const repository = ctx.repos.outfitChangeProjects;

  try {
    const taskRecord = await repository.findById(taskId);
    if (!taskRecord) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const stage1Result = taskRecord.stage1Result;
    if (!stage1Result) {
      throw new Error(`Stage1 result not found for task: ${taskId}`);
    }

    const actionSegment = stage1Result.actionSegments[segmentIndex];
    if (!actionSegment) {
      throw new Error(`Action segment not found at index ${segmentIndex}`);
    }

    // 钳位时长到合法区间 3-10s
    const duration = clampSegmentDuration(actionSegment.endTime - actionSegment.startTime);

    if (isTemplateMode) {
      // ===== 模板模式：使用 AnimateAnyone API =====
      log.info({ taskId, segmentIndex }, "模板模式：使用 AnimateAnyone 视频生成");

      // 获取模板信息
      const templateInfo = stage1Result.templateInfo;
      if (!templateInfo?.aliTemplateId) {
        throw new Error("模板模式下缺少 templateInfo.aliTemplateId");
      }

      // 获取角色图片（AnimateAnyone 需要人物图片 + 模板 ID）
      const characterImageUrl = await resolveCharacterImageUrl(ctx, repos, taskRecord);

      // 获取 AnimateAnyone provider
      const animateProvider = await resolveRouteProvider(ctx, ProviderRouteKeys.ANIMATE_ANYONE_VIDEO_GENERATION);
      if (!animateProvider) {
        throw new AppError(502, "ANIMATE_ANYONE_NO_PROVIDER", "未配置 AnimateAnyone 视频生成 Provider");
      }

      log.info(
        { segmentIndex, aliTemplateId: templateInfo.aliTemplateId, characterImageUrl: characterImageUrl.slice(0, 100) },
        "AnimateAnyone 视频生成参数准备完成"
      );

      // 提交 AnimateAnyone 视频生成任务
      const submitResult = await createAnimateAnyoneVideoTask(
        animateProvider,
        characterImageUrl,
        templateInfo.aliTemplateId,
        {
          prompt: "生成自然流畅的动作视频",
          duration: templateInfo.durationSec,
        }
      );

      log.info(
        { taskId, jobId: job.id, segmentIndex, videoTaskId: submitResult.taskId, aliTemplateId: templateInfo.aliTemplateId },
        "AnimateAnyone 视频任务已提交，创建 Query 任务"
      );

      // Submit 保持 running，stage 标记为"生成中"
      await updateAsyncJobStage(repos, job.id, "生成中", now);

      // 创建 AnimateAnyone Query 任务
      await createAsyncJob(repos, {
        userId: job.userId,
        jobType: "outfit_change_gen_video_edit_query",
        input: JSON.stringify({
          taskId,
          segmentIndex,
          videoTaskId: submitResult.taskId,
          duration,
          isTemplateMode: true,
          animateAnyoneAuditInfo: submitResult.auditInfo,
        }),
        now,
        projectId: job.projectId ?? undefined,
        parentJobId: job.id,
        initialStatus: "pending",
        executionMode: "poll",
      }, ctx.globalTaskConcurrencyService);

    } else {
      // ===== 视频模式：使用 Kling Omni-Video API =====

      // 提交前校验切片视频实际时长，Kling 要求 ≥ 3s
      const actualDuration = await getVideoDuration(input.segmentVideoUrl);
      if (actualDuration < 3) {
        throw new AppError(
          502,
          "SEGMENT_VIDEO_TOO_SHORT",
          `切片视频实际时长 ${actualDuration}s < 3s，Kling 要求至少 3 秒。segmentIndex=${segmentIndex}`
        );
      }

      // 提交前校验切片视频分辨率，Kling Omni-Video 要求宽度 700-2160px
      const resolution = await getVideoResolution(input.segmentVideoUrl);
      if (resolution.width < 700) {
        throw new AppError(
          502,
          "SEGMENT_VIDEO_WIDTH_TOO_SMALL",
          `切片视频宽度 ${resolution.width}px < 700px，Kling Omni-Video 要求最小宽度 700px。segmentIndex=${segmentIndex}`
        );
      }
      if (resolution.width > 2160) {
        throw new AppError(
          502,
          "SEGMENT_VIDEO_WIDTH_TOO_LARGE",
          `切片视频宽度 ${resolution.width}px > 2160px，Kling Omni-Video 要求最大宽度 2160px。segmentIndex=${segmentIndex}`
        );
      }

      log.info(
        { segmentIndex, width: resolution.width, height: resolution.height, duration: actualDuration },
        "切片视频校验通过"
      );

      // 获取服装图片（用于 Omni-Video 参考图）
      const garment = await ctx.repos.garmentAssets.findById(taskRecord.input.targetOutfitId);
      const garmentImageUrl = garment?.flatLayImageUrl || garment?.mainImageUrl;

      // 获取角色图片（用于 Omni-Video 参考图）
      const characterImageUrl = await resolveCharacterImageUrl(ctx, repos, taskRecord);

      // 构建参考图数组（最多 3 张，按优先级排序）
      // 1. 换装参考图（主要）- LLM 合成的服装穿在角色身上的图
      // 2. 服装平铺图（辅助）- 提供服装细节参考
      // 3. 角色图片（辅助）- 提供角色面部特征参考
      const referenceImages: string[] = [input.referenceImageUrl];
      if (garmentImageUrl) {
        referenceImages.push(garmentImageUrl);
      }
      if (characterImageUrl && characterImageUrl !== input.referenceImageUrl) {
        referenceImages.push(characterImageUrl);
      }

      log.info(
        {
          segmentIndex,
          referenceCount: referenceImages.length,
          referenceImageUrl: input.referenceImageUrl.slice(0, 100),
          garmentImageUrl: garmentImageUrl?.slice(0, 100),
          characterImageUrl: characterImageUrl?.slice(0, 100),
        },
        "Omni-Video 参考图准备完成"
      );

      const outfitPrompt = `将视频中角色的服装替换为目标服装，保持角色面部特征、体型和动作不变，确保服装细节准确、自然。`;

      const genInput: Stage3VideoEditInput = {
        segmentVideoUrl: input.segmentVideoUrl,
        referenceImages,
        outfitPrompt,
        segmentIndex,
        actionType: actionSegment.actionType,
        projectId: taskRecord.input.projectId,
        userId: taskRecord.input.userId,
        taskId,
        duration,
      };

      const submitResult = await submitOmniVideoEdit(ctx, genInput);

      log.info({ taskId, jobId: job.id, segmentIndex, videoTaskId: submitResult.taskId }, "视频编辑已提交，创建 Query 任务");

      // Submit 保持 running，stage 标记为"生成中"
      await updateAsyncJobStage(repos, job.id, "生成中", now);

      // 创建 Query 任务，parentJobId 指向 Submit（嵌套模式）
      await createAsyncJob(repos, {
        userId: job.userId,
        jobType: "outfit_change_gen_video_edit_query",
        input: JSON.stringify({
          taskId,
          segmentIndex,
          videoTaskId: submitResult.taskId,
          videoAuditId: submitResult.auditId,
          videoAuditStartedAt: submitResult.auditStartedAt,
          videoAuditInfo: submitResult.auditInfo,
          duration,
          isTemplateMode: false,
        }),
        now,
        projectId: job.projectId ?? undefined,
        parentJobId: job.id,
        initialStatus: "pending",
        executionMode: "poll",
      }, ctx.globalTaskConcurrencyService);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ taskId, jobId: job.id, segmentIndex, error: errorMessage }, "Video-edit Submit 任务失败");

    const videoId = `sv_${taskId}_${segmentIndex}`;
    await ctx.repos.segmentVideos.updateStatus(videoId, "failed", errorMessage);

    await finalizeAsyncJob(repos, job.id, "failed", null, {
      code: "OUTFIT_GEN_VIDEO_EDIT_ERROR",
      message: errorMessage,
    }, ctx.clock.now(), dispatcher);

    const taskRecord = await repository.findById(taskId);
    const projectId = taskRecord?.input?.projectId;
    if (projectId) {
      await ctx.repos.projects.updateStatus(projectId, "FILMING");
    }

    if (job.parentJobId) {
      await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, ctx.clock.now());
    }
  }
}

/**
 * 执行 outfit_change_gen_video_edit_query 任务（Query 阶段）
 *
 * 两种模式：
 * - 视频模式：查询 Kling Omni-Video API → 完成则存储
 * - 模板模式：查询 AnimateAnyone API → 完成则存储
 */
export async function executeOutfitGenVideoEditQueryJob(
  ctx: AppContext,
  repos: PgRepositoryCollection,
  job: AsyncJobRecord,
  dispatcher: QueueDispatcher
): Promise<void> {
  const input = JSON.parse(job.input) as {
    taskId: string;
    segmentIndex: number;
    videoTaskId: string;
    videoAuditId?: string;
    videoAuditStartedAt?: number;
    videoAuditInfo?: {
      modelName: string;
      actualEndpoint: string;
      requestHeadersJson: string;
      requestBodyJson: string;
    };
    duration: number;
    isTemplateMode?: boolean;
    animateAnyoneAuditInfo?: {
      actualEndpoint: string;
      requestBodySummary: Record<string, unknown>;
      effectivePrompt: string;
      requestHeadersJson: string;
      requestBodyJson: string;
    };
  };
  const taskId = input.taskId;
  const segmentIndex = input.segmentIndex;
  const videoTaskId = input.videoTaskId;
  const isTemplateMode = input.isTemplateMode ?? false;

  try {
    // 验证对象存储配置（必须持久化编辑视频）
    if (!ctx.storage) {
      throw new AppError(502, "STORAGE_NOT_CONFIGURED", "对象存储未配置，无法持久化编辑视频");
    }

    // 获取 taskRecord 用于读取 projectId
    const repository = ctx.repos.outfitChangeProjects;
    const taskRecord = await repository.findById(taskId);
    const projectId = taskRecord?.input?.projectId;
    if (!projectId) {
      throw new AppError(400, "PROJECT_ID_MISSING", "任务缺少 projectId，无法构建 OSS 存储路径");
    }

    // 超时检查
    if (job.createdAt && Date.now() - job.createdAt > QUERY_TIMEOUT_MS) {
      throw new AppError(502, "OUTFIT_GEN_VIDEO_EDIT_TIMEOUT", `视频编辑超时（${QUERY_TIMEOUT_MS / 1000}s）`);
    }

    if (isTemplateMode) {
      // ===== 模板模式：查询 AnimateAnyone =====
      const animateProvider = await resolveRouteProvider(ctx, ProviderRouteKeys.ANIMATE_ANYONE_VIDEO_GENERATION);
      if (!animateProvider) {
        throw new AppError(502, "ANIMATE_ANYONE_NO_PROVIDER", "未配置 AnimateAnyone 视频生成 Provider");
      }

      const queryResult = await queryAnimateAnyoneVideoTask(animateProvider, videoTaskId);

      if (queryResult.status === "succeeded" && queryResult.videoUrl) {
        log.info({ taskId, jobId: job.id, segmentIndex, videoUrl: queryResult.videoUrl.slice(0, 100) }, "AnimateAnyone 视频生成完成");

        // 持久化视频到 OSS（AnimateAnyone 返回的 URL 是临时链接）
        const videoOssKey = join("outfit-change", projectId, "edited", `segment_${segmentIndex}_animate.mp4`);
        const editedVideoUrl = await persistMediaToOss(ctx.storage, queryResult.videoUrl, videoOssKey, "video/mp4");
        log.info({ segmentIndex, ossUrl: editedVideoUrl.slice(0, 100) }, "AnimateAnyone 视频已持久化到 OSS");

        const videoId = `sv_${taskId}_${segmentIndex}`;
        await ctx.repos.segmentVideos.updateVideo(videoId, editedVideoUrl, queryResult.duration ?? input.duration);

        const now = ctx.clock.now();

        // 执行合并检查
        if (taskRecord?.stage1Result) {
          await handleGenComplete(ctx, repos, taskRecord, taskRecord.stage1Result, taskId, now);
        }

        // finalize Query
        await finalizeAsyncJob(repos, job.id, "completed", {
          segmentIndex,
          editedVideoUrl,
          duration: queryResult.duration ?? input.duration,
        }, null, now, dispatcher);

        // Query 完成后检查并 finalize Submit 父任务
        if (job.parentJobId) {
          await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, now);
        }

        return;
      }

      if (queryResult.status === "failed") {
        log.warn({ taskId, jobId: job.id, segmentIndex, error: queryResult.error }, "AnimateAnyone 视频生成失败");
        throw new AppError(502, "ANIMATE_ANYONE_VIDEO_FAILED", queryResult.error?.message ?? "AnimateAnyone 视频生成失败");
      }

      // pending → 更新心跳，等下次轮询
      await ctx.repos.asyncJobs.updateHeartbeat(job.id, ctx.clock.now());
      log.info({ jobId: job.id, segmentIndex, videoTaskId }, "AnimateAnyone 视频生成 pending，等待下次查询");

    } else {
      // ===== 视频模式：查询 Omni-Video =====
      const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.OUTFIT_CHANGE_VIDEO_EDIT);
      if (!provider) {
        throw new AppError(502, "VIDEO_EDIT_NO_PROVIDER", "未配置换装视频编辑 Provider");
      }

      const queryResult = await queryOmniVideoEditStatus(provider, videoTaskId);

      if (queryResult.status === "succeeded" && queryResult.videoUrl) {
        log.info({ taskId, jobId: job.id, segmentIndex, videoUrl: queryResult.videoUrl.slice(0, 100) }, "视频编辑完成");

        // 持久化编辑后视频到 OSS（Kling 返回的 URL 是临时链接）
        const videoOssKey = join("outfit-change", projectId, "edited", `segment_${segmentIndex}_edited.mp4`);
        const editedVideoUrl = await persistMediaToOss(ctx.storage, queryResult.videoUrl, videoOssKey, "video/mp4");
        log.info({ segmentIndex, ossUrl: editedVideoUrl.slice(0, 100) }, "编辑视频已持久化到 OSS");

        // Finalize 审计记录（合并 submit + query 结果）
        if (input.videoAuditId && input.videoAuditStartedAt && input.videoAuditInfo) {
          finalizeVideoEditAudit(ctx, {
            auditId: input.videoAuditId,
            auditStartedAt: input.videoAuditStartedAt,
            auditInfo: input.videoAuditInfo,
            result: {
              status: "success",
              videoUrl: editedVideoUrl,
              duration: input.duration,
            },
          });
        }

        const videoId = `sv_${taskId}_${segmentIndex}`;
        await ctx.repos.segmentVideos.updateVideo(videoId, editedVideoUrl, input.duration);

        const now = ctx.clock.now();

        // 先执行合并检查（如所有分镜完成则合并+上传）
        if (taskRecord?.stage1Result) {
          await handleGenComplete(ctx, repos, taskRecord, taskRecord.stage1Result, taskId, now);
        }

        // 再 finalize Query（触发 checkAndFinalizeParent → Submit → grandparent）
        await finalizeAsyncJob(repos, job.id, "completed", {
          segmentIndex,
          editedVideoUrl,
          duration: input.duration,
        }, null, now, dispatcher);

        // Query 完成后检查并 finalize Submit 父任务
        if (job.parentJobId) {
          await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, now);
        }

        return;
      }

      if (queryResult.status === "failed") {
        log.warn({ taskId, jobId: job.id, segmentIndex, error: queryResult.error }, "视频编辑失败");

        // Finalize 审计记录（合并 submit + query 失败结果）
        if (input.videoAuditId && input.videoAuditStartedAt && input.videoAuditInfo) {
          finalizeVideoEditAudit(ctx, {
            auditId: input.videoAuditId,
            auditStartedAt: input.videoAuditStartedAt,
            auditInfo: input.videoAuditInfo,
            result: {
              status: "failed",
              errorCode: queryResult.error?.code ?? "VIDEO_EDIT_QUERY_FAILED",
              errorMessage: queryResult.error?.message ?? "视频编辑任务失败",
            },
          });
        }

        throw new AppError(502, "OUTFIT_GEN_VIDEO_EDIT_QUERY_FAILED", queryResult.error?.message ?? "视频编辑任务失败");
      }

      // pending → 不做任何状态变更，更新心跳，等 Dispatcher 下次轮询
      await ctx.repos.asyncJobs.updateHeartbeat(job.id, ctx.clock.now());
      log.info({ jobId: job.id, segmentIndex, videoTaskId }, "视频编辑 pending，等待下次查询");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ taskId, jobId: job.id, segmentIndex, error: errorMessage, isTemplateMode }, "Video-edit Query 任务失败");

    const videoId = `sv_${taskId}_${segmentIndex}`;
    await ctx.repos.segmentVideos.updateStatus(videoId, "failed", errorMessage);

    await finalizeAsyncJob(repos, job.id, "failed", null, {
      code: "OUTFIT_GEN_VIDEO_EDIT_QUERY_ERROR",
      message: errorMessage,
    }, ctx.clock.now(), dispatcher);

    if (job.parentJobId) {
      await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, ctx.clock.now());
    }
  }
}
