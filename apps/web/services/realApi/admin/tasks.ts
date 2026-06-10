/**
 * 任务管理 API
 */

import { request } from "../../backendApi.request";
import type { AdminSystemJob, AdminUserJob } from "./types";

export const tasksApi = {
  async adminGetSchedulerConfig(token: string) {
    const response = await request<{
      success: boolean;
      data: { scoringDaemonEnabled: boolean; evolutionEnabled: boolean };
    }>("GET", `/admin/task-management/scheduler-config`, { token });
    return response.data;
  },

  async adminUpdateSchedulerConfig(token: string, config: {
    scoringDaemonEnabled?: boolean;
    evolutionEnabled?: boolean;
  }) {
    const response = await request<{
      success: boolean;
      data: { scoringDaemonEnabled: boolean; evolutionEnabled: boolean };
    }>("PATCH", `/admin/task-management/scheduler-config`, { token, body: config });
    return response.data;
  },

  adminGetSystemJobs(token: string, params?: {
    jobType?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.jobType) queryParams.set("jobType", params.jobType);
    if (params?.status) queryParams.set("status", params.status);
    if (params?.page) queryParams.set("page", String(params.page));
    if (params?.pageSize) queryParams.set("pageSize", String(params.pageSize));

    return request<{ items: AdminSystemJob[]; total: number; stats: Record<string, number> }>(
      "GET",
      `/admin/task-management/system-jobs?${queryParams}`,
      { token }
    );
  },

  adminGetUserJobs(token: string, params?: {
    jobType?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.jobType) queryParams.set("jobType", params.jobType);
    if (params?.status) queryParams.set("status", params.status);
    if (params?.page) queryParams.set("page", String(params.page));
    if (params?.pageSize) queryParams.set("pageSize", String(params.pageSize));

    return request<{ items: AdminUserJob[]; total: number; stats: Record<string, number> }>(
      "GET",
      `/admin/task-management/user-jobs?${queryParams}`,
      { token }
    );
  },
};