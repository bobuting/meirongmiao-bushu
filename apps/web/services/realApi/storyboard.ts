/**
 * realApi/storyboard.ts - 分镜相关 API 实现
 */

import { request } from "../backendApi.request";
import { sanitizeStoryboardGeneratePayload } from "../../../../src/storyboard-scene-ref-sanitizer";
import type { BackendApiStoryboardGeneratePayload } from "../backendApi.storyboard";

export interface RealStoryboardApi {
  generateStoryboard(
    token: string,
    projectId: string,
    payload: BackendApiStoryboardGeneratePayload,
  ): Promise<{
    frames: Array<{
      id: string;
      index: number;
      imageUrl: string;
      variants?: string[];
      selectedVariantIndex?: number;
    }>;
  }>;
  selectStoryboardVariant(
    token: string,
    projectId: string,
    frameId: string,
    variantIndex: number,
  ): Promise<{
    id: string;
    imageUrl: string;
    variants?: string[];
    selectedVariantIndex?: number;
  }>;
  syncStoryboardLayout(
    token: string,
    projectId: string,
    payload: { frameIds: string[] },
  ): Promise<{
    frames: Array<{
      id: string;
      index: number;
      imageUrl: string;
      variants?: string[];
      selectedVariantIndex?: number;
    }>;
  }>;
  generateStoryboardSceneReferences(
    token: string,
    projectId: string,
    payload: {
      script?: string;
      scenes?: Array<{
        index: number;
        prompt: string;
        title?: string;
        referenceImageUrl?: string;
      }>;
      frameCount?: number;
      templateLabel?: string;
      count?: number;
    },
  ): Promise<{
    references: Array<{
      index: number;
      sceneDescription: string;
      referenceUrls?: string[];
    }>;
    debugPrompts?: Array<unknown>;
    items: Array<{
      index: number;
      candidates: string[];
      sceneDescription?: string;
    }>;
  }>;
  persistStoryboardAssets(
    token: string,
    projectId: string,
    payload: {
      frameIds?: string[];
      urls?: string[];
      scope?: string;
      frameIndex?: number;
    },
  ): Promise<{ ok: boolean; urls?: string[] }>;

  /** 启动批量分镜预览任务 */
  startBatchPreviewJob(token: string, projectId: string, payload: {
    frameIndexes: number[];
  }): Promise<{ jobId: string; status: string }>;

  /** 停止批量分镜预览任务 */
  stopBatchPreviewJob(token: string, projectId: string, jobId?: string): Promise<{
    success: boolean;
    jobId: string;
  }>;

  /** 启动单帧预览任务（全局队列） */
  startSingleFramePreviewJob(token: string, projectId: string, payload: {
    frameIndex: number;
  }): Promise<{ jobId: string; status: string }>;
}

export const realStoryboardApi: RealStoryboardApi = {
  generateStoryboard(
    token: string,
    projectId: string,
    payload: BackendApiStoryboardGeneratePayload,
  ) {
    const sanitizedPayload = sanitizeStoryboardGeneratePayload(payload);
    return request<{
      frames: Array<{
        id: string;
        index: number;
        imageUrl: string;
        variants?: string[];
        selectedVariantIndex?: number;
      }>;
    }>("POST", `/projects/${projectId}/storyboards/generate`, {
      token,
      body: sanitizedPayload,
    });
  },

  selectStoryboardVariant(
    token: string,
    projectId: string,
    frameId: string,
    variantIndex: number,
  ) {
    return request<{
      id: string;
      imageUrl: string;
      variants?: string[];
      selectedVariantIndex?: number;
    }>("POST", `/projects/${projectId}/storyboards/${frameId}/select-variant`, {
      token,
      body: { variantIndex },
    });
  },

  syncStoryboardLayout(
    token: string,
    projectId: string,
    payload: { frameIds: string[] },
  ) {
    return request<{
      frames: Array<{
        id: string;
        index: number;
        imageUrl: string;
        variants?: string[];
        selectedVariantIndex?: number;
      }>;
    }>("POST", `/projects/${projectId}/storyboards/layout`, {
      token,
      body: payload,
    });
  },

  generateStoryboardSceneReferences(
    token: string,
    projectId: string,
    payload: {
      script?: string;
      scenes?: Array<{
        index: number;
        prompt: string;
        title?: string;
        referenceImageUrl?: string;
      }>;
      frameCount?: number;
      templateLabel?: string;
      count?: number;
    },
  ) {
    return request<{
      references: Array<{
        index: number;
        sceneDescription: string;
        referenceUrls?: string[];
      }>;
      debugPrompts?: Array<unknown>;
      items: Array<{
        index: number;
        candidates: string[];
        sceneDescription?: string;
      }>;
    }>("POST", `/projects/${projectId}/storyboards/scene-references/generate`, {
      token,
      body: payload,
    });
  },

  persistStoryboardAssets(
    token: string,
    projectId: string,
    payload: { frameIds?: string[]; urls?: string[]; scope?: string; frameIndex?: number },
  ) {
    return request<{ ok: boolean; urls?: string[] }>("POST", `/projects/${projectId}/storyboards/assets/persist`, {
      token,
      body: payload,
    });
  },

  /** 启动批量分镜预览任务（后端编排，全局队列跟踪） */
  startBatchPreviewJob(token: string, projectId: string, payload: {
    frameIndexes: number[];
  }) {
    return request<{
      jobId: string;
      status: string;
    }>("POST", `/projects/${projectId}/storyboards/batch-preview`, {
      token,
      body: payload,
    });
  },

  /** 停止批量分镜预览任务 */
  stopBatchPreviewJob(token: string, projectId: string, jobId?: string) {
    return request<{
      success: boolean;
      jobId: string;
    }>("POST", `/projects/${projectId}/storyboards/batch-preview/stop`, {
      token,
      body: jobId ? { jobId } : {},
    });
  },

  /** 启动单帧预览任务（走全局队列，替代旧的 frame-preview-jobs） */
  startSingleFramePreviewJob(token: string, projectId: string, payload: {
    frameIndex: number;
  }) {
    return request<{
      jobId: string;
      status: string;
    }>("POST", `/projects/${projectId}/storyboards/frame-preview-v2`, {
      token,
      body: payload,
    });
  },
};