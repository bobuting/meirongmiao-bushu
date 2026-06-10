/**
 * realApi/admin-scene-library.ts - 场景库后台管理 API
 */

import { request } from "../backendApi.request";

// 类型定义
export type SceneCategory = "indoor" | "outdoor" | "e_commerce" | "studio" | "lifestyle" | "commercial";

export interface SceneStatistics {
  totalCount: number;
  categoryDistribution: Record<string, number>;
  recentUpdates: number;
}

export interface SceneItem {
  id: string;
  sceneCategory: string;
  sceneCategoryCn?: string;
  sceneName: string;
  sceneNameCn?: string;
  sceneDescription: string;
  sceneDescriptionCn?: string;
  sceneTags: string[];
  lightingType?: string;
  suitability: string[];
  popularityScore: number;
  source: string;
  sourceImageUrl?: string;
  ossImageUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SceneListResult {
  items: SceneItem[];
  total: number;
  page: number;
  limit: number;
}

export interface AddScenePayload {
  sceneCategory: SceneCategory;
  sceneCategoryCn?: string;
  sceneName: string;
  sceneNameCn?: string;
  sceneDescription: string;
  sceneDescriptionCn?: string;
  sceneTags?: string[];
  lightingType?: string;
  suitability?: string[];
}

export interface EditScenePayload {
  sceneName?: string;
  sceneDescription?: string;
  sceneTags?: string[];
  lightingType?: string;
  suitability?: string[];
  popularityScore?: number;
}

export interface SceneRankingItem {
  id: string;
  sceneName: string;
  sceneNameCn?: string;
  popularityScore: number;
  trendPeriod: string;
}

export type SceneUpdateTriggerType = "scheduled" | "manual";
export type SceneUpdateLogStatus = "running" | "success" | "failed" | "skipped";

export interface SceneUpdateLog {
  id: string;
  triggerType: SceneUpdateTriggerType;
  status: SceneUpdateLogStatus;
  sceneCategory: string | null;
  xiaohongshuCount: number;
  instagramCount: number;
  weiboCount: number;
  douyinCount: number;
  scenesUpdated: number;
  durationMs: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

export interface SceneUpdateLogListResult {
  items: SceneUpdateLog[];
  total: number;
  page: number;
  limit: number;
}

// 场景分类中文名
export const SCENE_CATEGORY_LABELS: Record<SceneCategory, string> = {
  indoor: "室内场景",
  outdoor: "室外场景",
  e_commerce: "电商场景",
  studio: "影棚/直播间",
  lifestyle: "生活场景",
  commercial: "商业场景",
};

// API 实现
export const adminSceneLibraryApi = {
  async fetchStatistics(token: string): Promise<SceneStatistics> {
    return request("GET", "/admin/scene-library/statistics", { token });
  },

  async fetchScenes(
    token: string,
    params: {
      sceneCategory?: SceneCategory;
      page?: number;
      limit?: number;
    },
  ): Promise<SceneListResult> {
    const query = new URLSearchParams();
    if (params.sceneCategory) query.set("sceneCategory", params.sceneCategory);
    query.set("page", String(params.page || 1));
    query.set("limit", String(params.limit || 20));
    return request("GET", `/admin/scene-library/scenes?${query}`, { token });
  },

  async addScene(token: string, data: AddScenePayload): Promise<{ id: string }> {
    return request("POST", "/admin/scene-library/scenes", { token, body: data });
  },

  async editScene(token: string, id: string, data: EditScenePayload): Promise<{ success: boolean }> {
    return request("PATCH", `/admin/scene-library/scenes/${id}`, { token, body: data });
  },

  async deleteScene(token: string, id: string): Promise<{ success: boolean }> {
    return request("DELETE", `/admin/scene-library/scenes/${id}`, { token });
  },

  async fetchRanking(
    token: string,
    params: { sceneCategory?: SceneCategory; limit?: number },
  ): Promise<SceneRankingItem[]> {
    const query = new URLSearchParams();
    if (params.sceneCategory) query.set("sceneCategory", params.sceneCategory);
    query.set("limit", String(params.limit || 10));
    return request("GET", `/admin/scene-library/ranking?${query}`, { token });
  },

  async fetchUpdateLogs(
    token: string,
    params?: {
      page?: number;
      limit?: number;
      triggerType?: SceneUpdateTriggerType;
      status?: SceneUpdateLogStatus;
    },
  ): Promise<SceneUpdateLogListResult> {
    const query = new URLSearchParams();
    query.set("page", String(params?.page || 1));
    query.set("limit", String(params?.limit || 20));
    if (params?.triggerType) query.set("triggerType", params.triggerType);
    if (params?.status) query.set("status", params.status);
    return request("GET", `/admin/scene-library/update-logs?${query}`, { token });
  },

  async triggerUpdate(
    token: string,
    params?: { sceneCategory?: SceneCategory },
  ): Promise<{ success: boolean; message: string }> {
    return request("POST", "/admin/scene-library/trigger-update", {
      token,
      body: params || {},
    });
  },
};

export type AdminSceneLibraryApi = typeof adminSceneLibraryApi;
