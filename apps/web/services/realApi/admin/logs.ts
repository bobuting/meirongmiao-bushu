/**
 * 日志管理 API
 */

import { request } from "../../backendApi.request";
import type {
  AdminErrorLog,
  AdminCallAudit,
  AdminAuditLog,
} from "./types";

export const logsApi = {
  // 错误日志
  async errorLogsList(token: string, filters: {
    page?: number;
    pageSize?: number;
    startDate?: number;
    endDate?: number;
    keyword?: string;
    severity?: string;
    errorCode?: string;
  }) {
    const params = new URLSearchParams();
    if (filters.page) params.set("page", String(filters.page));
    if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
    if (filters.startDate) params.set("startDate", String(filters.startDate));
    if (filters.endDate) params.set("endDate", String(filters.endDate));
    if (filters.keyword) params.set("keyword", filters.keyword);
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.errorCode) params.set("errorCode", filters.errorCode);
    return request<{ items: AdminErrorLog[]; page: number; pageSize: number }>(
      "GET",
      `/admin/error-logs?${params}`,
      { token }
    );
  },

  async errorLogDetail(token: string, id: string) {
    return request<AdminErrorLog>("GET", `/admin/error-logs/${id}`, { token });
  },

  async errorLogsStatsByCode(token: string, startDate: number, endDate: number, severity?: string) {
    const params = new URLSearchParams();
    params.set("startDate", String(startDate));
    params.set("endDate", String(endDate));
    if (severity) params.set("severity", severity);
    return request<Array<{ errorCode: string; count: number }>>(
      "GET",
      `/admin/error-logs/stats/by-code?${params}`,
      { token }
    );
  },

  async errorLogsStatsByDate(token: string, startDate: number, endDate: number, severity?: string) {
    const params = new URLSearchParams();
    params.set("startDate", String(startDate));
    params.set("endDate", String(endDate));
    if (severity) params.set("severity", severity);
    return request<Array<{ date: string; count: number }>>(
      "GET",
      `/admin/error-logs/stats/by-date?${params}`,
      { token }
    );
  },

  // LLM 调用审计
  async callAuditsList(token: string, filters: {
    page?: number;
    pageSize?: number;
    startDate?: number;
    endDate?: number;
    provider?: string;
    projectId?: string;
  }) {
    const params = new URLSearchParams();
    if (filters.page) params.set("page", String(filters.page));
    if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
    if (filters.startDate) params.set("startDate", String(filters.startDate));
    if (filters.endDate) params.set("endDate", String(filters.endDate));
    if (filters.provider) params.set("provider", filters.provider);
    if (filters.projectId) params.set("projectId", filters.projectId);
    return request<{ items: AdminCallAudit[]; total: number; page: number; pageSize: number }>(
      "GET",
      `/admin/call-audits?${params}`,
      { token }
    );
  },

  async callAuditsStats(token: string, startDate?: number, endDate?: number, projectId?: string) {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", String(startDate));
    if (endDate) params.set("endDate", String(endDate));
    if (projectId) params.set("projectId", projectId);
    return request<{
      total: number;
      successCount: number;
      successRate: number;
      avgLatency: number;
      totalCost: number;
    }>("GET", `/admin/call-audits/stats?${params}`, { token });
  },

  async callAuditDetail(token: string, id: string) {
    return request<Record<string, unknown>>("GET", `/admin/call-audits/${id}`, { token });
  },

  // 操作审计
  async auditLogsList(token: string, filters: {
    page?: number;
    pageSize?: number;
    startDate?: number;
    endDate?: number;
    userId?: string;
    keyword?: string;
  }) {
    const params = new URLSearchParams();
    if (filters.page) params.set("page", String(filters.page));
    if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
    if (filters.startDate) params.set("startDate", String(filters.startDate));
    if (filters.endDate) params.set("endDate", String(filters.endDate));
    if (filters.userId) params.set("userId", filters.userId);
    if (filters.keyword) params.set("keyword", filters.keyword);
    return request<{ items: AdminAuditLog[]; total: number; page: number; pageSize: number }>(
      "GET",
      `/admin/audit-logs?${params}`,
      { token }
    );
  },

  async auditLogDetail(token: string, id: string) {
    return request<Record<string, unknown>>("GET", `/admin/audit-logs/${id}`, { token });
  },

  // 日志导出
  async logsExport(token: string, payload: {
    type: "error" | "llm" | "audit";
    filters: {
      startDate?: number;
      endDate?: number;
      keyword?: string;
      severity?: string;
      errorCode?: string;
      provider?: string;
      userId?: string;
    };
    format: "csv" | "json";
  }) {
    const response = await fetch("/neirongmiao/api/admin/logs/export", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("导出失败");

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const filename =
      response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "logs-export";
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  },
};