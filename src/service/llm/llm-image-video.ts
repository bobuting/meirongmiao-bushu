/**
 * 图生视频 LLM 服务（向后兼容包装器）
 *
 * 此文件提供向后兼容的 `generateImageToVideo` 函数
 * 内部调用 `llm-video.ts` 中的 `requestVideoUrl`
 *
 * 注意：存储逻辑在此文件中处理，遵循"存储逻辑由调用方处理"原则
 */

import type { AppContext } from "../../core/app-context.js";
import type { User } from "../../contracts/types.js";
import { getLogger } from "../../core/logger/index.js";
import { resolveRouteProvider, freezeCredit, unfreezeCredit, deductFrozenCredit } from "../../services/llm/llm-transport.js";
import { ProviderRouteKeys, type ProviderRouteKey } from "../../contracts/provider-route-keys.js";
import { requestVideoUrl, normalizeVideoReferenceImageUrl } from "./llm-video.js";
import { persistVideoSourceToStorage } from "../../services/media/storage-persist.js";
import {
  createLlmDebugRecord,
  finalizeLlmDebugRecordSuccess,
  finalizeLlmDebugRecordError,
} from "../../services/llm/llm-debug-recorder.js";

const log = getLogger("llm-image-video");

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/**
 * 角色参考图片
 */
export interface CharacterReference {
  imageUrl: string;
}

/**
 * 图生视频LLM输入参数
 */
export interface ImageToVideoLLMInput {
  /** 项目ID */
  projectId: string;
  /** 角色多视图参考图片（用于保持角色一致性） */
  characterReferences: CharacterReference[];
  /** 服装参考图（只取一张） */
  outfitReferenceImages?: string[];
  /** 分镜的场景图片URL */
  sceneImageUrl: string;
  /** 分镜的描述 (visualCue/videoCue) */
  scenePrompt: string;
  /** 分镜索引（用于生成clip-{i+1}.mp4文件名，默认0） */
  sceneIndex?: number;
  /** 已存在的任务ID（用于重试时查询已有结果） */
  videoTaskId?: string | null;
}

/**
 * 图生视频LLM结果
 */
export interface ImageToVideoLLMResult {
  success: boolean;
  /** 生成的视频访问URL */
  videoUrl?: string;
  /** 生成的视频存储路径 */
  videoPath?: string;
  /** 分镜索引 */
  sceneIndex?: number;
  /** 错误信息 */
  errorMessage?: string;
  /** 外部任务ID（用于轮询） */
  taskId?: string;
  /** 是否需要轮询 */
  pending?: boolean;
  /** 调试气泡记录ID（Submit 阶段创建，供 Query 阶段复用） */
  debugAuditId?: string;
  /** 调试气泡记录开始时间戳 */
  debugStartedAt?: number;
  /** 冻结积分ID（Submit 冻结后传递给 Query，由 Query 完成最终扣减/解冻） */
  freezeId?: string | null;
}

/**
 * 视频生成配置
 */
export interface VideoGenerationConfig {
  /** 视频时长（秒） */
  duration?: number;
  /** 分辨率 */
  resolution?: "540p" | "720p" | "1080p";
  /** 指定模型（可选，默认使用 provider 配置的模型） */
  model?: string;
  /** 模型候选列表（按优先级顺序，逗号分隔） */
  modelCandidates?: string;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** base64 data URL 截取长度（仅保留前缀 + 前 100 字符用于识别） */
const BASE64_PREVIEW_LENGTH = 100;

/**
 * 截取 base64 data URL，保留前缀和前 100 字符预览
 * 非 base64 的 HTTP URL 保持原样
 */
function truncateDataUrl(url: string): string {
  if (/^data:image\/[a-z+]+;base64,/i.test(url)) {
    const commaIndex = url.indexOf(",");
    if (commaIndex >= 0) {
      const prefix = url.substring(0, commaIndex + 1);
      const preview = url.substring(commaIndex + 1, commaIndex + 1 + BASE64_PREVIEW_LENGTH);
      return `${prefix}${preview}...[base64 truncated, total ${url.length} chars]`;
    }
  }
  return url;
}

/**
 * 构建视频生成审计 messages，记录实际发送给 LLM 的信息
 * - scenePrompt: 提示词
 * - sceneImageUrl: 场景图 URL
 * - referenceImages: 实际发送的参考图 URL（已筛选）
 */
function buildVideoGenerationAuditMessages(input: {
  scenePrompt: string;
  sceneImageUrl: string | null;
  referenceImages: string[];
}): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  const contentParts: string[] = [];

  // 原始提示词
  contentParts.push(`【提示词】\n${input.scenePrompt}`);

  // 场景图 URL
  if (input.sceneImageUrl) {
    contentParts.push(`【场景图 URL】\n${truncateDataUrl(input.sceneImageUrl)}`);
  }

  // 实际发送的参考图
  if (input.referenceImages.length > 0) {
    const refLines = input.referenceImages.map(
      (url, i) => `  参考图${i + 1}: ${truncateDataUrl(url)}`,
    );
    contentParts.push(`【参考图】\n${refLines.join("\n")}`);
  }

  messages.push({ role: "user", content: contentParts.join("\n\n") });

  // 补充独立图片 URL 消息供调试器展示
  const allImageUrls = [
    ...(input.sceneImageUrl ? [input.sceneImageUrl] : []),
    ...input.referenceImages,
  ];
  if (allImageUrls.length > 0) {
    messages.push({ role: "images", content: JSON.stringify(allImageUrls) });
  }

  return messages;
}

/**
 * 用 requestVideoUrl 返回的 effectivePrompt 更新审计记录
 * 把 effectivePrompt 追加到 requestBodyJson 中（因为 updateCallAudit 对 messagesJson 是覆盖语义）
 */
function updateAuditWithEffectivePrompt(
  ctx: AppContext,
  auditId: string,
  effectivePrompt: string,
  requestBodyJson: string | null,
): string {
  // 将 effectivePrompt 合并到 requestBodyJson 中
  let bodySummary: Record<string, unknown> = {};
  if (requestBodyJson) {
    try { bodySummary = JSON.parse(requestBodyJson); } catch { /* 忽略解析失败 */ }
  }
  bodySummary.effectivePrompt = effectivePrompt;
  const updatedBodyJson = JSON.stringify(bodySummary);

  ctx.providerAdminService.updateCallAudit({
    auditId,
    requestBodyJson: updatedBodyJson,
  });

  return updatedBodyJson;
}

// ---------------------------------------------------------------------------
// 主函数：generateImageToVideo
// ---------------------------------------------------------------------------

/**
 * 生成图片转视频（含存储持久化）
 *
 * 此函数提供向后兼容的接口，包含：
 * 1. 调用 `requestVideoUrl` 生成视频
 * 2. 持久化视频到对象存储
 * 3. 记录调试日志
 *
 * @param ctx 应用上下文（包含storage等服务）
 * @param user 用户信息
 * @param input 输入参数
 * @param config 视频生成配置
 * @param routeKey Provider 路由键，默认 STEP4_CLIP_VIDEO_GENERATION_ADULT
 * @param existingDebugInfo 已有的调试记录（Submit 阶段创建，Query 阶段复用）
 * @returns 视频生成结果
 */
export async function generateImageToVideo(
  ctx: AppContext,
  user: User,
  input: ImageToVideoLLMInput,
  config?: VideoGenerationConfig,
  routeKey: ProviderRouteKey = ProviderRouteKeys.STEP4_CLIP_VIDEO_GENERATION_ADULT,
  existingDebugInfo?: { auditId: string; startedAt: number } | null,
  /** 跳过冻结扣费（Query 阶段传 true，复用 Submit 的冻结积分） */
  skipCreditFreeze?: boolean,
  /** 配对标识（以 "pair-" 开头），用于调试气泡 Submit-Query 配对展示 */
  pairId?: string | null,
): Promise<ImageToVideoLLMResult> {
  const { projectId, characterReferences, outfitReferenceImages, sceneImageUrl, scenePrompt, videoTaskId } = input;
  const sceneIndex = input.sceneIndex ?? 0;
  // 通过 videoTaskId + skipCreditFreeze 判断是否为 Query 阶段
  const isQuery = !!videoTaskId && !!skipCreditFreeze;

  // 冻结积分（防止并发白嫖）—— Query 阶段跳过，复用 Submit 的冻结积分
  const { freezeId } = skipCreditFreeze
    ? { freezeId: null as string | null }
    : await freezeCredit({ ctx, routeKey, userId: user.id, projectId });

  // 调试记录（API 调用前创建，保证及时性）
  let debugRecord: { auditId: string; startedAt: number } | null = null;

  try {
    // 1. 获取 video_generation provider 配置
    const provider = await resolveRouteProvider(ctx, routeKey);

    if (!provider) {
      log.error("[llm-image-video] video_generation provider 未配置");
      return {
        success: false,
        sceneIndex,
        errorMessage: "video_generation provider 未配置，请在 nrm_providers 表中配置",
      };
    }

    // 2. 规范化场景图片URL
    const normalizedSceneUrl = normalizeVideoReferenceImageUrl(sceneImageUrl);
    if (!normalizedSceneUrl) {
      return {
        success: false,
        sceneIndex,
        errorMessage: "无效的场景图片URL",
      };
    }

    // 3. 构建完整的Prompt（直接使用专业提示词，无需拼接角色描述）
    // scenePrompt 已是 Step3 生成的专业提示词，包含角色锚点、场景描述、镜头运动等完整信息
    const fullPrompt = scenePrompt;

    // 4. 构建参考图数组：服饰参考图（主要）+ 角色五视图合成图（辅助）
    // 视频生成图片顺序：首帧图 + 服饰平铺图 + 角色五视图
    // 第一张参考图对构图影响最大，确保服饰细节（logo、图案）优先保持
    const charImageUrl = characterReferences[0]?.imageUrl;
    const outfitImgs = (outfitReferenceImages ?? []).filter(Boolean);
    // 服饰在前（主要参考），角色在后（辅助参考）
    const referenceImages = [...outfitImgs, charImageUrl].filter(Boolean) as string[];

    // 提前构建审计消息（提交和成功阶段都需要）
    const auditMessages = buildVideoGenerationAuditMessages({
      scenePrompt,
      sceneImageUrl,
      referenceImages,
    });

    // 5. 准备 Provider
    const modelToUse = config?.model || provider.model || undefined;
    const videoProvider = {
      ...provider,
      model: modelToUse || provider.model,
    };

    // 5.5 发起前创建/复用审计记录（发起时创建，返回时更新，保证及时性）
    if (existingDebugInfo) {
      debugRecord = { auditId: existingDebugInfo.auditId, startedAt: existingDebugInfo.startedAt };
    } else {
      debugRecord = createLlmDebugRecord(ctx, {
        routeKey,
        requestId: pairId ?? undefined,
        businessContext: isQuery ? `视频生成(查询) - 分镜 ${sceneIndex + 1}` : `视频生成 - 分镜 ${sceneIndex + 1}`,
        projectId,
        userId: user.id,
        messages: auditMessages,
        provider: videoProvider,
        callMode: videoProvider.callMode,
        hasMedia: normalizedSceneUrl ? "image" : null,
      });
    }

    // 6. 调用视频生成API
    let videoUrl: string;
    let resultTaskId: string | undefined;
    let auditInfo: { actualEndpoint: string; requestBodySummary: Record<string, unknown>; effectivePrompt?: string; requestHeadersJson: string; requestBodyJson: string } | null = null;
    try {
      const result = await requestVideoUrl(videoProvider, fullPrompt, {
        imageUrl: normalizedSceneUrl,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        returnAuditInfo: true,
        duration: config?.duration,
        taskId: videoTaskId,
      });

      // 提取视频 URL、taskId 和审计信息
      if (typeof result === "object" && "videoUrl" in result) {
        videoUrl = result.videoUrl;
        resultTaskId = result.taskId;
        auditInfo = result.auditInfo;
      } else {
        videoUrl = result;
      }

      // 用 API 返回的审计信息补全调试记录
      if (debugRecord && auditInfo) {
        ctx.providerAdminService.updateCallAudit({
          auditId: debugRecord.auditId,
          actualEndpoint: auditInfo.actualEndpoint,
          requestHeadersJson: auditInfo.requestHeadersJson,
          requestBodyJson: auditInfo.requestBodyJson,
        });
      }
      if (debugRecord && auditInfo?.effectivePrompt) {
        updateAuditWithEffectivePrompt(
          ctx, debugRecord.auditId, auditInfo.effectivePrompt,
          auditInfo.requestBodyJson,
        );
      }
    } catch (apiError) {
      const errorCode = (apiError as { code?: string })?.code;

      // VIDEO_TASK_PENDING 是临时状态，返回 pending 让调用方决定如何处理
      if (errorCode === "VIDEO_TASK_PENDING") {
        const extras = (apiError as { extras?: Record<string, unknown> })?.extras;
        const taskId = extras?.taskId as string | undefined;

        // Query 阶段 pending：finalize 审计记录
        if (isQuery) {
          if (debugRecord) {
            finalizeLlmDebugRecordSuccess(ctx, {
              auditId: debugRecord.auditId,
              startedAt: debugRecord.startedAt,
              actualModel: videoProvider.model,
              responseText: `pending，等待下次查询`,
            });
          }
          return {
            success: false,
            sceneIndex,
            pending: true,
            taskId,
            errorMessage: "视频生成中，请稍后重试",
            freezeId,
          };
        }

        // Submit 阶段：finalize 调试气泡
        if (debugRecord) {
          finalizeLlmDebugRecordSuccess(ctx, {
            auditId: debugRecord.auditId,
            startedAt: debugRecord.startedAt,
            actualModel: videoProvider.model,
            responseText: `异步提交成功; taskId=${taskId ?? "unknown"}`,
          });
        }

        return {
          success: false,
          sceneIndex,
          pending: true,
          taskId,
          errorMessage: "视频生成中，请稍后重试",
          debugAuditId: debugRecord?.auditId,
          debugStartedAt: debugRecord?.startedAt,
          freezeId,
        };
      }

      log.error({ apiError }, "[llm-image-video] Video API call failed");

      // API 调用失败：finalize 调试记录为错误
      if (debugRecord) {
        finalizeLlmDebugRecordError(ctx, {
          auditId: debugRecord.auditId,
          startedAt: debugRecord.startedAt,
          errorCode: errorCode ?? "VIDEO_API_ERROR",
          errorMessage: apiError instanceof Error ? apiError.message : "视频生成API调用失败",
        });
      }

      return {
        success: false,
        sceneIndex,
        errorMessage: apiError instanceof Error ? apiError.message : "视频生成API调用失败",
      };
    }

    // 7. 持久化生成的视频
    const filename = `clip-${sceneIndex + 1}-${Date.now()}.mp4`;
    const videoPath = `projects/${projectId}/fission/storyboard/new_storyboard/${filename}`;

    if (!ctx.storage) {
      // 视频已生成但存储失败，finalize 调试记录为错误
      finalizeLlmDebugRecordError(ctx, {
        auditId: debugRecord.auditId,
        startedAt: debugRecord.startedAt,
        errorCode: "STORAGE_UNAVAILABLE",
        errorMessage: "存储服务不可用",
      });
      return {
        success: false,
        videoPath,
        videoUrl,
        sceneIndex,
        errorMessage: "存储服务不可用",
      };
    }

    // 持久化视频到存储
    const persistedVideoUrl = await persistVideoSourceToStorage(
      ctx,
      videoUrl,
      `projects/${projectId}/fission/storyboard/new_storyboard`,
    );


    // 成功完成调试记录（endpoint/headers/body 已在创建时记录）
    finalizeLlmDebugRecordSuccess(ctx, {
      auditId: debugRecord.auditId,
      startedAt: debugRecord.startedAt,
      actualModel: videoProvider.model,
      responseText: persistedVideoUrl || videoUrl,
    });

    // 成功后扣减冻结积分
    if (freezeId) {
      await deductFrozenCredit({ ctx, routeKey, userId: user.id, projectId }, freezeId, "llm_image");
    }

    return {
      success: true,
      videoUrl: persistedVideoUrl,
      videoPath,
      sceneIndex,
      taskId: resultTaskId, // 返回任务ID，用于重试时查询
    };
  } catch (error) {
    log.error({ error }, "[llm-image-video] Error");
    // 失败后解冻积分
    if (freezeId) {
      await unfreezeCredit({ ctx, routeKey, userId: user.id, projectId }, freezeId);
    }
    if (debugRecord) {
      finalizeLlmDebugRecordError(ctx, {
        auditId: debugRecord.auditId,
        startedAt: debugRecord.startedAt,
        errorCode: "UNKNOWN_ERROR",
        errorMessage: error instanceof Error ? error.message : "未知错误",
      });
    } else if (existingDebugInfo) {
      // 复用场景：outer catch 时 debugRecord 尚未赋值，用 existingDebugInfo 兜底
      finalizeLlmDebugRecordError(ctx, {
        auditId: existingDebugInfo.auditId,
        startedAt: existingDebugInfo.startedAt,
        errorCode: "UNKNOWN_ERROR",
        errorMessage: error instanceof Error ? error.message : "未知错误",
      });
    }
    return {
      success: false,
      sceneIndex,
      errorMessage: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 图生视频LLM服务
 */
export const LlmImageVideoService = {
  generateImageToVideo,
};