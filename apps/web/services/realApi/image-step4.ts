/**
 * realApi/image-step4.ts - 图片项目 Step 4 电商详情页 API 实现
 * 使用共享的 PageSection / SectionType / SectionStatus 类型
 */

import { request } from "../backendApi.request";
import type { PageSection, SectionVersion, TextDisplayConfig, LayoutConfig } from "../../../../src/contracts/types";

export interface ListSectionsResponse {
  sections: PageSection[];
}

export interface CreateSectionBody {
  sectionType: string;
  title?: string;
}

export interface UpdateSectionBody {
  title?: string;
  copy?: string;
  editableData?: Record<string, unknown>;
  displayConfig?: TextDisplayConfig | null;
  layoutConfig?: LayoutConfig | null;
}

export interface ReorderSectionsBody {
  order: Array<{ id: string; sortOrder: number }>;
}

export interface LongImageGenerateResponse {
  jobId: string;
  status: string;
}

export interface LongImageGenerationItem {
  id: string;
  templateId: string | null;
  templateName: string | null;
  imageUrl: string;
  isActive: boolean;
  createdAt: number;
}

export interface LongImageStatusResponse {
  status: "idle" | "running" | "succeeded" | "failed";
  imageUrl?: string | null;
  sketchUrl?: string | null;
  stage?: string | null;
  error?: string | null;
  generations?: LongImageGenerationItem[];
}

export interface WanxiangTemplate {
  templateId: string;
  templateName: string;
  thumbnailUrl: string;
  category?: string;
  description?: string;
}

export interface LongImageTemplatesResponse {
  templates: WanxiangTemplate[];
}

export interface RealImageStep4Api {
  /** 获取所有 Section */
  imageStep4ListSections(token: string, projectId: string): Promise<ListSectionsResponse>;
  /** 创建 Section */
  imageStep4CreateSection(token: string, projectId: string, body: CreateSectionBody): Promise<{ section: PageSection }>;
  /** 更新 Section */
  imageStep4UpdateSection(token: string, projectId: string, sectionId: string, body: UpdateSectionBody): Promise<{ section: PageSection }>;
  /** 删除 Section */
  imageStep4DeleteSection(token: string, projectId: string, sectionId: string): Promise<{ success: boolean }>;
  /** 重排序 Section */
  imageStep4ReorderSections(token: string, projectId: string, order: Array<{ id: string; sortOrder: number }>): Promise<{ success: boolean }>;
  /** 提交万相营造长图生成任务 */
  imageStep4GenerateLongImage(token: string, projectId: string, options?: { templateId?: string; templateName?: string }): Promise<LongImageGenerateResponse>;
  /** 查询长图生成状态 */
  imageStep4GetLongImageStatus(token: string, projectId: string): Promise<LongImageStatusResponse>;
  /** 获取万相营造模板列表 */
  imageStep4GetLongImageTemplates(token: string, projectId: string): Promise<LongImageTemplatesResponse>;
  /** 代理下载 Sketch 文件（解决前端 CORS，返回 base64 编码） */
  imageStep4ProxySketchFile(token: string, projectId: string, sketchUrl: string): Promise<{ data: string; size: number; contentType: string }>;
  /** 激活长图历史记录 */
  imageStep4ActivateLongImage(token: string, projectId: string, generationId: string): Promise<{ imageUrl: string; sketchUrl: string | null }>;
}

export const realImageStep4Api: RealImageStep4Api = {
  imageStep4ListSections(token: string, projectId: string) {
    return request<ListSectionsResponse>(
      "GET",
      `/image-projects/${projectId}/sections`,
      { token },
    );
  },

  imageStep4CreateSection(token: string, projectId: string, body: CreateSectionBody) {
    return request<{ section: PageSection }>(
      "POST",
      `/image-projects/${projectId}/sections`,
      { token, body },
    );
  },

  imageStep4UpdateSection(token: string, projectId: string, sectionId: string, body: UpdateSectionBody) {
    return request<{ section: PageSection }>(
      "PUT",
      `/image-projects/${projectId}/sections/${sectionId}`,
      { token, body },
    );
  },

  imageStep4DeleteSection(token: string, projectId: string, sectionId: string) {
    return request<{ success: boolean }>(
      "DELETE",
      `/image-projects/${projectId}/sections/${sectionId}`,
      { token },
    );
  },

  imageStep4ReorderSections(token: string, projectId: string, order: Array<{ id: string; sortOrder: number }>) {
    return request<{ success: boolean }>(
      "PUT",
      `/image-projects/${projectId}/sections/reorder`,
      { token, body: { order } },
    );
  },

  imageStep4GenerateLongImage(token: string, projectId: string, options?: { templateId?: string }) {
    return request<LongImageGenerateResponse>(
      "POST",
      `/image-projects/${projectId}/long-image/generate`,
      { token, body: options },
    );
  },

  imageStep4GetLongImageStatus(token: string, projectId: string) {
    return request<LongImageStatusResponse>(
      "GET",
      `/image-projects/${projectId}/long-image/status`,
      { token },
    );
  },

  imageStep4GetLongImageTemplates(token: string, projectId: string) {
    return request<LongImageTemplatesResponse>(
      "GET",
      `/image-projects/${projectId}/long-image/templates`,
      { token },
    );
  },

  imageStep4ProxySketchFile(token: string, projectId: string, sketchUrl: string) {
    const encodedUrl = encodeURIComponent(sketchUrl);
    return request<{ data: string; size: number; contentType: string }>(
      "GET",
      `/image-projects/${projectId}/long-image/sketch-proxy?url=${encodedUrl}`,
      { token },
    );
  },

  imageStep4ActivateLongImage(token: string, projectId: string, generationId: string) {
    return request<{ imageUrl: string; sketchUrl: string | null }>(
      "PUT",
      `/image-projects/${projectId}/long-image/activate/${generationId}`,
      { token },
    );
  },

  /** 获取 sketch 文件上传预签名 URL（前端直传 OSS） */
  imageStep4SketchUploadUrl(token: string, projectId: string) {
    return request<{ success: boolean; uploadUrl: string; downloadUrl: string; objectKey: string }>(
      "GET",
      `/image-projects/${projectId}/long-image/sketch-upload-url`,
      { token },
    );
  },

  /** 编辑保存后更新 sketch URL */
  imageStep4SaveSketchUrl(token: string, projectId: string, data: { imageUrl?: string; sketchUrl?: string }) {
    return request<{ success: boolean; imageUrl: string; sketchUrl: string }>(
      "POST",
      `/image-projects/${projectId}/long-image/sketch-saved`,
      { token, body: data },
    );
  },

  /** 获取长图导出上传预签名 URL（WebP 格式，前端直传 OSS） */
  imageStep4ImageUploadUrl(token: string, projectId: string) {
    return request<{ success: boolean; uploadUrl: string; downloadUrl: string; objectKey: string }>(
      "GET",
      `/image-projects/${projectId}/long-image/image-upload-url`,
      { token },
    );
  },
};
