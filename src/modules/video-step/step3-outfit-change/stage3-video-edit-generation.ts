/**
 * Stage 3: 视频编辑模式生成模块（Omni-Video 工作流）
 *
 * 功能（video-edit 模式）：
 * - submitOmniVideoEdit：提交 Omni-Video 单步视频编辑任务
 * - queryOmniVideoEditStatus：查询 Omni-Video 任务状态
 * - 调用可灵 Omni-Video API（/kling/v1/videos/omni-video）
 *
 * Omni-Video 工作流（2 步）：
 * 1. POST /kling/v1/videos/omni-video — 提交编辑任务（video_list + image_list）→ 获得 task_id
 * 2. GET /kling/v1/videos/omni-video/{taskId} — 轮询任务完成 → 获得编辑后的视频 URL
 *
 * 步骤 1 在 executor 调用中完成（同步 HTTP），步骤 2 由 QueueDispatcher 外部轮询。
 */

import type { AppContext } from "../../../core/app-context.js";
import type { ResolvedRouteProvider } from "../../../services/llm/provider-resolver.js";
import { resolveRouteProvider } from "../../../services/llm/provider-resolver.js";
import {
  createVideoEditTask,
  queryVideoEditTask,
} from "../../../service/llm/llm-video.js";
import { createLlmDebugRecord, finalizeLlmDebugRecordSuccess, finalizeLlmDebugRecordError } from "../../../services/llm/llm-debug-recorder.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import {
  buildKlingVideoCreateEndpointCandidates,
  buildKlingOmniVideoRequestBody,
} from "../../../modules/kling-video-provider-endpoints.js";
import { buildAuthHeaderCandidates } from "../../../utils/http-request.js";
import { AppError } from "../../../core/errors.js";
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("stage3-video-edit-generation");

// ============================================================================
// 输入输出类型
// ============================================================================

/** Stage 3 视频编辑模式输入参数 */
export interface Stage3VideoEditInput {
  /** 切片视频 URL */
  segmentVideoUrl: string;
  /** 参考图 URL 数组（最多 4 张） */
  referenceImages: string[];
  /** 换装提示词 */
  outfitPrompt: string;
  /** 负向提示词（可选） */
  negativePrompt?: string;
  /** 视频时长（秒） */
  duration?: number;
  /** 分镜序号 */
  segmentIndex: number;
  /** 动作类型 */
  actionType: string;
  /** 项目ID */
  projectId: string;
  /** 用户ID */
  userId: string;
  /** 任务ID */
  taskId: string;
}

/** Stage 3 视频编辑模式输出结果 */
export interface Stage3VideoEditOutput {
  /** 分镜序号 */
  segmentIndex: number;
  /** 编辑后的视频 URL */
  editedVideoUrl: string;
  /** 视频时长（秒） */
  duration: number;
  /** 执行耗时（毫秒） */
  elapsedMs: number;
}

// ============================================================================
// 多模态提交结果
// ============================================================================

/** submitOmniVideoEdit 返回结果 */
export interface SubmitOmniVideoResult {
  /** 异步任务 ID */
  taskId: string;
  /** 查询端点（部分 Provider 不返回独立查询端点） */
  queryUrl: string | null;
  /** provider ID（用于后续查询） */
  providerId: string;
  /** provider callMode（用于后续查询） */
  providerCallMode: string;
  /** 审计记录 ID（用于轮询完成后 finalize） */
  auditId: string;
  /** 审计记录创建时间（用于计算 latency） */
  auditStartedAt: number;
  /** 审计所需信息（用于 query finalize） */
  auditInfo: {
    modelName: string;
    actualEndpoint: string;
    requestHeadersJson: string;
    requestBodyJson: string;
  };
}

// ============================================================================
// Omni-Video 提交（单步 POST，替代 init + add-selection + create 三步）
// ============================================================================

/**
 * 提交 Omni-Video 视频编辑任务
 * 单步 POST：video_list + image_list → task_id
 */
export async function submitOmniVideoEdit(
  ctx: AppContext,
  input: Stage3VideoEditInput,
): Promise<SubmitOmniVideoResult> {
  const segmentLabel = `分镜${input.segmentIndex + 1}`;

  log.info(
    {
      projectId: input.projectId,
      taskId: input.taskId,
      segmentIndex: input.segmentIndex,
      actionType: input.actionType,
      segmentVideoUrl: input.segmentVideoUrl.slice(0, 100),
      referenceImageCount: input.referenceImages.length,
    },
    `${segmentLabel}: 开始 Omni-Video 视频编辑`,
  );

  // 获取 Provider
  const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.OUTFIT_CHANGE_VIDEO_EDIT);
  if (!provider) {
    throw new AppError(502, "VIDEO_EDIT_NO_PROVIDER", "未配置换装视频编辑 Provider（outfit_change_video_edit）");
  }

  // 构建换装提示词
  const editPrompt = input.outfitPrompt || `将视频中角色的服装替换为目标服装，保持角色面部特征、体型和动作不变，确保服装细节准确、自然。`;

  // Omni-Video duration 接受 3-10 秒
  const duration = Math.max(3, Math.min(10, Math.round(input.duration ?? 5)));
  const modelName = provider.model ?? "kling-v3-omni";

  // 构建审计请求体（在 createLlmDebugRecord 之前构建）
  // 注意：此处仍用 Kling Omni-Video 格式构建审计体，仅用于调试气泡展示
  const requestBodyJson = buildKlingOmniVideoRequestBody({
    modelName,
    prompt: editPrompt,
    negativePrompt: input.negativePrompt,
    duration: String(duration),
    imageList: input.referenceImages.slice(0, 4).map((url) => ({ image_url: url })),
    videoList: [{ video_url: input.segmentVideoUrl, refer_type: "base", keep_original_sound: "yes" }],
  });

  // 审计端点和头信息
  const createEndpoints = buildKlingVideoCreateEndpointCandidates(provider.baseUrl);
  const actualEndpoint = createEndpoints[0] ?? provider.baseUrl;
  const auditHeaders: Record<string, string> = {
    Authorization: "Bearer ***",
    "Content-Type": "application/json",
  };
  const requestHeadersJson = JSON.stringify(auditHeaders);

  // 调试记录（包含 requestBodyJson）
  const auditMessages = [
    { role: "video_url", content: input.segmentVideoUrl },
    { role: "prompt", content: editPrompt },
    { role: "reference_images", content: JSON.stringify(input.referenceImages) },
  ];

  const debugRecord = createLlmDebugRecord(ctx, {
    routeKey: ProviderRouteKeys.OUTFIT_CHANGE_VIDEO_EDIT,
    businessContext: `换装视频编辑 - 分镜${input.segmentIndex + 1}`,
    projectId: input.projectId,
    userId: input.userId,
    messages: auditMessages,
    provider,
    hasMedia: "video",
    actualEndpoint,
    requestHeadersJson,
    requestBodyJson,
  });

  try {
    log.info(
      { segmentIndex: input.segmentIndex, imageCount: input.referenceImages.length, modelName, callMode: provider.callMode },
      `${segmentLabel}: 视频编辑提交`,
    );

    // 统一入口：根据 callMode 自动分发到对应 Provider
    const createResult = await createVideoEditTask(
      provider,
      input.segmentVideoUrl,
      editPrompt,
      {
        referenceImages: input.referenceImages.slice(0, 4),
        negativePrompt: input.negativePrompt,
        duration,
      },
    );
    if (!createResult.taskId) {
      throw new AppError(502, "VIDEO_EDIT_NO_TASK_ID", "视频编辑任务创建失败：未返回 taskId");
    }
    const taskId = createResult.taskId;
    const queryUrl = createResult.queryUrl;

    // Submit 成功后不 finalize，保持 pending 状态
    // 由 query 完成后统一 finalize，合并显示 submit + query 结果
    log.info(
      { projectId: input.projectId, outfitTaskId: input.taskId, segmentIndex: input.segmentIndex, taskId, auditId: debugRecord.auditId },
      `${segmentLabel}: Omni-Video 视频编辑任务已提交（审计记录待 query finalize）`,
    );

    return {
      taskId,
      queryUrl,
      providerId: provider.id,
      providerCallMode: provider.callMode,
      auditId: debugRecord.auditId,
      auditStartedAt: debugRecord.startedAt,
      auditInfo: {
        modelName,
        actualEndpoint,
        requestHeadersJson,
        requestBodyJson,
      },
    };
  } catch (error) {
    const code = error instanceof AppError ? error.code : "OMNI_VIDEO_SUBMIT_ERROR";
    const message = error instanceof Error ? error.message : String(error);
    finalizeLlmDebugRecordError(ctx, {
      auditId: debugRecord.auditId,
      startedAt: debugRecord.startedAt,
      errorCode: code,
      errorMessage: message.slice(0, 400),
      actualEndpoint,
      requestHeadersJson,
      requestBodyJson,
    });
    throw error;
  }
}

/**
 * Finalize Omni-Video 审计记录
 * 在 query 完成后调用，合并 submit 信息 + query 结果
 */
export function finalizeVideoEditAudit(
  ctx: AppContext,
  input: {
    auditId: string;
    auditStartedAt: number;
    auditInfo: {
      modelName: string;
      actualEndpoint: string;
      requestHeadersJson: string;
      requestBodyJson: string;
    };
    result:
      | { status: "success"; videoUrl: string; duration: number }
      | { status: "failed"; errorCode: string; errorMessage: string };
  },
): void {
  if (input.result.status === "success") {
    finalizeLlmDebugRecordSuccess(ctx, {
      auditId: input.auditId,
      startedAt: input.auditStartedAt,
      actualModel: input.auditInfo.modelName,
      responseText: `任务完成; videoUrl=${input.result.videoUrl}; duration=${input.result.duration}s`,
      actualEndpoint: input.auditInfo.actualEndpoint,
      requestHeadersJson: input.auditInfo.requestHeadersJson,
      requestBodyJson: input.auditInfo.requestBodyJson,
    });
  } else {
    finalizeLlmDebugRecordError(ctx, {
      auditId: input.auditId,
      startedAt: input.auditStartedAt,
      errorCode: input.result.errorCode,
      errorMessage: input.result.errorMessage.slice(0, 400),
      actualEndpoint: input.auditInfo.actualEndpoint,
      requestHeadersJson: input.auditInfo.requestHeadersJson,
      requestBodyJson: input.auditInfo.requestBodyJson,
    });
  }
}

/**
 * 查询 Omni-Video 视频编辑任务状态
 * 由 executor 调用，查询 provider 端任务状态
 */
export async function queryOmniVideoEditStatus(
  provider: ResolvedRouteProvider,
  taskId: string,
): Promise<{
  status: "pending" | "succeeded" | "failed";
  videoUrl?: string;
  error?: { code: string; message: string };
}> {
  return queryVideoEditTask(provider, taskId);
}
