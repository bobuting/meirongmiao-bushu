/**
 * 裂变分镜提示词生成执行器
 *
 * 负责处理 step6_fission_shot_prompts job（once 模式，单次执行）：
 * - 阶段1：生成 FISSION 专业提示词（依赖 new_story 完成）
 * - 阶段2：批量创建所有下游任务（image → video_submit → combination）
 * - 完成后由 QueueDispatcher 自动 promote image 任务
 */

import type { Pool } from "pg";
import type { AppContext } from "../../core/app-context.js";
import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import type { User } from "../../contracts/types.js";
import { getLogger } from "../../core/logger/index.js";
import { SHOT_PROMPTS_TYPE } from "../../contracts/shot-prompts-contract.js";
import { FissionVideoStatusService, createFissionTaskItemsService } from "../../service/services-sub.js";
import { getShotPromptsService, buildEnhancedVideoPrompt } from "../../services/shot-prompts-service.js";
import { getScriptsDataDbService } from "../../service/scripts-data-db-service.js";
import { PgShotBreakdownRepository } from "../../repositories/pg/shot-breakdown-pg-repository.js";
import type {
  FissionShotPromptsJobInput,
  FissionItemImageJobInput,
  FissionItemVideoJobInput,
  FissionCombinationJobInput,
} from "./fission-job-service.js";
import { FISSION_ITEM_IMAGE_JOB_TYPE, FISSION_ITEM_VIDEO_SUBMIT_JOB_TYPE, FISSION_COMBINATION_JOB_TYPE } from "./fission-job-service.js";
import type { FissionTaskType } from "../../repositories/pg/fission-task-item-pg-repository.js";
import { getAsyncJob, finalizeAsyncJob, checkAndFinalizeParent, createAsyncJob } from "../../service/async-job-service.js";
import type { QueueDispatcher } from "../queue-dispatcher.js";
import { randomUUID } from "node:crypto";

const logger = getLogger("fission-shot-prompts-executor");

/** 提示词解析结果 */
interface ResolvedShotPrompt {
  videoPrompt: string;
  keyframePrompt: string;
}

let _instance: FissionShotPromptsExecutor | null = null;
export function registerFissionShotPromptsExecutor(e: FissionShotPromptsExecutor): void { _instance = e; }
export function getFissionShotPromptsExecutor(): FissionShotPromptsExecutor | null { return _instance; }

export class FissionShotPromptsExecutor {
  private readonly pool: Pool;
  private readonly repos: PgRepositoryCollection;
  private readonly log = getLogger("fission-shot-prompts-executor");
  private readonly statusService: FissionVideoStatusService;
  private readonly taskItemsService;

  constructor(
    private readonly ctx: AppContext,
    private readonly dispatcher?: QueueDispatcher,
  ) {
    this.pool = ctx.pool;
    this.repos = ctx.repos as PgRepositoryCollection;
    this.statusService = new FissionVideoStatusService(ctx.repos);
    this.taskItemsService = createFissionTaskItemsService(ctx.repos, this.statusService, ctx.businessConfigService);
  }

  /** 执行提示词生成 + 下游任务创建（once 模式，单次执行完毕） */
  async execute(user: User, projectId: string, jobId: string): Promise<void> {
    const now = Date.now();

    const job = await getAsyncJob(this.ctx.repos, jobId, () => now);
    if (!job || job.status !== "running") return;

    const input = JSON.parse(job.input) as FissionShotPromptsJobInput;

    try {
      // 阶段1：生成 FISSION 专业提示词
      await this.generateShotPrompts(user, projectId, input);

      // 阶段2：创建所有下游任务（image → video_submit → combination）
      const childJobIds = await this.createDownstreamTasks(user, projectId, input, now);

      // finalize shot_prompts
      await finalizeAsyncJob(this.ctx.repos, jobId, "completed", { childJobIds }, null, now, this.dispatcher);
      this.log.info({ jobId, childCount: childJobIds.length }, "shot_prompts 完成，下游任务已创建");

      // promote image 任务 + 检查父任务
      if (this.dispatcher) {
        await this.dispatcher.tryPromote();
      }
      if (job.parentJobId && this.dispatcher) {
        await checkAndFinalizeParent(this.ctx.repos, job.parentJobId, this.dispatcher, now);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log.error({ err: error, jobId, projectId }, "shot_prompts 执行失败");
      await this.statusService.updateAsyncStatus(projectId, {
        shotPromptsAsyncStatus: "failed", asyncFailedStage: "shot_prompts", asyncErrorMessage: errorMsg,
      });
      await finalizeAsyncJob(this.ctx.repos, jobId, "failed", { errorMessage: errorMsg }, { code: "SHOT_PROMPTS_FAILED", message: errorMsg }, now, this.dispatcher);
      if (job.parentJobId && this.dispatcher) {
        await checkAndFinalizeParent(this.ctx.repos, job.parentJobId, this.dispatcher, now);
      }
    }
  }

  // ========== 阶段1：生成 FISSION 提示词 ==========

  private async generateShotPrompts(user: User, projectId: string, input: FissionShotPromptsJobInput): Promise<void> {
    // 原子 UPDATE：设置 shot_prompts 状态为 processing
    const updated = await this.ctx.repos.fissionVideoStatus.atomicSetShotPromptsProcessing(projectId, Date.now());

    if (!updated) {
      const statuses = await this.statusService.listByProject(projectId);
      const existingStatus = statuses[0];
      if (existingStatus?.shotPromptsAsyncStatus === "completed") {
        this.log.info({ projectId }, "专业提示词已完成，跳过生成");
        return;
      }
      throw new Error(`提示词状态不可重入: ${existingStatus?.shotPromptsAsyncStatus ?? "unknown"}`);
    }

    // 检查是否已有 fission 提示词（幂等）
    const shotPromptsService = getShotPromptsService(this.ctx);
    const existingPrompts = await shotPromptsService.getActive(projectId, SHOT_PROMPTS_TYPE.FISSION);
    if (existingPrompts?.shots?.length) {
      this.log.info({ projectId }, "专业提示词已存在，跳过生成");
      await this.statusService.updateAsyncStatus(projectId, { shotPromptsAsyncStatus: "completed" });
      return;
    }

    // 获取新故事脚本数据
    const statuses = await this.statusService.listByProject(projectId);
    const existingStatus = statuses[0];
    const newStoryScriptId = existingStatus?.newStoryScriptId;
    if (!newStoryScriptId) throw new Error("新故事脚本ID缺失（newStoryScriptId），无法生成提示词");

    const scriptsDbService = getScriptsDataDbService(this.ctx.repos);
    const scriptDataRecord = await scriptsDbService.getById(newStoryScriptId);
    if (!scriptDataRecord) throw new Error("新故事脚本数据缺失（nrm_scripts_data 表无数据）");

    const shotBreakdownRepo = new PgShotBreakdownRepository(this.pool);
    const shotBreakdownRecords = await shotBreakdownRepo.findByScriptDataId(newStoryScriptId);
    if (!shotBreakdownRecords?.length) throw new Error("新故事分镜数据缺失（shot_breakdown 表无数据）");

    // 构建 shot_breakdown 结构
    const shotBreakdown = shotBreakdownRecords.map(r => ({
      shot_id: r.shotIndex,
      shot_type: r.shotType ?? undefined,
      shot_description: r.shotDescription ?? undefined,
      camera_movement: r.cameraMovement ?? undefined,
      timecode: r.timecodeStart || r.timecodeEnd || r.durationSeconds
        ? { start: r.timecodeStart ?? undefined, end: r.timecodeEnd ?? undefined, duration_seconds: r.durationSeconds ?? undefined }
        : undefined,
      visual: r.visualJson ?? undefined,
      subjects: r.subjectsJson ?? undefined,
      audio: r.audioJson ?? undefined,
    }));

    const shotPromptsRequest = {
      projectId,
      scriptDataId: newStoryScriptId,
      segments: shotBreakdown.map((shot, idx) => ({
        title: `分镜 ${shot.shot_id || idx + 1}`,
        content: shot.shot_description ?? "",
      })),
      aspectRatio: "9:16" as const,
      temperature: 0.9,
    };

    await shotPromptsService.generateAndSave(shotPromptsRequest, SHOT_PROMPTS_TYPE.FISSION, user.id);

    await this.statusService.updateAsyncStatus(projectId, { shotPromptsAsyncStatus: "completed" });
    this.log.info({ projectId }, "专业提示词生成完成");
  }

  // ========== 阶段2：创建下游任务 ==========

  private async createDownstreamTasks(
    user: User, projectId: string, input: FissionShotPromptsJobInput, now: number,
  ): Promise<string[]> {
    const fc = await this.buildFissionContext(projectId);
    const prompts = await this.resolveShotPrompts(projectId);

    if (!prompts) throw new Error("未找到 FISSION 提示词，无法创建下游任务");

    const childJobIds: string[] = [];
    const videoSubmitJobIds: string[] = [];
    const parentJobId = input.parentJobId;

    // 获取所有 task items
    const imageVideoItems = await this.taskItemsService.getItemsByType(input.fissionVideoStatusId, "image_video");
    const newStoryItems = await this.taskItemsService.getItemsByType(input.fissionVideoStatusId, "new_story");

    // B 类（image_video）items
    for (const item of imageVideoItems) {
      const ids = await this.createItemJobs(user, projectId, parentJobId, input.fissionVideoStatusId, item, "image_video", prompts, fc, now);
      childJobIds.push(...ids.jobIds);
      videoSubmitJobIds.push(...ids.videoSubmitIds);
    }

    // C 类（new_story）items
    for (const item of newStoryItems) {
      const ids = await this.createItemJobs(user, projectId, parentJobId, input.fissionVideoStatusId, item, "new_story", prompts, fc, now);
      childJobIds.push(...ids.jobIds);
      videoSubmitJobIds.push(...ids.videoSubmitIds);
    }

    // 创建 combination job（fission_parent 的子任务，depends_on 所有 video_submit）
    await this.createCombinationJob(user, projectId, input, videoSubmitJobIds, now);
    this.log.info({ imageCount: childJobIds.length - videoSubmitJobIds.length, videoCount: videoSubmitJobIds.length, parentJobId }, "下游任务创建完成");

    return childJobIds;
  }

  /** 为单个 item 创建 image + video_submit job */
  private async createItemJobs(
    user: User, projectId: string, parentJobId: string,
    fissionVideoStatusId: string,
    item: { itemIndex: number; imageStatus: string; videoStatus: string; imageUrl: string | null; videoUrl: string | null },
    taskType: FissionTaskType,
    prompts: Map<number, ResolvedShotPrompt>,
    fc: { characterImageUrl: string | null; outfitImageUrl: string | null },
    now: number,
  ): Promise<{ jobIds: string[]; videoSubmitIds: string[] }> {
    const prompt = prompts.get(item.itemIndex);
    if (!prompt) return { jobIds: [], videoSubmitIds: [] };

    const jobIds: string[] = [];
    const videoSubmitIds: string[] = [];

    const imageCompleted = item.imageStatus === "completed" && item.imageUrl;
    const videoCompleted = item.videoStatus === "completed" && item.videoUrl;

    // 都已完成则跳过
    if (imageCompleted && videoCompleted) return { jobIds: [], videoSubmitIds: [] };

    // 创建 image job（除非图片已完成）
    let imageJobId: string | undefined;
    if (!imageCompleted) {
      imageJobId = randomUUID();
      const imageInput: FissionItemImageJobInput = {
        fissionVideoStatusId, projectId,
        itemIndex: item.itemIndex, taskType,
        keyframePrompt: prompt.keyframePrompt,
        characterImageUrl: fc.characterImageUrl,
        outfitImageUrl: fc.outfitImageUrl,
        parentJobId,
      };
      await createAsyncJob(this.repos, {
        id: imageJobId, userId: user.id,
        jobType: FISSION_ITEM_IMAGE_JOB_TYPE,
        projectId, input: JSON.stringify(imageInput), now,
        parentJobId, initialStatus: "pending",
      });
      jobIds.push(imageJobId);
    }

    // 创建 video_submit job（除非视频已完成）
    if (!videoCompleted) {
      const videoJobId = randomUUID();
      const videoInput: FissionItemVideoJobInput = {
        fissionVideoStatusId, projectId,
        itemIndex: item.itemIndex, taskType,
        videoPrompt: prompt.videoPrompt,
        characterImageUrl: fc.characterImageUrl,
        outfitImageUrl: fc.outfitImageUrl,
        parentJobId,
      };
      await createAsyncJob(this.repos, {
        id: videoJobId, userId: user.id,
        jobType: FISSION_ITEM_VIDEO_SUBMIT_JOB_TYPE,
        projectId, input: JSON.stringify(videoInput), now,
        parentJobId,
        dependsOn: imageJobId ? [imageJobId] : undefined,
        initialStatus: "pending",
      });
      jobIds.push(videoJobId);
      videoSubmitIds.push(videoJobId);
    }

    return { jobIds, videoSubmitIds };
  }

  /** 创建 combination job（fission_parent 的子任务，depends_on 所有 video_submit） */
  private async createCombinationJob(
    user: { id: string }, projectId: string, input: FissionShotPromptsJobInput,
    videoSubmitJobIds: string[], now: number,
  ): Promise<void> {
    const statusList = await this.statusService.listByProject(projectId);
    const fissionCount = statusList[0]?.fissionCount ?? 3;

    const combinationInput: FissionCombinationJobInput = {
      fissionVideoStatusId: input.fissionVideoStatusId,
      projectId,
      fissionCount,
      parentJobId: input.parentJobId,
    };

    const combinationJobId = randomUUID();
    await createAsyncJob(this.repos, {
      id: combinationJobId, userId: user.id,
      jobType: FISSION_COMBINATION_JOB_TYPE,
      projectId, input: JSON.stringify(combinationInput), now,
      parentJobId: input.parentJobId,
      dependsOn: videoSubmitJobIds.length > 0 ? videoSubmitJobIds : undefined,
      initialStatus: "pending",
    });

    this.log.info({ combinationJobId, dependsOn: videoSubmitJobIds.length }, "combination job 已创建");
  }

  // ========== 工具方法 ==========

  private async resolveShotPrompts(projectId: string): Promise<Map<number, ResolvedShotPrompt> | null> {
    const service = getShotPromptsService(this.ctx);
    const record = await service.getActive(projectId, SHOT_PROMPTS_TYPE.FISSION);
    if (!record?.shots?.length) return null;

    const map = new Map<number, ResolvedShotPrompt>();
    for (const shot of record.shots as Array<{ shot_id: number; video_prompt?: { prompt: string; camera_motion?: string; camera_motion_detail?: string; motion_intensity?: string; negative_prompt?: string }; keyframe_prompt?: { prompt: string } }>) {
      const videoPrompt = shot.video_prompt ? buildEnhancedVideoPrompt(shot.video_prompt) : undefined;
      const keyframePrompt = shot.keyframe_prompt?.prompt;
      if (videoPrompt && keyframePrompt) {
        map.set(shot.shot_id, { videoPrompt, keyframePrompt });
      }
    }
    return map;
  }

  private async buildFissionContext(projectId: string) {
    const pc = await this.ctx.projectContextService.getProjectContext(projectId, {
      includeCharacterFiveView: true, includeGarmentImages: true,
    });
    return {
      characterImageUrl: pc.character?.fiveViewOssImageUrl ?? null,
      characterName: pc.character?.name ?? null,
      outfitImageUrl: pc.garments?.[0]?.mainImageUrl || null,
      characterDescription: pc.characterDescription,
      clothingStyles: pc.clothingStyles,
      outfitDescription: pc.outfitDescription,
      characterGender: pc.selectedRoleDirection?.gender?.toString() ?? pc.character?.gender ?? null,
      characterAge: pc.selectedRoleDirection?.age?.toString() ?? pc.character?.age ?? null,
      characterStyle: pc.selectedRoleDirection?.styleWords?.join("、") ?? pc.character?.style ?? null,
      outfitStyleName: pc.selectedOutfit?.styleName ?? null,
    };
  }
}
