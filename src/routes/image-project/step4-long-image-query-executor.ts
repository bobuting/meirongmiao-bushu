/**
 * Step4 长图生成 Query 执行器（图片项目，万相营造商详长图 API）
 *
 * Query 任务：轮询万相营造 API 状态 → pending 时保持 running → succeeded 时保存结果
 * 创建独立审计记录（与 Submit 共享 pairId），前端通过 pairId 配对展示
 */

import type { AppContext } from "../../core/app-context.js";
import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import type { AsyncJobRecord } from "../../service/async-job-service.js";
import type { QueueDispatcher } from "../../modules/queue-dispatcher.js";
import { getLogger } from "../../core/logger/index.js";
import { type ProviderRouteKey, isProviderRouteKey } from "../../contracts/provider-route-keys.js";
import { resolveRouteProvider } from "../../services/llm/provider-resolver.js";
import { pollWanxiangTaskResult, resolveSketchOssUrl, extractSketchId } from "../../services/media/alicloud-market-provider.js";
import { AppError } from "../../core/errors.js";
import { createHash } from "node:crypto";
import {
  finalizeAsyncJob,
  checkAndFinalizeParent,
  getAsyncJob,
} from "../../service/async-job-service.js";
import { persistImageSourceToStorage, ImageFormat } from "../../services/media/storage-persist.js";
import {
  createLlmDebugRecord,
  finalizeLlmDebugRecordSuccess,
  finalizeLlmDebugRecordError,
} from "../../services/llm/llm-debug-recorder.js";
import { type LongImageSubmitJobResult } from "./step4-long-image-submit-executor.js";

const log = getLogger("step4-long-image-query-executor");

/** Query 任务超时阈值（5 分钟） */
const QUERY_TIMEOUT_MS = 5 * 60 * 1000;

/** Query 任务输入 */
interface LongImageQueryJobInput {
  projectId: string;
  parentJobId: string;
  genId: string;
  templateId?: string | null;
  templateName?: string | null;
}

/**
 * 执行 image_step4_long_image_query 任务
 */
export async function executeLongImageQueryJob(
  ctx: AppContext,
  repos: PgRepositoryCollection,
  job: AsyncJobRecord,
  dispatcher: QueueDispatcher,
): Promise<void> {
  const now = ctx.clock.now();
  const input = JSON.parse(job.input) as LongImageQueryJobInput;

  log.info({ jobId: job.id, genId: input.genId }, "长图生成 Query 开始");

  // 读取当前 poll 次数（从上次的 result 中累加）
  const prevResult = job.result
    ? (typeof job.result === "string" ? JSON.parse(job.result) as Record<string, unknown> : job.result as Record<string, unknown>)
    : {};
  const pollCount = ((prevResult.pollCount as number) ?? 0) + 1;

  let parentRouteKey: ProviderRouteKey | null = null;
  let pairId: string | null = null;
  let queryEndpoint: string | null = null;
  let queryDebugRecord: { auditId: string; startedAt: number } | null = null;

  try {
    // 1. 读取父任务调试信息（routeKey + pairId）
    if (job.parentJobId) {
      const parentJob = await getAsyncJob(repos, job.parentJobId, () => now);
      if (parentJob?.result) {
        const parentResult = typeof parentJob.result === "string"
          ? JSON.parse(parentJob.result) as LongImageSubmitJobResult
          : parentJob.result as unknown as LongImageSubmitJobResult;
        if (parentResult.routeKey && isProviderRouteKey(parentResult.routeKey)) {
          parentRouteKey = parentResult.routeKey;
        }
        pairId = parentResult.pairId ?? null;
      }
    }

    // 2. 获取 Provider
    if (!parentRouteKey) {
      throw new AppError(503, "MISSING_ROUTE_KEY", "无法从父任务获取 RouteKey");
    }
    const provider = await resolveRouteProvider(ctx, parentRouteKey);
    if (!provider) {
      throw new AppError(503, "PROVIDER_POLICY_MISSING", `${parentRouteKey} provider 未配置`);
    }
    queryEndpoint = `${provider.baseUrl}/maigc/api/starlink/query?genId=${input.genId}`;

    // 2.5 超时检查（移到 provider 解析之后，确保能创建调试记录）
    if (job.createdAt && now - job.createdAt > QUERY_TIMEOUT_MS) {
      const timeoutRecord = createLlmDebugRecord(ctx, {
        routeKey: parentRouteKey,
        businessContext: "图片项目 Step4 长图生成(查询)",
        requestId: pairId ?? undefined,
        projectId: input.projectId,
        userId: job.userId,
        asyncJobId: job.id,
        messages: [{ role: "prompt", content: `query genId=${input.genId} (第${pollCount}次轮询, timeout)` }],
        provider,
        actualEndpoint: queryEndpoint,
      });
      if (timeoutRecord) {
        finalizeLlmDebugRecordError(ctx, {
          auditId: timeoutRecord.auditId,
          startedAt: timeoutRecord.startedAt,
          errorCode: "LONG_IMAGE_QUERY_TIMEOUT",
          errorMessage: `长图生成超时（${QUERY_TIMEOUT_MS / 1000}s）`,
        });
      }
      throw new AppError(502, "LONG_IMAGE_QUERY_TIMEOUT", `长图生成超时（${QUERY_TIMEOUT_MS / 1000}s）`);
    }

    // 3. 发起查询前创建审计记录（发起时创建，返回时更新，保证及时性）
    queryDebugRecord = createLlmDebugRecord(ctx, {
      routeKey: parentRouteKey,
      businessContext: "图片项目 Step4 长图生成(查询)",
      requestId: pairId ?? undefined,
      projectId: input.projectId,
      userId: job.userId,
      asyncJobId: job.id,
      messages: [{ role: "prompt", content: `query genId=${input.genId} (第${pollCount}次轮询)` }],
      provider,
      actualEndpoint: queryEndpoint,
    });

    // 4. 查询任务状态
    const queryResult = await pollWanxiangTaskResult(provider, input.genId);

    // 5. pending/running → 更新心跳 + poll 计数，finalize 审计记录
    if (queryResult.status === "pending" || queryResult.status === "running") {
      await ctx.repos.asyncJobs.updateHeartbeatWithResult(job.id, now, { pollCount });
      if (queryDebugRecord) {
        finalizeLlmDebugRecordSuccess(ctx, {
          auditId: queryDebugRecord.auditId,
          startedAt: queryDebugRecord.startedAt,
          actualModel: provider.model,
          responseText: `${queryResult.status} 第${pollCount}次轮询，等待下次查询`,
          actualEndpoint: queryResult.actualEndpoint ?? queryEndpoint,
        });
      }
      log.info({ jobId: job.id, genId: input.genId, status: queryResult.status, pollCount }, "长图生成 pending，等待下次查询");
      return;
    }

    // 6. 处理终态结果
    if (queryResult.status === "succeeded") {
      if (!queryResult.imageUrl) {
        throw new AppError(502, "LONG_IMAGE_NO_URL", "长图生成成功但未返回图片地址");
      }
      log.info({ jobId: job.id, imageUrl: queryResult.imageUrl.slice(0, 100) }, "长图生成完成");

      // 转存图片到 OSS（无损 WebP，不缩尺寸，避免长图变模糊）
      const ossUrl = await persistImageSourceToStorage(ctx, queryResult.imageUrl, "media/step4-long-image", {
        persistRemote: true,
        optimizeFormat: ImageFormat.WEBP,
        optimizeQuality: 100,
        optimizeMaxLongEdge: 99999, // 不限制尺寸，保留原始分辨率
      });
      log.info({ jobId: job.id, ossUrl: ossUrl.slice(0, 100) }, "长图已转存到 OSS");

      // 解析 Sketch 下载地址（download_sketch 是 SPA 页面，需调用 mixo API 获取真实 ossUrl）
      // 然后下载 Sketch 文件并转存到我们的 OSS
      // Sketch 生成可能比长图慢，需要重试
      let sketchOssUrl: string | null = null;
      log.info({ jobId: job.id, sketchUrl: queryResult.sketchUrl?.slice(0, 100) }, "准备解析 Sketch URL");
      if (queryResult.sketchUrl) {
        const sketchId = extractSketchId(queryResult.sketchUrl);
        log.info({ jobId: job.id, sketchId }, "提取到 Sketch ID");
        if (sketchId) {
          // 最多重试 3 次，每次间隔 5 秒（Sketch 文件可能还在生成中）
          const maxRetries = 3;
          const retryDelayMs = 5_000;
          let externalSketchUrl: string | null = null;

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              externalSketchUrl = await resolveSketchOssUrl(sketchId);
              if (externalSketchUrl) {
                log.info({ jobId: job.id, attempt, externalSketchUrl: externalSketchUrl.slice(0, 100) }, "Sketch 外部 URL 解析成功");
                break;
              }
              log.info({ jobId: job.id, attempt, maxRetries }, "Sketch OSS 地址未就绪，等待重试");
            } catch (e) {
              log.warn({ jobId: job.id, attempt, error: e instanceof Error ? e.message : String(e) }, "Sketch URL 解析异常");
            }
            if (attempt < maxRetries) {
              await new Promise((r) => setTimeout(r, retryDelayMs));
            }
          }

          // 下载 Sketch 文件并转存到我们的 OSS
          if (externalSketchUrl && ctx.storage) {
            try {
              const sketchResponse = await fetch(externalSketchUrl);
              if (sketchResponse.ok) {
                const sketchBuffer = Buffer.from(await sketchResponse.arrayBuffer());
                const sketchHash = createHash("sha256").update(sketchBuffer).digest("hex");
                const sketchKey = `media/step4-sketch/${sketchHash.slice(0, 2)}/${sketchHash}.sketch`;
                await ctx.storage.putObject(sketchKey, sketchBuffer, "application/zip");
                sketchOssUrl = await ctx.storage.getSignedUrl(sketchKey);
                if (sketchOssUrl) {
                  log.info({ jobId: job.id, sketchOssUrl: sketchOssUrl.slice(0, 100) }, "Sketch 文件已转存到 OSS");
                }
              } else {
                log.warn({ jobId: job.id, status: sketchResponse.status }, "Sketch 文件下载失败");
              }
            } catch (e) {
              log.warn({ jobId: job.id, sketchId, error: e instanceof Error ? e.message : String(e) }, "Sketch 下载/转存失败");
            }
          } else if (!externalSketchUrl) {
            log.warn({ jobId: job.id, sketchId, maxRetries }, "Sketch OSS 地址重试耗尽，放弃转存");
          }
        }
      }

      // 写入长图历史记录（用万相 genId 作为唯一标识，防止重复执行写入多条记录）
      const historyId = `lg-${input.genId}`;
      await ctx.repos.longImageGeneration.upsert({
        id: historyId,
        projectId: input.projectId,
        templateId: input.templateId ?? null,
        templateName: input.templateName ?? null,
        imageUrl: ossUrl,
        sketchUrl: sketchOssUrl,
        isActive: true,
        createdAt: now,
      });
      await ctx.repos.longImageGeneration.activate(input.projectId, historyId);

      // 同步更新 ext 表（兼容分享页等旧逻辑）
      await ctx.repos.imageProjectExt.updateLongImage(input.projectId, ossUrl, sketchOssUrl);

      // Finalize Query 自己的调试气泡
      if (queryDebugRecord) {
        finalizeLlmDebugRecordSuccess(ctx, {
          auditId: queryDebugRecord.auditId,
          startedAt: queryDebugRecord.startedAt,
          actualModel: provider.model,
          responseText: [
            `长图生成成功 (第${pollCount}次轮询)`,
            `imageUrl=${queryResult.imageUrl.slice(0, 300)}`,
            queryResult.sketchUrl ? `sketchUrl=${queryResult.sketchUrl.slice(0, 200)}` : null,
          ].filter(Boolean).join("; "),
          actualEndpoint: queryResult.actualEndpoint ?? queryEndpoint,
        });
      }

      // Finalize Query 任务
      await finalizeAsyncJob(repos, job.id, "completed", {
        imageUrl: ossUrl,
        sketchUrl: sketchOssUrl ?? queryResult.sketchUrl ?? null,
      }, null, now, dispatcher);

      if (job.parentJobId) {
        await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, now);
      }
      return;
    }

    if (queryResult.status === "failed") {
      log.warn({ jobId: job.id, error: queryResult.error }, "长图生成失败");
      throw new AppError(502, "LONG_IMAGE_QUERY_FAILED", queryResult.error ?? "长图生成任务失败");
    }

    // 未知状态兜底（防止静默返回导致 job 永远卡 running）
    throw new AppError(502, "UNKNOWN_QUERY_STATUS", `未知的查询状态: ${queryResult.status}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ jobId: job.id, genId: input.genId, error: errorMessage }, "长图生成 Query 失败");

    if (queryDebugRecord) {
      const errorCode = error instanceof AppError ? (error.code ?? "LONG_IMAGE_QUERY_ERROR") : "LONG_IMAGE_QUERY_ERROR";
      finalizeLlmDebugRecordError(ctx, {
        auditId: queryDebugRecord.auditId,
        startedAt: queryDebugRecord.startedAt,
        errorCode,
        errorMessage: queryEndpoint ? `${errorMessage} (queryEndpoint=${queryEndpoint})` : errorMessage,
        actualEndpoint: queryEndpoint,
      });
    }

    await finalizeAsyncJob(repos, job.id, "failed", null, {
      code: "LONG_IMAGE_QUERY_ERROR",
      message: errorMessage,
    }, now, dispatcher);

    if (job.parentJobId) {
      await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, now);
    }
  }
}
