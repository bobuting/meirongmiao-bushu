/**
 * 视频裂变路由
 * 提供裂变视频的增删查接口，所有接口需要登录验证
 * 使用传统数据库字段存储，不使用 JSONB
 */

import type { FastifyInstance, RouteHandlerMethod } from "fastify";
import type { FissionVideo, StoryboardFrame, User } from "../contracts/types.js";
import type { AppContext } from "../core/app-context.js";
import type { IObjectStorageAdapter } from "../contracts/object-storage.js";
import { randomUUID } from "node:crypto";
import { getLogger } from "../core/logger/index.js";
import { AppError } from "../core/errors.js";
// import { readFile } from "node:fs/promises";
// import { resolve, join } from "node:path";
import { FissionVideoService } from "../modules/fission-video/fission-video-service.js";
import { FissionStatus, FissionStoryboardSourceType } from "../modules/fission-video/fission-video-config.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { FissionVideoStatusService, FissionStoryboardSubService, type FissionVideoStatusRecord, /* type FissionStoryboardCombination, */ createFissionTaskItemsService, type FissionTaskItemRecord } from "../service/services-sub.js";
import { MirrorVideoService } from "../modules/fission-video/fission-videos-mirror-service.js";
import {
  FissionVideosMirror2Service,
  type ImageInputItem,
  type ImageToVideoResult,
} from "../modules/fission-video/fission-videos-mirror2-service.js";
import {
  selectRandomClipsWithIds,
  createTransitionInfo,
  mergeVideos,
  uploadFissionVideo,
} from "../modules/fission-video/fission-core-service.js";

import { getVideoMusicByScript } from "../modules/video-music/video-music-service-atmospheres.js";
import { resolveRouteProvider } from "../services/llm/llm-transport.js";
import { type CharacterReference } from "../service/llm/llm-image-video.js";
// import type { ShotPromptsRecord } from "../contracts/shot-prompts-contract.js";
import { SHOT_PROMPTS_TYPE } from "../contracts/shot-prompts-contract.js";
import type { ShotPromptItem } from "../contracts/shot-prompt-engineer-contract.js";
import {
  getStorageAdapter,
  // extractStorageConfigFromAppConfig,
  // getPublicUrl,
} from "../modules/fission-video/fission-storage-service.js";
import { getFinalVideosDbService } from "../service/final-videos-db-service.js";
import { FissionJobService, FISSION_JOB_TYPE } from "../modules/fission-video/fission-job-service.js";
import { registerFissionNewStoryExecutor, getFissionNewStoryExecutor, FissionNewStoryExecutor } from "../modules/fission-video/fission-new-story-executor.js";
import { registerFissionShotPromptsExecutor, getFissionShotPromptsExecutor, FissionShotPromptsExecutor } from "../modules/fission-video/fission-shot-prompts-executor.js";
import { registerFissionItemImageExecutor, getFissionItemImageExecutor, FissionItemImageExecutor } from "../modules/fission-video/fission-item-image-executor.js";
import { registerFissionCombinationExecutor, getFissionCombinationExecutor, FissionCombinationExecutor } from "../modules/fission-video/fission-combination-executor.js";
import { findActiveJobByProjectAndType, findLatestJobByProjectAndType, createAsyncJob } from "../service/async-job-service.js";

const logger = getLogger("fission-video-routes");

/**
 * 裂变公共上下文（Task A 和 Task B 并行执行时共享的数据）
 */
interface FissionSharedContext {
  /** 角色参考图列表 */
  characterRefs: CharacterReference[];
  /** 服饰主图 */
  outfitImageUrl: string | null;
  /** 服饰参考图列表 */
  outfitReferenceImages: string[];
  /** 角色描述 */
  characterDescription: string;
  /** 服饰风格 */
  clothingStyles: string[];
  /** 服饰描述 */
  outfitDescription: string;
  /** 角色性别 */
  characterGender: string | null;
  /** 角色年龄 */
  characterAge: string | null;
  /** 角色风格 */
  characterStyle: string | null;
  /** 穿搭方案风格名称 */
  outfitStyleName: string | null;
  /** 角色方向（Step2 定妆选择，包含 styleWords） */
  selectedRoleDirection: import("../modules/project-context/types.js").SelectedRoleDirection | null;
}

/**
 * 视频裂变路由处理器接口
 */
export interface FissionVideoRouteHandlers {
  readonly getStoryboards: RouteHandlerMethod;
  readonly listFissionVideos: RouteHandlerMethod;
  readonly createFissionVideo: RouteHandlerMethod;
  readonly deleteFissionVideo: RouteHandlerMethod;
  readonly saveComVideo: RouteHandlerMethod;
  readonly getMirrorVideoStatus: RouteHandlerMethod;
  // 已删除：createImageToVideo（绕过 prep）
  // 分镜处理（开始裂变）- 已废弃，分镜数据改用 nrm_fission_task_items
  // readonly processStoryboard: RouteHandlerMethod;
  // 裂变视频状态相关
  readonly listFissionVideoStatus: RouteHandlerMethod;
  readonly getFissionVideoStatus: RouteHandlerMethod;
  readonly createFissionVideoStatus: RouteHandlerMethod;
  readonly updateFissionVideoStatus: RouteHandlerMethod;
  readonly deleteFissionVideoStatus: RouteHandlerMethod;
  readonly updateFissionVideoProgress: RouteHandlerMethod;
  // 氛围分析相关
  readonly getAtmosphere: RouteHandlerMethod;
  // 分镜组合相关
  readonly getStoryboardCombinations: RouteHandlerMethod;
  // 并行执行相关（新增）
  readonly startParallelFission: RouteHandlerMethod;
  // 已删除：getFissionProgress（前端已改用 globalTaskQueue 订阅）
  readonly retryFailedItems: RouteHandlerMethod;
  // 恢复卡住的 pending 任务
  readonly resumePendingTasks: RouteHandlerMethod;
  // 部分完成时直接合并成功的任务项
  readonly mergePartialFission: RouteHandlerMethod;
  // 同步执行相关（新版裂变流程）
  readonly syncInitializeTaskItems: RouteHandlerMethod;
  // 异步任务相关（Step4 前移）
  // 标记裂变完成
  readonly completeFission: RouteHandlerMethod;
  // 组合合并前置条件检查
  readonly checkMergePrerequisites: RouteHandlerMethod;
  // 获取任务项列表（用于前端显示任务卡片）
  readonly getTaskItems: RouteHandlerMethod;
}

/**
 * 注册视频裂变路由
 */
export function registerFissionVideoRoutes(
  app: FastifyInstance,
  handlers: FissionVideoRouteHandlers,
): void {
  // 获取项目分镜列表（需登录）
  app.get("/fission/storyboards", handlers.getStoryboards);

  // 获取裂变视频列表（需登录，支持分页）
  app.get("/fission/videos", handlers.listFissionVideos);

  // 创建裂变视频（需登录）
  app.post("/fission/videos", handlers.createFissionVideo);

  // 保存组合视频记录（前端先上传 OSS，再发 URL 持久化）
  app.post("/fission/videos/com-save", handlers.saveComVideo);

  // 删除裂变视频（需登录，校验所有者）
  app.delete("/fission/videos/:id", handlers.deleteFissionVideo);

  // 查询镜像视频状态（需登录）
  app.get("/fission/videos/mirror/:projectId", handlers.getMirrorVideoStatus);

  // 已删除：image-to-video 路由（绕过 prep，不符合新流程）
// 所有分镜预览生成必须通过 prep → sgen 流程

  // 分镜处理（开始裂变）- 已废弃，分镜数据改用 nrm_fission_task_items
  // app.post("/fission/storyboard/process", handlers.processStoryboard);

  // ========== 裂变视频状态相关路由 ==========
  // 获取项目的裂变状态列表
  app.get("/fission/status", handlers.listFissionVideoStatus);

  // 获取裂变状态详情
  app.get("/fission/status/:id", handlers.getFissionVideoStatus);

  // 创建裂变状态记录
  app.post("/fission/status", handlers.createFissionVideoStatus);

  // 更新裂变状态记录
  app.put("/fission/status/:id", handlers.updateFissionVideoStatus);

  // 删除裂变状态记录
  app.delete("/fission/status/:id", handlers.deleteFissionVideoStatus);

  // 更新裂变进度（原子操作）
  app.patch("/fission/status/:id/progress", handlers.updateFissionVideoProgress);

  // 获取项目氛围（自动分析脚本）
  app.get("/fission/status/:projectId/atmosphere", handlers.getAtmosphere);

  // 获取分镜组合列表
  app.get("/fission/storyboard/combinations", handlers.getStoryboardCombinations);

  // ========== 并行执行相关路由（新增）==========
  // 启动并行裂变任务
  app.post("/fission/parallel/start", handlers.startParallelFission);

  // 已删除：/fission/progress/:projectId GET 路由（前端已改用 globalTaskQueue 订阅）

  // 重试失败项
  app.post("/fission/retry", handlers.retryFailedItems);

  // 恢复卡住的 pending 任务
  app.post("/fission/resume", handlers.resumePendingTasks);

  // 部分完成时直接合并成功的任务项
  app.post("/fission/merge-partial", handlers.mergePartialFission);

  // ========== 同步执行相关路由（新版裂变流程）==========
  // 步骤1.5：初始化任务项
  app.post("/fission/sync/initialize", handlers.syncInitializeTaskItems);

  app.get("/fission/merge/check/:projectId", handlers.checkMergePrerequisites);

  // 标记裂变完成
  app.post("/fission/complete", handlers.completeFission);

  // 获取任务项列表（用于前端显示任务卡片）
  app.get("/fission/status/:id/task-items", handlers.getTaskItems);
}

/**
 * 创建视频裂变路由处理器
 * 使用 AppContext 和 requireUser 函数创建处理器
 */
export function createFissionVideoRouteHandlersWithContext(
  ctx: AppContext,
  requireUser: (ctx: AppContext, request: Parameters<RouteHandlerMethod>[0]) => Promise<User>,
): FissionVideoRouteHandlers {
  // 从 ctx.repos 创建 Service 实例
  const fissionVideoService = new FissionVideoService(ctx.repos);
  const fissionVideoStatusService = new FissionVideoStatusService(ctx.repos);
  const mirrorVideoService = new MirrorVideoService(ctx.repos);
  const fissionStoryboardSubService = new FissionStoryboardSubService(ctx.repos);

  // 注册 FissionNewStoryExecutor（全局单例）
  if (!getFissionNewStoryExecutor()) {
    registerFissionNewStoryExecutor(new FissionNewStoryExecutor(ctx, ctx.queueDispatcher));
  }

  // 注册 FissionShotPromptsExecutor（全局单例）
  if (!getFissionShotPromptsExecutor()) {
    registerFissionShotPromptsExecutor(new FissionShotPromptsExecutor(ctx, ctx.queueDispatcher));
  }

  // 注册 FissionItemImageExecutor（全局单例）
  if (!getFissionItemImageExecutor()) {
    registerFissionItemImageExecutor(new FissionItemImageExecutor(ctx, ctx.queueDispatcher));
  }

  // 注册 FissionCombinationExecutor（全局单例）
  if (!getFissionCombinationExecutor()) {
    registerFissionCombinationExecutor(new FissionCombinationExecutor(ctx, ctx.queueDispatcher));
  }

  // 创建 FissionJobService 实例
  const fissionJobService = new FissionJobService(ctx.repos, ctx.globalTaskConcurrencyService);

  return {
    /**
     * 获取项目分镜列表
     * 用于在裂变功能中选择分镜进行组合
     */
    getStoryboards: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const query = request.query as { projectId?: string };

      // 验证项目ID
      if (!query.projectId) {
        throw new AppError(400, "MISSING_PROJECT_ID", "缺少项目ID");
      }

      // 验证项目是否存在且属于当前用户
      const project = await ctx.repos.projects.findById(query.projectId);
      if (!project) {
        throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
      }
      if (project.userId !== user.id) {
        throw new AppError(403, "FORBIDDEN_ACCESS", "无权访问此项目");
      }

      // 获取该项目的所有分镜（nrm_storyboard_frames 已删除，从 nrm_step3_frame_images 查询）
      const storyboardRows = await ctx.repos.step3FrameImages.findRawStoryboardRows(query.projectId);
      const storyboards: StoryboardFrame[] = storyboardRows.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        projectId: row.project_id as string,
        scriptVersionId: null,
        index: (row.frame_index ?? 0) as number,
        imageUrl: (row.selected_image_url ?? "") as string,
        variants: [row.selected_image_url ?? ""] as string[],
        selectedVariantIndex: 0 as number,
      }));

      // 按索引排序
      storyboards.sort((a, b) => a.index - b.index);

      return reply.send({ success: true, storyboards });
    },

    /**
     * 获取裂变视频列表
     * 支持分页，只返回当前用户创建的裂变视频
     */
    listFissionVideos: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const query = request.query as {
        projectId?: string;
        page?: string;
        pageSize?: string;
      };

      const page = parseInt(query.page || "1", 10);
      const pageSize = parseInt(query.pageSize || "10", 10);

      // 从数据库获取裂变视频列表
      const service = fissionVideoService;
      let videos: FissionVideo[];
      if (query.projectId) {
        videos = await service.listByProject(query.projectId);
      } else {
        videos = await service.listByCreator(user.id);
      }

      // 过滤只返回当前用户的视频
      videos = videos.filter(v => v.creatorId === user.id);

      // 按创建时间正序排列（老视频在前，新视频在后，序号固定）
      videos.sort((a, b) => a.createdAt - b.createdAt);

      const total = videos.length;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const paginatedVideos = videos.slice(start, end);

      return reply.send({
        success: true,
        videos: paginatedVideos,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    },

    /**
     * 创建裂变视频
     * 支持两种模式：
     * 1. 传入 storyboardIds - 使用指定的分镜ID
     * 2. 传入 clipVideoUrls - 使用镜像视频URL，随机选择3个合并
     */
    createFissionVideo: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const body = request.body as {
        projectId?: string;
        storyboardIds?: string[];
        clipVideoUrls?: string[];           // 镜像视频URL数组（可选）
        transitionType?: string;
        transitionDuration?: number;
        audioUrl?: string;
        speed?: number;
        skipVideoGeneration?: boolean;      // 是否跳过视频生成（仅创建记录）
      };

      // 获取数据库配置，创建存储适配器
      const appConfig = ctx.adminConfigService.get();
      const storage = getStorageAdapter(appConfig, ctx.storage);
      // const storageConfig = extractStorageConfigFromAppConfig(appConfig);

      // 验证必填参数
      if (!body.projectId) {
        throw new AppError(400, "MISSING_PROJECT_ID", "缺少项目ID");
      }

      // 验证项目是否存在且属于当前用户
      const project = await ctx.repos.projects.findById(body.projectId);
      if (!project) {
        throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
      }
      if (project.userId !== user.id) {
        throw new AppError(403, "FORBIDDEN_ACCESS", "无权访问此项目");
      }

      // ========== 确定镜像视频来源 ==========
      let finalClipUrls: string[] = [];
      let storyboardIdsArray: string[] = [];

      if (body.clipVideoUrls && body.clipVideoUrls.length >= 3) {
        // 模式1：使用传入的镜像视频URL
        finalClipUrls = body.clipVideoUrls;
      } else if (body.storyboardIds && body.storyboardIds.length >= 2) {
        // 模式2：使用传入的分镜ID（兼容旧逻辑）
        storyboardIdsArray = body.storyboardIds;

        // 验证分镜是否属于该项目
        for (const storyboardId of body.storyboardIds) {
          const frame = await ctx.repos.step3FrameImages.findById(storyboardId);
          if (!frame || frame.project_id !== body.projectId) {
            throw new AppError(400, "VALIDATION_ERROR", `分镜 ${storyboardId} 不属于该项目`);
          }
        }
      } else {
        throw new AppError(400, "MISSING_CLIP_OR_STORYBOARD", "需要提供 clipVideoUrls（至少3个）或 storyboardIds（至少2个）");
      }

      // ========== 构建分镜ID组合键 ==========
      let storyboardIdsKey: string;

      if (finalClipUrls.length > 0) {
        // 从镜像视频随机选择3个
        const selectedClips = selectRandomClipsWithIds(finalClipUrls, 3);
        if (selectedClips.length < 3) {
          throw new AppError(400, "INSUFFICIENT_MIRROR_VIDEOS", "镜像视频数量不足，至少需要3个");
        }
        storyboardIdsArray = selectedClips.map(c => c.id);
        finalClipUrls = selectedClips.map(c => c.url);
        storyboardIdsKey = storyboardIdsArray.join("||");
      } else {
        storyboardIdsKey = storyboardIdsArray.join("||");
      }

      // 获取服务实例
      const service = fissionVideoService;

      // 不再检查组合唯一性，允许相同组合存在多条记录（弃用 + 未弃用）

      const now = Date.now();

      // 构建转场信息（随机选择转场效果）
      const transitionInfo = createTransitionInfo(body.transitionType, body.transitionDuration);

      // 创建裂变视频记录（初始状态为 pending）
      const newVideo: FissionVideo = {
        id: randomUUID(),
        projectId: body.projectId,
        fissionType: "storyboard_recombine",
        thumbnailUrl: null,
        videoPath: null,
        storyboardIds: storyboardIdsKey,
        transitionInfo,
        audioUrl: body.audioUrl || null,
        durationSec: null,
        speed: body.speed || 1.0,
        status: "pending",
        errorMessage: null,
        fissionVideoStatusId: null,
        creatorId: user.id,
        createdAt: now,
        updatedAt: now,
        isDeprecated: false,
        deprecatedAt: null,
        deprecatedBy: null,
      };

      // 保存到数据库（pending状态）
      await service.create(newVideo);

      // ========== 视频生成逻辑 ==========
      // 如果提供了镜像视频URL且未跳过生成，则进行视频合并
      if (finalClipUrls.length >= 3 && !body.skipVideoGeneration) {
        // 更新状态为 processing
        await service.update({
          ...newVideo,
          status: "processing",
          updatedAt: Date.now(),
        });

        try {
          // 合并视频
          const mergeResult = await mergeVideos({
            clipVideoUrls: finalClipUrls,
            transitionDurationFrames: transitionInfo.durationFrames,  // FreeCut 帧数模式
            videoDownloadTimeoutMs: ctx.configService.get().videoDownloadTimeoutMs,
            onProgress: (percent, message) => {
              request.log.info({ projectId: body.projectId, percent }, `[Fission] ${message}`);
            },
          });

          // 上传视频到存储（不传 publicBaseUrl，让函数使用 getSignedUrl 获取正确的 OSS URL）
          const { path: videoPath, url: videoUrl } = await uploadFissionVideo(
            storage,
            body.projectId,
            storyboardIdsArray,
            mergeResult.buffer
          );

          // 更新数据库记录为已完成
          const completedVideo = {
            ...newVideo,
            videoPath,
            durationSec: mergeResult.durationSec,
            status: "completed" as const,
            updatedAt: Date.now(),
          };

          await service.update(completedVideo);

          return reply.send({
            success: true,
            video: completedVideo,
            videoUrl,
          });

        } catch (error) {
          // 视频生成失败，更新错误信息
          const errorMessage = error instanceof Error ? error.message : String(error);
          request.log.error({ err: error, projectId: body.projectId }, `[Fission] 视频生成失败`);

          await service.update({
            ...newVideo,
            status: "failed",
            errorMessage,
            updatedAt: Date.now(),
          });

          throw new AppError(500, "VIDEO_GENERATION_FAILED", `视频生成失败: ${errorMessage}`);
        }
      }

      // 返回创建的记录（未生成视频）
      return reply.send({ success: true, video: newVideo });
    },

    /**
     * 删除裂变视频（弃用）
     * 只允许创建者删除自己的裂变视频
     * 实际为弃用操作，设置 is_deprecated = true
     */
    deleteFissionVideo: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const params = request.params as { id: string };

      // 查找裂变视频
      const service = fissionVideoService;
      const video = await service.getById(params.id);
      if (!video) {
        throw new AppError(404, "FISSION_VIDEO_NOT_FOUND", "裂变视频不存在");
      }

      // 验证所有者
      if (video.creatorId !== user.id) {
        throw new AppError(403, "FORBIDDEN_DELETE", "无权删除此视频");
      }

      // 弃用视频（软删除）
      await service.deprecate(params.id, user.id);

      return reply.send({ success: true });
    },

    /**
     * POST /fission/videos/com-save
     * 前端先上传 OSS，再发 OSS URL 给后端持久化
     */
    saveComVideo: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const body = request.body as {
        projectId: string;
        videoUrl: string;
        combinationId: string;
        combinationType: string;
        storyboardUrls: string[];
        transitionType: string;
        audioUrl?: string;
        durationSec: number;
        speed: number;
      };

      if (!body.projectId) throw new AppError(400, "MISSING_PROJECT_ID", "缺少项目ID");
      if (!body.videoUrl) throw new AppError(400, "MISSING_VIDEO_URL", "缺少视频URL");
      if (!body.combinationId) throw new AppError(400, "MISSING_COMBINATION_ID", "缺少组合ID");

      try {
        request.log.info({ projectId: body.projectId, combinationId: body.combinationId }, `[ComSave] 保存组合视频记录`);

        const now = Date.now();
        const newVideo: FissionVideo = {
          id: randomUUID(),
          projectId: body.projectId,
          fissionType: body.combinationType as "storyboard_recombine" | "homogenize_optimize" | "ai_new_story",
          thumbnailUrl: null,
          videoPath: body.videoUrl,
          storyboardIds: body.combinationId,
          storyboardUrls: body.storyboardUrls,
          transitionInfo: { type: body.transitionType, durationFrames: 0 },
          audioUrl: body.audioUrl || null,
          durationSec: Math.round(body.durationSec),
          speed: body.speed,
          status: "completed",
          errorMessage: null,
          fissionVideoStatusId: null,
          creatorId: user.id,
          createdAt: now,
          updatedAt: now,
          isDeprecated: false,
          deprecatedAt: null,
          deprecatedBy: null,
        };

        await fissionVideoService.create(newVideo);

        try {
          const finalVideosService = getFinalVideosDbService(ctx.repos);
          await finalVideosService.create({
            projectId: body.projectId,
            videoType: "fission",
            videoUrl: body.videoUrl,
            durationSec: body.durationSec ?? null,
            coverImageUrl: null,
            backgroundMusicUrl: body.audioUrl || null,
            backgroundMusicTitle: null,
            transitionType: body.transitionType || null,
            storyboardIds: body.combinationId || null,
            storyboardUrls: body.storyboardUrls || null,
            creatorId: user.id,
          });
        } catch (error) {
          request.log.error({ err: error }, `[FinalVideo] 保存裂变成片记录失败`);
        }

        return reply.send({ success: true, videoUrl: body.videoUrl });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        request.log.error({ err: error }, `[ComSave] 保存失败`);
        throw new AppError(500, "SAVE_FAILED", "`保存失败: ${errorMessage}`");
      }
    },

    /**
     * 查询镜像视频状态
     * 返回项目的镜像视频记录
     */
    getMirrorVideoStatus: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const params = request.params as { projectId: string };

      if (!params.projectId) {
        throw new AppError(400, "MISSING_PROJECT_ID", "缺少项目ID");
      }

      // 验证项目所有权
      const project = await ctx.repos.projects.findById(params.projectId);
      if (!project) {
        throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
      }
      if (project.userId !== user.id) {
        throw new AppError(403, "FORBIDDEN", "无权访问此项目");
      }

      try {
        const record = await mirrorVideoService.getByProjectId(params.projectId);

        if (!record) {
          return reply.send({
            success: true,
            exists: false,
            message: "暂无镜像视频记录",
          });
        }

        return reply.send({
          success: true,
          exists: true,
          mirrorRecord: {
            id: record.id,
            projectId: record.projectId,
            mirrorCount: record.payloadJson.mirrorCount,
            mirrorVideoUrls: record.payloadJson.mirrorVideoUrls,
            status: record.status,
            createdAt: record.createdAt,
          },
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        request.server.log.error({ err: error }, `[Mirror] 查询失败: ${errorMessage}`);
        throw new AppError(500, "OPERATION_FAILED", `查询失败: ${errorMessage}`);
      }
    },

    // ========== 裂变视频状态相关处理器 ==========

    /**
     * 获取项目的裂变状态列表
     */
    listFissionVideoStatus: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const query = request.query as { projectId?: string };

      if (!query.projectId) {
        throw new AppError(400, "MISSING_PROJECT_ID", "缺少项目ID");
      }

      try {
        const service = fissionVideoStatusService;
        const records = await service.listByProject(query.projectId);

        // 过滤只返回当前用户的记录
        const filtered = records.filter(r => r.creatorId === user.id);

        return reply.send({
          success: true,
          records: filtered,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        request.server.log.error({ err: error }, `[FissionStatus] 查询列表失败: ${errorMessage}`);
        throw new AppError(500, "OPERATION_FAILED", `查询失败: ${errorMessage}`);
      }
    },

    /**
     * 获取裂变状态详情
     */
    getFissionVideoStatus: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const params = request.params as { id: string };

      if (!params.id) {
        throw new AppError(400, "MISSING_STATUS_ID", "缺少状态ID");
      }

      try {
        const service = fissionVideoStatusService;
        const record = await service.getById(params.id);

        if (!record) {
          throw new AppError(404, "FISSION_STATUS_NOT_FOUND", "裂变状态记录不存在");
        }

        // 验证所有者
        if (record.creatorId !== user.id) {
          throw new AppError(403, "FORBIDDEN_ACCESS_RECORD", "无权访问此记录");
        }

        return reply.send({
          success: true,
          record,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        request.server.log.error({ err: error }, `[FissionStatus] 查询失败: ${errorMessage}`);
        throw new AppError(500, "OPERATION_FAILED", `查询失败: ${errorMessage}`);
      }
    },

    /**
     * 创建裂变状态记录
     */
    createFissionVideoStatus: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const body = request.body as {
        projectId: string;
        fissionCount?: number;
        status?: string;
      };

      if (!body.projectId) {
        throw new AppError(400, "MISSING_PROJECT_ID", "缺少项目ID");
      }

      try {
        const service = fissionVideoStatusService;
        const record = await service.create({
          projectId: body.projectId,
          fissionCount: body.fissionCount,
          status: (body.status as any) || FissionStatus.CREATING,
        }, user.id);

        return reply.send({
          success: true,
          record,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        request.server.log.error({ err: error }, `[FissionStatus] 创建失败: ${errorMessage}`);
        throw new AppError(500, "OPERATION_FAILED", `创建失败: ${errorMessage}`);
      }
    },

    /**
     * 更新裂变状态记录
     */
    updateFissionVideoStatus: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const params = request.params as { id: string };
      const body = request.body as {
        fissionCount?: number;
        completedCount?: number;
        status?: string;
        consumedCredits?: number;
      };

      if (!params.id) {
        throw new AppError(400, "MISSING_STATUS_ID", "缺少状态ID");
      }

      try {
        const service = fissionVideoStatusService;
        const existing = await service.getById(params.id);

        if (!existing) {
          throw new AppError(404, "FISSION_STATUS_NOT_FOUND", "裂变状态记录不存在");
        }

        // 验证所有者
        if (existing.creatorId !== user.id) {
          throw new AppError(403, "FORBIDDEN_UPDATE_RECORD", "无权修改此记录");
        }

        const record = await service.update(params.id, {
          fissionCount: body.fissionCount,
          completedCount: body.completedCount,
          status: (body.status as any) || existing.status,
          consumedCredits: body.consumedCredits,
        });

        return reply.send({
          success: true,
          record,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        request.server.log.error({ err: error }, `[FissionStatus] 更新失败: ${errorMessage}`);
        throw new AppError(500, "OPERATION_FAILED", `更新失败: ${errorMessage}`);
      }
    },

    /**
     * 删除裂变状态记录
     */
    deleteFissionVideoStatus: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const params = request.params as { id: string };

      if (!params.id) {
        throw new AppError(400, "MISSING_STATUS_ID", "缺少状态ID");
      }

      try {
        const service = fissionVideoStatusService;
        const existing = await service.getById(params.id);

        if (!existing) {
          throw new AppError(404, "FISSION_STATUS_NOT_FOUND", "裂变状态记录不存在");
        }

        // 验证所有者
        if (existing.creatorId !== user.id) {
          throw new AppError(403, "FORBIDDEN_DELETE_RECORD", "无权删除此记录");
        }

        await service.delete(params.id);

        return reply.send({ success: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        request.server.log.error({ err: error }, `[FissionStatus] 删除失败: ${errorMessage}`);
        throw new AppError(500, "OPERATION_FAILED", `删除失败: ${errorMessage}`);
      }
    },

    /**
     * 更新裂变进度（原子操作）
     */
    updateFissionVideoProgress: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const params = request.params as { id: string };
      const body = request.body as {
        completedCountDelta?: number;
        consumedCreditsDelta?: number;
        status?: string;
      };

      if (!params.id) {
        throw new AppError(400, "MISSING_STATUS_ID", "缺少状态ID");
      }

      try {
        const service = fissionVideoStatusService;
        const existing = await service.getById(params.id);

        if (!existing) {
          throw new AppError(404, "FISSION_STATUS_NOT_FOUND", "裂变状态记录不存在");
        }

        // 验证所有者
        if (existing.creatorId !== user.id) {
          throw new AppError(403, "FORBIDDEN_UPDATE_RECORD", "无权修改此记录");
        }

        const record = await service.updateProgress(params.id, {
          completedCountDelta: body.completedCountDelta,
          consumedCreditsDelta: body.consumedCreditsDelta,
          status: (body.status as any) || existing.status,
        });

        return reply.send({
          success: true,
          record,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        request.server.log.error({ err: error }, `[FissionStatus] 更新进度失败: ${errorMessage}`);
        throw new AppError(500, "OPERATION_FAILED", `更新进度失败: ${errorMessage}`);
      }
    },

    /**
     * 获取分镜组合列表
     * 根据裂变数量计算选取数量，从三种来源生成组合：
     * 1. 原始分镜：从来源为"原始分镜"的分镜列表中选取
     * 2. 图生视频：优先"图生视频"，不足用"原始分镜"补充
     * 3. 新故事：优先"新故事分镜"，不足用"原始分镜"补充
     * 返回组合列表，组合id不能重复
     */
    getStoryboardCombinations: async (request, reply) => {
      await requireUser(ctx, request);
      const query = request.query as { projectId?: string; fissionCount?: string };

      if (!query.projectId) {
        throw new AppError(400, "MISSING_PROJECT_ID", "缺少项目ID");
      }

      const fissionCount = parseInt(query.fissionCount || '0', 10);
      if (isNaN(fissionCount) || fissionCount <= 0) {
        throw new AppError(400, "INVALID_FISSION_COUNT", "无效的裂变数量");
      }

      try {
        // 1. 查已有的裂变视频（用于前端展示，不影响生成逻辑）
        const existingVideos = await fissionVideoService.listByProject(query.projectId, false);
        const completedVideos = existingVideos.filter(v => v.status === 'completed' && v.videoPath);

        request.server.log.info({ existingCount: completedVideos.length, fissionCount }, '[getStoryboardCombinations] 已有视频/请求数量');

        // 2. 每次都生成指定数量的新组合（不考虑已有视频数量）
        const combinations = await fissionStoryboardSubService.getCombinations(query.projectId, fissionCount);

        request.server.log.info({ count: combinations.length }, '[getStoryboardCombinations] 返回组合数');

        return reply.send({
          success: true,
          data: combinations,
          existingVideos: completedVideos.map((v, i) => ({
            index: i,
            id: v.id,
            videoUrl: v.videoPath,
            storyboardIds: v.storyboardIds,
            durationSec: v.durationSec,
          })),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        request.server.log.error({ err: error }, `[FissionStoryboard] 获取分镜组合失败: ${errorMessage}`);
        throw new AppError(500, "OPERATION_FAILED", `获取分镜组合失败: ${errorMessage}`);
      }
    },

    /**
     * 获取项目氛围（自动分析脚本）
     * 1. 先查询 fission_video_status 中是否有氛围数据
     * 2. 如果有，返回氛围数据
     * 3. 如果没有，从 snap_json.json 获取脚本，调用大模型分析，然后保存到数据库
     */
    getAtmosphere: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const params = request.params as { projectId: string };

      if (!params.projectId) {
        throw new AppError(400, "MISSING_PROJECT_ID", "缺少项目ID");
      }

      // 验证项目是否存在且属于当前用户
      const project = await ctx.repos.projects.findById(params.projectId);
      if (!project) {
        throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
      }
      if (project.userId !== user.id) {
        throw new AppError(403, "FORBIDDEN_ACCESS", "无权访问此项目");
      }

      try {
        // 1. 查询 fission_video_status 中是否有氛围数据
        const statusService = fissionVideoStatusService;
        const statusList = await statusService.listByProject(params.projectId);

        if (statusList.length > 0 && statusList[0].atmospheres && statusList[0].atmospheres.length > 0) {
          // 有氛围数据，直接返回
          return reply.send({
            success: true,
            atmospheres: statusList[0].atmospheres,
          });
        }

        // 2. 没有氛围数据，需要分析脚本
        const scriptRow = await ctx.repos.scriptData.findConfirmedByProjectId(params.projectId);
        const scriptText = (scriptRow?.basic_info as string)?.trim() ?? "";

        if (!scriptText) {
          // 没有脚本，返回默认阳光
          const defaultAtmospheres = ["阳光"];
          // 如果有状态记录，更新它
          if (statusList.length > 0) {
            await statusService.updateAtmospheres(statusList[0].id, defaultAtmospheres);
          }
          return reply.send({
            success: true,
            atmospheres: defaultAtmospheres,
          });
        }

        // 3. 调用大模型分析脚本氛围
        const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.MUSIC_ATMOSPHERE_ANALYSIS);
        if (!provider) {
throw new AppError(500, "PROVIDER_NOT_AVAILABLE", "无法获取 LLM Provider");
        }
        const result = await getVideoMusicByScript(ctx, scriptText);

        // 4. 保存到数据库
        if (statusList.length > 0) {
          await statusService.updateAtmospheres(statusList[0].id, result.matchedAtmosphere ? [result.matchedAtmosphere] : []);
        }

        return reply.send({
          success: result.success,
          atmospheres: result.matchedAtmosphere ? [result.matchedAtmosphere] : [],
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        request.server.log.error({ err: error }, `[Fission] 获取氛围失败: ${errorMessage}`);
        throw new AppError(500, "OPERATION_FAILED", `获取氛围失败: ${errorMessage}`);
      }
    },

    /**
     * 启动并行裂变任务
     * 先执行阶段1（新故事生成）和阶段1.5（专业提示词生成），然后并行执行图生视频和新故事视频生成
     */
    startParallelFission: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const body = request.body as {
        projectId: string;
        imageVideoCount?: number;
        newStoryCount?: number;
      };

      if (!body.projectId) {
        throw new AppError(400, "MISSING_PROJECT_ID", "缺少 projectId");
      }

      // A 类 = Step4 原始分镜数量
      // B 类 = A 类数量（原始位置的重新演绎分镜）
      // C 类 = Math.ceil(clipCount / 2)（随机位置插入的扩写分镜）
      const clipCount = await ctx.repos.step4VideoScenes.countSelectedByProject(body.projectId);
      if (clipCount === 0) {
        throw new AppError(400, "STORYBOARD_VIDEO_NOT_FOUND", "未找到分镜视频，请先完成分镜视频生成");
      }
      const imageVideoCount = clipCount;
      const newStoryCount = Math.ceil(clipCount / 2);

      // 随机生成 C 类插入位置（在 totalShotCount 中随机选取 newStoryCount 个位置）
      const totalShotCount = clipCount + newStoryCount;
      const allIndices = Array.from({ length: totalShotCount }, (_, i) => i + 1);
      const shuffled = allIndices.sort(() => Math.random() - 0.5);
      const insertPositions = shuffled.slice(0, newStoryCount).sort((a, b) => a - b);
      // 原始分镜在新故事中的位置 = 排除插入位置后剩余的位置
      const originalPositions = allIndices.filter(i => !insertPositions.includes(i));

      try {
        // 获取存储适配器
        const appConfig = ctx.adminConfigService.get();
        const storage = getStorageAdapter(appConfig, ctx.storage);

        if (!storage) {
          throw new AppError(500, "STORAGE_ADAPTER_UNAVAILABLE", "存储适配器不可用");
        }

        // 获取或创建裂变状态记录
        const statusList = await fissionVideoStatusService.listByProject(body.projectId);
        let statusRecord = statusList[0];
        if (!statusRecord) {
          statusRecord = await fissionVideoStatusService.create(
            {
              projectId: body.projectId,
              status: FissionStatus.PARALLEL_RUNNING,
              fissionCount: totalShotCount,
            },
            user.id
          );
        } else {
          // 更新状态为并行执行中，同步更新 fissionCount
          await fissionVideoStatusService.update(statusRecord.id, {
            status: FissionStatus.PARALLEL_RUNNING,
            fissionCount: totalShotCount,
          });
          // 重试时重置异步状态为 pending，使执行器可以重新进入
          if (statusRecord.newStoryAsyncStatus === 'failed' || statusRecord.shotPromptsAsyncStatus === 'failed') {
            await fissionVideoStatusService.updateAsyncStatus(body.projectId, {
              newStoryAsyncStatus: 'pending',
              shotPromptsAsyncStatus: 'pending',
              asyncFailedStage: null,
              asyncErrorMessage: null,
            });
          }
        }

        // 初始化任务项（仅首次创建，重试时不重新创建）
        const taskItemsService = createFissionTaskItemsService(ctx.repos, fissionVideoStatusService, ctx.businessConfigService);
        const existingItems = await taskItemsService.getAllItems(statusRecord.id);
        if (existingItems.length === 0) {
          // 首次创建：使用计算的随机位置
          await taskItemsService.initializeTaskItemsWithIndexes(
            statusRecord.id,
            originalPositions,
            insertPositions
          );
        }
        // 重试时：保留已有的任务项，不重新创建（避免分镜数量增加）

        // 创建裂变任务图：1个父任务 + 2个子任务（prep + sgen）
        const fissionPositionMap = { insertPositions, originalPositions, totalShotCount };
        const now = Date.now();
        const jobResult = await fissionJobService.createFissionJobGraph(
          user.id,
          body.projectId,
          {
            fissionVideoStatusId: statusRecord.id,
            imageVideoCount,
            newStoryCount,
            fissionContext: {},
            fissionPositionMap,
          },
          now,
        );

        if ("error" in jobResult) {
          throw new AppError(429, "RATE_LIMITED", `
            success: false,
            message: jobResult.error,
            errorCode: jobResult.errorCode,
          `);
        }

        // 子任务由 tick scheduler 和 queue dispatcher 自动推进，无需手动 advanceOnce

        return reply.send({
          success: true,
          fissionVideoStatusId: statusRecord.id,
          jobId: jobResult.parentJobId,
          newStoryJobId: jobResult.newStoryJobId,
          shotPromptsJobId: jobResult.shotPromptsJobId,
          message: "并行任务已启动，shot_prompts 将在 new_story 完成后自动执行",
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        request.server.log.error({ err: error }, `[Fission] 启动并行裂变失败: ${errorMessage}`);
        throw new AppError(500, "OPERATION_FAILED", `启动并行裂变失败: ${errorMessage}`);
      }
    },

    // 已删除：getFissionProgress handler（前端已改用 globalTaskQueue 订阅）

    /**
     * 重试失败项
     */
    retryFailedItems: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const body = request.body as {
        projectId: string;
        taskType: "image_video" | "new_story";
        itemIds?: string[];
      };

      if (!body.projectId || !body.taskType) {
        throw new AppError(400, "MISSING_REQUIRED_PARAMS", "缺少必要参数");
      }

      try {
        const statusList = await fissionVideoStatusService.listByProject(body.projectId);
        const statusRecord = statusList[0];
        if (!statusRecord) {
          throw new AppError(404, "FISSION_STATUS_NOT_FOUND", "未找到裂变状态记录");
        }

        const taskItemsService = createFissionTaskItemsService(ctx.repos, fissionVideoStatusService, ctx.businessConfigService);

        // 重试校验逻辑
        // 规则：
        // 1. 视频重试：图片必须成功，且视频状态为 failed
        // 2. 图片重试：不支持（图片失败需要重新执行整个分镜）
        if (body.taskType === "image_video" && body.itemIds) {
          const imageItems = await taskItemsService.getItemsByType(statusRecord.id, "image_video");
          for (const itemId of body.itemIds) {
            const itemIndex = parseInt(itemId, 10);
            const taskItem = imageItems.find((i: FissionTaskItemRecord) => i.itemIndex === itemIndex);
            if (taskItem) {
              // 图片失败时，不允许重试视频（需要重新执行整个分镜）
              if (taskItem.imageStatus === "failed") {
                throw new AppError(400, "VALIDATION_ERROR", `分镜 ${itemIndex + 1} 图片生成失败，无法单独重试视频`);
              }
              // 视频已成功或处理中，不允许重试
              if (taskItem.videoStatus === "completed" || taskItem.videoStatus === "processing") {
                throw new AppError(400, "VALIDATION_ERROR", `分镜 ${itemIndex + 1} 视频已生成或正在生成，不可重试`);
              }
              // 视频状态不是 failed，不允许重试
              if (taskItem.videoStatus !== "failed") {
                throw new AppError(400, "VALIDATION_ERROR", `分镜 ${itemIndex + 1} 视频状态不支持重试`);
              }
            }
          }
        }

        // 重置失败项状态
        const result = await taskItemsService.resetFailedItems(
          statusRecord.id,
          body.taskType,
          body.itemIds
        );

        // 查找活跃 shot_prompts 子 job 并通过 executor 推进重试
        const shotPromptsJob = await findActiveJobByProjectAndType(ctx.repos, body.projectId, "step6_fission_shot_prompts");
        if (shotPromptsJob) {
          const shotPromptsExec = getFissionShotPromptsExecutor();
          shotPromptsExec?.execute(user, body.projectId, shotPromptsJob.id).catch((err: unknown) => {
            logger.error({ err, jobId: shotPromptsJob.id }, "[Fission] shot_prompts 重试推进失败");
          });
        } else {
          // 无活跃 shot_prompts job，创建新 fission_parent + shot_prompts 补齐缺失任务
          const now = Date.now();
          const newParentResult = await createAsyncJob(ctx.repos, {
            userId: user.id,
            jobType: FISSION_JOB_TYPE,
            projectId: body.projectId,
            input: JSON.stringify({ fissionVideoStatusId: statusRecord.id, retry: true }),
            now,
            initialStatus: "running",
          }, ctx.globalTaskConcurrencyService);

          if (!("error" in newParentResult)) {
            const shotPromptsInput = {
              projectId: body.projectId,
              fissionVideoStatusId: statusRecord.id,
              imageVideoCount: 0,
              newStoryCount: 0,
              fissionContext: {},
              parentJobId: newParentResult.jobId,
            };
            await createAsyncJob(ctx.repos, {
              userId: user.id,
              jobType: "step6_fission_shot_prompts",
              projectId: body.projectId,
              input: JSON.stringify(shotPromptsInput),
              now,
              parentJobId: newParentResult.jobId,
              initialStatus: "pending",
            }, ctx.globalTaskConcurrencyService);
            logger.info({ parentJobId: newParentResult.jobId }, "[Fission] 创建新 fission_parent + shot_prompts 补齐缺失任务");
          }
        }

        return reply.send({
          success: true,
          resetCount: result.resetCount,
          message: `已重置 ${result.resetCount} 个失败项`,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        request.server.log.error({ err: error }, `[Fission] 重试失败项失败: ${errorMessage}`);
        throw new AppError(500, "OPERATION_FAILED", `重试失败项失败: ${errorMessage}`);
      }
    },

    // ========== 同步执行处理器（新版裂变流程）==========

    /**
     * 步骤1.5：初始化任务项
     * - 创建裂变状态记录（如果不存在）
     * - 初始化任务项（幂等，已存在则跳过）
     */
    syncInitializeTaskItems: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const body = request.body as {
        projectId: string;
        imageVideoCount: number;
        newStoryCount: number;
      };

      if (!body.projectId || body.imageVideoCount === undefined) {
        throw new AppError(400, "MISSING_REQUIRED_PARAMS", "缺少必要参数");
      }

      // C 类数量 = Math.ceil(clipCount / 2)，忽略前端传参
      const clipCount = await ctx.repos.step4VideoScenes.countSelectedByProject(body.projectId);
      const newStoryCount = Math.ceil(clipCount / 2);

      request.server.log.info(`[SyncInitialize] 初始化任务项: 项目=${body.projectId}, 图生视频=${body.imageVideoCount}, 新故事=${newStoryCount}`);

      try {
        // 获取或创建裂变状态记录
        const statusList = await fissionVideoStatusService.listByProject(body.projectId);
        let statusRecord = statusList[0];

        if (!statusRecord) {
          // 创建新的状态记录
          const totalShotCount = clipCount + newStoryCount;
          statusRecord = await fissionVideoStatusService.create(
            {
              projectId: body.projectId,
              status: FissionStatus.CREATING,
              fissionCount: totalShotCount,
            },
            user.id
          );
          request.server.log.info(`[SyncInitialize] 创建裂变状态记录: ${statusRecord.id}`);
        } else {
          request.server.log.info(`[SyncInitialize] 使用已有裂变状态记录: ${statusRecord.id}`);
        }

        // 初始化任务项（幂等操作，随机位置插入）
        const taskItemsService = createFissionTaskItemsService(ctx.repos, fissionVideoStatusService, ctx.businessConfigService);

        // 检查是否已有任务项
        const existingItems = await taskItemsService.getItemsByType(statusRecord.id, "image_video");
        if (existingItems.length === 0) {
          const totalShotCount = clipCount + newStoryCount;
          const allIndices = Array.from({ length: totalShotCount }, (_, i) => i + 1);
          const shuffled = allIndices.sort(() => Math.random() - 0.5);
          const insertPositions = shuffled.slice(0, newStoryCount).sort((a, b) => a - b);
          const originalPositions = allIndices.filter(i => !insertPositions.includes(i));
          await taskItemsService.initializeTaskItemsWithIndexes(
            statusRecord.id,
            originalPositions,
            insertPositions
          );
          request.server.log.info(`[SyncInitialize] 任务项初始化完成 (B类=${originalPositions.join(',')}, C类=${insertPositions.join(',')})`);
        } else {
          request.server.log.info(`[SyncInitialize] 任务项已存在，跳过初始化 (${existingItems.length}个)`);
        }

        return reply.send({
          success: true,
          fissionVideoStatusId: statusRecord.id,
          message: "初始化成功",
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        request.server.log.error({ err: error }, `[SyncInitialize] 初始化失败: ${errorMessage}`);
        throw new AppError(500, "OPERATION_FAILED", `初始化失败: ${errorMessage}`);
      }
    },

    /**
     * 步骤2：同步执行图生视频
     * - 智能跳过已完成的图片和视频
     * - 同步执行，等待完成后返回结果
     */
    
    /**
     * POST /fission/resume
     * 恢复卡住的 pending 任务
     * 用于处理服务重启或网络中断后任务未继续执行的情况
     */
    resumePendingTasks: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const body = request.body as { projectId: string };

      if (!body.projectId) {
        throw new AppError(400, "MISSING_PROJECT_ID", "缺少项目ID");
      }

      const project = await ctx.repos.projects.findById(body.projectId);
      if (!project) {
        throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
      }
      if (project.userId !== user.id) {
        throw new AppError(403, "FORBIDDEN_ACCESS", "无权访问此项目");
      }

      try {
        // 获取裂变状态记录
        const statusList = await fissionVideoStatusService.listByProject(body.projectId);
        const statusRecord = statusList[0];
        if (!statusRecord) {
          throw new AppError(404, "FISSION_STATUS_NOT_FOUND", "未找到裂变状态记录");
        }

        const taskItemsService = createFissionTaskItemsService(ctx.repos, fissionVideoStatusService, ctx.businessConfigService);

        // 获取所有 pending 状态的任务项
        const allItems = await taskItemsService.getItemsByType(statusRecord.id, "image_video");
        const newStoryItems = await taskItemsService.getItemsByType(statusRecord.id, "new_story");
        allItems.push(...newStoryItems);

        const stuckItems = allItems.filter(item => {
          // pending/failed 状态需要补齐
          const statusStuck = item.imageStatus === "pending" || item.imageStatus === "failed"
            || item.videoStatus === "pending" || item.videoStatus === "failed";
          // completed 但 URL 为空（数据不一致）也需要补齐
          const incomplete = (item.imageStatus === "completed" && !item.imageUrl)
            || (item.videoStatus === "completed" && !item.videoUrl);
          return statusStuck || incomplete;
        });

        if (stuckItems.length === 0) {
          return reply.send({
            success: true,
            resumedCount: 0,
            message: "没有待处理的任务",
          });
        }

        request.server.log.info(`[Fission] 恢复待处理任务: ${body.projectId}, 任务数: ${stuckItems.length}`);

        // 先将数据不一致的 item 状态重置为 pending（completed 但 URL 为空）
        for (const item of stuckItems) {
          const resetFields: string[] = [];
          if (item.imageStatus === "completed" && !item.imageUrl) resetFields.push("image_status = 'pending'");
          if (item.videoStatus === "completed" && !item.videoUrl) resetFields.push("video_status = 'pending'");
          if (item.imageStatus === "failed") resetFields.push("image_status = 'pending'");
          if (item.videoStatus === "failed") resetFields.push("video_status = 'pending'");
          if (resetFields.length > 0) {
            await ctx.repos.fissionTaskItems.resetItemStatusFields(item.id, resetFields);
            request.server.log.info({ itemIndex: item.itemIndex, resetFields }, "[Fission] 重置不一致的 item 状态");
          }
        }

        // 查找活跃 shot_prompts job 并通过 executor 推进恢复
        let activeShotPromptsJob = await findActiveJobByProjectAndType(ctx.repos, body.projectId, "step6_fission_shot_prompts");
        if (activeShotPromptsJob) {
          getFissionShotPromptsExecutor()?.execute(user, body.projectId, activeShotPromptsJob.id).catch((err: unknown) => {
            logger.error({ err, jobId: activeShotPromptsJob!.id }, "[Fission] shot_prompts 恢复推进失败");
          });
        } else {
          // 没有活跃的 shot_prompts job，创建新 fission_parent + shot_prompts 补齐缺失任务
          const now = Date.now();
          const newParentResult = await createAsyncJob(ctx.repos, {
            userId: user.id,
            jobType: FISSION_JOB_TYPE,
            projectId: body.projectId,
            input: JSON.stringify({ fissionVideoStatusId: statusRecord.id, retry: true }),
            now,
            initialStatus: "running",
          }, ctx.globalTaskConcurrencyService);

          if ("error" in newParentResult) {
            request.server.log.error({ newParentResult }, "[Fission] 创建新 fission_parent 被拒绝");
            throw new AppError(400, "VALIDATION_ERROR", `创建恢复任务失败: ${newParentResult.error || '并发控制拒绝'}，请稍后重试或重新发起裂变`);
          }

          const shotPromptsInput = {
            projectId: body.projectId,
            fissionVideoStatusId: statusRecord.id,
            imageVideoCount: 0,
            newStoryCount: 0,
            fissionContext: {},
            parentJobId: newParentResult.jobId,
          };
          const shotPromptsResult = await createAsyncJob(ctx.repos, {
            userId: user.id,
            jobType: "step6_fission_shot_prompts",
            projectId: body.projectId,
            input: JSON.stringify(shotPromptsInput),
            now,
            parentJobId: newParentResult.jobId,
            initialStatus: "pending",
          }, ctx.globalTaskConcurrencyService);
          if ("error" in shotPromptsResult) {
            request.server.log.error({ shotPromptsResult }, "[Fission] 创建新 shot_prompts job 被拒绝");
            throw new AppError(400, "VALIDATION_ERROR", `创建恢复任务失败: ${shotPromptsResult.error || '并发控制拒绝'}，请稍后重试或重新发起裂变`);
          }
          request.server.log.info({ parentJobId: newParentResult.jobId, shotPromptsJobId: shotPromptsResult.jobId }, "[Fission] 创建新 fission_parent + shot_prompts 补齐缺失任务");
        }

        // 统计需要恢复的任务类型
        const imageVideoStuck = stuckItems.filter(item => item.taskType === "image_video");
        const newStoryStuck = stuckItems.filter(item => item.taskType === "new_story");

        return reply.send({
          success: true,
          resumedCount: stuckItems.length,
          imageVideoCount: imageVideoStuck.length,
          newStoryCount: newStoryStuck.length,
          message: `已恢复 ${stuckItems.length} 个卡住的任务`,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new AppError(500, "OPERATION_FAILED", `恢复任务失败: ${errorMessage}`);
      }
    },

    /**
     * POST /fission/merge-partial
     * 部分完成时直接用成功的任务项生成组合方案并进入合并
     * 跳过失败项，只合并已完成的视频
     */
    mergePartialFission: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const body = request.body as { projectId: string };

      if (!body.projectId) {
        throw new AppError(400, "MISSING_PROJECT_ID", "缺少项目ID");
      }

      const project = await ctx.repos.projects.findById(body.projectId);
      if (!project) {
        throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
      }
      if (project.userId !== user.id) {
        throw new AppError(403, "FORBIDDEN_ACCESS", "无权访问此项目");
      }

      try {
        const statusList = await fissionVideoStatusService.listByProject(body.projectId);
        const statusRecord = statusList[0];
        if (!statusRecord) {
          throw new AppError(404, "FISSION_STATUS_NOT_FOUND", "未找到裂变状态记录");
        }

        if (statusRecord.status !== FissionStatus.PARTIAL_COMPLETE && statusRecord.status !== FissionStatus.PARALLEL_RUNNING) {
          throw new AppError(400, "INVALID_STATUS", `当前状态 ${statusRecord.status} 不允许直接合并`);
        }

        const taskItemsService = createFissionTaskItemsService(ctx.repos, fissionVideoStatusService, ctx.businessConfigService);
        const imageVideoItems = await taskItemsService.getItemsByType(statusRecord.id, "image_video");
        const newStoryItems = await taskItemsService.getItemsByType(statusRecord.id, "new_story");
        const allItems = [...imageVideoItems, ...newStoryItems];

        // 筛选全部完成的任务项（图片+视频都完成且有URL）
        const completedItems = allItems.filter(item =>
          item.imageStatus === "completed" && item.imageUrl &&
          item.videoStatus === "completed" && item.videoUrl,
        );

        if (completedItems.length === 0) {
          throw new AppError(400, "NO_COMPLETED_ITEMS", "没有成功完成的任务项，无法合并");
        }

        request.server.log.info({
          projectId: body.projectId,
          completedCount: completedItems.length,
          failedCount: allItems.length - completedItems.length,
        }, "[Fission] 部分合并：使用成功项生成组合方案");

        // 生成组合方案（用实际完成数量作为 fissionCount）
        const combinations = await fissionStoryboardSubService.getCombinations(body.projectId, completedItems.length);

        // 更新状态为 ready_for_merge
        await fissionVideoStatusService.update(statusRecord.id, {
          status: FissionStatus.READY_FOR_MERGE,
        });

        return reply.send({
          success: true,
          completedCount: completedItems.length,
          combinationCount: combinations.length,
          message: `已生成 ${combinations.length} 个组合方案（${completedItems.length} 个成功项）`,
        });
      } catch (error) {
        if (error instanceof AppError) throw error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new AppError(500, "MERGE_PARTIAL_FAILED", `部分合并失败: ${errorMessage}`);
      }
    },

    /**
     * POST /fission/complete
     * 标记裂变完成，更新状态为 completed
     */
    completeFission: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const body = request.body as { projectId: string };

      if (!body.projectId) {
        throw new AppError(400, "MISSING_PROJECT_ID", "缺少项目ID");
      }

      const project = await ctx.repos.projects.findById(body.projectId);
      if (!project) {
        throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
      }
      if (project.userId !== user.id) {
        throw new AppError(403, "FORBIDDEN_ACCESS", "无权访问此项目");
      }

      try {
        // 获取裂变状态记录
        const statuses = await fissionVideoStatusService.listByProject(body.projectId);
        if (statuses.length === 0) {
          throw new AppError(404, "FISSION_STATUS_NOT_FOUND", "裂变状态记录不存在");
        }

        const statusRecord = statuses[0];

        // 更新状态为 completed
        await fissionVideoStatusService.update(statusRecord.id, {
          status: FissionStatus.COMPLETED,
        });

        logger.info({ projectId: body.projectId }, `[Fission] 标记裂变完成: ${body.projectId}`);

        return reply.send({
          success: true,
          message: "裂变已完成",
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new AppError(500, "OPERATION_FAILED", `标记完成失败: ${errorMessage}`);
      }
    },

    /**
     * GET /fission/merge/check/:projectId
     * 检查组合合并前置条件是否满足
     * 返回：镜像数据+分镜视频是否完整
     */
    checkMergePrerequisites: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const projectId = (request.params as { projectId: string }).projectId;

      if (!projectId) {
        throw new AppError(400, "MISSING_PROJECT_ID", "缺少项目ID");
      }

      const project = await ctx.repos.projects.findById(projectId);
      if (!project) {
        throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
      }
      if (project.userId !== user.id) {
        throw new AppError(403, "FORBIDDEN_ACCESS", "无权访问此项目");
      }

      try {
        // 检查1：裂变状态是否已完成
        const statuses = await fissionVideoStatusService.listByProject(projectId);
        const statusRecord = statuses[0];
        const fissionCompleted = statusRecord?.status === FissionStatus.COMPLETED || statusRecord?.status === FissionStatus.PARTIAL_COMPLETE;

        // 检查2：task_items 中已完成的视频数
        const videoCount = statusRecord?.id
          ? await ctx.repos.fissionTaskItems.countCompletedByStatusId(statusRecord.id)
          : 0;
        const hasVideos = videoCount > 0;

        // 检查3：镜像视频是否存在
        const mirrorCount = await ctx.repos.mirrorVideos.countByProjectId(projectId);
        const hasMirrors = mirrorCount > 0;

        const ready = fissionCompleted && hasVideos;

        return reply.send({
          success: true,
          ready,
          details: {
            fissionCompleted,
            hasVideos,
            hasMirrors,
            videoCount,
            mirrorCount,
          },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new AppError(500, "OPERATION_FAILED", `前置条件检查失败: ${errorMessage}`);
      }
    },

    /**
     * GET /fission/status/:id/task-items
     * 获取裂变任务项列表（用于前端显示任务卡片）
     * 返回所有 task_items 的状态和结果
     */
    getTaskItems: async (request, reply) => {
      const user = await requireUser(ctx, request);
      const params = request.params as { id: string };

      if (!params.id) {
        throw new AppError(400, "MISSING_STATUS_ID", "缺少状态ID");
      }

      try {
        // 验证状态记录存在且属于当前用户
        const statusRecord = await fissionVideoStatusService.getById(params.id);
        if (!statusRecord) {
          throw new AppError(404, "FISSION_STATUS_NOT_FOUND", "裂变状态记录不存在");
        }
        if (statusRecord.creatorId !== user.id) {
          throw new AppError(403, "FORBIDDEN_ACCESS_RECORD", "无权访问此记录");
        }

        // 获取所有任务项
        const taskItemsService = createFissionTaskItemsService(ctx.repos, fissionVideoStatusService, ctx.businessConfigService);
        const items = await taskItemsService.getAllItems(params.id);

        return reply.send({
          success: true,
          items,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        request.server.log.error({ err: error }, `[Fission] 获取任务项列表失败: ${errorMessage}`);
        throw new AppError(500, "OPERATION_FAILED", `获取任务项列表失败: ${errorMessage}`);
      }
    },
  };
}

// ========== 辅助函数 ==========

/**
 * 简化的分镜提示词结构（仅包含执行所需字段）
 */
