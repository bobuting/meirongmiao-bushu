/**
 * realApi/admin-aesthetic-library.ts - 审美特征库后台管理 API
 */

import { request } from "../backendApi.request";
import type { AgeGroupRange } from "../../../../src/constants/age-groups";

// 重新导出统一类型，保持向后兼容
export type AgeRange = AgeGroupRange;

export interface AestheticStatistics {
  totalCount: number;
  childCount: number;
  adultCount: number;
  categoryDistribution: Record<string, number>;
  recentUpdates: number;
}

export interface AestheticFeature {
  id: string;
  featureCategory: string;
  featureCategoryCn?: string;  // 特征分类中文名
  featureName: string;
  featureNameCn?: string;  // 特征名称中文名
  featureDescription: string;
  featureDescriptionCn?: string;  // 特征描述中文
  ethnicityApplicable: string[];
  ageRange: string;
  popularityScore: number;
  source: string;
  sourceImageUrl?: string;  // 原始图片 URL
  ossImageUrl?: string;     // OSS 图片 URL
  createdAt: string;
  updatedAt: string;
}

export interface AestheticFeaturesListResult {
  items: AestheticFeature[];
  total: number;
  page: number;
  limit: number;
}

export interface AddFeaturePayload {
  featureCategory: string;
  featureName: string;
  featureDescription: string;
  ethnicityApplicable: string[];
  ageRange: AgeRange;
}

export interface EditFeaturePayload {
  featureName?: string;
  featureDescription?: string;
  ethnicityApplicable?: string[];
  popularityScore?: number;
}

export interface RankingItem {
  id: string;
  featureName: string;
  featureNameCn?: string;  // 特征名称中文名
  popularityScore: number;
  trendPeriod: string;
}

// 运行记录类型定义
export type UpdateTriggerType = "scheduled" | "manual";
export type UpdateLogStatus = "running" | "success" | "failed" | "skipped";

export interface AestheticUpdateLog {
  id: string;
  triggerType: UpdateTriggerType;
  status: UpdateLogStatus;
  ageRange: string | null;
  xiaohongshuCount: number;
  instagramCount: number;
  weiboCount: number;
  douyinCount: number;
  featuresUpdated: number;
  durationMs: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

export interface UpdateLogListResult {
  items: AestheticUpdateLog[];
  total: number;
  page: number;
  limit: number;
}

// API 实现
export const adminAestheticLibraryApi = {
  /**
   * 获取统计数据
   */
  async fetchStatistics(token: string): Promise<AestheticStatistics> {
    return request("GET", "/admin/aesthetic-library/statistics", { token });
  },

  /**
   * 获取特征列表（分页）
   */
  async fetchFeatures(
    token: string,
    params: {
      ageRange?: AgeRange;
      featureCategory?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<AestheticFeaturesListResult> {
    const query = new URLSearchParams();
    if (params.ageRange) query.set("ageRange", params.ageRange);
    if (params.featureCategory) query.set("featureCategory", params.featureCategory);
    query.set("page", String(params.page || 1));
    query.set("limit", String(params.limit || 20));

    return request("GET", `/admin/aesthetic-library/features?${query}`, { token });
  },

  /**
   * 添加新特征
   */
  async addFeature(token: string, data: AddFeaturePayload): Promise<{ id: string }> {
    return request("POST", "/admin/aesthetic-library/features", { token, body: data });
  },

  /**
   * 编辑特征
   */
  async editFeature(
    token: string,
    id: string,
    data: EditFeaturePayload
  ): Promise<{ success: boolean }> {
    return request("PATCH", `/admin/aesthetic-library/features/${id}`, { token, body: data });
  },

  /**
   * 删除特征（软删除）
   */
  async deleteFeature(token: string, id: string): Promise<{ success: boolean }> {
    return request("DELETE", `/admin/aesthetic-library/features/${id}`, { token });
  },

  /**
   * 获取热度排行
   */
  async fetchRanking(
    token: string,
    params: {
      ageRange?: AgeRange;
      limit?: number;
    }
  ): Promise<RankingItem[]> {
    const query = new URLSearchParams();
    if (params.ageRange) query.set("ageRange", params.ageRange);
    query.set("limit", String(params.limit || 10));

    return request("GET", `/admin/aesthetic-library/ranking?${query}`, { token });
  },

  /**
   * 查询运行记录（分页）
   */
  async fetchUpdateLogs(
    token: string,
    params?: {
      page?: number;
      limit?: number;
      triggerType?: UpdateTriggerType;
      status?: UpdateLogStatus;
    }
  ): Promise<UpdateLogListResult> {
    const query = new URLSearchParams();
    query.set("page", String(params?.page || 1));
    query.set("limit", String(params?.limit || 20));
    if (params?.triggerType) query.set("triggerType", params.triggerType);
    if (params?.status) query.set("status", params.status);

    return request("GET", `/admin/aesthetic-library/update-logs?${query}`, { token });
  },

  /**
   * 手动触发更新
   */
  async triggerUpdate(
    token: string,
    params?: { ageRange?: AgeRange }
  ): Promise<{ success: boolean; message: string }> {
    return request("POST", "/admin/aesthetic-library/trigger-update", {
      token,
      body: params || {},
    });
  },
};

export type AdminAestheticLibraryApi = typeof adminAestheticLibraryApi;