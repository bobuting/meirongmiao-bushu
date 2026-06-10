/**
 * realApi/step3.ts - Step3 脚本创作相关 API 实现
 */

import { request } from "../backendApi.request";
import type { ScriptDto, ScriptStrategyType } from "@contracts/script.dto";
import type { ScriptCandidateEntity } from "@contracts/step3-candidate-snapshot-contract";

export interface RealStep3Api {
  /** 创建脚本生成 job */
  step3CreateScriptJob(
    token: string,
    projectId: string,
    type: ScriptStrategyType,
    forceRefresh?: boolean,
  ): Promise<{ jobId: string; status: string; type: string }>;

  /** 批量创建所有策略脚本生成任务（父子任务模式） */
  step3CreateAllScriptJobs(
    token: string,
    projectId: string,
    strategies?: ScriptStrategyType[],
    forceRefresh?: boolean,
  ): Promise<{
    parentJobId: string;
    childJobIds: string[];
    status: string;
    strategies: string[];
    ageGroup?: string | null;
  }>;

  /** 查询脚本生成 job 状态 */
  step3GetScriptJobsStatus(
    token: string,
    projectId: string,
  ): Promise<{
    selectedScriptId: string | null;
    confirmedScriptId: string | null;
    strategies?: string[];
    ageGroup?: string | null;
    jobs: Record<string, {
      jobId: string;
      status: string;
      resultScriptIds?: string[];
      errorMessage?: string | null;
      failedCount?: number;
    } | null>;
    hasDataByType?: Record<string, boolean>;
  }>;

  /** 根据 types 获取候选脚本数据 */
  step3FetchScriptCandidates(
    token: string,
    projectId: string,
    types?: string[],
  ): Promise<{ items: ScriptDto[] }>;

  /** 选中某个候选脚本 */
  step3CandidateSelect(
    token: string,
    projectId: string,
    candidateId: string,
  ): Promise<{ success: boolean }>;

  /** 确认选中某个候选脚本 */
  step3CandidateConfirm(
    token: string,
    projectId: string,
    candidateId: string,
    segments?: { title?: string; content?: string; visualCue?: string; visualPrompt?: string }[],
    libraryScriptId?: string | null,
  ): Promise<{
    success: boolean;
    scriptSegmentCount: number;
    scriptSegments: { title: string; content: string; visualCue: string; visualPrompt: string }[];
  }>;

  /** 反推项目：创建异步改写 job，返回 jobId */
  step3ReverseRewrite(
    token: string,
    projectId: string,
  ): Promise<{
    success: boolean;
    jobId: string | null;
    status: "pending" | "running" | "completed" | "failed";
    candidate?: ScriptCandidateEntity | null;
    scriptSegmentCount?: number;
    scriptSegments?: { title: string; content: string; visualCue: string; visualPrompt: string }[];
  }>;

  /** 管理员解锁：清空选中/确认状态 */
  step3CandidateAdminUnlock(
    token: string,
    projectId: string,
    reason: string,
  ): Promise<{ success: boolean }>;
}

export const realStep3Api: RealStep3Api = {
  // =========================================================================
  // Step3 脚本生成 Job API
  // =========================================================================

  /** 创建脚本生成 job */
  step3CreateScriptJob(
    token: string,
    projectId: string,
    type: ScriptStrategyType,
    forceRefresh?: boolean,
  ) {
    return request<{ jobId: string; status: string; type: string }>(
      "POST",
      `/projects/${projectId}/step3/candidates/${type}`,
      { token, body: forceRefresh ? { forceRefresh: true } : undefined },
    );
  },

  /** 批量创建所有策略脚本生成任务（父子任务模式） */
  step3CreateAllScriptJobs(
    token: string,
    projectId: string,
    strategies?: ScriptStrategyType[],
    forceRefresh?: boolean,
  ) {
    return request<{
      parentJobId: string;
      childJobIds: string[];
      status: string;
      strategies: string[];
      age: number | null;
      ageGroup: string;
    }>(
      "POST",
      `/projects/${projectId}/step3/candidates/generate-all`,
      { token, body: { strategies, forceRefresh } },
    );
  },

  /** 查询脚本生成 job 状态 */
  step3GetScriptJobsStatus(
    token: string,
    projectId: string,
  ) {
    return request<{
      selectedScriptId: string | null;
      confirmedScriptId: string | null;
      jobs: Record<string, {
        jobId: string;
        status: string;
        resultScriptIds?: string[];
        errorMessage?: string | null;
        failedCount?: number;
      } | null>;
      hasDataByType?: Record<string, boolean>;
      strategies: string[];
      ageGroup: string;
    }>("GET", `/projects/${projectId}/step3/candidates/jobs/status`, { token });
  },

  /** 获取候选脚本数据 */
  step3FetchScriptCandidates(
    token: string,
    projectId: string,
    types?: string[],
  ) {
    const query = types && types.length > 0 ? `?types=${types.join(",")}` : "";
    return request<{ items: ScriptDto[] }>(
      "GET",
      `/projects/${projectId}/step3/candidates/scripts${query}`,
      { token },
    );
  },

  /** 选中某个候选脚本 */
  step3CandidateSelect(
    token: string,
    projectId: string,
    candidateId: string,
  ) {
    return request<{ success: boolean }>(
      "POST",
      `/projects/${projectId}/step3/candidates/select`,
      {
        token,
        body: { candidateId },
      },
    );
  },

  /** 确认选中某个候选脚本 */
  step3CandidateConfirm(
    token: string,
    projectId: string,
    candidateId: string,
    segments?: { title?: string; content?: string; visualCue?: string; visualPrompt?: string }[],
    libraryScriptId?: string | null,
  ) {
    return request<{
      success: boolean;
      scriptSegmentCount: number;
      scriptSegments: { title: string; content: string; visualCue: string; visualPrompt: string }[];
    }>(
      "POST",
      `/projects/${projectId}/step3/candidates/confirm`,
      {
        token,
        body: {
          candidateId,
          segments,
          libraryScriptId: libraryScriptId || undefined,
        },
      },
    );
  },

  /** 反推项目：创建异步改写 job，返回 jobId */
  step3ReverseRewrite(token: string, projectId: string) {
    return request<{
      success: boolean;
      jobId: string | null;
      status: "pending" | "running" | "completed" | "failed";
      candidate?: ScriptCandidateEntity | null;
      scriptSegmentCount?: number;
      scriptSegments?: { title: string; content: string; visualCue: string; visualPrompt: string }[];
    }>("POST", `/projects/${projectId}/step3/reverse-rewrite`, { token });
  },

  /** 管理员解锁：清空选中/确认状态 */
  step3CandidateAdminUnlock(
    token: string,
    projectId: string,
    reason: string,
  ) {
    return request<{ success: boolean }>(
      "POST",
      `/projects/${projectId}/step3/candidates/admin-unlock`,
      {
        token,
        body: { reason },
      },
    );
  },
};