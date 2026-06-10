/**
 * realApi/image-step1.ts — 图片项目 Step 1 专用 API 模块
 *
 * 路径前缀: /image-projects/${projectId}/...
 * 不要修改 realApi/step1.ts（视频项目共享）
 */

import { request } from "../backendApi.request";
import type { Step1ImageClassificationResultDto } from "../backendApi.types";
import type { Step1RoleDirectionCard } from "../../../../src/contracts/step1-joint-reverse-contract";

export interface ImageStep1Api {
  imageUploadAssets(
    token: string,
    projectId: string,
    files: Array<{
      garmentAssetId: string;
      fileName: string;
      sizeMb: number;
    }>,
  ): Promise<{ assets: Array<{ id: string; category: string | null; fileName: string; sizeMb: number }> }>;
  imageStep1ClassifyImage(
    token: string,
    projectId: string,
    payload: {
      imageUrl: string;
      fileName?: string;
      target?: "main" | "other";
      hasMainImage?: boolean;
      existingOtherViewCount?: number;
      includeFeedback?: boolean;
    },
  ): Promise<Step1ImageClassificationResultDto>;

  /** 新流程：基于服饰信息+性别年龄生成角色预设（不依赖穿搭方案） */
  imageStep1GenerateRoleDirectionFromGarments(
    token: string,
    projectId: string,
    payload: {
      gender: "male" | "female";
      ageRange: string;
    },
  ): Promise<{
    status: "completed";
    roleDirectionCards: Step1RoleDirectionCard[];
  }>;

  /** 更新图片项目的选中角色方向（Step1 角色预设） */
  imageStep1UpdateProjectRoleDirection(
    token: string,
    projectId: string,
    roleDirection: Record<string, unknown> | null,
  ): Promise<{ success: boolean }>;

  /** 确认穿搭方案，进入定妆阶段（Step2） */
  imageStep1ConfirmOutfit(
    token: string,
    projectId: string,
  ): Promise<{ ok: boolean; status: string }>;
}

export const imageStep1Api: ImageStep1Api = {
  imageUploadAssets(
    token: string,
    projectId: string,
    files: Array<{
      garmentAssetId: string;
      fileName: string;
      sizeMb: number;
    }>,
  ) {
    return request<{ assets: Array<{ id: string; category: string | null; fileName: string; sizeMb: number }> }>(
      "POST",
      `/image-projects/${projectId}/uploads`,
      {
        token,
        body: { files },
      },
    );
  },

  imageStep1ClassifyImage(
    token: string,
    projectId: string,
    payload: {
      imageUrl: string;
      fileName?: string;
      target?: "main" | "other";
      hasMainImage?: boolean;
      existingOtherViewCount?: number;
      includeFeedback?: boolean;
    },
  ) {
    return request<Step1ImageClassificationResultDto>("POST", `/image-projects/${projectId}/step1/classify-image`, {
      token,
      body: payload,
    });
  },

  imageStep1GenerateRoleDirectionFromGarments(
    token: string,
    projectId: string,
    payload: {
      gender: "male" | "female";
      ageRange: string;
    },
  ) {
    return request<{
      status: "completed";
      roleDirectionCards: Step1RoleDirectionCard[];
    }>("POST", `/image-projects/${projectId}/step1/role-direction-from-garments`, {
      token,
      body: {
        gender: payload.gender,
        ageRange: payload.ageRange,
      },
    });
  },

  /** 更新图片项目的选中角色方向（Step1 角色预设） */
  imageStep1UpdateProjectRoleDirection(
    token: string,
    projectId: string,
    roleDirection: Record<string, unknown> | null,
  ) {
    return request<{ success: boolean }>("PUT", `/image-projects/${projectId}/role-direction`, {
      token,
      body: { roleDirection },
    });
  },

  /** 确认穿搭方案，进入定妆阶段（Step2） */
  imageStep1ConfirmOutfit(
    token: string,
    projectId: string,
  ) {
    return request<{ ok: boolean; status: string }>("POST", `/image-projects/${projectId}/outfits/confirm`, {
      token,
    });
  },
};
