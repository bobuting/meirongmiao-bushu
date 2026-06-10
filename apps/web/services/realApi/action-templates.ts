/**
 * 动作模板库 API 模块
 * AnimateAnyone 内置动作模板查询
 */

import { request } from "../backendApi.request";
import { API_PATH_PREFIX } from "../backendApi.config";

/** 动作模板分类 */
export type ActionTemplateCategory = "dance" | "sport" | "expression" | "daily" | "special";

/** 模板来源 */
export type ActionTemplateSource = "official" | "user_created" | "system";

/** 动作模板 */
export interface ActionTemplate {
  id: string;
  name: string;
  category: ActionTemplateCategory;
  aliTemplateId?: string;
  durationSec: number;
  thumbnailUrl?: string;
  previewVideoUrl?: string;
  previewGifUrl?: string;
  description?: string;
  tags?: string[];
  popularity: number;
  isActive: boolean;
  source: ActionTemplateSource;
  createdAt: number;
  updatedAt: number;
}

/** 查询模板列表参数 */
export interface QueryActionTemplatesParams {
  category?: ActionTemplateCategory;
  source?: ActionTemplateSource;
  sortBy?: "popularity" | "duration_sec" | "created_at";
  sortOrder?: "ASC" | "DESC";
  limit?: number;
  offset?: number;
}

/** 模板列表响应 */
export interface ActionTemplateListResponse {
  items: ActionTemplate[];
  total: number;
  hasMore: boolean;
}

/** 动作模板 API 接口 */
export interface RealActionTemplatesApi {
  /** 查询模板列表 */
  listTemplates(
    token: string,
    params?: QueryActionTemplatesParams
  ): Promise<{ success: boolean; data: ActionTemplateListResponse }>;

  /** 查询模板详情 */
  getTemplate(
    token: string,
    templateId: string
  ): Promise<{ success: boolean; data: ActionTemplate }>;
}

/** 动作模板库 API 实现 */
export const realActionTemplatesApi: RealActionTemplatesApi = {
  /** 查询模板列表 */
  listTemplates: async (token, params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.category) queryParams.set("category", params.category);
    if (params.source) queryParams.set("source", params.source);
    if (params.sortBy) queryParams.set("sortBy", params.sortBy);
    if (params.sortOrder) queryParams.set("sortOrder", params.sortOrder);
    if (params.limit) queryParams.set("limit", String(params.limit));
    if (params.offset) queryParams.set("offset", String(params.offset));

    const query = queryParams.toString();
    const path = query ? `/action-templates?${query}` : "/action-templates";

    return request("GET", path, { token });
  },

  /** 查询模板详情 */
  getTemplate: async (token, templateId) => {
    return request("GET", `/action-templates/${templateId}`, { token });
  },
};

// ============================================================================
// Admin 管理端 API（增删改查）
// ============================================================================

/** Admin 模板列表查询参数（含禁用状态筛选） */
export interface AdminQueryTemplatesParams extends QueryActionTemplatesParams {
  isActive?: boolean;
}

/** Admin 模板统计响应 */
export interface AdminTemplateStatsResponse {
  total: number;
  active: number;
  inactive: number;
  byCategory: Array<{
    category: ActionTemplateCategory;
    count: number;
    totalPopularity: number;
  }>;
  topTemplates: Array<{
    id: string;
    name: string;
    category: ActionTemplateCategory;
    popularity: number;
  }>;
}

/** Admin 创建模板参数 */
export interface AdminCreateTemplateParams {
  name: string;
  category: ActionTemplateCategory;
  aliTemplateId?: string;
  durationSec: number;
  thumbnailUrl?: string;
  previewVideoUrl?: string;
  previewGifUrl?: string;
  description?: string;
  tags?: string[];
  source?: ActionTemplateSource;
}

/** Admin 更新模板参数 */
export interface AdminUpdateTemplateParams {
  name?: string;
  category?: ActionTemplateCategory;
  thumbnailUrl?: string;
  previewVideoUrl?: string;
  previewGifUrl?: string;
  description?: string;
  tags?: string[];
  isActive?: boolean;
}

/** Admin 动作模板 API 接口 */
export interface AdminActionTemplatesApi {
  /** 查询模板列表（管理端，含禁用） */
  listTemplates(
    token: string,
    params?: AdminQueryTemplatesParams
  ): Promise<{ success: boolean; data: { items: ActionTemplate[]; total: number } }>;

  /** 查询模板统计 */
  getStats(token: string): Promise<{ success: boolean; data: AdminTemplateStatsResponse }>;

  /** 查询模板详情 */
  getTemplate(
    token: string,
    templateId: string
  ): Promise<{ success: boolean; data: ActionTemplate }>;

  /** 新增模板 */
  createTemplate(
    token: string,
    params: AdminCreateTemplateParams
  ): Promise<{ success: boolean; data: ActionTemplate }>;

  /** 更新模板 */
  updateTemplate(
    token: string,
    templateId: string,
    params: AdminUpdateTemplateParams
  ): Promise<{ success: boolean; data: ActionTemplate }>;

  /** 删除模板 */
  deleteTemplate(
    token: string,
    templateId: string
  ): Promise<{ success: boolean; data: { id: string; deleted: boolean } }>;
}

/** Admin 动作模板库 API 实现 */
export const adminActionTemplatesApi: AdminActionTemplatesApi = {
  /** 查询模板列表（管理端） */
  listTemplates: async (token, params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.category) queryParams.set("category", params.category);
    if (params.source) queryParams.set("source", params.source);
    if (params.isActive !== undefined) queryParams.set("isActive", String(params.isActive));
    if (params.sortBy) queryParams.set("sortBy", params.sortBy);
    if (params.sortOrder) queryParams.set("sortOrder", params.sortOrder);
    if (params.limit) queryParams.set("limit", String(params.limit));
    if (params.offset) queryParams.set("offset", String(params.offset));

    const query = queryParams.toString();
    const path = query ? `/admin/action-templates?${query}` : "/admin/action-templates";

    return request("GET", path, { token });
  },

  /** 查询模板统计 */
  getStats: async (token) => {
    return request("GET", "/admin/action-templates/stats", { token });
  },

  /** 查询模板详情 */
  getTemplate: async (token, templateId) => {
    return request("GET", `/admin/action-templates/${templateId}`, { token });
  },

  /** 新增模板 */
  createTemplate: async (token, params) => {
    return request("POST", "/admin/action-templates", { token, body: params });
  },

  /** 更新模板 */
  updateTemplate: async (token, templateId, params) => {
    return request("PUT", `/admin/action-templates/${templateId}`, { token, body: params });
  },

  /** 删除模板 */
  deleteTemplate: async (token, templateId) => {
    return request("DELETE", `/admin/action-templates/${templateId}`, { token });
  },
};

// ============================================================================
// 模板生成 API（上传视频生成模板）
// ============================================================================

/** 生成模板任务响应 */
export interface GenerateTemplateTaskResponse {
  taskId: string;
  queryUrl: string;
  status: "pending";
  message: string;
}

/** 查询生成任务状态响应 */
export interface QueryGenerateTaskResponse {
  status: "pending" | "succeeded" | "failed";
  taskId?: string;
  templateId?: string;
  duration?: number;
  template?: ActionTemplate;
  error?: string;
  message?: string;
}

/** 生成模板参数 */
export interface GenerateTemplateParams {
  videoUrl: string;
  name?: string;
  category?: ActionTemplateCategory;
  description?: string;
  tags?: string[];
}

/** 查询任务状态参数（用于创建模板记录） */
export interface QueryTaskParams {
  name?: string;
  category?: ActionTemplateCategory;
  description?: string;
  tags?: string;
  thumbnailUrl?: string;
  previewVideoUrl?: string;
  previewGifUrl?: string;
}

/** 上传参考视频响应 */
export interface UploadVideoResponse {
  fileName: string;
  url: string;
}

/** 模板生成 API */
export interface TemplateGenerateApi {
  /** 创建模板生成任务 */
  createGenerateTask(
    token: string,
    params: GenerateTemplateParams
  ): Promise<{ success: boolean; data: GenerateTemplateTaskResponse }>;

  /** 查询生成任务状态 */
  queryGenerateTask(
    token: string,
    taskId: string,
    params?: QueryTaskParams
  ): Promise<{ success: boolean; data: QueryGenerateTaskResponse }>;

  /** 上传参考视频 */
  uploadVideo(
    token: string,
    file: File
  ): Promise<{ success: boolean; data: UploadVideoResponse }>;
}

/** 模板生成 API 实现 */
export const templateGenerateApi: TemplateGenerateApi = {
  /** 创建模板生成任务 */
  createGenerateTask: async (token, params) => {
    return request("POST", "/admin/action-templates/generate", { token, body: params });
  },

  /** 查询生成任务状态 */
  queryGenerateTask: async (token, taskId, params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.name) queryParams.set("name", params.name);
    if (params.category) queryParams.set("category", params.category);
    if (params.description) queryParams.set("description", params.description);
    if (params.tags) queryParams.set("tags", params.tags);
    if (params.thumbnailUrl) queryParams.set("thumbnailUrl", params.thumbnailUrl);
    if (params.previewVideoUrl) queryParams.set("previewVideoUrl", params.previewVideoUrl);
    if (params.previewGifUrl) queryParams.set("previewGifUrl", params.previewGifUrl);

    const query = queryParams.toString();
    const path = query
      ? `/admin/action-templates/generate/${taskId}?${query}`
      : `/admin/action-templates/generate/${taskId}`;

    return request("GET", path, { token });
  },

  /** 上传参考视频 */
  uploadVideo: async (token, file) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_PATH_PREFIX}/admin/action-templates/upload-video`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    return response.json();
  },
};