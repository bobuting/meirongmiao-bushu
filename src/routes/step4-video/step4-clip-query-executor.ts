/**
 * Step4 视频片段 Query 执行器
 *
 * Query 任务：查询视频状态 → pending 时保持 running，更新 updated_at
 * 创建独立审计记录（与 Submit 共享 pairId），前端通过 pairId 配对展示
 */

import type { AppContext } from "../../core/app-context.js";
import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import type { AsyncJobRecord } from "../../service/async-job-service.js";
import type { QueueDispatcher } from "../../modules/queue-dispatcher.js";
import { getLogger } from "../../core/logger/index.js";
import { type ProviderRouteKey, isProviderRouteKey } from "../../contracts/provider-route-keys.js";
import { resolveRouteProvider } from "../../services/llm/provider-resolver.js";
import { queryVideoTask } from "../../service/llm/llm-video.js";
import { AppError } from "../../core/errors.js";
import {
  finalizeAsyncJob,
  checkAndFinalizeParent,
  getAsyncJob,
} from "../../service/async-job-service.js";
import { persistVideoSourceToStorage } from "../../services/media/storage-persist.js";
import { advanceProjectStatusIfAllScenesHaveVideo } from "./scene-status-advance.js";
import {
  createLlmDebugRecord,
  finalizeLlmDebugRecordSuccess,
  finalizeLlmDebugRecordError,
} from "../../services/llm/llm-debug-recorder.js";
import {
  type Step4ClipQueryJobInput,
  type Step4ClipQueryJobResult,
  type Step4ClipSubmitJobResult,
} from "./advance-video-job.js";

const log = getLogger("step4-clip-query-executor");

/** Query 任务超时阈值（10 分钟） */
const QUERY_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * 执行 step4_clip_query 任务
 * 1. 查询外部 API 视频生成状态
 * 2. succeeded → 更新场景 + finalize completed
 * 3. pending → 更新 updated_at（保持 running，等下次轮询）
 * 4. failed → finalize failed
 */
export async function executeStep4ClipQueryJob(
  ctx: AppContext,
  repos: PgRepositoryCollection,
  job: AsyncJobRecord,
  dispatcher: QueueDispatcher,
): Promise<void> {
  const now = ctx.clock.now();
  const input = JSON.parse(job.input) as Step4ClipQueryJobInput;

  log.info({ jobId: job.id, sceneIndex: input.sceneIndex, taskId: input.videoTaskId }, "Step4 Clip Query 开始");

  let parentRouteKey: ProviderRouteKey | null = null;
  let pairId: string | null = null;
  let queryDebugRecord: { auditId: string; startedAt: number } | null = null;

  try {
    // 1. 最先读取父任务调试信息（routeKey + pairId）
    if (job.parentJobId) {
      const parentJob = await getAsyncJob(repos, job.parentJobId, () => now);
      if (parentJob?.result) {
        const parentResult = typeof parentJob.result === "string"
          ? JSON.parse(parentJob.result) as Step4ClipSubmitJobResult
          : parentJob.result as unknown as Step4ClipSubmitJobResult;
        pairId = parentResult.pairId ?? null;
        if (parentResult.routeKey && isProviderRouteKey(parentResult.routeKey)) {
          parentRouteKey = parentResult.routeKey;
        }
      }
    }

    // 2. 获取 Provider（必须使用 Submit 传递的 RouteKey，确保使用相同的 Provider）
    if (!parentRouteKey) {
      throw new AppError(503, "MISSING_ROUTE_KEY", "无法从父任务获取 RouteKey，请检查 Submit 任务是否正确传递");
    }
    const provider = await resolveRouteProvider(ctx, parentRouteKey);
    if (!provider) {
      throw new AppError(503, "PROVIDER_POLICY_MISSING", `${parentRouteKey} provider 未配置`);
    }

    // 2.5 超时检查（移到 provider 解析之后，确保能创建调试记录）
    if (job.createdAt && now - job.createdAt > QUERY_TIMEOUT_MS) {
      const timeoutRecord = createLlmDebugRecord(ctx, {
        routeKey: parentRouteKey,
        businessContext: `Step4 分镜${input.sceneIndex + 1}视频生成(查询)`,
        requestId: pairId ?? undefined,
        projectId: input.projectId,
        userId: job.userId,
        asyncJobId: job.id,
        messages: [{ role: "prompt", content: `query taskId=${input.videoTaskId} (timeout)` }],
        provider,
      });
      if (timeoutRecord) {
        finalizeLlmDebugRecordError(ctx, {
          auditId: timeoutRecord.auditId,
          startedAt: timeoutRecord.startedAt,
          errorCode: "STEP4_CLIP_QUERY_TIMEOUT",
          errorMessage: `视频生成超时（${QUERY_TIMEOUT_MS / 1000}s）`,
        });
      }
      throw new AppError(502, "STEP4_CLIP_QUERY_TIMEOUT", `视频生成超时（${QUERY_TIMEOUT_MS / 1000}s）`);
    }

    log.info({ jobId: job.id, sceneIndex: input.sceneIndex, routeKey: parentRouteKey, callMode: provider.callMode }, "Query 使用 Provider");

    // 3. 发起查询前创建审计记录（发起时创建，返回时更新，保证及时性）
    queryDebugRecord = createLlmDebugRecord(ctx, {
      routeKey: parentRouteKey,
      businessContext: `Step4 分镜${input.sceneIndex + 1}视频生成(查询)`,
      requestId: pairId ?? undefined,
      projectId: input.projectId,
      userId: job.userId,
      asyncJobId: job.id,
      messages: [{ role: "prompt", content: `query taskId=${input.videoTaskId}` }],
      provider,
    });

    // 4. 查询视频状态
    const queryResult = await queryVideoTask(provider, input.videoTaskId);

    // 5. pending → 更新心跳 + finalize 审计记录
    if (queryResult.status === "pending") {
      await ctx.repos.asyncJobs.updateHeartbeat(job.id, now);
      if (queryDebugRecord) {
        finalizeLlmDebugRecordSuccess(ctx, {
          auditId: queryDebugRecord.auditId,
          startedAt: queryDebugRecord.startedAt,
          actualModel: provider.model,
          responseText: `pending，等待下次查询`,
          actualEndpoint: queryResult.auditInfo?.actualEndpoint ?? undefined,
          requestHeadersJson: queryResult.auditInfo?.requestHeadersJson,
        });
      }
      log.info({ jobId: job.id, sceneIndex: input.sceneIndex, taskId: input.videoTaskId }, "视频生成 pending，等待下次查询");
      return;
    }

    // 6. 处理终态结果
    if (queryResult.status === "succeeded") {
      if (!queryResult.videoUrl) {
        throw new AppError(502, "STEP4_CLIP_NO_URL", "视频生成成功但未返回视频地址");
      }
      log.info({ jobId: job.id, sceneIndex: input.sceneIndex, videoUrl: queryResult.videoUrl.slice(0, 100) }, "视频生成完成");

      // 转存视频到 OSS（先完成所有工作，再 finalize 调试气泡，避免工作失败时气泡已标成功）
      const ossUrl = await persistVideoSourceToStorage(ctx, queryResult.videoUrl, "media/step4-clip");
      log.info({ jobId: job.id, sceneIndex: input.sceneIndex, ossUrl: ossUrl.slice(0, 100) }, "视频已转存到 OSS");

      // 读取当前场景记录，追加新的 variant URL（去重）
      const currentScene = await ctx.repos.step4VideoScenes.findByProjectAndScene(input.projectId, input.sceneIndex);
      const existingUrls = currentScene?.variantUrls ?? [];
      const updatedVariantUrls = existingUrls.includes(ossUrl) ? existingUrls : [...existingUrls, ossUrl];

      // 更新 step4_video_scenes 表
      await ctx.repos.step4VideoScenes.updateScene(input.projectId, input.sceneIndex, {
        clipStatus: "completed",
        clipUrl: ossUrl,
        externalTaskId: null,
        variantUrls: updatedVariantUrls,
      }, job.userId);

      // 所有分镜视频就绪时推进项目状态
      await advanceProjectStatusIfAllScenesHaveVideo(ctx, input.projectId);

      // Finalize Query 自己的调试气泡
      if (queryDebugRecord) {
        finalizeLlmDebugRecordSuccess(ctx, {
          auditId: queryDebugRecord.auditId,
          startedAt: queryDebugRecord.startedAt,
          actualModel: provider.model,
          responseText: `视频生成成功; videoUrl=${queryResult.videoUrl.slice(0, 300)}`,
          actualEndpoint: queryResult.auditInfo?.actualEndpoint,
          requestHeadersJson: queryResult.auditInfo?.requestHeadersJson,
        });
      }

      // Finalize Query 任务（存 OSS URL，外部 URL 有时效性）
      const queryJobResult: Step4ClipQueryJobResult = { videoUrl: ossUrl };
      await finalizeAsyncJob(repos, job.id, "completed", queryJobResult as unknown as Record<string, unknown>, null, now, dispatcher);

      // 检查父任务
      if (job.parentJobId) {
        await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, now);
      }
      return;
    }

    if (queryResult.status === "failed") {
      log.warn({ jobId: job.id, sceneIndex: input.sceneIndex, error: queryResult.error }, "视频生成失败");
      throw new AppError(502, "STEP4_CLIP_QUERY_FAILED", queryResult.error?.message ?? "视频生成任务失败");
    }

    // 未知状态兜底（防止静默返回导致 job 永远卡 running）
    throw new AppError(502, "UNKNOWN_QUERY_STATUS", `未知的查询状态: ${queryResult.status}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ jobId: job.id, sceneIndex: input.sceneIndex, error: errorMessage }, "Step4 Clip Query 失败");

    // Finalize Query 自己的调试气泡（失败）
    if (queryDebugRecord) {
      const errorCode = error instanceof AppError ? (error.code ?? "STEP4_CLIP_QUERY_ERROR") : "STEP4_CLIP_QUERY_ERROR";
      finalizeLlmDebugRecordError(ctx, {
        auditId: queryDebugRecord.auditId,
        startedAt: queryDebugRecord.startedAt,
        errorCode,
        errorMessage,
      });
    }

    // 更新场景状态
    await ctx.repos.step4VideoScenes.updateScene(input.projectId, input.sceneIndex, {
      clipStatus: "failed",
      errorMessage,
    }, job.userId);

    // Finalize Query 任务为 failed
    await finalizeAsyncJob(repos, job.id, "failed", null, {
      code: "STEP4_CLIP_QUERY_ERROR",
      message: errorMessage,
    }, now, dispatcher);

    // 检查父任务
    if (job.parentJobId) {
      await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, now);
    }
  }
}
