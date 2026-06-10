/**
 * realApi/businessConfig.ts - 业务配置管理 API
 */

import { request } from "../backendApi.request";

export interface BusinessConfigItem {
  module: string;
  config: Record<string, unknown> | null;
  description: string | null;
}

export interface BusinessConfigListResponse {
  items: BusinessConfigItem[];
}

export interface BusinessConfigUpdatePayload {
  config: Record<string, unknown>;
  description?: string;
}

export interface TaskQueueStatus {
  globalActiveCount: number;
  pendingCount: number;
  runningCount: number;
  byType: Array<{ jobType: string; status: string; count: number }>;
}

export interface RealBusinessConfigApi {
  /** 获取所有业务配置模块列表 */
  businessConfigsList(token: string): Promise<BusinessConfigListResponse>;
  /** 获取指定模块配置 */
  businessConfigGet(token: string, module: string): Promise<BusinessConfigItem>;
  /** 更新指定模块配置 */
  businessConfigPatch(token: string, module: string, payload: BusinessConfigUpdatePayload): Promise<BusinessConfigItem>;
  /** 获取任务队列状态 */
  taskQueueStatus(token: string): Promise<TaskQueueStatus>;
}

export const realBusinessConfigApi: RealBusinessConfigApi = {
  async businessConfigsList(token: string) {
    return request<BusinessConfigListResponse>("GET", "/admin/business-configs", { token });
  },

  async businessConfigGet(token: string, module: string) {
    return request<BusinessConfigItem>("GET", `/admin/business-configs/${encodeURIComponent(module)}`, { token });
  },

  async businessConfigPatch(token: string, module: string, payload: BusinessConfigUpdatePayload) {
    return request<BusinessConfigItem>("PATCH", `/admin/business-configs/${encodeURIComponent(module)}`, {
      token,
      body: payload,
    });
  },

  async taskQueueStatus(token: string) {
    return request<TaskQueueStatus>("GET", "/admin/task-queue-status", { token });
  },
};
