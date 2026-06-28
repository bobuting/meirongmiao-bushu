/**
 * Step4 视频任务 Submit-Query 分离模式
 *
 * 提供 Submit-Query 任务类型定义、ID 构建、任务 CRUD
 */

import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import { getLogger } from "../../core/logger/index.js";
import { AppError } from "../../core/errors.js";
const log = getLogger("step4-advance-video-job");
import {
  createAsyncJob,
} from "../../service/async-job-service.js";

// ========== 任务类型常量 ==========

/** Step4 视频片段提交任务类型（Submit：提交视频生成） */
export const STEP4_CLIP_SUBMIT_JOB_TYPE = "step4_clip_submit";

/** Step4 视频片段查询任务类型（Query：轮询视频状态） */
export const STEP4_CLIP_QUERY_JOB_TYPE = "step4_clip_query";

// ========== 类型 ==========

/** Step4 视频片段提交任务输入 — 只传最小标识，executor 自行查数据库 */
export interface Step4ClipSubmitJobInput {
  videoJobId: string;
  parentJobId: string;
  sceneIndex: number;
  projectId: string;
  userId: string;
}

/** Step4 视频片段提交任务结果 */
export interface Step4ClipSubmitJobResult {
  videoTaskId: string | null;
  errorMessage?: string;
  /** LLM 调试气泡 auditId，供 Query executor 完成 finalize */
  debugAuditId?: string;
  /** 调试气泡创建时间，供 Query 计算 total latency */
  debugStartedAt?: number;
  /** Submit 阶段的审计信息，供 Query finalize 时补全 */
  submitAuditInfo?: {
    actualEndpoint?: string;
    requestHeadersJson?: string;
    requestBodyJson?: string;
  };
  /** Submit 使用的 RouteKey，供 Query 使用相同 Provider */
  routeKey?: string;
  /** 配对标识（Submit + Query 共享，用于调试气泡配对展示） */
  pairId?: string;
  /** 冻结积分 ID，供 Query 成功时扣减或失败时解冻 */
  freezeId?: string | null;
  /** 冻结积分金额，供 Query 使用 */
  creditCost?: number;
}

/** Step4 视频片段查询任务输入 */
export interface Step4ClipQueryJobInput {
  videoJobId: string;
  parentJobId: string;
  sceneIndex: number;
  projectId: string;
  videoTaskId: string;
  /** 冻结积分 ID，从 Submit 传入，成功时扣减、失败时解冻 */
  freezeId?: string | null;
  /** 冻结积分金额，从 Submit 传入 */
  creditCost?: number;
}

/** Step4 视频片段查询任务结果 */
export interface Step4ClipQueryJobResult {
  videoUrl: string | null;
  errorMessage?: string;
}

// ========== Async Job ID 构建与解析 ==========

/** 构建 per-scene Submit async job ID */
export function buildStep4ClipSubmitJobId(videoJobId: string, sceneIndex: number): string {
  return `step4-submit-${videoJobId}-s${sceneIndex}`;
}

/** 构建 per-scene Query async job ID */
export function buildStep4ClipQueryJobId(videoJobId: string, sceneIndex: number): string {
  return `step4-query-${videoJobId}-s${sceneIndex}`;
}

/** 解析 async job ID → { videoJobId, sceneIndex } */
export function parseStep4AsyncJobId(jobId: string): { videoJobId: string; sceneIndex: number } | null {
  const match = jobId.match(/^step4-(submit|query)?-?(.+)-s(\d+)$/);
  if (!match) return null;
  return { videoJobId: match[2]!, sceneIndex: Number(match[3]) };
}

// ========== Submit-Query 分离模式 CRUD ==========

/**
 * 创建 Step4 Clip Submit 任务
 * Submit 任务：提交视频生成 → 创建 Query 子任务 → finalize 完成
 */
export async function createStep4ClipSubmitJob(
  repos: PgRepositoryCollection,
  params: {
    videoJobId: string;
    userId: string;
    projectId: string;
    sceneIndex: number;
    parentJobId: string;
    concurrencyService?: import("../../modules/global-task-concurrency-service.js").GlobalTaskConcurrencyService;
  },
): Promise<{ jobId: string }> {
  const now = Date.now();
  const id = buildStep4ClipSubmitJobId(params.videoJobId, params.sceneIndex);

  const input: Step4ClipSubmitJobInput = {
    videoJobId: params.videoJobId,
    parentJobId: params.parentJobId,
    sceneIndex: params.sceneIndex,
    projectId: params.projectId,
    userId: params.userId,
  };

  const result = await createAsyncJob(repos, {
    id,
    userId: params.userId,
    jobType: STEP4_CLIP_SUBMIT_JOB_TYPE,
    input: JSON.stringify(input),
    now,
    projectId: params.projectId,
    parentJobId: params.parentJobId,
    initialStatus: "pending",
  }, params.concurrencyService);

  if ("error" in result) {
    throw new AppError(500, "SUBMIT_JOB_FAILED", `创建 Submit 任务失败: ${result.error}`);
  }

  return { jobId: result.jobId };
}

/**
 * 创建 Step4 Clip Query 任务
 * Query 任务：查询视频状态 → pending 时保持 running，更新 updated_at
 */
export async function createStep4ClipQueryJob(
  repos: PgRepositoryCollection,
  params: {
    videoJobId: string;
    userId: string;
    projectId: string;
    sceneIndex: number;
    parentJobId: string;
    videoTaskId: string;
    /** 冻结积分 ID，从 Submit 传入 */
    freezeId?: string | null;
    /** 冻结积分金额 */
    creditCost?: number;
    concurrencyService?: import("../../modules/global-task-concurrency-service.js").GlobalTaskConcurrencyService;
  },
): Promise<{ jobId: string }> {
  const now = Date.now();
  const id = buildStep4ClipQueryJobId(params.videoJobId, params.sceneIndex);

  const input: Step4ClipQueryJobInput = {
    videoJobId: params.videoJobId,
    parentJobId: params.parentJobId,
    sceneIndex: params.sceneIndex,
    projectId: params.projectId,
    videoTaskId: params.videoTaskId,
    freezeId: params.freezeId,
    creditCost: params.creditCost,
  };

  const result = await createAsyncJob(repos, {
    id,
    userId: params.userId,
    jobType: STEP4_CLIP_QUERY_JOB_TYPE,
    input: JSON.stringify(input),
    now,
    projectId: params.projectId,
    parentJobId: params.parentJobId,
    initialStatus: "pending",
    executionMode: "poll",
  }, params.concurrencyService);

  if ("error" in result) {
    throw new AppError(500, "QUERY_JOB_FAILED", `创建 Query 任务失败: ${result.error}`);
  }

  return { jobId: result.jobId };
}
