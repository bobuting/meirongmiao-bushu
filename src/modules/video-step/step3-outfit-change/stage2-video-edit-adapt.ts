/**
 * Stage 2: 视频编辑模式适配模块
 *
 * 功能（video-edit 模式）：
 * - 视频切片：根据 actionSegments 将源视频切分成多个片段
 * - 参考图生成：生成换装参考图（服装 + 角色）
 * - 存储切片视频 URL 和参考图 URL
 *
 * 与 image-to-video 模式的区别：
 * - image-to-video：换帧（首帧 + 尾帧）
 * - video-edit：切片 + 参考图
 */

import type { AppContext } from "../../../core/app-context.js";
import type { ActionSegment } from "../../../contracts/outfit-change-contract.js";
import { splitVideoBySegments, type VideoSplitResult, type KeyframeThumbnail, extractVideoKeyframes } from "../../../utils/video-split.js";
import { resolveRouteProvider } from "../../../services/llm/provider-resolver.js";
import { requestLlmImageGenerationUrl } from "../../../services/media/image-generation-providers.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { AppError } from "../../../core/errors.js";
import { getLogger } from "../../../core/logger/index.js";

/**
 * 钳位分段时长到 Kling Omni-Video 合法区间
 * 合法值：3-10秒（整数），无盲区
 */
export function clampSegmentDuration(rawSeconds: number): number {
  const rounded = Math.round(rawSeconds);
  return Math.max(3, Math.min(10, rounded));
}

const log = getLogger("stage2-video-edit-adapt");

// ============================================================================
// 输入输出类型
// ============================================================================

/** Stage 2 视频编辑模式输入参数 */
export interface Stage2VideoEditInput {
  /** 源视频 URL */
  sourceVideoUrl: string;
  /** Stage 1 输出的动作分镜数组 */
  actionSegments: ActionSegment[];
  /** 目标服装 ID（关联 nrm_garment_assets） */
  targetOutfitId: string;
  /** 角色类型：library=角色库角色 */
  characterType: "library";
  /** 角色ID（关联 nrm_library_characters） */
  characterId: string;
  /** 项目ID */
  projectId: string;
  /** 用户ID */
  userId: string;
  /** 任务ID（换装项目ID） */
  taskId: string;
}

/** 单个片段的适配结果 */
export interface SegmentAdaptResult {
  /** 分镜序号 */
  segmentIndex: number;
  /** 切片视频 URL */
  segmentVideoUrl: string;
  /** 切片视频关键帧截图 URL 数组 */
  sourceVideoThumbnails: KeyframeThumbnail[];
  /** 参考图 URL（换装目标） */
  referenceImageUrl: string;
  /** 动作类型 */
  actionType: string;
  /** 执行耗时（毫秒） */
  elapsedMs: number;
}

/** Stage 2 视频编辑模式输出结果 */
export interface Stage2VideoEditOutput {
  /** 各片段适配结果 */
  segmentResults: SegmentAdaptResult[];
  /** 切片总数 */
  segmentCount: number;
  /** 总耗时（毫秒） */
  totalElapsedMs: number;
}

// ============================================================================
// 主函数
// ============================================================================

/**
 * 执行 Stage 2 视频编辑模式适配
 *
 * 流程：
 * 1. 视频切片：根据 actionSegments 切分源视频
 * 2. 参考图生成：为每个片段生成换装参考图
 * 3. 存储结果到 segmentVideos 表
 */
export async function executeStage2VideoEdit(
  ctx: AppContext,
  input: Stage2VideoEditInput
): Promise<Stage2VideoEditOutput> {
  const startTime = Date.now();
  log.info(
    {
      projectId: input.projectId,
      taskId: input.taskId,
      segmentCount: input.actionSegments.length,
      targetOutfitId: input.targetOutfitId,
    },
    "Stage 2 视频编辑模式: 开始"
  );

  // 验证对象存储配置
  if (!ctx.storage) {
    throw new AppError(502, "STORAGE_NOT_CONFIGURED", "对象存储未配置，无法执行视频切片");
  }

  try {
    // ===== Step 1: 获取服装和角色图片 =====
    log.info("Step 1: 获取服装和角色图片");

    const garment = await ctx.repos.garmentAssets.findById(input.targetOutfitId);
    if (!garment) {
      throw new AppError(400, "GARMENT_NOT_FOUND", `服装不存在：${input.targetOutfitId}`);
    }
    const garmentImageUrl = garment.flatLayImageUrl || garment.mainImageUrl;
    if (!garmentImageUrl) {
      throw new AppError(400, "GARMENT_IMAGE_MISSING", `服装图片缺失：${input.targetOutfitId}`);
    }

    let characterImageUrl: string;
    if (input.characterType === "library") {
      const character = await ctx.repos.libraryCharacters.findById(input.characterId);
      if (!character) {
        throw new AppError(400, "CHARACTER_NOT_FOUND", `角色不存在：${input.characterId}`);
      }
      characterImageUrl = character.thumbnailUrl;
    } else {
      throw new AppError(400, "UNSUPPORTED_CHARACTER_TYPE", "暂不支持该角色类型");
    }

    log.info({ garmentImageUrl, characterImageUrl }, "服装和角色图片获取成功");

    // ===== Step 2: 视频切片 =====
    log.info({ segmentCount: input.actionSegments.length }, "Step 2: 视频切片");

    const splitLogger = {
      info: (obj: unknown, msg: string) => log.info(obj as Record<string, unknown>, msg),
      warn: (obj: unknown, msg: string) => log.warn(obj as Record<string, unknown>, msg),
      error: (obj: unknown, msg: string) => log.error(obj as Record<string, unknown>, msg),
    };

    const splitResult: VideoSplitResult = await splitVideoBySegments(
      ctx.storage,
      input.sourceVideoUrl,
      input.actionSegments,
      input.projectId,
      splitLogger,
      0,      // startSegmentIndex
      2160,   // maxDimension - Kling Omni-Video 最大边长限制
      700     // minWidth - Kling Omni-Video 最小宽度限制
    );

    log.info(
      { segmentCount: splitResult.segmentCount, elapsedMs: splitResult.elapsedMs },
      "视频切片完成"
    );

    // ===== Step 3: 生成换装参考图 =====
    log.info("Step 3: 生成换装参考图");

    const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.OUTFIT_CHANGE_IMAGE_GENERATION);
    if (!provider) {
      throw new AppError(502, "STAGE2_NO_PROVIDER", "未配置换装图像生成 Provider");
    }

    const referencePrompt = `【换装参考图生成】
服装：${garment.name || "目标服装"}
角色：保持角色面部特征和体型
要求：
1. 生成一张展示服装穿在角色身上的参考图
2. 保持服装细节准确
3. 角色姿态自然`;

    // 生成单张参考图（所有片段共用）
    const refGenResult = await requestLlmImageGenerationUrl(provider, referencePrompt, {
      mode: "image_to_image",
      images: [garmentImageUrl, characterImageUrl],
      ratio: "9:16",
      debugOptions: {
        ctx,
        routeKey: ProviderRouteKeys.OUTFIT_CHANGE_IMAGE_GENERATION,
        businessContext: "换装视频编辑 - 参考图生成",
        userId: input.userId,
        projectId: input.projectId,
      },
    });

    const referenceImageUrl = refGenResult.url;
    if (!referenceImageUrl) {
      throw new AppError(502, "REFERENCE_IMAGE_FAILED", "参考图生成失败");
    }

    log.info({ referenceImageUrl }, "参考图生成完成");

    // ===== Step 4: 构建结果 =====
    const segmentResults: SegmentAdaptResult[] = splitResult.segmentUrls.map((url, index) => ({
      segmentIndex: index,
      segmentVideoUrl: url,
      sourceVideoThumbnails: [], // 截图由 executor-handlers.ts 提取
      referenceImageUrl,
      actionType: input.actionSegments[index]?.actionType || "unknown",
      elapsedMs: splitResult.elapsedMs,
    }));

    const totalElapsedMs = Date.now() - startTime;

    log.info(
      {
        projectId: input.projectId,
        taskId: input.taskId,
        segmentCount: segmentResults.length,
        totalElapsedMs,
      },
      "Stage 2 视频编辑模式: 完成"
    );

    return {
      segmentResults,
      segmentCount: segmentResults.length,
      totalElapsedMs,
    };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    log.error(
      {
        projectId: input.projectId,
        taskId: input.taskId,
        elapsedMs,
        error: error instanceof Error ? error.message : String(error),
      },
      "Stage 2 视频编辑模式: 失败"
    );
    throw error;
  }
}

/**
 * 执行单分镜视频编辑适配
 *
 * 用于父子任务模式下，每个子任务处理单个片段
 *
 * @param ctx 应用上下文
 * @param input 单分镜适配输入
 * @returns 单分镜适配输出
 */
export async function adaptSingleSegmentForVideoEdit(
  ctx: AppContext,
  input: {
    /** 分镜序号 */
    segmentIndex: number;
    /** 动作分镜 */
    actionSegment: ActionSegment;
    /** 源视频 URL */
    sourceVideoUrl: string;
    /** 目标服装图片 URL */
    garmentImageUrl: string;
    /** 角色图片 URL */
    characterImageUrl: string;
    /** 项目ID */
    projectId: string;
    /** 用户ID */
    userId: string;
    /** 任务ID */
    taskId: string;
  }
): Promise<SegmentAdaptResult> {
  const startTime = Date.now();
  const segmentLabel = `分镜${input.segmentIndex + 1}`;

  // 验证对象存储配置
  if (!ctx.storage) {
    throw new AppError(502, "STORAGE_NOT_CONFIGURED", "对象存储未配置，无法执行视频切片");
  }

  log.info(
    {
      projectId: input.projectId,
      taskId: input.taskId,
      segmentIndex: input.segmentIndex,
      actionType: input.actionSegment.actionType,
    },
    `${segmentLabel}: 开始视频编辑适配`
  );

  try {
    // ===== Step 0: 钳位分段时长到 Kling Omni-Video 合法区间（3-10s 整数） =====
    const rawDuration = input.actionSegment.endTime - input.actionSegment.startTime;
    const clamped = clampSegmentDuration(rawDuration);
    const adjustedSegment: typeof input.actionSegment = {
      ...input.actionSegment,
      endTime: input.actionSegment.startTime + clamped,
    };

    if (clamped !== rawDuration) {
      log.info(
        { segmentIndex: input.segmentIndex, rawDuration, clampedDuration: clamped },
        `${segmentLabel}: 时长钳位 ${rawDuration}s → ${clamped}s`
      );
    }

    // ===== Step 1: 切取单个片段 =====
    log.info(
      { segmentIndex: input.segmentIndex, startTime: adjustedSegment.startTime, duration: clamped },
      `${segmentLabel}: 视频切片`
    );

    // 使用 splitVideoBySegments 处理单个片段
    const splitLogger = {
      info: (obj: unknown, msg: string) => log.info(obj as Record<string, unknown>, msg),
      warn: (obj: unknown, msg: string) => log.warn(obj as Record<string, unknown>, msg),
      error: (obj: unknown, msg: string) => log.error(obj as Record<string, unknown>, msg),
    };

    const splitResult = await splitVideoBySegments(
      ctx.storage,
      input.sourceVideoUrl,
      [adjustedSegment],
      input.projectId,
      splitLogger,
      input.segmentIndex,  // 使用实际分镜序号命名，避免并行任务互相覆盖
      2160,  // maxDimension - Kling Omni-Video 最大边长限制
      700    // minWidth - Kling Omni-Video 最小宽度限制
    );

    const segmentVideoUrl = splitResult.segmentUrls[0];
    if (!segmentVideoUrl) {
      throw new AppError(502, "SEGMENT_SPLIT_FAILED", `${segmentLabel}切片失败`);
    }

    log.info({ segmentIndex: input.segmentIndex, segmentVideoUrl }, `${segmentLabel}: 切片完成`);

    // ===== Step 2: 生成参考图 =====
    const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.OUTFIT_CHANGE_IMAGE_GENERATION);
    if (!provider) {
      throw new AppError(502, "ADAPT_SEGMENT_NO_PROVIDER", "未配置换装图像生成 Provider");
    }

    const referencePrompt = `【换装参考图】
分镜序号: ${input.segmentIndex + 1}
动作类型: ${input.actionSegment.actionType}
服装: 目标服装
角色: 保持角色特征
要求: 生成换装参考图`;

    const refGenResult = await requestLlmImageGenerationUrl(provider, referencePrompt, {
      mode: "image_to_image",
      images: [input.garmentImageUrl, input.characterImageUrl],
      ratio: "9:16",
      debugOptions: {
        ctx,
        routeKey: ProviderRouteKeys.OUTFIT_CHANGE_IMAGE_GENERATION,
        businessContext: `换装视频编辑 - 分镜${input.segmentIndex + 1}参考图`,
        userId: input.userId,
        projectId: input.projectId,
      },
    });

    const referenceImageUrl = refGenResult.url;
    if (!referenceImageUrl) {
      throw new AppError(502, "REFERENCE_IMAGE_FAILED", `${segmentLabel}参考图生成失败`);
    }

    const elapsedMs = Date.now() - startTime;

    log.info(
      {
        projectId: input.projectId,
        taskId: input.taskId,
        segmentIndex: input.segmentIndex,
        segmentVideoUrl,
        referenceImageUrl,
        elapsedMs,
      },
      `${segmentLabel}: 视频编辑适配完成`
    );

    return {
      segmentIndex: input.segmentIndex,
      segmentVideoUrl,
      sourceVideoThumbnails: [], // 截图由 executor-handlers.ts 提取
      referenceImageUrl,
      actionType: input.actionSegment.actionType,
      elapsedMs,
    };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    log.error(
      {
        projectId: input.projectId,
        taskId: input.taskId,
        segmentIndex: input.segmentIndex,
        elapsedMs,
        error: error instanceof Error ? error.message : String(error),
      },
      `${segmentLabel}: 视频编辑适配失败`
    );
    throw error;
  }
}