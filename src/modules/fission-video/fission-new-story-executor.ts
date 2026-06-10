/**
 * 裂变新故事生成执行器
 *
 * 负责处理 step6_fission_new_story job（once 模式，单次执行）：
 * - 从DDL列重建完整原视频脚本JSON
 * - 调用大模型在指定位置插入扩写分镜
 * - 存储新故事到 nrm_scripts_data (type=6)
 * - 完成后由 QueueDispatcher promote shot_prompts（depends_on 机制）
 */

import type { AppContext } from "../../core/app-context.js";
import type { User } from "../../contracts/types.js";
import { getLogger } from "../../core/logger/index.js";
import { FissionVideoStatusService } from "../../service/services-sub.js";
import { resolveRouteProvider } from "../../services/llm/provider-resolver.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";
import { getScriptsDataDbService, type InsertScriptDataItem, type VideoScriptPayload } from "../../service/scripts-data-db-service.js";
import { PgShotBreakdownRepository, type ShotBreakdownRaw } from "../../repositories/pg/shot-breakdown-pg-repository.js";
import { generateNewStory } from "./fission-story-generator.js";
import type { FissionNewStoryJobInput } from "./fission-job-service.js";
import { getAsyncJob, finalizeAsyncJob, checkAndFinalizeParent } from "../../service/async-job-service.js";
import type { QueueDispatcher } from "../queue-dispatcher.js";


let _instance: FissionNewStoryExecutor | null = null;
export function registerFissionNewStoryExecutor(e: FissionNewStoryExecutor): void { _instance = e; }
export function getFissionNewStoryExecutor(): FissionNewStoryExecutor | null { return _instance; }

export class FissionNewStoryExecutor {
  private readonly pool;
  private readonly log = getLogger("fission-new-story-executor");
  private readonly statusService: FissionVideoStatusService;

  constructor(
    private readonly ctx: AppContext,
    private readonly dispatcher?: QueueDispatcher,
  ) {
    this.pool = ctx.pool;
    this.statusService = new FissionVideoStatusService(ctx.repos);
  }

  /** 执行新故事生成（once 模式，单次执行完毕） */
  async execute(user: User, projectId: string, jobId: string): Promise<void> {
    const now = Date.now();

    const job = await getAsyncJob(this.ctx.repos, jobId, () => now);
    if (!job || job.status !== "running") return;

    const input = JSON.parse(job.input) as FissionNewStoryJobInput;

    try {
      await this.statusService.getOrCreateByProject(projectId, user.id);

      // 原子 UPDATE：设置 new_story 状态为 processing
      const updated = await this.ctx.repos.fissionVideoStatus.atomicSetNewStoryProcessing(projectId, Date.now());

      if (!updated) {
        const statuses = await this.statusService.listByProject(projectId);
        const existingStatus = statuses[0];
        if (existingStatus?.newStoryAsyncStatus === "completed") {
          this.log.info({ projectId }, "新故事已存在，直接完成");
          await finalizeAsyncJob(this.ctx.repos, jobId, "completed", {}, null, now, this.dispatcher);
          if (job.parentJobId && this.dispatcher) {
            await this.dispatcher.tryPromote();
          }
          return;
        }
        throw new Error(`新故事状态不可重入: ${existingStatus?.newStoryAsyncStatus ?? "unknown"}`);
      }

      // 获取已确认的脚本（完整JSON需从DDL列重建）
      const scriptService = getScriptsDataDbService(this.ctx.repos);
      const confirmedScript = await scriptService.getConfirmedScript(projectId);
      if (!confirmedScript) throw new Error("未找到已确认的脚本");

      // 从shot_breakdown表获取分镜数据
      const shotBreakdownRepo = new PgShotBreakdownRepository(this.pool);
      const shots = await shotBreakdownRepo.findByScriptDataId(confirmedScript.id);
      if (!shots.length) throw new Error("原脚本分镜数量为0");

      // 重建完整的VideoScriptPayload（DDL列 + shot_breakdown表）
      const originalScript: VideoScriptPayload = {
        video_info: confirmedScript.payload.video_info,
        video_analysis: confirmedScript.payload.video_analysis,
        editing_analysis: confirmedScript.payload.editing_analysis,
        shot_breakdown: shots.map(s => ({
          shot_id: s.shotIndex,
          shot_type: s.shotType ?? "中景",
          camera_movement: s.cameraMovement ?? "固定",
          shot_description: s.shotDescription ?? "",
          subjects: (s.subjectsJson ?? []) as ShotBreakdownRaw["subjects"],
          visual: s.visualJson ?? {},
          audio: s.audioJson ?? {},
          timecode: {
            start: s.timecodeStart ?? undefined,
            end: s.timecodeEnd ?? undefined,
            duration_seconds: s.durationSeconds ?? undefined,
          },
          transition_in: (s.transitionJson as Record<string, unknown> | null)?.in as ShotBreakdownRaw["transition_in"] ?? undefined,
          transition_out: (s.transitionJson as Record<string, unknown> | null)?.out as ShotBreakdownRaw["transition_out"] ?? undefined,
          camera_details: s.cameraDetailsJson ?? undefined,
          text_elements: s.textElementsJson ?? undefined,
          speed_effects: s.speedEffectsJson ?? undefined,
        })) as ShotBreakdownRaw[],
      };

      const llmProvider = await resolveRouteProvider(this.ctx, ProviderRouteKeys.FISSION_STORY_GENERATION);
      if (!llmProvider) throw new Error("新故事生成模型未配置");

      const insertPositions = input.fissionPositionMap?.insertPositions;
      if (!insertPositions?.length) throw new Error("缺少插入位置映射（fissionPositionMap），请重新发起裂变");

      // 传入完整的原视频脚本JSON
      const newStoryResult = await generateNewStory({
        ctx: this.ctx, userId: user.id, projectId,
        originalScript,
        llmProvider,
        insertPositions,
      });

      if (!newStoryResult?.payload?.shot_breakdown?.length) throw new Error("新故事生成结果为空");

      // 存储新故事到 nrm_script_data (type=6)
      const scriptId = crypto.randomUUID();

      const scriptItem: InsertScriptDataItem = {
        id: scriptId,
        type: 6,
        payloadJson: newStoryResult.payload,
        skillCode: "fission_story_generation",
        projectId,
        userId: user.id,
        sourceScriptId: confirmedScript.id,
        isSelected: false,
        isConfirmed: false,
      };
      await scriptService.batchInsertIfNotExists([scriptItem]);

      // 更新 fission_video_status
      await this.statusService.updateNewStoryScriptId(projectId, scriptId);
      await this.statusService.updateAsyncStatus(projectId, { newStoryAsyncStatus: "completed" });

      // finalize
      await finalizeAsyncJob(this.ctx.repos, jobId, "completed", { newStoryScriptId: scriptId }, null, now, this.dispatcher);
      this.log.info({ jobId, projectId, scriptId }, "新故事生成完成");

      // promote shot_prompts（depends_on new_story）
      if (job.parentJobId && this.dispatcher) {
        await checkAndFinalizeParent(this.ctx.repos, job.parentJobId, this.dispatcher, now);
        await this.dispatcher.tryPromote();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log.error({ err: error, jobId, projectId }, "新故事生成失败");
      await this.statusService.updateAsyncStatus(projectId, {
        newStoryAsyncStatus: "failed", asyncFailedStage: "new_story", asyncErrorMessage: errorMsg,
      });
      await finalizeAsyncJob(this.ctx.repos, jobId, "failed", { errorMessage: errorMsg }, { code: "NEW_STORY_FAILED", message: errorMsg }, now, this.dispatcher);
      if (job.parentJobId && this.dispatcher) {
        await checkAndFinalizeParent(this.ctx.repos, job.parentJobId, this.dispatcher, now);
      }
    }
  }
}
