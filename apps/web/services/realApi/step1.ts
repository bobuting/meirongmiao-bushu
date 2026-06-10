/**
 * realApi/step1.ts - Step1 素材准备相关 API 实现
 */

import { request } from "../backendApi.request";
import type { Step1ImageClassificationResultDto, ImageGarmentAnalysisResultDto } from "../backendApi.types";
import type { Step1RoleDirectionCard } from "../../../../src/contracts/step1-joint-reverse-contract";

export interface RealStep1Api {
  uploadAssets(
    token: string,
    projectId: string,
    files: Array<{
      garmentAssetId: string;
      fileName: string;
      sizeMb: number;
    }>,
  ): Promise<{ assets: Array<{ id: string; category: string | null; fileName: string; sizeMb: number }> }>;
  step1ClassifyImage(
    token: string,
    projectId: string,
    payload: {
      imageUrl: string;
      fileName?: string;
      target?: "main" | "other";
      hasMainImage?: boolean;
      existingOtherViewCount?: number;
      includeFeedback?: boolean;
      // 传入时自动创建服饰资产（图片项目场景），不传则只分类
      sizeMb?: number;
      source?: string;
    },
  ): Promise<Step1ImageClassificationResultDto>;
  /** 图片项目专属：单品分析（分类+属性+卖点） */
  analyzeGarment(
    token: string,
    projectId: string,
    payload: {
      imageUrl: string;
      fileName?: string;
    },
  ): Promise<ImageGarmentAnalysisResultDto>;
  /** 新流程：基于服饰信息+性别年龄生成角色预设（不依赖穿搭方案） */
  step1GenerateRoleDirectionFromGarments(
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
}

export const realStep1Api: RealStep1Api = {
  uploadAssets(
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
      `/projects/${projectId}/uploads`,
      {
        token,
        body: { files },
      },
    );
  },

  step1ClassifyImage(
    token: string,
    projectId: string,
    payload: {
      imageUrl: string;
      fileName?: string;
      target?: "main" | "other";
      hasMainImage?: boolean;
      existingOtherViewCount?: number;
      includeFeedback?: boolean;
      sizeMb?: number;
      source?: string;
    },
  ) {
    return request<Step1ImageClassificationResultDto>("POST", `/projects/${projectId}/step1/classify-image`, {
      token,
      body: payload,
    });
  },

  analyzeGarment(
    token: string,
    projectId: string,
    payload: {
      imageUrl: string;
      fileName?: string;
    },
  ) {
    return request<ImageGarmentAnalysisResultDto>("POST", `/image-projects/${projectId}/step1/analyze-garment`, {
      token,
      body: payload,
    });
  },

  step1GenerateRoleDirectionFromGarments(
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
    }>("POST", `/projects/${projectId}/step1/role-direction-from-garments`, {
      token,
      body: {
        gender: payload.gender,
        ageRange: payload.ageRange,
      },
    });
  },
};