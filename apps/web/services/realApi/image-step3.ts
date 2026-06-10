/**
 * realApi/image-step3.ts — 图片项目 Step 3 专用 API 模块
 *
 * 路径前缀: /image-projects/${projectId}/step3/...
 * Logo 路径前缀: /image-projects/${projectId}/logo
 */

import { request } from "../backendApi.request";
import type { ModelPhoto, LogoPosition } from "../../../../src/contracts/types";

/** Logo 配置响应 */
export interface LogoConfigResponse {
  logoUrl: string | null;
  logoPosition: LogoPosition;
  logoWidthRatio: number;
  logoMinWidth: number;
  logoMaxWidth: number;
  logoMargin: number;
  logoOpacity: number;
}

/** Logo 配置更新请求 */
export interface LogoConfigUpdateRequest {
  widthRatio?: number;
  minWidth?: number;
  maxWidth?: number;
  margin?: number;
  opacity?: number;
  position?: LogoPosition;
}

export interface ImageStep3Api {
  imageStep3GenerateBatch(
    token: string,
    projectId: string,
    payload?: {
      outfitSummary?: string;
      characterDescription?: string;
      photoCount?: number;
      backgroundStyle?: "solid" | "scene" | "balanced";
      /** 多色变体：指定非主色变体的资产 ID 列表 */
      colorVariantAssetIds?: string[];
      /** 多色同框模式：生成包含多个颜色变体的合照 */
      multiColorShowcase?: boolean;
    },
  ): Promise<{ jobs: Array<{ jobId: string; colorLabel?: string }>; variantGroups?: Array<{ groupId: string; members: Array<{ assetId: string; color: string | null }> }> }>;
  imageStep3ListPhotos(
    token: string,
    projectId: string,
  ): Promise<{ photos: ModelPhoto[] }>;
  imageStep3Regenerate(
    token: string,
    projectId: string,
    photoId: string,
    payload?: {
      newPoseLabel?: string;
      newBgLabel?: string;
      posePrompt?: string;
      bgPrompt?: string;
    },
  ): Promise<{ photo: ModelPhoto }>;
  imageStep3Select(
    token: string,
    projectId: string,
    photoId: string,
    payload: { isSelected: boolean },
  ): Promise<{ photo: ModelPhoto }>;
  /** 删除单张模特图 */
  imageStep3DeletePhoto(
    token: string,
    projectId: string,
    photoId: string,
  ): Promise<{ success: boolean }>;
  /** 获取 Logo 配置 */
  imageStep3GetLogo(
    token: string,
    projectId: string,
  ): Promise<LogoConfigResponse>;
  /** 上传 Logo */
  imageStep3UploadLogo(
    token: string,
    projectId: string,
    payload: { logoUrl: string },
  ): Promise<{ success: boolean; logoUrl: string }>;
  /** 删除 Logo */
  imageStep3DeleteLogo(
    token: string,
    projectId: string,
  ): Promise<{ success: boolean }>;
  /** 更新 Logo 配置（大小、边距等） */
  imageStep3UpdateLogoConfig(
    token: string,
    projectId: string,
    payload: LogoConfigUpdateRequest,
  ): Promise<{ success: boolean; config: LogoConfigResponse }>;
}

export const imageStep3Api: ImageStep3Api = {
  imageStep3GenerateBatch(
    token: string,
    projectId: string,
    payload?: {
      outfitSummary?: string;
      characterDescription?: string;
      photoCount?: number;
      backgroundStyle?: "solid" | "scene" | "balanced";
      colorVariantAssetIds?: string[];
      multiColorShowcase?: boolean;
      /** 多人模式：角色颜色分配 characterId → variantAssetId */
      characterColorMap?: Record<string, string>;
    },
  ) {
    return request<{ jobs: Array<{ jobId: string; colorLabel?: string }>; variantGroups?: Array<{ groupId: string; members: Array<{ assetId: string; color: string | null }> }> }>("POST", `/image-projects/${projectId}/step3/photos/generate-batch`, {
      token,
      body: payload ?? {},
    });
  },

  imageStep3ListPhotos(token: string, projectId: string) {
    return request<{ photos: ModelPhoto[] }>(
      "GET",
      `/image-projects/${projectId}/step3/photos`,
      { token },
    );
  },

  imageStep3Regenerate(
    token: string,
    projectId: string,
    photoId: string,
    payload?: {
      newPoseLabel?: string;
      newBgLabel?: string;
      posePrompt?: string;
      bgPrompt?: string;
    },
  ) {
    return request<{ photo: ModelPhoto }>(
      "POST",
      `/image-projects/${projectId}/step3/photos/${photoId}/regenerate`,
      {
        token,
        body: payload ?? {},
      },
    );
  },

  imageStep3Select(
    token: string,
    projectId: string,
    photoId: string,
    payload: { isSelected: boolean },
  ) {
    return request<{ photo: ModelPhoto }>(
      "POST",
      `/image-projects/${projectId}/step3/photos/${photoId}/select`,
      {
        token,
        body: payload,
      },
    );
  },

  imageStep3DeletePhoto(token: string, projectId: string, photoId: string) {
    return request<{ success: boolean }>(
      "DELETE",
      `/image-projects/${projectId}/step3/photos/${photoId}`,
      { token },
    );
  },

  imageStep3GetLogo(token: string, projectId: string) {
    return request<LogoConfigResponse>(
      "GET",
      `/image-projects/${projectId}/logo`,
      { token },
    );
  },

  imageStep3UploadLogo(
    token: string,
    projectId: string,
    payload: { logoUrl: string },
  ) {
    return request<{ success: boolean; logoUrl: string }>(
      "POST",
      `/image-projects/${projectId}/logo`,
      { token, body: payload },
    );
  },

  imageStep3DeleteLogo(token: string, projectId: string) {
    return request<{ success: boolean }>(
      "DELETE",
      `/image-projects/${projectId}/logo`,
      { token },
    );
  },

  imageStep3UpdateLogoConfig(token: string, projectId: string, payload: LogoConfigUpdateRequest) {
    return request<{ success: boolean; config: LogoConfigResponse }>(
      "PATCH",
      `/image-projects/${projectId}/logo/config`,
      { token, body: payload },
    );
  },
};
