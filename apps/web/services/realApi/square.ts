/**
 * realApi/square.ts - 广场/热点相关 API 实现
 */

import { request } from "../backendApi.request";
import type { VideoScriptDataRecord } from "../../../../src/service/scripts-data-db-service";

// ============================================================================
// 类型定义
// ============================================================================

/** 发布到广场请求响应 */
export interface PublishToSquareResponse {
  success: boolean;
  message: string;
  requestId: string | null;
}

/** 发布状态记录 */
export interface PublishStatusRecord {
  id: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  rejectReason: string | null;
  createdAt: number;
  reviewedAt: number | null;
}

/** 发布状态查询响应 */
export interface PublishStatusResponse {
  success: boolean;
  message: string;
  records: PublishStatusRecord[];
}

// ============================================================================
// API 接口
// ============================================================================

export interface RealSquareApi {
  squareResources(): Promise<{
    resources: Array<{
      id: string;
      type: "script" | "character" | "storyboard";
      title: string;
      thumbnailUrl: string;
      tags: string[];
      createdAt: number;
    }>;
  }>;
  squareResolveVideoUrl(
    token: string,
    payload: { url: string },
  ): Promise<{
    videoUrl: string | null;
    error: string | null;
  }>;
  squareTemplateGetScript(
    token: string,
    templateId: string,
  ): Promise<{
    success: boolean;
    hasScript: boolean;
    script?: VideoScriptDataRecord;
    shotBreakdown?: Array<{
      id: string;
      scriptDataId: string;
      shotIndex: number;
      shotType: string | null;
      cameraMovement: string | null;
      shotDescription: string | null;
      timecodeStart: string | null;
      timecodeEnd: string | null;
      durationSeconds: number | null;
      visualJson: Record<string, unknown> | null;
      subjectsJson: unknown[] | null;
      audioJson: Record<string, unknown> | null;
      textElementsJson: unknown[] | null;
    }>;
    reason?: string;
  }>;
  squareTemplateLinkScript(
    token: string,
    templateId: string,
    scriptDataId: string,
  ): Promise<{ success: boolean }>;
  /** 发布到广场（创建发布申请） */
  publishToSquare(
    token: string,
    projectId: string,
    squarePublishCategory?: string | null,
  ): Promise<PublishToSquareResponse>;
  /** 查询项目的发布状态 */
  checkPublishStatus(
    token: string,
    projectId: string,
  ): Promise<PublishStatusResponse>;
}

export const realSquareApi: RealSquareApi = {
  squareResources() {
    return request<{
      resources: Array<{
        id: string;
        type: "script" | "character" | "storyboard";
        title: string;
        thumbnailUrl: string;
        tags: string[];
        createdAt: number;
      }>;
    }>("GET", "/square/resources");
  },

  squareResolveVideoUrl(
    token: string,
    payload: { url: string },
  ) {
    return request<{
      videoUrl: string | null;
      error: string | null;
    }>("POST", "/square/trends/resolve-video-url", {
      token,
      body: payload,
    });
  },

  squareTemplateGetScript(token: string, templateId: string) {
    return request<{
      success: boolean;
      hasScript: boolean;
      script?: VideoScriptDataRecord;
      shotBreakdown?: Array<{
        id: string;
        scriptDataId: string;
        shotIndex: number;
        shotType: string | null;
        cameraMovement: string | null;
        shotDescription: string | null;
        timecodeStart: string | null;
        timecodeEnd: string | null;
        durationSeconds: number | null;
        visualJson: Record<string, unknown> | null;
        subjectsJson: unknown[] | null;
        audioJson: Record<string, unknown> | null;
        textElementsJson: unknown[] | null;
      }>;
      reason?: string;
    }>("GET", `/square-templates/${templateId}/script`, { token });
  },

  squareTemplateLinkScript(token: string, templateId: string, scriptDataId: string) {
    return request<{ success: boolean }>("POST", `/square-templates/${templateId}/link-script`, {
      token,
      body: { scriptDataId },
    });
  },

  /** 发布到广场（创建发布申请） */
  publishToSquare(token: string, projectId: string, squarePublishCategory?: string | null) {
    return request<PublishToSquareResponse>("POST", "/square/publish", {
      token,
      body: { projectId, squarePublishCategory },
    });
  },
  /** 查询项目的发布状态 */
  checkPublishStatus(token: string, projectId: string) {
    return request<PublishStatusResponse>("GET", `/square/publish-status?projectId=${projectId}`, {
      token,
    });
  },
};