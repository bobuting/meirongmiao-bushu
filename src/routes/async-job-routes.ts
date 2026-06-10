/**
 * 通用异步任务路由
 * 提供任务类型无关的查询接口，供前端全局任务队列轮询。
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { requireUser } from "../services/auth/route-guards.js";
import {
  getAsyncJob,
  getUserAsyncJobs,
  type AsyncJobRecord,
} from "../service/async-job-service.js";

export function registerAsyncJobRoutes(app: FastifyInstance, ctx: AppContext): void {
  // ============================================================================
  // GET /async-jobs/my — 当前用户所有任务（全局任务队列）
  // 高频轮询接口，禁用请求日志避免刷屏
  // ============================================================================
  app.get("/async-jobs/my", { logLevel: 'warn' }, async (request) => {
    const user = await requireUser(ctx, request);

    const jobs = await getUserAsyncJobs(ctx.repos, user.id, 50);

    return {
      jobs: jobs.map(formatJobResponse),
    };
  });

  // ============================================================================
  // GET /async-jobs/:jobId — 查询单个任务
  // ============================================================================
  app.get("/async-jobs/:jobId", async (request) => {
    const { jobId } = request.params as { jobId: string };
    const job = await getAsyncJob(ctx.repos, jobId, () => ctx.clock.now());
    if (!job) {
      return { ok: false, code: "JOB_NOT_FOUND", message: "任务不存在或已过期。" };
    }
    if (job.status === "completed" && job.result) {
      return { status: "completed", stage: null, result: job.result };
    }
    if (job.status === "failed" && job.error) {
      return { status: "failed", stage: job.stage, error: job.error };
    }
    return { status: job.status, stage: job.stage };
  });

  // ============================================================================
  // GET /async-jobs/:jobId/provider-calls — 查询任务关联的后端调用
  // ============================================================================
  app.get("/async-jobs/:jobId/provider-calls", async (request) => {
    const { jobId } = request.params as { jobId: string };

    // 验证任务存在且属于当前用户
    const user = await requireUser(ctx, request);
    const job = await getAsyncJob(ctx.repos, jobId, () => ctx.clock.now());
    if (!job) {
      return { ok: false, code: "JOB_NOT_FOUND", message: "任务不存在或已过期。" };
    }
    if (job.userId !== user.id) {
      return { ok: false, code: "FORBIDDEN", message: "无权访问此任务。" };
    }

    // 查询关联的 provider calls
    const calls = await ctx.repos.providerCallAudits.findForJobProviderCalls(jobId);

    return {
      calls: calls.map((row) => ({
        id: row.id,
        providerId: row.provider_id,
        routeKey: row.route_key,
        status: row.status,
        latencyMs: row.latency_ms,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        requestSummary: row.request_summary,
        responseSummary: row.response_summary,
        createdAt: Number(row.created_at),
        actualModel: row.actual_model,
        providerVendor: row.provider_vendor,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        ttftMs: row.ttft_ms,
        callMode: row.call_mode,
      })),
    };
  });
}

/** 格式化任务响应（统一字段命名，已完成任务裁剪大字段减少轮询 payload） */
function formatJobResponse(job: AsyncJobRecord) {
  const shouldTrim = job.status === "completed" || job.status === "failed" || job.status === "expired";
  return {
    id: job.id,
    jobType: job.jobType,
    status: job.status,
    stage: job.stage,
    input: shouldTrim ? trimInput(job.input, job.jobType) : job.input,
    projectId: job.projectId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: shouldTrim ? trimResult(job.result) : job.result,
    error: job.error,
    parentJobId: job.parentJobId,
  };
}

/** 裁剪 input：保留关键信息生成有效 JSON，避免截断产生无效 JSON */
function trimInput(input: string, jobType?: string): string {
  if (input.length <= 200) return input;
  try {
    const parsed = JSON.parse(input);
    if (typeof parsed.frameIndex === "number") {
      // 返回精简 JSON，只保留前端需要的 frameIndex 和 title
      return JSON.stringify({
        frameIndex: parsed.frameIndex,
        title: typeof parsed.title === "string" ? parsed.title : undefined,
      });
    }
    // step4_video：只保留数量信息，去掉大文本提示词
    if (jobType === "step4_video") {
      return JSON.stringify({
        clipCount: parsed.clipCount ?? 1,
        targetSceneIndex: parsed.targetSceneIndex ?? undefined,
      });
    }
  } catch { /* ignore */ }
  return input.slice(0, 200) + "...";
}

/** 裁剪 result：只保留关键字段，去掉大量 URL 列表 */
function trimResult(result: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!result) return null;
  // batch preview：保留统计数据，去掉 candidates 数组
  if ("totalFrames" in result) {
    return {
      totalFrames: result.totalFrames,
      completedFrames: result.completedFrames,
      failedFrames: result.failedFrames,
    };
  }
  // 脚本生成：保留 resultScriptIds
  if ("resultScriptIds" in result) {
    return { resultScriptIds: result.resultScriptIds };
  }
  // step4 视频片段：只保留 sceneIndex
  if ("sceneIndex" in result) {
    return { sceneIndex: result.sceneIndex };
  }
  // step2 五视图生成：保留 characterId 和 slot
  if ("characterId" in result) {
    return {
      characterId: result.characterId,
      characterName: result.characterName,
      slot: result.slot,
    };
  }
  return result;
}
