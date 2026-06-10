/**
 * realApi/step2.ts - Step2 角色生成相关 API 实现
 */

import { request } from "../backendApi.request";
import type { RecommendOutfitsResponse } from "../../pages/project-flow/step1JointReverseService";

/** recommendOutfits 接口入参：支持旧版 slotUrls 和新版 selection 两种模式 */
export interface RecommendOutfitsPayload {
  topImageUrls?: string[];
  bottomImageUrls?: string[];
  shoesImageUrls?: string[];
  accessoryImageUrls?: string[];
  preference?: string;
  /** 新版：基于选择来源和资产 ID 生成搭配 */
  selection?: {
    selectedSource: string;
    selectedAssetIds: string[];
  };
}

/** optimizeOutfitAnalysis 接口入参 */
export interface OptimizeOutfitAnalysisPayload {
  analysis: string;
  style?: string;
  /** 当前提示词（用于优化上下文） */
  currentPrompt?: string;
  /** 分部位引导信息 */
  guidance?: {
    bottom?: string;
    shoes?: string;
    accessory?: string;
  };
}

/** optimizeOutfitAnalysis 接口返回值 */
export interface OptimizeOutfitAnalysisResult {
  analysis: string;
  /** 优化后的提示词 */
  prompt?: string;
}

export interface RealStep2Api {
  recommendOutfits(
    token: string,
    projectId: string,
    payload?: RecommendOutfitsPayload,
  ): Promise<RecommendOutfitsResponse>;
  optimizeOutfitAnalysis(
    token: string,
    projectId: string,
    payload: OptimizeOutfitAnalysisPayload,
  ): Promise<OptimizeOutfitAnalysisResult>;
  selectOutfit(token: string, projectId: string, planId: string): Promise<{ id: string }>;
  unselectOutfit(token: string, projectId: string): Promise<{ ok: boolean }>;
  confirmOutfit(token: string, projectId: string): Promise<{ ok: boolean; status: string }>;
  listPresets(token: string): Promise<{ presets: Array<{ id: string; name: string; tags: string[] }> }>;
}

export const realStep2Api: RealStep2Api = {
  recommendOutfits(
    token: string,
    projectId: string,
    payload?: RecommendOutfitsPayload,
  ) {
    return request<RecommendOutfitsResponse>("POST", `/projects/${projectId}/outfits/recommend`, {
      token,
      body: payload ?? {},
    });
  },

  optimizeOutfitAnalysis(
    token: string,
    projectId: string,
    payload: OptimizeOutfitAnalysisPayload,
  ) {
    return request<OptimizeOutfitAnalysisResult>("POST", `/projects/${projectId}/outfits/analysis/optimize`, {
      token,
      body: payload,
    });
  },

  selectOutfit(token: string, projectId: string, planId: string) {
    return request<{ id: string }>("POST", `/projects/${projectId}/outfits/select`, {
      token,
      body: { planId },
    });
  },

  unselectOutfit(token: string, projectId: string) {
    return request<{ ok: boolean }>("POST", `/projects/${projectId}/outfits/unselect`, {
      token,
    });
  },

  confirmOutfit(token: string, projectId: string) {
    return request<{ ok: boolean; status: string }>("POST", `/projects/${projectId}/outfits/confirm`, {
      token,
    });
  },

  listPresets(token: string) {
    return request<{ presets: Array<{ id: string; name: string; tags: string[] }> }>("GET", "/characters/presets", { token });
  },
};
