/**
 * 卡住任务定时清理调度器
 *
* 每 5 分钟扫描一次，将超过 60 分钟仍为 running 状态的任务标记为 failed：
 * - step4_video：同时清理对应的 step4_video_scenes 状态
 * - step6_fission：同时清理对应的 nrm_fission_video_status 状态
 * - image_step3 / image_step4：图片项目 fire-and-forget 任务，服务重启后无调度器恢复，需超时兜底
 */

import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import type { FastifyBaseLogger } from "fastify";
import { FISSION_JOB_TYPE } from "../modules/fission-video/fission-job-service.js";
import { sseManager } from "../modules/sse-manager.js";
import { checkAndFinalizeParent } from "../service/async-job-service.js";

/** fire-and-forget 模式的 job types（无 scheduler 恢复，需超时兜底） */
const FIRE_AND_FORGET_JOB_TYPES = [
  "image_step3_model_photo",
  "image_step3_model_plan",
  "image_step3_single_photo",
  "quality_scoring",
] as const;

/** 清理配置 */
export interface StuckJobCleanupConfig {
  /** 扫描间隔（毫秒），默认 5 分钟 */
  intervalMs: number;
/** 超时阈值（毫秒），默认 60 分钟 */
timeoutMs: number;
}

const DEFAULT_CONFIG: StuckJobCleanupConfig = {
  intervalMs: 5 * 60 * 1000,   // 5 分钟
timeoutMs: 60 * 60 * 1000,   // 60 分钟（裂变任务含图片+视频生成，12个分镜需要较长时间）
};

export class StuckJobCleanupScheduler {
  private readonly logger: FastifyBaseLogger;
  private readonly config: StuckJobCleanupConfig;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly repos: PgRepositoryCollection,
    logger: FastifyBaseLogger,
    config: Partial<StuckJobCleanupConfig> = {}
  ) {
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 启动定时清理 */
  start(): void {
    this.logger.info(`Stuck job cleanup scheduler started (interval=${this.config.intervalMs / 1000}s, timeout=${this.config.timeoutMs / 1000}s)`);
    this.scheduleNextRun();
  }

  /** 停止定时清理 */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.logger.info("Stuck job cleanup scheduler stopped");
  }

  /** 手动执行清理 */
  async runCleanup(): Promise<{ timedOutCount: number; sceneResetCount: number; fissionResetCount: number; imageResetCount: number; catchAllCount: number; systemJobCount: number }> {
    const cutoffTime = Date.now() - this.config.timeoutMs;

    try {
      // 查询超时的 running step4_video 任务
      const step4Jobs = await this.repos.asyncJobs.findStuckStep4VideoJobs(cutoffTime);

      // 查询超时的 running step6_fission 任务
      const fissionJobs = await this.repos.asyncJobs.findStuckFissionJobs(cutoffTime, FISSION_JOB_TYPE);

      // 查询超时的 running fire-and-forget 任务
      const imageJobs = await this.repos.asyncJobs.findStuckFireAndForgetJobs(cutoffTime, FIRE_AND_FORGET_JOB_TYPES);

      // 查询超时的 running system jobs
      const systemJobs = await this.repos.systemJobs.findStuckRunning(cutoffTime);

      if (step4Jobs.length === 0 && fissionJobs.length === 0 && imageJobs.length === 0 && systemJobs.length === 0) {
        return { timedOutCount: 0, sceneResetCount: 0, fissionResetCount: 0, imageResetCount: 0, catchAllCount: 0, systemJobCount: 0 };
      }

      this.logger.info({ step4: step4Jobs.length, fission: fissionJobs.length, image: imageJobs.length, system: systemJobs.length }, `Found ${step4Jobs.length + fissionJobs.length + imageJobs.length + systemJobs.length} stuck jobs, timing out...`);

      let timedOutCount = 0;
      let sceneResetCount = 0;
      let fissionResetCount = 0;
      let catchAllCount = 0;
      let systemJobCount = 0;

      // 处理 step4_video 超时任务
      for (const job of step4Jobs) {
        const input = typeof job.input === "string" ? JSON.parse(job.input) : {};
        const targetSceneIndex = input.targetSceneIndex ?? null;
        const now = Date.now();

        await this.repos.asyncJobs.markAsFailed(
          job.id,
          JSON.stringify({ code: "STUCK_JOB_TIMEOUT", message: "任务超过60分钟未完成，已被系统超时" }),
          now,
        );
        timedOutCount++;

        // 推送 SSE 信号
        sseManager.pushToUser(job.user_id, {
          type: "job_failed",
          jobId: job.id,
          jobType: "step4_video",
          status: "failed",
          error: { code: "STUCK_JOB_TIMEOUT", message: "任务超过60分钟未完成，已被系统超时" },
          timestamp: now,
        });

        if (targetSceneIndex != null) {
          await this.repos.step4VideoScenes.resetStuckScene(job.project_id, targetSceneIndex);
          sceneResetCount++;
        }

        this.logger.info({ jobId: job.id, projectId: job.project_id, sceneIndex: targetSceneIndex }, `Stuck step4 job timed out`);

        // 检查父任务是否需要自动完成
        if (job.parent_job_id) {
          await checkAndFinalizeParent(this.repos, job.parent_job_id, undefined, now);
        }
      }

      // 处理 step6_fission 超时任务
      for (const job of fissionJobs) {
        // 解析 result 获取 fissionVideoStatusId
        const result = typeof job.result === "string" ? JSON.parse(job.result) : job.result || {};
        const fissionVideoStatusId = result.fissionVideoStatusId ?? null;
        const now = Date.now();

        await this.repos.asyncJobs.markAsFailed(
          job.id,
          JSON.stringify({ code: "STUCK_JOB_TIMEOUT", message: "裂变任务超过60分钟未完成，已被系统超时" }),
          now,
        );
        timedOutCount++;

        // 推送 SSE 信号
        sseManager.pushToUser(job.user_id, {
          type: "job_failed",
          jobId: job.id,
          jobType: FISSION_JOB_TYPE,
          status: "failed",
          error: { code: "STUCK_JOB_TIMEOUT", message: "裂变任务超过60分钟未完成，已被系统超时" },
          timestamp: now,
        });

        // 如果有关联的 fission_video_status，更新为 partial_complete
        if (fissionVideoStatusId) {
          await this.repos.fissionVideoStatus.markPartialComplete(fissionVideoStatusId, now);
          fissionResetCount++;
        }

        this.logger.info({ jobId: job.id, projectId: job.project_id, fissionStatusId: fissionVideoStatusId }, `Stuck fission job timed out`);

        // 检查父任务是否需要自动完成
        if (job.parent_job_id) {
          await checkAndFinalizeParent(this.repos, job.parent_job_id, undefined, now);
        }
      }

      // 处理图片项目超时任务（无需额外状态清理，直接标记 failed）
      let imageResetCount = 0;
      for (const job of imageJobs) {
        const now = Date.now();
        await this.repos.asyncJobs.markAsFailed(
          job.id,
          JSON.stringify({ code: "STUCK_JOB_TIMEOUT", message: "任务超时未完成，已被系统自动清理，请重试" }),
          now,
        );
        timedOutCount++;
        imageResetCount++;

        // 推送 SSE 信号
        sseManager.pushToUser(job.user_id, {
          type: "job_failed",
          jobId: job.id,
          jobType: job.job_type,
          status: "failed",
          error: { code: "STUCK_JOB_TIMEOUT", message: "任务超时未完成，已被系统自动清理，请重试" },
          timestamp: now,
        });

        this.logger.info({ jobId: job.id, projectId: job.project_id, jobType: job.job_type }, `Stuck image job timed out`);

        // 检查父任务是否需要自动完成
        if (job.parent_job_id) {
          await checkAndFinalizeParent(this.repos, job.parent_job_id, undefined, now);
        }
      }

      // 处理 system jobs 超时任务（quality_scoring 等）
      for (const job of systemJobs) {
        const now = Date.now();
        await this.repos.systemJobs.markStuckFailed(job.id, "系统任务超时未完成，已被自动清理", now);
        timedOutCount++;
        systemJobCount++;

        this.logger.info({ jobId: job.id, jobType: job.job_type }, `Stuck system job timed out`);
      }

      // 兜底：catch-all 处理所有其他超时的 running 任务（如 step4_clip_submit、step6_fission_item_video_submit 等）
      const alreadyHandledIds: string[] = [
        ...step4Jobs.map((j) => j.id),
        ...fissionJobs.map((j) => j.id),
        ...imageJobs.map((j) => j.id),
      ];
      const catchAllJobs = await this.repos.asyncJobs.findStuckCatchAllJobs(cutoffTime, alreadyHandledIds);

      for (const job of catchAllJobs) {
        const now = Date.now();
        await this.repos.asyncJobs.markAsFailed(
          job.id,
          JSON.stringify({ code: "STUCK_JOB_TIMEOUT", message: "任务超时未完成，已被系统自动清理" }),
          now,
        );
        timedOutCount++;
        catchAllCount++;

        sseManager.pushToUser(job.user_id, {
          type: "job_failed",
          jobId: job.id,
          jobType: job.job_type,
          status: "failed",
          error: { code: "STUCK_JOB_TIMEOUT", message: "任务超时未完成，已被系统自动清理" },
          timestamp: now,
        });

        this.logger.info({ jobId: job.id, jobType: job.job_type }, `Stuck job (catch-all) timed out`);

        if (job.parent_job_id) {
          await checkAndFinalizeParent(this.repos, job.parent_job_id, undefined, now);
        }
      }

      this.logger.info({ timedOutCount, sceneResetCount, fissionResetCount, imageResetCount, catchAllCount, systemJobCount }, "Stuck job cleanup completed");

      return { timedOutCount, sceneResetCount, fissionResetCount, imageResetCount, catchAllCount, systemJobCount };
    } catch (error) {
      this.logger.error(error, "Stuck job cleanup failed");
      return { timedOutCount: 0, sceneResetCount: 0, fissionResetCount: 0, imageResetCount: 0, catchAllCount: 0, systemJobCount: 0 };
    }
  }

  /** 计算下次执行时间并调度 */
  private scheduleNextRun(): void {
    this.timer = setTimeout(async () => {
      await this.runCleanup();
      this.scheduleNextRun();
    }, this.config.intervalMs);
  }
}
