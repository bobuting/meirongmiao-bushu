/**
 * 裂变分镜图片生成执行器
 *
 * 负责处理 step6_fission_item_image job：
 * - 接收 image job
 * - 调用 LLM 图片生成
 * - 上传到 OSS
 * - finalize 时更新 task_items 表
 * - QueueDispatcher 会自动 promote 对应的 video job（dependsOn 机制）
 */

import type { AppContext } from "../../core/app-context.js";
import type { User } from "../../contracts/types.js";
import type { IObjectStorageAdapter } from "../../contracts/object-storage.js";
import type { ResolvedRouteProvider } from "../../contracts/provider-route-contract.js";
import type { FissionTaskItemRecord, FissionTaskType } from "../../repositories/pg/fission-task-item-pg-repository.js";
import { getLogger } from "../../core/logger/index.js";
import { ProviderRouteKeys, selectRouteKeyByAge } from "../../contracts/provider-route-keys.js";
import { FissionVideoStatusService, createFissionTaskItemsService } from "../../service/services-sub.js";
import { resolveRouteProvider } from "../../services/llm/provider-resolver.js";
import { requestLlmImageGenerationUrls } from "../../services/media/image-generation-providers.js";
import { getAsyncJob, finalizeAsyncJob, updateAsyncJobResult, checkAndFinalizeParent } from "../../service/async-job-service.js";
import { getStorageAdapter } from "./fission-storage-service.js";
import type { FissionItemImageJobInput, FissionItemImageJobResult } from "./fission-job-service.js";
import type { QueueDispatcher } from "../queue-dispatcher.js";
import { createHash } from "node:crypto";
import { optimizeImageBuffer } from "../../services/media/storage-persist.js";

const logger = getLogger("fission-item-image-executor");

/** 图片生成执行器单例 */
let _imageExecutor: FissionItemImageExecutor | null = null;
export function registerFissionItemImageExecutor(e: FissionItemImageExecutor): void { _imageExecutor = e; }
export function getFissionItemImageExecutor(): FissionItemImageExecutor | null { return _imageExecutor; }

/**
 * 分镜图片生成执行器
 */
export class FissionItemImageExecutor {
  private readonly pool;
  private readonly log = getLogger("fission-item-image-executor");
  private readonly taskItemsService;
  private readonly statusService: FissionVideoStatusService;

  constructor(
    private readonly ctx: AppContext,
    private readonly dispatcher?: QueueDispatcher,
  ) {
    this.pool = ctx.pool;
    this.statusService = new FissionVideoStatusService(ctx.repos);
    this.taskItemsService = createFissionTaskItemsService(ctx.repos, this.statusService, ctx.businessConfigService);
  }

  /**
   * 推进图片生成任务（每次 tick 调用）
   * QueueDispatcher 已在 tryPromote 中获取 advisory lock，executor 无需重复获取
   */
  async advanceOnce(user: User, projectId: string, jobId: string): Promise<void> {
    const now = Date.now();

    const job = await getAsyncJob(this.ctx.repos, jobId, () => now);
    if (!job || job.status !== "running") return;

      const input = JSON.parse(job.input) as FissionItemImageJobInput;
      const result: FissionItemImageJobResult = (job.result as unknown as FissionItemImageJobResult) || {
        imageUrl: null,
        imagePath: null,
      };

      // 已完成：直接 finalize
      if (result.imageUrl) {
        await finalizeAsyncJob(this.ctx.repos, jobId, "completed", result, null, now, this.dispatcher);
        if (job.parentJobId && this.dispatcher) {
          await checkAndFinalizeParent(this.ctx.repos, job.parentJobId, this.dispatcher, now);
        }
        return;
      }

      // 执行图片生成
      try {
        const storage = getStorageAdapter(this.ctx.adminConfigService.get(), this.ctx.storage);
        if (!storage) {
          result.errorMessage = "存储服务不可用";
          await finalizeAsyncJob(this.ctx.repos, jobId, "failed", result, { code: "STORAGE_UNAVAILABLE", message: "存储服务不可用" }, now, this.dispatcher);
          // 【修复】失败时检查父任务是否需要自动完成
          if (job.parentJobId && this.dispatcher) {
            await checkAndFinalizeParent(this.ctx.repos, job.parentJobId, this.dispatcher, now);
          }
          return;
        }

        // 根据角色年龄选择图片生成 RouteKey
        const project = await this.ctx.repos.projects.findById(projectId);
        const age = project?.selectedRoleDirection?.age;
        const imageRouteKey = selectRouteKeyByAge(
          age != null ? Number(age) : null,
          ProviderRouteKeys.FISSION_STORYBOARD_IMAGE_CHILD,
          ProviderRouteKeys.FISSION_STORYBOARD_IMAGE_ADULT,
        );

        const imageProvider = await resolveRouteProvider(this.ctx, imageRouteKey);
        if (!imageProvider) {
          result.errorMessage = "图片生成模型未配置";
          await finalizeAsyncJob(this.ctx.repos, jobId, "failed", result, { code: "PROVIDER_NOT_CONFIGURED", message: "图片生成模型未配置" }, now, this.dispatcher);
          if (job.parentJobId && this.dispatcher) {
            await checkAndFinalizeParent(this.ctx.repos, job.parentJobId, this.dispatcher, now);
          }
          return;
        }

        // 参考图片
        const refImages = [input.characterImageUrl, input.outfitImageUrl].filter(Boolean) as string[];

        const imgResult = await requestLlmImageGenerationUrls(imageProvider, input.keyframePrompt, {
          mode: refImages.length ? "image_to_image" : "text_to_image",
          images: refImages.length ? refImages : undefined,
          ratio: "9:16",
          resolution: "1k",
          count: 1,
          temperature: 0.7,
          debugOptions: {
            ctx: this.ctx,
            routeKey: imageRouteKey,
            businessContext: `裂变分镜图片生成 (${input.taskType} #${input.itemIndex})`,
            projectId: projectId,
            userId: user.id,
          },
        });

        if (!imgResult.urls.length) {
          result.errorMessage = "图片生成失败";
          await finalizeAsyncJob(this.ctx.repos, jobId, "failed", result, { code: "IMAGE_GENERATION_FAILED", message: "图片生成失败" }, now, this.dispatcher);
          // 【修复】失败时检查父任务是否需要自动完成
          if (job.parentJobId && this.dispatcher) {
            await checkAndFinalizeParent(this.ctx.repos, job.parentJobId, this.dispatcher, now);
          }
          return;
        }

        // 上传到 OSS
        const filePrefix = input.taskType === "new_story" ? "ns-" : "scene-";
        const oss = await this.uploadSceneImage(imgResult.urls[0], storage, projectId, filePrefix + input.itemIndex);

        // 更新 task_items 表
        const items = await this.taskItemsService.getPendingItems(input.fissionVideoStatusId, input.taskType);
        const item = items.find(i => i.itemIndex === input.itemIndex);
        if (item) {
          await this.taskItemsService.updateImageStatus(item.id, input.fissionVideoStatusId, input.taskType, {
            imageUrl: oss.url,
            imagePath: oss.path,
            status: "completed",
          });
        }

        // finalize（QueueDispatcher 会自动 promote 对应的 video job）
        result.imageUrl = oss.url;
        result.imagePath = oss.path;
        await finalizeAsyncJob(this.ctx.repos, jobId, "completed", result, null, now, this.dispatcher);

        // 触发父任务检查（sgen 可能需要更新进度）
        if (job.parentJobId && this.dispatcher) {
          await this.dispatcher.tryPromote();
        }

        this.log.info({ jobId, itemIndex: input.itemIndex, taskType: input.taskType }, "分镜图片生成完成");
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.log.error({ jobId, error: errorMsg }, "分镜图片生成异常");
        result.errorMessage = errorMsg;
        await finalizeAsyncJob(this.ctx.repos, jobId, "failed", result, { code: "IMAGE_ERROR", message: errorMsg }, now, this.dispatcher);
        // 【修复】失败时检查父任务是否需要自动完成
        if (job.parentJobId && this.dispatcher) {
          await checkAndFinalizeParent(this.ctx.repos, job.parentJobId, this.dispatcher, now);
        }
      }
  }

  /** 上传图片到 OSS */
  private async uploadSceneImage(
    imageUrl: string,
    storage: IObjectStorageAdapter,
    projectId: string,
    fileName: string,
  ): Promise<{ url: string; path: string }> {
    const response = await fetch(imageUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    // 优化图片：限制尺寸 + 转换 JPEG 格式（Gemini 不支持 WebP）
    const { buffer: optimizedBuffer, contentType: optimizedContentType } = await optimizeImageBuffer(buffer);
    const digest = createHash("sha256").update(optimizedBuffer).digest("hex");
    const path = `media/sha256/${digest.slice(0, 2)}/${digest}.jpg`;
    await storage.putObject(path, new Uint8Array(optimizedBuffer), optimizedContentType);
    const url = storage.getPublicUrl(path);
    return { url, path };
  }
}