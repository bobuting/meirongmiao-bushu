/**
 * Step4 长图生成 Submit 执行器（图片项目，万相营造商详长图 API）
 *
 * Submit 任务：提交长图生成 → 创建 Query 子任务 → 保持 running 等待 Query 完成
 * 数据来源：executor 自行从数据库查询，不依赖 job input 中的业务数据。
 */

import type { AppContext } from "../../core/app-context.js";
import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import type { AsyncJobRecord } from "../../service/async-job-service.js";
import type { QueueDispatcher } from "../../modules/queue-dispatcher.js";
import { getLogger } from "../../core/logger/index.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";
import { resolveRouteProvider } from "../../services/llm/provider-resolver.js";
import { submitWanxiangLongImage } from "../../services/media/alicloud-market-provider.js";
import { AppError } from "../../core/errors.js";
import {
  finalizeAsyncJob,
  updateAsyncJobStage,
  checkAndFinalizeParent,
  createAsyncJob,
} from "../../service/async-job-service.js";
import {
  createLlmDebugRecord,
  finalizeLlmDebugRecordSuccess,
  finalizeLlmDebugRecordError,
} from "../../services/llm/llm-debug-recorder.js";

const log = getLogger("step4-long-image-submit-executor");

/** Submit 任务输入 */
export interface LongImageSubmitJobInput {
  projectId: string;
  /** 用户选择的模板 ID（可选，不传则 AI 自动选择） */
  templateId?: string;
  /** 模板名称 */
  templateName?: string;
}

/** Submit 任务结果（传递给 Query 子任务） */
export interface LongImageSubmitJobResult {
  genId: string;
  routeKey: string;
  /** 调试气泡 auditId（用于 Query 完成/失败时更新气泡状态） */
  debugAuditId?: string;
  debugStartedAt?: number;
  /** 配对标识（Submit + Query 共享，用于调试气泡配对展示） */
  pairId?: string;
}

/** 构建 Query 子任务 ID */
export function buildLongImageQueryJobId(submitJobId: string): string {
  return `${submitJobId}-query`;
}

/**
 * 执行 image_step4_long_image_submit 任务
 */
export async function executeLongImageSubmitJob(
  ctx: AppContext,
  repos: PgRepositoryCollection,
  job: AsyncJobRecord,
  dispatcher: QueueDispatcher,
): Promise<void> {
  const now = ctx.clock.now();
  const input = JSON.parse(job.input) as LongImageSubmitJobInput;

  log.info({ jobId: job.id, projectId: input.projectId }, "长图生成 Submit 开始");

  let debugRecord: { auditId: string; startedAt: number } | null = null;
  let freezeId: string | null = null;
  // 配对标识：Submit 和 Query 共享，用于调试气泡配对展示
  const pairId = `pair-${job.id}`;

  try {
    // 1. 获取项目信息
    const project = await ctx.repos.projects.findById(input.projectId);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", `项目 ${input.projectId} 不存在`);
    }

    // 2. 收集产品图片、标题和卖点文本
    const { itemTitle, introduction, images, imageWhitebg } = await collectProductData(ctx, input.projectId, project.name);

    // 3. 解析 Provider
    const routeKey = ProviderRouteKeys.IMAGE_PROJECT_STEP4_LONG_IMAGE;
    const provider = await resolveRouteProvider(ctx, routeKey);
    if (!provider) {
      throw new AppError(503, "PROVIDER_POLICY_MISSING", `${routeKey} provider 未配置`);
    }

    // 4. 冻结积分
    const creditCost = await ctx.creditPricingService.getCost(routeKey);
    if (creditCost > 0) {
      freezeId = await ctx.creditService.freeze(job.userId, creditCost, {
        routeKey,
        operation: "image_step4_long_image",
        projectId: input.projectId,
      });
    }

    // 5. 提交前创建审计记录（发起时创建，返回时更新，保证及时性）
    const auditRequestBody: Record<string, unknown> = { introduction, images };
    if (itemTitle) auditRequestBody.item_title = itemTitle;
    if (input.templateId) auditRequestBody.template_id = input.templateId;
    if (imageWhitebg) auditRequestBody.image_whitebg = imageWhitebg;
    debugRecord = createLlmDebugRecord(ctx, {
      routeKey,
      businessContext: "图片项目 Step4 长图生成(提交)",
      requestId: pairId,
      projectId: input.projectId,
      userId: job.userId,
      asyncJobId: job.id,
      messages: [
        { role: "prompt", content: `${itemTitle}: ${introduction}` },
        { role: "reference_images", content: images.join("\n") },
      ],
      provider,
      hasMedia: images.length > 0 ? "image" : null,
      requestHeadersJson: JSON.stringify({
        Authorization: "APPCODE ***",
        "Content-Type": "application/json",
      }),
      requestBodyJson: JSON.stringify(auditRequestBody),
    });

    // 6. 提交万相营造 API
    const submitResult = await submitWanxiangLongImage(provider, {
      itemTitle,
      introduction,
      images,
      templateId: input.templateId,
      imageWhitebg,
    });

    // 7. 扣减冻结积分
    if (freezeId) {
      try {
        await ctx.creditService.deductFrozen(job.userId, freezeId, creditCost);
      } catch {
        log.warn({ jobId: job.id, freezeId }, "冻结积分扣减失败（长图已提交）");
      }
    }

    // 提交成功，finalize 调试气泡
    finalizeLlmDebugRecordSuccess(ctx, {
      auditId: debugRecord.auditId,
      startedAt: debugRecord.startedAt,
      actualModel: provider.model,
      responseText: `异步提交成功; genId=${submitResult.genId}`,
      actualEndpoint: submitResult.actualEndpoint,
    });

    // 8. 创建 Query 子任务
    const queryJobId = buildLongImageQueryJobId(job.id);
    await createAsyncJob(repos, {
      id: queryJobId,
      userId: job.userId,
      jobType: "image_step4_long_image_query",
      projectId: input.projectId,
      input: JSON.stringify({
        projectId: input.projectId,
        parentJobId: job.id,
        genId: submitResult.genId,
        templateId: input.templateId ?? null,
        templateName: input.templateName ?? null,
      }),
      now,
      parentJobId: job.id,
      initialStatus: "pending",
      executionMode: "poll",
    }, ctx.globalTaskConcurrencyService);

    // 保存 submit 结果（包含调试信息供 Query executor 使用）
    const submitJobResult: LongImageSubmitJobResult = {
      genId: submitResult.genId,
      routeKey,
      debugAuditId: debugRecord?.auditId,
      debugStartedAt: debugRecord?.startedAt,
      pairId,
    };
    await updateAsyncJobStage(repos, job.id, "生成中", now, submitJobResult as unknown as Record<string, unknown>);

    await dispatcher.tryPromote();
    log.info({ jobId: job.id, queryJobId, genId: submitResult.genId }, "长图生成 Query 任务创建成功");

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ jobId: job.id, projectId: input.projectId, error: errorMessage }, "长图生成 Submit 失败");

    if (freezeId) {
      await ctx.creditService.unfreeze(job.userId, freezeId).catch((e) => {
        log.error({ userId: job.userId, freezeId, error: e instanceof Error ? e.message : String(e) }, "积分解冻失败");
      });
    }

    if (debugRecord) {
      const errorCode = error instanceof AppError ? (error.code ?? "LONG_IMAGE_SUBMIT_ERROR") : "LONG_IMAGE_SUBMIT_ERROR";
      finalizeLlmDebugRecordError(ctx, {
        auditId: debugRecord.auditId,
        startedAt: debugRecord.startedAt,
        errorCode,
        errorMessage,
      });
    }

    await finalizeAsyncJob(repos, job.id, "failed", null, {
      code: "LONG_IMAGE_SUBMIT_ERROR",
      message: errorMessage,
    }, now, dispatcher);

    if (job.parentJobId) {
      await checkAndFinalizeParent(repos, job.parentJobId, dispatcher, now);
    }
  }
}

/** 收集产品数据：标题、描述、图片、白底图 */
async function collectProductData(
  ctx: AppContext,
  projectId: string,
  projectName: string,
): Promise<{ itemTitle: string; introduction: string; images: string[]; imageWhitebg?: string }> {
  const imageList: string[] = [];
  const textParts: string[] = [];
  const titleParts: string[] = [];
  let whitebgUrl: string | undefined;

  // 收集服饰平铺图和卖点
  const garmentAssocs = await ctx.repos.projectGarmentAssocs.findByProjectId(projectId);
  const garmentAssetIds = garmentAssocs.map((a) => a.garmentAssetId);
  const garmentAssets = garmentAssetIds.length > 0
    ? await ctx.repos.garmentAssets.findByIds(garmentAssetIds)
    : [];

  for (const asset of garmentAssets) {
    if (asset.flatLayImageUrl) {
      // 取第一张平铺图作为白底图（平铺图通常为白底，可显著提升 API 输出效果）
      // 作为白底图的平铺图不再放入 images 数组，避免重复占用图片位
      if (!whitebgUrl) {
        whitebgUrl = asset.flatLayImageUrl;
      } else {
        imageList.push(asset.flatLayImageUrl);
      }
    }
    if (asset.sellingPoints?.length) {
      textParts.push(...asset.sellingPoints.map((s) => s.point));
      titleParts.push(...asset.sellingPoints.slice(0, 3).map((s) => s.point));
    }
    if (asset.description) textParts.push(asset.description);
    if (asset.name) titleParts.push(asset.name);
  }

  // 收集模特图
  const modelPhotos = await ctx.repos.modelPhotos.findByProjectId(projectId);
  for (const photo of modelPhotos) {
    if (photo.imageUrl && photo.isSelected) imageList.push(photo.imageUrl);
  }

  if (imageList.length === 0) {
    throw new AppError(400, "NO_PRODUCT_IMAGES", "请先上传产品图片（服饰平铺图或模特图）");
  }

  // 优先用服饰卖点/名称拼接标题，比系统默认项目名更有意义
  const itemTitle = titleParts.length > 0
    ? titleParts.slice(0, 4).join(" ")
    : projectName || "电商产品";

  const rawIntroduction = textParts.join("；") || "电商产品详情展示，品质保证，值得信赖";
  // API 要求 introduction 最少 50 字符、最多 1000 字符
  let introduction = rawIntroduction.length < 50
    ? `${rawIntroduction}，品质优良，值得信赖，详情请看图片展示，欢迎选购`
    : rawIntroduction;
  if (introduction.length > 1000) {
    introduction = introduction.slice(0, 997) + "...";
  }

  return {
    itemTitle,
    introduction,
    images: imageList.slice(0, 10),
    imageWhitebg: whitebgUrl,
  };
}
