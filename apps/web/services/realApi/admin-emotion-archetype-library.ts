/**
 * realApi/admin-emotion-archetype-library.ts - 情感原型库后台管理 API
 */

import { request } from "../backendApi.request";

// 类型定义
export type EmotionCategory =
  | "自我发现"
  | "时间流逝"
  | "人际连接"
  | "意外时刻"
  | "日常仪式"
  | "蜕变逆袭"
  | "身份切换"
  | "仪式庆典";

export interface EmotionArchetypeStatistics {
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  manualCount: number;
  llmExtractedCount: number;
  avgPopularity: string;
  categoryStats: Array<{ category: string; count: number }>;
}

export interface EmotionArchetypeItem {
  id: string;
  name: string;
  category: EmotionCategory;
  emotionCore: string;
  moment: string;
  conflict: string;
  clothingRole: string;
  popularityScore: number;
  useCount: number;
  avgUserRating: number | null;
  lastUsedAt: number | null;
  isActive: boolean;
  source: string;
  suitableStyles: string[];
  suitableAge: string[];
  suitableGender: string[];
  createdAt: number;
  updatedAt: number;
}

export interface EmotionArchetypesListResult {
  items: EmotionArchetypeItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AddArchetypePayload {
  id?: string;
  name: string;
  category: EmotionCategory;
  emotionCore: string;
  moment: string;
  conflict: string;
  clothingRole: string;
  visualCues?: string[];
  duration?: string;
  shotCount?: number;
  syncMode?: string;
  suitableStyles?: string[];
  suitableAge?: string[];
  suitableGender?: string[];
}

export interface EditArchetypePayload {
  name?: string;
  category?: EmotionCategory;
  emotionCore?: string;
  moment?: string;
  conflict?: string;
  clothingRole?: string;
  popularityScore?: number;
  isActive?: boolean;
  suitableStyles?: string[];
  suitableAge?: string[];
  suitableGender?: string[];
}

export interface RankingItem {
  id: string;
  name: string;
  category: EmotionCategory;
  emotionCore: string;
  popularityScore: number;
  useCount: number;
  avgUserRating: number | null;
}

/** 运行记录项 */
export interface RunLogItem {
  id: number;
  runType: "scheduled_update" | "archetype_usage";
  triggerType: "scheduled" | "manual" | "auto";
  status: "running" | "completed" | "failed";
  taskResults: Record<string, unknown> | null;
  archetypeId: string | null;
  projectId: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: number;
  completedAt: number | null;
  createdAt: number;
}

/** 运行记录列表结果 */
export interface RunLogsListResult {
  items: RunLogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// API 实现
export const adminEmotionArchetypeLibraryApi = {
  /**
   * 获取统计数据
   */
  async fetchStatistics(token: string): Promise<EmotionArchetypeStatistics> {
    return request("GET", "/admin/emotion-archetype-library/statistics", { token });
  },

  /**
   * 获取原型列表（分页）
   */
  async fetchArchetypes(
    token: string,
    params: {
      category?: EmotionCategory;
      source?: string;
      isActive?: string;
      page?: number;
      limit?: number;
      sortBy?: string;
    }
  ): Promise<EmotionArchetypesListResult> {
    const query = new URLSearchParams();
    if (params.category) query.set("category", params.category);
    if (params.source) query.set("source", params.source);
    if (params.isActive) query.set("isActive", params.isActive);
    query.set("page", String(params.page || 1));
    query.set("limit", String(params.limit || 20));
    if (params.sortBy) query.set("sortBy", params.sortBy);

    return request("GET", `/admin/emotion-archetype-library/archetypes?${query}`, { token });
  },

  /**
   * 添加新原型
   */
  async addArchetype(token: string, data: AddArchetypePayload): Promise<{ success: boolean; archetypeId: string }> {
    return request("POST", "/admin/emotion-archetype-library/archetypes", { token, body: data });
  },

  /**
   * 编辑原型
   */
  async editArchetype(
    token: string,
    id: string,
    data: EditArchetypePayload
  ): Promise<{ success: boolean }> {
    return request("PATCH", `/admin/emotion-archetype-library/archetypes/${id}`, { token, body: data });
  },

  /**
   * 删除原型（软删除）
   */
  async deleteArchetype(token: string, id: string, hard?: boolean): Promise<{ success: boolean }> {
    const query = hard ? "?hard=true" : "";
    return request("DELETE", `/admin/emotion-archetype-library/archetypes/${id}${query}`, { token });
  },

  /**
   * 获取热度排行
   */
  async fetchRanking(
    token: string,
    params: {
      category?: EmotionCategory;
      limit?: number;
    }
  ): Promise<{ items: RankingItem[] }> {
    const query = new URLSearchParams();
    if (params.category) query.set("category", params.category);
    query.set("limit", String(params.limit || 10));

    return request("GET", `/admin/emotion-archetype-library/ranking?${query}`, { token });
  },

  /**
   * 手动触发流行度重算
   */
  async recalculatePopularity(token: string): Promise<{ success: boolean; updatedCount: number }> {
    return request("POST", "/admin/emotion-archetype-library/recalculate", { token });
  },

  /**
   * 获取运行记录列表（分页）
   */
  async fetchRunLogs(
    token: string,
    params: {
      runType?: string;
      status?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<RunLogsListResult> {
    const query = new URLSearchParams();
    if (params.runType) query.set("runType", params.runType);
    if (params.status) query.set("status", params.status);
    query.set("page", String(params.page || 1));
    query.set("limit", String(params.limit || 20));

    return request("GET", `/admin/emotion-archetype-library/run-logs?${query}`, { token });
  },
};

export type AdminEmotionArchetypeLibraryApi = typeof adminEmotionArchetypeLibraryApi;
