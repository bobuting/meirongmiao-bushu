/**
 * 成片管理 API
 * 独立模块，避免 admin.ts 过大
 */

import { request } from "../backendApi.request";

// ========== 类型定义 ==========

export interface FinalVideoProject {
  id: string;
  name: string;
  userId: string;
  userEmail: string;
  finalVideoCount: number;
  updatedAt: number;
  coverImageUrl: string | null;
  projectKind: string;
}

export interface FinalVideo {
  id: string;
  projectId: string;
  videoType: "step4" | "fission" | "outfit_merge";
  videoUrl: string;
  durationSec: number | null;
  fileSize: number | null;
  coverImageUrl: string | null;
  backgroundMusicTitle: string | null;
  backgroundMusicUrl: string | null;
  storyboardUrls: string[] | null;
  transitionType: string | null;
  transitionDurationFrames: number | null;  // FreeCut 帧数模式
  creatorId: string | null;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
  projectName: string | null;
  creatorEmail: string | null;
}

// ========== API 函数 ==========

/** 获取有成片的项目列表 */
export async function finalVideosProjects(token: string, params?: {
  userId?: string;
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<{ projects: FinalVideoProject[] }> {
  const queryParams = new URLSearchParams();
  if (params?.userId) queryParams.set("userId", params.userId);
  if (params?.search) queryParams.set("search", params.search);
  if (params?.offset) queryParams.set("offset", String(params.offset));
  if (params?.limit) queryParams.set("limit", String(params.limit));

  const query = queryParams.toString();
  return request<{ projects: FinalVideoProject[] }>(
    "GET",
    `/admin/final-videos/projects${query ? `?${query}` : ""}`,
    { token }
  );
}

/** 获取项目的成片列表 */
export async function finalVideosList(token: string, projectId: string): Promise<{ videos: FinalVideo[] }> {
  return request<{ videos: FinalVideo[] }>(
    "GET",
    `/admin/final-videos?projectId=${projectId}`,
    { token }
  );
}

/** 软删除成片 */
export async function finalVideoDelete(token: string, videoId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    "DELETE",
    `/admin/final-videos/${videoId}`,
    { token }
  );
}