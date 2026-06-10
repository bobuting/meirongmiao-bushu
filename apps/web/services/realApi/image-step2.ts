/**
 * realApi/image-step2.ts — 图片项目 Step 2 专用 API 模块
 *
 * 路径前缀: /image-projects/${projectId}/...
 * 不要修改 realApi/step2.ts（视频项目共享）
 */

import { request } from "../backendApi.request";

export interface ImageStep2Api {
  imageRecommendOutfits(
    token: string,
    projectId: string,
    payload: {
      topImageUrls?: string[];
      bottomImageUrls?: string[];
      shoesImageUrls?: string[];
      accessoryImageUrls?: string[];
      preference?: string;
    },
  ): Promise<{ plans: unknown[] }>;
  imageSelectOutfit(token: string, projectId: string, planId: string): Promise<{ id: string }>;
  imageUnselectOutfit(token: string, projectId: string): Promise<{ ok: boolean }>;
  imageListPresets(token: string): Promise<{ presets: Array<{ id: string; name: string; tags: string[] }> }>;
  /** 保存多人关系模式 */
  imageSetRelationMode(
    token: string,
    projectId: string,
    relationMode: string,
  ): Promise<{ success: boolean; relationMode: string }>;
  /** 获取多人关系模式 */
  imageGetRelationMode(
    token: string,
    projectId: string,
  ): Promise<{ success: boolean; relationMode: string }>;
}

export const imageStep2Api: ImageStep2Api = {
  imageRecommendOutfits(
    token: string,
    projectId: string,
    payload: {
      topImageUrls?: string[];
      bottomImageUrls?: string[];
      shoesImageUrls?: string[];
      accessoryImageUrls?: string[];
      preference?: string;
    },
  ) {
    return request<{ plans: unknown[] }>("POST", `/image-projects/${projectId}/step1/outfits/recommend`, {
      token,
      body: payload,
    });
  },

  imageSelectOutfit(token: string, projectId: string, planId: string) {
    return request<{ id: string }>("POST", `/image-projects/${projectId}/step1/outfits/select`, {
      token,
      body: { planId },
    });
  },

  imageUnselectOutfit(token: string, projectId: string) {
    return request<{ ok: boolean }>("POST", `/image-projects/${projectId}/step1/outfits/unselect`, {
      token,
    });
  },

  imageListPresets(token: string) {
    return request<{ presets: Array<{ id: string; name: string; tags: string[] }> }>("GET", "/characters/presets", { token });
  },

  imageSetRelationMode(token: string, projectId: string, relationMode: string) {
    return request<{ success: boolean; relationMode: string }>("PUT", `/image-projects/${projectId}/relation-mode`, {
      token,
      body: { relationMode },
    });
  },

  imageGetRelationMode(token: string, projectId: string) {
    return request<{ success: boolean; relationMode: string }>("GET", `/image-projects/${projectId}/relation-mode`, {
      token,
    });
  },
};
