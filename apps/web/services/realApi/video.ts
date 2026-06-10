/**
 * realApi/video.ts - 视频任务相关 API 实现
 *
 * 对应后端路由:
 * - POST /projects/:projectId/video-jobs (创建视频任务)
 * - GET /projects/:projectId/video-jobs (列出视频任务)
 * - GET /projects/:projectId/video-jobs/:jobId (查询单个视频任务)
 * - POST /projects/:projectId/video-jobs/:jobId/complete (完成视频任务)
 * - POST /projects/:projectId/export (导出项目)
 */

import { request } from "../backendApi.request";

/** 视频导出音乐选项 */
export interface VideoExportMusicOptions {
  musicUrl: string | null;
  musicVolume: number | null;
  musicFadeInSec: number | null;
  musicFadeOutSec: number | null;
}

/** 视频任务 DTO（与前端 Step4VideoJobDto 保持一致） */
export interface VideoJobDto {
  id: string;
  status: "running" | "succeeded" | "failed" | "timeout";
  attempts: number;
  durationMinutes: number;
  startedAt: number;
  totalClipCount?: number;
  completedClipCount?: number;
  videoUrls?: string[];
  /** 单片段重试任务的目标镜头索引（从 0 开始），undefined 表示批量任务 */
  targetSceneIndex?: number;
  error?: {
    code: string;
    message: string;
  } | null;
}

export interface RealVideoApi {
  createVideoJob(
    token: string,
    projectId: string,
    payload: { source?: "auto" | "manual"; targetSceneIndex?: number },
  ): Promise<VideoJobDto>;
  listVideoJobs(token: string, projectId: string): Promise<{ jobs: VideoJobDto[] }>;
  getVideoJob(token: string, projectId: string, jobId: string): Promise<VideoJobDto>;
  completeVideoJob(
    token: string,
    projectId: string,
    jobId: string,
    payload: {
      status: "succeeded" | "failed" | "timeout";
      durationMinutes: number;
    },
  ): Promise<VideoJobDto>;
  exportVideo(
    token: string,
    projectId: string,
    resolution: string,
    clipVideoUrls?: string[],
    music?: VideoExportMusicOptions | null,
  ): Promise<{ url: string }>;
}

export const realVideoApi: RealVideoApi = {
  createVideoJob(
    token: string,
    projectId: string,
    payload: { source?: "auto" | "manual"; targetSceneIndex?: number },
  ) {
    return request<VideoJobDto>("POST", `/projects/${projectId}/video-jobs`, {
      token,
      body: payload,
    });
  },

  listVideoJobs(token: string, projectId: string) {
    return request<{ jobs: VideoJobDto[] }>("GET", `/projects/${projectId}/video-jobs`, { token });
  },

  getVideoJob(token: string, projectId: string, jobId: string) {
    return request<VideoJobDto>("GET", `/projects/${projectId}/video-jobs/${jobId}`, { token });
  },

  completeVideoJob(
    token: string,
    projectId: string,
    jobId: string,
    payload: {
      status: "succeeded" | "failed" | "timeout";
      durationMinutes: number;
    },
  ) {
    return request<VideoJobDto>("POST", `/projects/${projectId}/video-jobs/${jobId}/complete`, {
      token,
      body: payload,
    });
  },

  exportVideo(
    token: string,
    projectId: string,
    resolution: string,
    clipVideoUrls?: string[],
    music?: VideoExportMusicOptions | null,
  ) {
    return request<{ url: string }>("POST", `/projects/${projectId}/export`, {
      token,
      body: { resolution, clipVideoUrls, music },
    });
  },
};