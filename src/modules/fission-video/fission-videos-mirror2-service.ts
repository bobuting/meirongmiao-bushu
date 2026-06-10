/**
 * 图生视频服务
 * 将图片（角色多视图、分镜场景图）生成对应的镜像视频
 * 使用 llm-image-video.ts 服务进行视频生成
 */

import type { IObjectStorageAdapter } from "../../contracts/object-storage.js";
import { generateImageToVideo } from "../../service/llm/llm-image-video.js";
import type { AppContext } from "../../core/app-context.js";
import type { User } from "../../contracts/types.js";
import type { ShotPromptsRecord } from "../../contracts/shot-prompts-contract.js";
import { resolveRouteProvider } from "../../services/llm/llm-transport.js";
import { requestLlmImageGenerationUrls } from "../../services/media/image-generation-providers.js";
import { persistImageSourceToStorage } from "../../services/media/storage-persist.js";
import { ProviderRouteKeys, selectRouteKeyByAge } from "../../contracts/provider-route-keys.js";
import { getLogger } from "../../core/logger/index.js";
import { buildEnhancedVideoPrompt } from "../../services/shot-prompts-service.js";

const log = getLogger("fission-mirror2");

/**
 * 图片输入项
 */
export interface ImageInputItem {
  /** 图片URL */
  url: string;
  /** 图片描述/提示词 */
  description: string;
  /** 视图类型（可选）: closeup, front, left, right, back */
  viewKey?: string;
  /** 图片索引 */
  index?: number;
  /** 分镜 keyframe_prompt（用于图生图重生成，可选） */
  keyframePrompt?: string;
  /** 角色参考图URL数组（用于图生图重生成） */
  referenceImageUrls?: string[];
}

/**
 * 图生视频选项
 */
export interface ImageToVideoOptions {
  /** 项目ID */
  projectId: string;
  /** 图片列表（包含角色多视图 + 第一个分镜） */
  images: ImageInputItem[];
  /** App上下文（包含storage等服务） */
  ctx: AppContext | null;
  /** 用户信息 */
  user: User | null;
  /** 存储适配器（已废弃，使用ctx.storage） */
  storage: IObjectStorageAdapter | null;
  /** 视频生成配置 */
  videoConfig?: {
    /** 视频生成API URL */
    apiUrl?: string;
    /** 视频生成API Key */
    apiKey?: string;
    /** 视频时长（秒） */
    duration?: number;
    /** 帧率 */
    fps?: number;
    /** 模型名称 */
    model?: string;
    /** 图生图温度（默认0，重生成时使用0.7） */
    imageTemperature?: number;
  };
  /** 服装参考图（只取一张） */
  outfitReferenceImages?: string[];
  /** 进度回调 */
  onProgress?: (percent: number, message: string) => void;
}

/**
 * 单个视频生成结果
 */
export interface VideoResult {
  /** 存储路径 */
  path: string;
  /** 访问URL */
  url: string;
  /** 图片索引 */
  imageIndex: number;
  /** 视频时长（秒） */
  durationSec?: number;
  /** 失败信息（图片重生成或视频生成失败时填充） */
  errorMessage?: string;
}

/**
 * 图生视频结果
 */
export interface ImageToVideoResult {
  /** 是否成功 */
  success: boolean;
  /** 生成的视频列表 */
  videos: VideoResult[];
  /** 任务ID（异步任务时使用） */
  taskId?: string;
  /** 错误信息 */
  errorMessage?: string;
  /** 失败的分镜列表（包含失败原因） */
  failedItems?: VideoResult[];
}

/**
 * 默认视频时长（秒）
 */
const DEFAULT_VIDEO_DURATION = 3;

/**
 * 默认帧率
 */
const DEFAULT_FPS = 24;

/**
 * 使用 keyframe_prompt 重新 generate 场景图片（temperature=0.7）
 * @param keyframePrompt 分镜专业关键帧提示词
 * @param referenceImageUrls 参考图URL数组（1张角色图 + 1张服装图，共2张）
 * @param projectId 项目ID（用于日志）
 * @param ctx 应用上下文
 * @returns 重新生成的图片URL，失败返回null
 */
async function regenerateSceneImage(
  keyframePrompt: string,
  referenceImageUrls: string[],
  projectId: string,
  ctx: AppContext,
  userId: string,
): Promise<string | null> {
  try {
    // 根据角色年龄选择图片生成 RouteKey
    const project = await ctx.repos.projects.findById(projectId);
    const age = project?.selectedRoleDirection?.age;
    const imageRouteKey = selectRouteKeyByAge(
      age != null ? Number(age) : null,
      ProviderRouteKeys.FISSION_STORYBOARD_IMAGE_CHILD,
      ProviderRouteKeys.FISSION_STORYBOARD_IMAGE_ADULT,
    );

    // 获取图片生成 provider
    const imageProvider = await resolveRouteProvider(ctx, imageRouteKey);
    if (!imageProvider) {
      log.warn({ projectId }, "无图片生成 provider，跳过重生成");
      return null;
    }


    // 调用图片生成 API，使用 temperature=0.7
    const regeneratedResult = await requestLlmImageGenerationUrls(
      imageProvider,
      keyframePrompt,
      {
        mode: referenceImageUrls.length > 0 ? "image_to_image" : "text_to_image",
        images: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
        ratio: "9:16",
        resolution: "1k",
        count: 1,
        temperature: 0.7,
        debugOptions: {
          ctx,
          routeKey: imageRouteKey,
          businessContext: "场景图片重生成 (image-to-video)",
          projectId: projectId,
          userId,
        },
      },
    );

    if (regeneratedResult.urls.length > 0) {
      // 持久化到 OSS（强制持久化 HTTP URL）
      const persistedUrl = await persistImageSourceToStorage(
        ctx,
        regeneratedResult.urls[0],
        `fission/${projectId}/regenerated`,
        { persistRemote: true, optimize: true },
      );
      return persistedUrl;
    }

    log.warn("图片重生成返回空结果");
    return null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ err: error }, "场景图片重生成失败");
    return null;
  }
}

/**
 * 生成单个图片的视频（使用llm-image-video服务）
 * 取所有奇数分镜（第1、3、5...个分镜，即索引0、2、4...）生成视频
 */
async function generateSingleImageVideo(
  imageItems: ImageInputItem[],
  options: ImageToVideoOptions
): Promise<VideoResult[]> {
  const { projectId, ctx, user, videoConfig } = options;
  // 服装参考图（优先使用 options.outfitReferenceImages，其次从 images 数组提取）
  let outfitReferenceImages = options.outfitReferenceImages;

  if (!ctx || !user) {
    log.error("缺少 ctx 或 user 参数");
    return [];
  }

  // 图片基础URL前缀
  const HOST_BASE_URL = process.env.HOST_BASE_URL || 'https://www.neirongmiao.com';

  // 规范化图片URL：没有http开头的加上基础URL前缀
  const normalizeImageUrl = (url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `${HOST_BASE_URL}${url}`;
  };

  // 分离角色多视图和分镜图片
  // 角色多视图: viewKey 为 closeup/front/left/right/back
  // 分镜图片: viewKey 为 scene-1, scene-3, scene-5, ... (奇数分镜)
  // 提取角色参考图URL（用于图生图重生成，只取1张）
  const characterReferenceUrls: string[] = [];
  // 服装参考图URL（只取1张）
  let outfitImageUrl: string | null = null;
  // 存储所有奇数分镜的场景图片
  const sceneImages: Array<{ url: string; prompt: string; index: number; keyframePrompt?: string }> = [];

  for (const item of imageItems) {
    if (item.viewKey && ["closeup", "front", "left", "right", "back"].includes(item.viewKey)) {
      // 收集角色参考图URL（只取1张）
      if (characterReferenceUrls.length < 1) {
        characterReferenceUrls.push(normalizeImageUrl(item.url));
      }
    } else if (item.viewKey === "outfit") {
      // 从 images 数组提取服装参考图（只取一张，优先级低于 options.outfitReferenceImages）
      if (!outfitReferenceImages || outfitReferenceImages.length === 0) {
        outfitReferenceImages = [normalizeImageUrl(item.url)];
      }
      // 收集服装参考图URL（只取1张）
      if (!outfitImageUrl) {
        outfitImageUrl = normalizeImageUrl(item.url);
      }
    } else if (item.viewKey?.startsWith("scene-")) {
      // 提取分镜索引（scene-1 -> 1, scene-3 -> 3, ...）
      const sceneIndex = parseInt(item.viewKey.replace("scene-", ""), 10);
      // 只取奇数分镜（索引为奇数：1, 3, 5, ...）
      if (sceneIndex % 2 === 1) {
        sceneImages.push({
          url: normalizeImageUrl(item.url),
          prompt: item.description,
          index: sceneIndex - 1, // 转换为0-based索引
          keyframePrompt: item.keyframePrompt,
        });
      }
    }
  }

  if (sceneImages.length === 0) {
    log.error("未找到奇数分镜图片");
    return [];
  }


  // 打印每个分镜的详细信息
  sceneImages.forEach((scene, i) => {
  });

  const videos: VideoResult[] = [];
  const failedResults: VideoResult[] = [];

  // 为每个奇数分镜生成视频
  for (let i = 0; i < sceneImages.length; i++) {
    const sceneImage = sceneImages[i];

    try {
      // 如果传入了 keyframe_prompt，先用图生图重生成场景图片（temperature=0.7）
      let effectiveSceneUrl = sceneImage.url;
      if (sceneImage.keyframePrompt && ctx) {
        // 合并参考图：1张角色图 + 1张服装图
        const regenReferenceImages = [...characterReferenceUrls];
        if (outfitImageUrl) {
          regenReferenceImages.push(outfitImageUrl);
        }
        try {
          const regeneratedUrl = await regenerateSceneImage(
            sceneImage.keyframePrompt,
            regenReferenceImages,
            projectId,
            ctx,
            user.id,
          );
          if (regeneratedUrl) {
            effectiveSceneUrl = regeneratedUrl;
          } else {
            // regenerateSceneImage 返回 null 表示生成失败
            const errMsg = `分镜 ${sceneImage.index + 1} 图片重生成失败`;
            log.error({ sceneIndex: sceneImage.index + 1 }, errMsg);
            failedResults.push({
              path: "",
              url: "",
              imageIndex: sceneImage.index,
              errorMessage: errMsg,
            });
            continue;
          }
        } catch (regenError) {
          const errMsg = regenError instanceof Error ? regenError.message : String(regenError);
          log.error({ err: regenError, sceneIndex: sceneImage.index + 1 }, "图片重生成异常");
          failedResults.push({
            path: "",
            url: "",
            imageIndex: sceneImage.index,
            errorMessage: `图片重生成异常: ${errMsg}`,
          });
          continue;
        }
      }

      // 根据角色年龄选择视频生成 RouteKey
      const project = await ctx.repos.projects.findById(projectId);
      const age = project?.selectedRoleDirection?.age;
      const videoRouteKey = selectRouteKeyByAge(
        age != null ? Number(age) : null,
        ProviderRouteKeys.FISSION_VIDEO_GENERATION_CHILD,
        ProviderRouteKeys.FISSION_VIDEO_GENERATION_ADULT,
      );

      // 调用llm-image-video服务生成视频
      const result = await generateImageToVideo(
        ctx,
        user,
        {
          projectId,
          characterReferences: characterReferenceUrls.map(url => ({ imageUrl: url })),
          outfitReferenceImages: outfitReferenceImages,
          sceneImageUrl: effectiveSceneUrl,
          scenePrompt: sceneImage.prompt,
          sceneIndex: sceneImage.index,
        },
        videoConfig,
        videoRouteKey,
      );


      // 处理 pending 状态：视频生成中，跳过此分镜，等待下次调用
      if (result.pending) {
        continue;
      }

      if (result.success && result.videoUrl) {
        videos.push({
          path: result.videoPath || "",
          url: result.videoUrl,
          imageIndex: result.sceneIndex ?? sceneImage.index,
          durationSec: videoConfig?.duration,
        });
      } else {
        const errMsg = result.errorMessage || "视频生成失败";
        log.error({ sceneIndex: sceneImage.index + 1, errMsg }, "视频生成失败");
        failedResults.push({
          path: "",
          url: "",
          imageIndex: sceneImage.index,
          errorMessage: errMsg,
        });
      }
    } catch (error) {
      const errorCode = (error as { code?: string })?.code;
      const errMsg = error instanceof Error ? error.message : String(error);

      // VIDEO_TASK_PENDING 是临时状态，跳过不标记为失败
      if (errorCode === "VIDEO_TASK_PENDING") {
        continue;
      }

      log.error({ sceneIndex: sceneImage.index + 1, errMsg }, "分镜生成异常");
      failedResults.push({
        path: "",
        url: "",
        imageIndex: sceneImage.index,
        errorMessage: errMsg,
      });
    }

  }


  // 有失败时，将失败信息拼接到结果中返回
  const allResults = [...videos, ...failedResults];
  if (failedResults.length > 0) {
    return allResults;
  }
  return allResults;
}

/**
 * 批量生成图片对应的视频
 * 取所有奇数分镜（第1、3、5...个分镜）生成视频
 * @param options 生成选项
 * @returns 视频生成结果
 */
export async function generateImageToVideoVideos(
  options: ImageToVideoOptions
): Promise<ImageToVideoResult> {
  const { images, onProgress } = options;

  if (!images || images.length === 0) {
    return {
      success: false,
      videos: [],
      errorMessage: "没有提供图片",
    };
  }


  // 更新进度
  onProgress?.(10, "准备生成视频...");

  try {
    // 调用新的生成函数（串行生成视频）
    const allResults = await generateSingleImageVideo(images, options);

    onProgress?.(90, "视频生成完成");

    // 分离成功和失败的结果
    const successVideos = allResults.filter(v => !v.errorMessage);
    const failedItems = allResults.filter(v => v.errorMessage);


    onProgress?.(100, "完成");

    // 构建失败信息摘要
    const failedSummary = failedItems.length > 0
      ? failedItems.map(f => `分镜${f.imageIndex + 1}: ${f.errorMessage}`).join("; ")
      : undefined;

    return {
      success: successVideos.length > 0,
      videos: successVideos,
      failedItems,
      errorMessage: successVideos.length === 0
        ? (failedSummary || "视频生成失败")
        : failedSummary,
    };
  } catch (error) {
    log.error({ err: error }, "图片转视频生成失败");
    return {
      success: false,
      videos: [],
      errorMessage: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 从项目数据中提取图片列表
 * 提取所有奇数分镜（第1、3、5...个分镜，即索引0、2、4...）
 * @param projectData snap_json.json 中的 projectData
 * @param shotPrompts 专业提示词记录（必须存在，否则抛出错误）
 * @returns 图片列表（角色多视图 + 奇数分镜）
 * @throws Error 如果 shotPrompts 不存在或为空
 */
export function extractImagesFromProjectData(
  projectData: Record<string, unknown>,
  shotPrompts: ShotPromptsRecord,
): ImageInputItem[] {
  if (!shotPrompts.shots || shotPrompts.shots.length === 0) {
    throw new Error("专业提示词为空，请先完成 Step3 生成分镜提示词");
  }

  const images: ImageInputItem[] = [];

  // 1. 提取角色多视图 (step3CharacterReferencePool) - 全部提取
  const characterPool = projectData.step3CharacterReferencePool as Array<{
    id?: string;
    label?: string;
    imageUrl?: string;
    viewKey?: string;
  }> | undefined;

  if (Array.isArray(characterPool)) {
    for (const ref of characterPool) {
      if (ref.imageUrl) {
        images.push({
          url: ref.imageUrl,
          description: ref.label || `角色视图 ${ref.viewKey || ''}`,
          viewKey: ref.viewKey,
        });
      }
    }
  }

  // 2. 提取所有奇数分镜场景图片（索引 0, 2, 4, ... 对应第1、3、5...个分镜）
  const script = projectData.script as Array<{
    sceneImageUrl?: string;
    visualCue?: string;
    videoCue?: string;
    title?: string;
  }> | undefined;

  if (Array.isArray(script) && script.length > 0) {
    script.forEach((scene, index) => {
      // 只取奇数分镜（索引为偶数：0, 2, 4, ...）
      if (index % 2 === 0 && scene.sceneImageUrl) {
        // shot_id = 数组索引 + 1（Step3 生成逻辑：index + 1）
        const shotId = index + 1;
        const shotItem = shotPrompts.shots.find(s => s.shot_id === shotId);

        if (!shotItem) {
          throw new Error(`找不到 shot_id=${shotId} 的专业提示词，请重新生成分镜提示词`);
        }

        const professionalPrompt = shotItem.video_prompt
          ? buildEnhancedVideoPrompt(shotItem.video_prompt)
          : null;
        if (!professionalPrompt) {
          throw new Error(`shot_id=${shotId} 的 video_prompt.prompt 为空，请重新生成分镜提示词`);
        }

        images.push({
          url: scene.sceneImageUrl,
          description: professionalPrompt,
          viewKey: `scene-${index + 1}`,
        });
      }
    });
  }

  // 服装参考图已改用 module-based 数据，此处不再从 uploads 提取
  return images;
}

/**
 * 图生视频服务
 */
export const FissionVideosMirror2Service = {
  generateImageToVideoVideos,
  extractImagesFromProjectData,
};