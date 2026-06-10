/**
 * 脚本管理 API（含热点脚本）
 */

import { request } from "../../backendApi.request";
import type {
  AdminScript,
  AdminScriptWithVersion,
  AdminHotTrendScriptsResponse,
  AdminHotTrendScript,
  AdminHotTrendSyncLog,
  AdminHotTrendDailyReport,
  AdminScriptItem,
  AdminScriptScore,
} from "./types";

export const scriptsApi = {
  // 基础脚本管理
  adminScripts(token: string, params?: { page?: number; pageSize?: number }) {
    const query = params ? `?page=${params.page ?? 1}&pageSize=${params.pageSize ?? 20}` : "";
    return request<{
      scripts: AdminScript[];
      pagination: { page: number; pageSize: number; total: number };
    }>("GET", `/admin/scripts${query}`, { token });
  },

  adminCreateScript(token: string, payload: { title: string; content: string; tags?: string[]; ownerEmail?: string }) {
    return request<AdminScriptWithVersion>("POST", "/admin/scripts", { token, body: payload });
  },

  adminUpdateScript(token: string, scriptId: string, payload: Partial<{ title: string; content: string; tags: string[] }>) {
    return request<AdminScriptWithVersion>("PATCH", `/admin/scripts/${scriptId}`, { token, body: payload });
  },

  adminDeleteScript(token: string, scriptId: string) {
    return request<{ ok: boolean }>("DELETE", `/admin/scripts/${scriptId}`, { token });
  },

  adminImportScripts(token: string, payload: {
    items: Array<{
      projectId: string;
      basicInfo: string;
      roleTable?: string;
      outfitTable?: string;
      storyboard?: string;
    }>;
  }) {
    return request<{
      created: Array<{ id: string; projectId: string }>;
      failed: Array<{ projectId: string; reason: string }>;
      total: number;
    }>("POST", "/admin/scripts/import", { token, body: payload });
  },

  adminExportScripts(token: string) {
    return request<{
      scripts: Array<{
        id: string;
        projectId: string;
        version: number;
        payload: { basicInfo: string };
        createdAt: number;
      }>;
    }>("GET", "/admin/scripts/export", { token });
  },

  // 热点脚本
  adminHotTrendScripts(token: string, options?: { trendType?: "realtime" | "video"; page?: number; pageSize?: number }) {
    const qs = new URLSearchParams();
    if (options?.trendType) qs.set("trendType", options.trendType);
    if (options?.page) qs.set("page", String(options.page));
    if (options?.pageSize) qs.set("pageSize", String(options.pageSize));
    const query = qs.toString();
    return request<AdminHotTrendScriptsResponse>(
      "GET",
      `/admin/scripts/hot-trends${query ? `?${query}` : ""}`,
      { token }
    );
  },

  adminDeleteHotTrendScript(token: string, scriptId: string) {
    return request<{ ok: boolean }>("DELETE", `/admin/scripts/hot-trends/${scriptId}`, { token });
  },

  adminSyncHotTrendScripts(token: string, payload?: { force?: boolean; type?: "realtime" | "video" | "all" }) {
    return request<{
      synced: Array<{
        type: "realtime" | "video";
        syncedAt: number;
        nextSyncAt: number;
        topicCount: number;
        updatedAt: string | null;
      }>;
    }>("POST", "/admin/scripts/hot-trends/sync", { token, body: payload ?? {} });
  },

  adminHotTrendSyncLogs(token: string, params?: {
    page?: number;
    limit?: number;
    triggerType?: "scheduled" | "manual";
    trendType?: "realtime" | "video";
    status?: "running" | "success" | "failed";
  }) {
    const query = new URLSearchParams();
    query.set("page", String(params?.page ?? 1));
    query.set("limit", String(params?.limit ?? 20));
    if (params?.triggerType) query.set("triggerType", params.triggerType);
    if (params?.trendType) query.set("trendType", params.trendType);
    if (params?.status) query.set("status", params.status);
    return request<{ items: AdminHotTrendSyncLog[]; total: number; page: number; limit: number }>(
      "GET",
      `/admin/scripts/hot-trends/sync-logs?${query}`,
      { token }
    );
  },

  adminHotTrendDailyReports(token: string, params?: { page?: number; limit?: number }) {
    const query = new URLSearchParams();
    query.set("page", String(params?.page ?? 1));
    query.set("limit", String(params?.limit ?? 15));
    return request<{ items: AdminHotTrendDailyReport[]; total: number; page: number; limit: number }>(
      "GET",
      `/admin/hot-trend/daily-reports?${query}`,
      { token }
    );
  },

  adminHotTrendDailyReportDetail(token: string, reportDate: string) {
    return request<Record<string, unknown>>(
      "GET",
      `/admin/hot-trend/daily-reports/${reportDate}`,
      { token }
    );
  },

  adminUpsertHotTrendScript(token: string, payload: {
    title: string;
    content: string;
    tags?: string[];
    ownerEmail?: string;
    trendType?: "realtime" | "video";
    reason?: string;
  }) {
    return request<AdminHotTrendScript & { deduped: boolean }>(
      "POST",
      "/admin/scripts/hot-trends",
      { token, body: payload }
    );
  },

  adminUpdateHotTrendScript(token: string, scriptId: string, payload: Partial<{
    title: string;
    content: string;
    tags: string[];
    trendType: "realtime" | "video";
    reason: string;
  }>) {
    return request<AdminHotTrendScript & { deduped: boolean }>(
      "PATCH",
      `/admin/scripts/hot-trends/${scriptId}`,
      { token, body: payload }
    );
  },

  // 热点资源管理
  adminDeleteHotTrendAssets(token: string, scriptIds: string[]) {
    return request<{ ok: boolean }>("POST", "/admin/scripts/hot-trends/batch-delete", {
      token,
      body: { scriptIds },
    });
  },

  adminReverseHotTrendAssetToSmartStoryboard(token: string, scriptId: string) {
    return request<{ ok: boolean }>(
      "POST",
      `/admin/scripts/hot-trends/${scriptId}/reverse-to-smart-storyboard`,
      { token }
    );
  },

  adminPruneUnlinkedVideoHotTrendAssets(token: string, payload?: { rebuildLinked?: boolean }) {
    return request<{ deleted: number }>("POST", "/admin/scripts/hot-trends/video-prune-unlinked", {
      token,
      body: payload ?? {},
    });
  },

  adminRelabelHotTrendAssets(token: string, payload: { scriptIds: string[] }) {
    return request<{ updated: number }>("POST", "/admin/scripts/hot-trends/relabel", {
      token,
      body: payload,
    });
  },

  adminUpdateSmartStoryboard(token: string, itemId: string, payload: { tags?: string[]; notes?: string }) {
    return request<{ ok: boolean }>("PATCH", `/admin/smart-storyboards/${itemId}`, {
      token,
      body: payload,
    });
  },

  adminDeleteSmartStoryboards(token: string, itemIds: string[]) {
    return request<{ ok: boolean }>("POST", "/admin/smart-storyboards/batch-delete", {
      token,
      body: { itemIds },
    });
  },

  // 反推脚本（返回与普通脚本相同格式）
  getAdminReverseScript(token: string, scriptId: string) {
    return request<{
      scriptId: string;
      title: string;
      isSelected: boolean;
      isConfirmed: boolean;
      strategyType: string;
      createdAt: number;
      payload: Record<string, unknown>;
      shotPrompts: Record<string, unknown> | null;
      sourceType?: string;
      sourceOssUrl?: string | null;
    }>("GET", `/admin/reverse-scripts/${scriptId}`, { token });
  },

  // 脚本管理（新版）
  async adminGetScripts(token: string, params: {
    page?: number;
    pageSize?: number;
    strategy?: string;
    hasScore?: boolean;
    search?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.set("page", String(params.page));
    if (params.pageSize) queryParams.set("pageSize", String(params.pageSize));
    if (params.strategy) queryParams.set("strategy", params.strategy);
    if (params.hasScore !== undefined) queryParams.set("hasScore", String(params.hasScore));
    if (params.search) queryParams.set("search", params.search);

    const response = await request<{
      success: boolean;
      data: {
        items: AdminScriptItem[];
        total: number;
        scoresMap: Record<string, AdminScriptScore>;
      };
    }>("GET", `/admin/script-management/scripts?${queryParams}`, { token });
    return response.data;
  },

  async adminGetScriptQualityScore(token: string, scriptId: string) {
    const response = await request<{
      success: boolean;
      data: AdminScriptScore | null;
    }>("GET", `/admin/script-management/scripts/${scriptId}/score`, { token });
    return response.data;
  },

  adminGetScriptStats(token: string) {
    return request<{
      strategyStats: Array<{ strategy: string; avgScore: number; count: number }>;
      overallStats: { totalScripts: number; passedScripts: number; avgScore: number };
    }>("GET", `/admin/script-management/scripts/stats`, { token });
  },
};