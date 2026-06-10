/**
 * realApi/reverse.ts - 逆向解析相关 API 实现
 */

import { request } from "../backendApi.request";
import type {
  ReverseParseV2JobDto,
  ReverseParseV2ResultDto,
  LlmReverseJobCreateResponse,
  LlmReverseJobQueryResponse,
} from "../backendApi.types";

export interface RealReverseApi {
  reverseParse(
    token: string,
    payload: {
      input: string;
      projectId?: string;
      mode?: "url" | "file";
    },
  ): Promise<ReverseParseV2ResultDto>;
  reverseParseV2(
    token: string,
    payload: {
      input: string;
      projectId?: string;
      mode?: "douyin_url" | "video_url" | "upload_file";
    },
    options?: {
      onJobCreated?: (jobId: string) => void;
    },
  ): Promise<ReverseParseV2JobDto>;
  startReverseParseV2Job(
    token: string,
    payload: {
      input: string;
      projectId?: string;
      mode?: "douyin_url" | "video_url" | "upload_file";
    },
  ): Promise<{ jobId: string }>;
  getReverseParseV2Job(token: string, jobId: string): Promise<ReverseParseV2JobDto>;
  reverseHotTrendAssetToLibrary(
    token: string,
    scriptId: string,
  ): Promise<{ ok: boolean }>;
  /** 单视频热榜 LLM 反推（一键复刻）— 异步 job 模式 */
  startLlmReverseJob(token: string, payload: { input: string; filename?: string; templateId?: string }): Promise<LlmReverseJobCreateResponse>;
  /** 查询 LLM 反推任务状态 */
  getLlmReverseJob(token: string, jobId: string): Promise<LlmReverseJobQueryResponse>;
  submitReview(
    token: string,
    projectId: string,
    payload: {
      type: "publish" | "export";
      data: Record<string, unknown>;
    },
  ): Promise<{ reviewId: string }>;
  getMyAsyncJobs(token: string): Promise<{
    jobs: Array<{
      id: string;
      jobType: string;
      status: string;
      stage: string | null;
      input: string;
      createdAt: number;
      updatedAt: number;
      result: Record<string, unknown> | null;
      error: { code: string; message: string } | null;
    }>;
  }>;
}

export const realReverseApi: RealReverseApi = {
  reverseParse(
    token: string,
    payload: {
      input: string;
      projectId?: string;
      mode?: "url" | "file";
    },
  ) {
    return request<ReverseParseV2ResultDto>("POST", "/reverse/parse", {
      token,
      body: payload,
    });
  },

  reverseParseV2(
    token: string,
    payload: {
      input: string;
      projectId?: string;
      mode?: "douyin_url" | "video_url" | "upload_file";
    },
    _options?: {
      onJobCreated?: (jobId: string) => void;
    },
  ) {
    return request<ReverseParseV2JobDto>("POST", "/reverse/parse-v2", {
      token,
      body: payload,
    });
  },

  startReverseParseV2Job(
    token: string,
    payload: {
      input: string;
      projectId?: string;
      mode?: "douyin_url" | "video_url" | "upload_file";
    },
  ) {
    return request<{ jobId: string }>("POST", "/reverse/parse-v2/jobs", {
      token,
      body: payload,
    });
  },

  getReverseParseV2Job(token: string, jobId: string) {
    return request<ReverseParseV2JobDto>("GET", `/reverse/parse-v2/jobs/${jobId}`, { token });
  },

  reverseHotTrendAssetToLibrary(token: string, scriptId: string) {
    return request<{ ok: boolean }>("POST", `/reverse/hot-trend-asset/${scriptId}/to-library`, {
      token,
    });
  },

  startLlmReverseJob(token: string, payload: { input: string; filename?: string; templateId?: string }) {
    return request<LlmReverseJobCreateResponse>("POST", "/reverse/llm-reverse/jobs", {
      token,
      body: payload,
    });
  },

  getLlmReverseJob(token: string, jobId: string) {
    return request<LlmReverseJobQueryResponse>("GET", `/reverse/llm-reverse/jobs/${jobId}`, { token });
  },

  /** 获取当前用户所有异步任务（通用任务队列） */
  getMyAsyncJobs(token: string) {
    return request<{ jobs: Array<{
      id: string;
      jobType: string;
      status: string;
      stage: string | null;
      input: string;
      createdAt: number;
      updatedAt: number;
      result: Record<string, unknown> | null;
      error: { code: string; message: string } | null;
    }> }>("GET", "/async-jobs/my", { token });
  },

  submitReview(
    token: string,
    projectId: string,
    payload: {
      type: "publish" | "export";
      data: Record<string, unknown>;
    },
  ) {
    return request<{ reviewId: string }>("POST", "/reviews/request", {
      token,
      body: { ...payload, projectId },
    });
  },
};