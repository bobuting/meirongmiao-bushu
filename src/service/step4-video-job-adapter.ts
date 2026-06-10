/**
 * Step4 视频任务适配层
 * 将 nrm_async_jobs 的 input/result JSON 与 VideoJob 扁平对象互转，
 * 让 advance loop 继续使用相同的属性访问模式。
 */

import type { VideoJob, VideoJobStatus, Step4VideoJobInput, Step4VideoJobResult } from "../contracts/types.js";
import type { AsyncJobRecord, AsyncJobStatus } from "./async-job-service.js";

/** async job record → 扁平 VideoJob 对象 */
export function parseStep4VideoJob(record: AsyncJobRecord): VideoJob {
  const input: Partial<Step4VideoJobInput> =
    typeof record.input === "string" && record.input ? JSON.parse(record.input) : {};
  const result: Partial<Step4VideoJobResult> =
    (record.result as Partial<Step4VideoJobResult>) ?? {};

  return {
    id: record.id,
    projectId: record.projectId ?? "",
    userId: record.userId,
    status: mapAsyncStatusToVideoJobStatus(record.status),
    attempts: result.attempts ?? 1,
    startedAt: result.startedAt ?? record.createdAt,
    durationMinutes: result.durationMinutes ?? 0,
    totalClipCount: result.totalClipCount,
    completedClipCount: result.completedClipCount,
    videoUrls: result.videoUrls,
    externalTaskIds: result.externalTaskIds,
    providerAuditIds: result.providerAuditIds,
    providerId: result.providerId,
    model: result.model,
    targetSceneIndex: input.targetSceneIndex,
    enqueuedAt: result.enqueuedAt,
    clipGeneration: result.clipGeneration,
    error: record.error,
    retryNotBefore: result.retryNotBefore,
    isAdvancing: result.isAdvancing,
    advancingStartedAt: result.advancingStartedAt,
  };
}

/** VideoJob 创建输入 → input JSON 字符串 */
export function serializeStep4VideoJobInput(input: {
  targetSceneIndex?: number;
  source?: "auto" | "manual";
}): string {
  const obj: Step4VideoJobInput = {};
  if (typeof input.targetSceneIndex === "number") obj.targetSceneIndex = input.targetSceneIndex;
  if (input.source) obj.source = input.source;
  return JSON.stringify(obj);
}

/** VideoJob 可变字段 → result JSONB 片段 */
export function serializeStep4VideoJobResult(job: Partial<VideoJob>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (job.totalClipCount !== undefined) result.totalClipCount = job.totalClipCount;
  if (job.completedClipCount !== undefined) result.completedClipCount = job.completedClipCount;
  if (job.videoUrls !== undefined) result.videoUrls = job.videoUrls;
  if (job.externalTaskIds !== undefined) result.externalTaskIds = job.externalTaskIds;
  if (job.providerAuditIds !== undefined) result.providerAuditIds = job.providerAuditIds;
  if (job.providerId !== undefined) result.providerId = job.providerId;
  if (job.model !== undefined) result.model = job.model;
  if (job.clipGeneration !== undefined) result.clipGeneration = job.clipGeneration;
  if (job.attempts !== undefined) result.attempts = job.attempts;
  if (job.startedAt !== undefined) result.startedAt = job.startedAt;
  if (job.durationMinutes !== undefined) result.durationMinutes = job.durationMinutes;
  if (job.retryNotBefore !== undefined) result.retryNotBefore = job.retryNotBefore;
  if (job.isAdvancing !== undefined) result.isAdvancing = job.isAdvancing;
  if (job.advancingStartedAt !== undefined) result.advancingStartedAt = job.advancingStartedAt;
  if (job.enqueuedAt !== undefined) result.enqueuedAt = job.enqueuedAt;
  return result;
}

/** VideoJob status → AsyncJobStatus */
export function mapVideoJobStatusToAsyncStatus(status: VideoJobStatus): AsyncJobStatus {
  switch (status) {
    case "succeeded": return "completed";
    case "timeout": return "failed";
    default: return status;
  }
}

/** AsyncJobStatus → VideoJobStatus */
export function mapAsyncStatusToVideoJobStatus(status: AsyncJobStatus): VideoJobStatus {
  switch (status) {
    case "completed": return "succeeded";
    case "expired": return "failed";
    default: return status as VideoJobStatus;
  }
}
