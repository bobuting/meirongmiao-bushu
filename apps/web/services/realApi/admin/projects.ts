/**
 * 项目管理 API
 */

import { request } from "../../backendApi.request";
import type {
  AdminProjectListItem,
  AdminProjectDetail,
  MigratePreviewResponse,
  MigrateExecuteResponse,
} from "../../backendApi.types";

export const projectsApi = {
  listAdminProjects(token: string, params?: {
    projectKind?: "video" | "image" | "reverse" | "outfit_change";
    status?: string;
    companyName?: string;
    anomalyType?: "stuck" | "failed_task" | "slow_step";
    userId?: string;
    garmentCategory?: "top" | "bottom" | "shoes" | "accessory" | "suit" | "dress" | "outer";
    timeRange?: "today" | "7days" | "30days";
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.projectKind) queryParams.set("projectKind", params.projectKind);
    if (params?.status) queryParams.set("status", params.status);
    if (params?.companyName) queryParams.set("companyName", params.companyName);
    if (params?.anomalyType) queryParams.set("anomalyType", params.anomalyType);
    if (params?.userId) queryParams.set("userId", params.userId);
    if (params?.garmentCategory) queryParams.set("garmentCategory", params.garmentCategory);
    if (params?.timeRange) queryParams.set("timeRange", params.timeRange);
    if (params?.search) queryParams.set("search", params.search);
    if (params?.page) queryParams.set("page", String(params.page));
    if (params?.pageSize) queryParams.set("pageSize", String(params.pageSize));

    return request<{
      projects: AdminProjectListItem[];
      pagination: { page: number; pageSize: number; total: number; totalPages: number };
    }>("GET", `/admin/projects?${queryParams}`, { token });
  },

  getAdminProjectDetail(token: string, projectId: string) {
    return request<AdminProjectDetail>("GET", `/admin/projects/${projectId}/detail`, { token });
  },

  getAdminProjectScriptsRaw(token: string, projectId: string) {
    return request<{
      scripts: Array<{
        scriptId: string;
        title: string;
        isSelected: boolean;
        isConfirmed: boolean;
        strategyType: string;
        createdAt: number;
        payload: Record<string, unknown>;
        shotPrompts: Record<string, unknown> | null;
      }>;
    }>("GET", `/admin/projects/${projectId}/scripts/raw`, { token });
  },

  listAdminCompanies(token: string) {
    return request<{ companies: string[] }>("GET", "/admin/companies", { token });
  },

  getAdminAnomalies(token: string) {
    return request<{ failed: number; stuck: number; slowStep: number }>(
      "GET",
      "/admin/tasks/anomalies",
      { token }
    );
  },

  performAdminOperation(token: string, projectId: string, payload: {
    operationType: "unlock_script" | "unlock_character" | "unlock_outfit" | "reset_step" | "retry_task" | "force_complete" | "delete_project";
    reason: string;
    targetStep?: number;
    taskId?: string;
    preview?: boolean;
  }) {
    return request<{ success: boolean; message: string }>(
      "POST",
      `/admin/projects/${projectId}/operations`,
      { token, body: payload }
    );
  },

  async exportAdminProjects(token: string, filters?: {
    projectKind?: "video" | "image" | "reverse" | "outfit_change";
    status?: string;
    companyName?: string;
    anomalyType?: "stuck" | "failed_task" | "slow_step";
    userId?: string;
    garmentCategory?: "top" | "bottom" | "shoes" | "accessory" | "suit" | "dress" | "outer";
    timeRange?: "today" | "7days" | "30days";
    search?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (filters?.projectKind) queryParams.set("projectKind", filters.projectKind);
    if (filters?.status) queryParams.set("status", filters.status);
    if (filters?.companyName) queryParams.set("companyName", filters.companyName);
    if (filters?.anomalyType) queryParams.set("anomalyType", filters.anomalyType);
    if (filters?.userId) queryParams.set("userId", filters.userId);
    if (filters?.garmentCategory) queryParams.set("garmentCategory", filters.garmentCategory);
    if (filters?.timeRange) queryParams.set("timeRange", filters.timeRange);
    if (filters?.search) queryParams.set("search", filters.search);

    const response = await fetch(`/neirongmiao/api/admin/projects/export?${queryParams}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) throw new Error("导出失败");

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const filename =
      response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ||
      `projects-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  },

  /** 迁移预览 */
  async migrateProjectPreview(token: string, projectId: string): Promise<MigratePreviewResponse> {
    return request<MigratePreviewResponse>("POST", `/admin/projects/migrate`, {
      token,
      body: { projectId, preview: true },
    });
  },

  /** 执行迁移 */
  async migrateProjectExecute(token: string, projectId: string): Promise<MigrateExecuteResponse> {
    return request<MigrateExecuteResponse>("POST", `/admin/projects/migrate`, {
      token,
      body: { projectId, preview: false },
    });
  },
};