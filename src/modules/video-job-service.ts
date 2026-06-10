import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import type { User, VideoJob, VideoJobStatus } from "../contracts/types.js";
import type { IProjectService, IVideoJobService } from "../contracts/services.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { PgStep3FrameImageRepository } from "../repositories/pg/step3-frame-image-pg-repository.js";
import type { BusinessConfigService } from "./business-config-service.js";
import type { GlobalTaskConcurrencyService } from "./global-task-concurrency-service.js";
import type { QueueDispatcher } from "./queue-dispatcher.js";
import { assertCondition, AppError } from "../core/errors.js";
import { DEFAULT_GLOBAL_TASK_CONFIG } from "../contracts/business-config-contract.js";
import {
  createAsyncJob,
  updateAsyncJobStage,
  finalizeAsyncJob,
  getAsyncJob,
  findActiveStep4VideoJobs,
  findStep4VideoJobsByProjectId,
} from "../service/async-job-service.js";
import {
  parseStep4VideoJob,
  serializeStep4VideoJobInput,
  serializeStep4VideoJobResult,
  mapVideoJobStatusToAsyncStatus,
} from "../service/step4-video-job-adapter.js";

interface CompleteInput {
  status: Extract<VideoJobStatus, "succeeded" | "failed" | "timeout">;
  durationMinutes: number;
  error?: { code: string; message: string };
}

function isActiveRunningJob(job: VideoJob, now: number): boolean {
  if (job.status !== "running") return false;
  if (typeof job.retryNotBefore === "number" && job.retryNotBefore > now) return false;
  return true;
}

export class VideoJobService implements IVideoJobService {
  constructor(
    private readonly repos: PgRepositoryCollection,
    private readonly clock: IRepositoryClock,
    private readonly businessConfigService: BusinessConfigService,
    private readonly projectService: IProjectService,
    private readonly step3FrameImages: PgStep3FrameImageRepository,
    private readonly concurrencyService?: GlobalTaskConcurrencyService,
    private readonly dispatcher?: QueueDispatcher,
  ) {}

  async create(
    user: User,
    projectId: string,
    input?: {
      source?: "auto" | "manual";
      targetSceneIndex?: number;
    },
  ): Promise<VideoJob> {
    const project = await this.projectService.requireOwnerProject(user, projectId);
    const now = this.clock.now();

    // 自动生成防重复检查
    const source = input?.source ?? "manual";
    const targetSceneIndex = input?.targetSceneIndex;
    if (source === "auto") {
      const projectJobs = await findStep4VideoJobsByProjectId(this.repos, project.id);

      if (typeof targetSceneIndex === "number") {
        // 单片段重试：该场景已有活跃任务时拦截
        const hasActiveJobForScene = projectJobs.some((record) => {
          if (record.status !== "pending" && record.status !== "running") return false;
          const job = parseStep4VideoJob(record);
          return job.targetSceneIndex === targetSceneIndex;
        });
        if (hasActiveJobForScene) {
          throw new AppError(
            400,
            "VIDEO_JOB_ALREADY_RUNNING",
            "该镜头正在生成中，请等待完成后再试。",
          );
        }
      } else {
        // 批量自动生成：项目有任何活跃任务或已有真实视频时拦截
        const hasActiveJob = projectJobs.some(
          (record) => record.status === "pending" || record.status === "running",
        );
        if (hasActiveJob) {
          throw new AppError(
            400,
            "VIDEO_JOB_ALREADY_RUNNING",
            "项目已有正在生成的视频任务，请等待完成后再试。",
          );
        }
        // 检查 step4_video_scenes 是否已有真实视频（result.videoUrls 永远为空，不可靠）
        const hasAnyRealVideo = projectJobs.some((record) => {
          if (record.status !== "completed") return false;
          const result = record.result as Record<string, unknown> | null;
          const completedClipCount = (result?.completedClipCount as number) ?? 0;
          return completedClipCount > 0;
        });
        if (hasAnyRealVideo) {
          throw new AppError(
            400,
            "VIDEO_ALREADY_GENERATED",
            "项目已有生成的视频，不允许自动重复生成。如需重新生成，请点击手动生成按钮。",
          );
        }
      }
    }

    const allActiveJobs = await findActiveStep4VideoJobs(this.repos);

    // 并发控制已由 concurrencyService 原子处理（超并发时排队，队列满时拒绝）
    // 此处仅做无 concurrencyService 时的手动检查兜底
    if (!this.concurrencyService) {
      const nowMs = this.clock.now();
      const taskConfig = this.businessConfigService.get("global_task", DEFAULT_GLOBAL_TASK_CONFIG);
      const allJobsFlat = allActiveJobs.map(parseStep4VideoJob);
      const userRunning = allJobsFlat.filter(
        (x) => x.userId === user.id && isActiveRunningJob(x, nowMs),
      ).length;
      const globalRunning = allJobsFlat.filter(
        (x) => isActiveRunningJob(x, nowMs),
      ).length;
      assertCondition(
        userRunning < taskConfig.maxPerUserConcurrent,
        429,
        "JOB_USER_CONCURRENCY_EXCEEDED",
        `您的视频任务数已达上限（${taskConfig.maxPerUserConcurrent}个），请等待当前任务完成后再试。`,
      );
      assertCondition(
        globalRunning < taskConfig.maxGlobalConcurrent,
        429,
        "JOB_GLOBAL_CONCURRENCY_EXCEEDED",
        `系统当前处理的视频任务较多，请稍后再试。`,
      );
    }

    // 从 nrm_step3_frame_images 查询分镜数量确定 totalClipCount（scenes 由 parent executor 创建，此时还不存在）
    const frameCount = await this.step3FrameImages.countByProjectId(project.id);
    const totalClipCount = Math.max(frameCount, 1);

    const jobId = this.clock.generateId();
    const inputJson = serializeStep4VideoJobInput({
      targetSceneIndex: input?.targetSceneIndex,
      source,
    });
    const initialResult: Record<string, unknown> = {
      totalClipCount,
      completedClipCount: 0,
      videoUrls: [],
      externalTaskIds: [],
      providerAuditIds: [],
      providerId: null,
      model: null,
      attempts: 1,
      startedAt: now,
      durationMinutes: 0,
    };

    const createResult = await createAsyncJob(this.repos, {
      id: jobId,
      userId: user.id,
      jobType: "step4_video",
      input: inputJson,
      now,
      projectId: project.id,
      initialStatus: "pending", // 【并发改造】统一模式：pending 由 QueueDispatcher 调度
    }, this.concurrencyService);

    // 队列已满时返回错误
    if ("error" in createResult) {
      throw new AppError(429, createResult.errorCode, createResult.error);
    }

    // 写入初始 result（排队和执行中都需要，前端轮询依赖这些数据）
    // 排队时 stage 设为 "queued"，Dispatcher 提升后清除 stage 表示开始执行
    if (createResult.running) {
      await updateAsyncJobStage(this.repos, createResult.jobId, null!, now, initialResult);
    } else {
      await updateAsyncJobStage(this.repos, createResult.jobId, "queued", now, {
        ...initialResult,
        queuePosition: createResult.queuePosition,
      });
    }

    // 更新项目时间戳
    project.updatedAt = this.clock.now();
    await this.projectService.saveProject(project);

    return {
      id: createResult.jobId,
      projectId: project.id,
      userId: user.id,
      status: "running" as VideoJobStatus,
      attempts: 1,
      startedAt: now,
      durationMinutes: 0,
      totalClipCount,
      completedClipCount: 0,
      targetSceneIndex: input?.targetSceneIndex,
      videoUrls: [],
      externalTaskIds: [],
      providerId: null,
      model: null,
      error: null,
    };
  }

  async complete(user: User, projectId: string, jobId: string, input: CompleteInput): Promise<VideoJob> {
    const project = await this.projectService.requireOwnerProject(user, projectId);
    const now = this.clock.now();
    const record = await getAsyncJob(this.repos, jobId, () => now);
    assertCondition(Boolean(record), 404, "NOT_FOUND", "Job not found");
    const existing = record!;
    assertCondition(existing.projectId === project.id, 400, "JOB_PROJECT_MISMATCH", "Job mismatch");
    assertCondition(existing.userId === user.id, 403, "FORBIDDEN", "Job owner only");

    const job = parseStep4VideoJob(existing);
    const asyncStatus = mapVideoJobStatusToAsyncStatus(input.status) as "completed" | "failed";

    if (input.status === "failed" || input.status === "timeout") {
      await finalizeAsyncJob(
        this.repos,
        jobId,
        asyncStatus,
        { ...serializeStep4VideoJobResult(job), durationMinutes: input.durationMinutes },
        input.error ?? null,
        now,
        this.dispatcher,
      );
      project.updatedAt = now;
      await this.projectService.setStatus(project, project.status);
      return { ...job, status: input.status, durationMinutes: input.durationMinutes, error: input.error ?? null };
    }

    await finalizeAsyncJob(
      this.repos,
      jobId,
      asyncStatus,
      { ...serializeStep4VideoJobResult(job), durationMinutes: input.durationMinutes },
      null,
      now,
      this.dispatcher,
    );
    project.updatedAt = now;
    await this.projectService.setStatus(project, project.status);
    return { ...job, status: "succeeded", durationMinutes: input.durationMinutes };
  }
}
