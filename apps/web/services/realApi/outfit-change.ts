/**
 * 换装视频生成 API 模块
 */

import { request } from "../backendApi.request";

/** 换装任务 DTO */
export interface OutfitChangeTaskDto {
  taskId: string;
  status: string;
  asyncJobId?: string;
  input: {
    sourceVideoUrl: string;
    targetOutfitId: string;
    characterType?: "library" | "generated";
    characterId?: string;
    projectId: string;
  };
  stage0Result?: Record<string, unknown> | null;
  stage1Result?: Record<string, unknown> | null;
  stage2Result?: Record<string, unknown> | null;
  stage3Result?: Record<string, unknown> | null;
  errorMessage?: string | null;
  createdAt: number;
  updatedAt: number;
}

/** 换装任务列表项 */
export interface OutfitChangeTaskListItem {
  taskId: string;
  status: string;
  projectId: string;
  createdAt: number;
  updatedAt: number;
}

/** 换装 draft 数据 */
export interface OutfitChangeDraftData {
  taskId: string;
  projectId: string | null;
  sourceVideoUrl: string | null;
  builtinTemplateId: string | null;
  targetOutfitId: string | null;
  characterId: string | null;
  status: string;
}

/** 换装 API 接口 */
export interface RealOutfitChangeApi {
  /** 创建或更新 draft（Step1-3 中间选择持久化） */
  saveDraft(
    token: string,
    payload: {
      projectId: string;
      sourceVideoUrl?: string | null;
      builtinTemplateId?: string | null;
      targetOutfitId?: string | null;
      characterId?: string | null;
    }
  ): Promise<{ success: boolean; data: OutfitChangeDraftData }>;
  /** 查询项目的 draft 记录 */
  getDraft(
    token: string,
    projectId: string
  ): Promise<{ success: boolean; data: OutfitChangeDraftData | null }>;
  createTask(
    token: string,
    payload: {
      sourceVideoUrl?: string;
      builtinTemplateId?: string;
      targetOutfitId: string;
      characterType?: "library" | "generated";
      characterId?: string;
      projectId: string;
    }
  ): Promise<{
    success: boolean;
    data: { taskId: string; asyncJobId?: string; status: string; createdAt: number };
  }>;
  getTask(token: string, taskId: string): Promise<{ success: boolean; data: OutfitChangeTaskDto }>;
  listTasks(
    token: string,
    projectId?: string
  ): Promise<{ success: boolean; data: { items: OutfitChangeTaskListItem[]; total: number } }>;
  cancelTask(
    token: string,
    taskId: string
  ): Promise<{ success: boolean; data: { taskId: string; status: string } }>;
  getResult(
    token: string,
    taskId: string
  ): Promise<{
    success: boolean;
    data: {
      taskId: string;
      status: string;
      generatedVideoUrl: string;
      frameCount: number;
      consistencyScores: Record<string, number>;
      generationTime: number;
      stage0Result?: Record<string, unknown>;
      stage1Result?: Record<string, unknown>;
      stage2Result?: Record<string, unknown>;
    };
  }>;
  /** 前端合并完成后调用，更新任务和项目状态 */
  completeMerge(
    token: string,
    taskId: string,
    payload: {
      mergedVideoUrl: string;
      durationSec?: number;
    }
  ): Promise<{ success: boolean; data: { taskId: string; status: string; mergedVideoUrl: string } }>;
}

export const realOutfitChangeApi: RealOutfitChangeApi = {
  saveDraft(token, payload) {
    return request("PUT", "/outfit-change/draft", { token, body: payload });
  },
  getDraft(token, projectId) {
    return request("GET", `/outfit-change/draft?projectId=${encodeURIComponent(projectId)}`, { token });
  },
  createTask(token, payload) {
    return request("POST", "/outfit-change/tasks", { token, body: payload });
  },
  getTask(token, taskId) {
    return request("GET", `/outfit-change/tasks/${taskId}`, { token });
  },
  listTasks(token, projectId) {
    const path = projectId
      ? `/outfit-change/tasks?projectId=${encodeURIComponent(projectId)}`
      : "/outfit-change/tasks";
    return request("GET", path, { token });
  },
  cancelTask(token, taskId) {
    return request("POST", `/outfit-change/tasks/${taskId}/cancel`, { token });
  },
  getResult(token, taskId) {
    return request("GET", `/outfit-change/tasks/${taskId}/result`, { token });
  },
  completeMerge(token, taskId, payload) {
    return request("POST", `/outfit-change/tasks/${taskId}/complete-merge`, { token, body: payload });
  },
};
