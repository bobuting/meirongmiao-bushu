/**
 * 扩展发布任务服务（独立于 nrm_async_jobs）
 * 使用 Repository 模式访问数据
 */

import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import type {
  ExtDouyinPublishJobRecord,
  JobStatus,
  PublishJobInput,
  PublishJobResult,
  JobError,
} from "../repositories/pg/ext-douyin-publish-job-pg-repository.js";

// 导出类型供外部使用
export type { ExtDouyinPublishJobRecord as ExtPublishJob, JobStatus, PublishJobInput, PublishJobResult, JobError };

interface CreateJobInput {
  userId: string;
  projectId: string;
  accountId: string;
  input: PublishJobInput;
}

/** 扩展抖音发布任务服务 */
export class ExtDouyinPublishService {
  constructor(private repos: PgRepositoryCollection) {}

  /** 创建发布任务 */
  async createJob(input: CreateJobInput): Promise<ExtDouyinPublishJobRecord> {
    const id = crypto.randomUUID();
    const now = Date.now();

    return this.repos.extDouyinPublishJobs.createJob({
      id,
      userId: input.userId,
      projectId: input.projectId,
      accountId: input.accountId,
      inputJson: input.input,
      now,
    });
  }

  /** 查询用户的发布任务列表 */
  async listJobs(userId: string): Promise<ExtDouyinPublishJobRecord[]> {
    return this.repos.extDouyinPublishJobs.listByUserId(userId);
  }

  /** 查询单条发布任务 */
  async getJobById(userId: string, jobId: string): Promise<ExtDouyinPublishJobRecord | null> {
    return this.repos.extDouyinPublishJobs.findByIdAndUserId(userId, jobId);
  }

  /** 过期超时的 claimed/running任务（超过 2 小时未更新视为卡死） */
  async expireStaleJobs(userId: string): Promise<number> {
    return this.repos.extDouyinPublishJobs.expireStaleJobs(userId);
  }

  /** 扩展轮询：获取下一个待执行任务 */
  async pollNextJob(userId: string): Promise<ExtDouyinPublishJobRecord | null> {
    return this.repos.extDouyinPublishJobs.pollNextPending(userId);
  }

  /** 扩展认领任务（pending → claimed，原子操作） */
  async claimJob(userId: string, jobId: string): Promise<boolean> {
    return this.repos.extDouyinPublishJobs.claimJob(userId, jobId, Date.now());
  }

  /** 扩展上报进度（仅允许从 claimed/running 转换） */
  async reportProgress(userId: string, jobId: string, progress: { stage: string; message: string; progress?: number }): Promise<void> {
    await this.repos.extDouyinPublishJobs.reportProgress(userId, jobId, progress.stage, Date.now());
  }

  /** 扩展完成任务（仅允许从 claimed/running 转换） */
  async completeJob(userId: string, jobId: string, result: PublishJobResult): Promise<void> {
    await this.repos.extDouyinPublishJobs.completeJob(userId, jobId, result, Date.now());
  }

  /** 扩展失败（仅允许从 claimed/running 转换） */
  async failJob(userId: string, jobId: string, error: JobError): Promise<void> {
    await this.repos.extDouyinPublishJobs.failJob(userId, jobId, error, Date.now());
  }
}