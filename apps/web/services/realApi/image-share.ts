/**
 * realApi/image-share.ts — 图片项目公开分享 API
 * 无需认证，用于分享预览页面
 */

import { request } from "../backendApi.request";

export interface ImageShareProjectResponse {
  project: {
    id: string;
    name: string;
    status: string;
    createdAt: number;
    projectKind: string;
  };
  photos: Array<{
    id: string;
    imageUrl: string | null;
    poseLabel: string;
    bgLabel: string;
    isSelected: boolean;
    order: number;
  }>;
  sections: Array<{
    id: string;
    sectionKey: string;
    sectionType: string;
    title: string | null;
    goal: string | null;
    copy: string | null;
    currentImageAssetId: string | null;
    sortOrder: number;
  }>;
  ext: {
    logoUrl: string | null;
    logoPosition: string | null;
    longImageUrl: string | null;
  } | null;
  /** 长图历史记录（只读展示） */
  longImageGenerations: Array<{
    id: string;
    templateName: string | null;
    imageUrl: string;
    isActive: boolean;
    createdAt: number;
  }>;
}

export interface ImageShareApi {
  /** 获取图片项目分享信息（公开 API） */
  getImageProjectShareInfo(projectId: string): Promise<ImageShareProjectResponse>;
}

export const imageShareApi: ImageShareApi = {
  getImageProjectShareInfo(projectId: string) {
    return request<ImageShareProjectResponse>(
      "GET",
      `/share-image/projects/${projectId}`,
      { token: "" }, // 公开 API，无需 token
    );
  },
};