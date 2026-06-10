/**
 * Provider 管理 API（含 Policy）
 */

import { request } from "../../backendApi.request";
import type { ProviderRouteKey } from "../../backendApi.types";
import type { ProviderCallMode } from "@contracts/types";
import type {
  AdminProvider,
  AdminProviderPolicy,
  AdminProviderAudit,
  AdminFunctionalRoute,
} from "./types";

export const providersApi = {
  // Provider 管理
  adminProviders(token: string) {
    return request<{
      providers: AdminProvider[];
      typeModels: Record<string, { value: string; label: string }[]>;
    }>("GET", "/admin/providers", { token });
  },

  adminCreateProvider(token: string, payload: {
    name: string;
    type: string;
    vendor: string;
    baseUrl: string;
    model: string;
    callMode?: ProviderCallMode;
    accessKey?: string | null;
    remark?: string | null;
    enabled?: boolean;
    secret?: string;
    options?: { geminiGroundingEnabled?: boolean; geminiFallbackModels?: string[] };
  }) {
    return request<{ id: string; name: string; maskedSecret?: string }>("POST", "/admin/providers", {
      token,
      body: payload,
    });
  },

  adminUpdateProvider(token: string, providerId: string, payload: Partial<{
    name: string;
    vendor: string;
    baseUrl: string;
    model: string;
    callMode: ProviderCallMode;
    enabled: boolean;
    secret: string;
    remark?: string | null;
  }>) {
    return request<{ id: string; name: string; maskedSecret?: string }>(
      "PATCH",
      `/admin/providers/${providerId}`,
      { token, body: payload }
    );
  },

  adminDeleteProvider(token: string, providerId: string) {
    return request<{ ok: boolean }>("DELETE", `/admin/providers/${providerId}`, { token });
  },

  adminUpdateProviderSecret(token: string, providerId: string, secret: string) {
    return request<{ ok: boolean }>("PUT", `/admin/providers/${providerId}/secret`, {
      token,
      body: { secret },
    });
  },

  adminTestProviderConnectivity(token: string, providerId: string, payload?: {
    routeKey?: ProviderRouteKey;
    transportMode?: "auto" | "gemini" | "openai";
  }) {
    return request<{
      ok: boolean;
      providerId: string;
      routeKey: ProviderRouteKey;
      transportMode: string;
      sample: string;
    }>("POST", `/admin/providers/${providerId}/connectivity-test`, { token, body: payload ?? {} });
  },

  // Provider Policy 管理
  adminProviderPolicies(token: string) {
    return request<{ policies: AdminProviderPolicy[] }>("GET", "/admin/provider-policies", { token });
  },

  adminCreateProviderPolicy(token: string, payload: {
    routeKey: string;
    type: string;
    primaryProviderId: string;
    fallbackProviderIds?: string[];
    timeoutMs?: number;
    retryCount?: number;
    enabled?: boolean;
    description?: string;
  }) {
    return request<{ id: string }>("POST", "/admin/provider-policies", { token, body: payload });
  },

  adminUpdateProviderPolicy(token: string, policyId: string, payload: Partial<{
    routeKey: string;
    type: string;
    primaryProviderId: string;
    fallbackProviderIds: string[];
    timeoutMs: number;
    retryCount: number;
    enabled: boolean;
    description: string;
    sortOrder: number;
  }>) {
    return request<{ id: string }>("PATCH", `/admin/provider-policies/${policyId}`, { token, body: payload });
  },

  adminDeleteProviderPolicy(token: string, policyId: string) {
    return request<{ ok: boolean }>("DELETE", `/admin/provider-policies/${policyId}`, { token });
  },

  adminTestProviderPolicy(token: string, policyId: string, payload?: { userInput?: string; videoUrl?: string }) {
    return request<{
      ok: boolean;
      policyId: string;
      type: string;
      sample: string;
      latencyMs: number;
    }>("POST", `/admin/provider-policies/${policyId}/test`, { token, body: payload ?? {} });
  },

  adminProviderAudits(token: string, limit = 100) {
    return request<{ audits: AdminProviderAudit[] }>(
      "GET",
      `/admin/provider-audits?limit=${limit}`,
      { token }
    );
  },

  adminProviderAuditDetail(token: string, id: string) {
    return request<{ audit: AdminProviderAudit }>(
      "GET",
      `/admin/provider-audits/${encodeURIComponent(id)}`,
      { token }
    );
  },

  adminClearProviderAudits(token: string) {
    return request<{ ok: boolean }>("DELETE", "/admin/provider-audits", { token });
  },

  adminClearTasks(token: string) {
    return request<{ ok: boolean; stoppedCount: number; deletedCount: number }>(
      "POST",
      "/admin/tasks/clear",
      { token }
    );
  },

  // 功能路由配置
  adminFunctionalRoutes(token: string) {
    return request<{ routes: AdminFunctionalRoute[] }>("GET", "/admin/functional-routes", { token });
  },

  adminSetFunctionalRoute(token: string, type: string, payload: {
    providerId: string;
    fallbackProviderIds?: string[];
    enabled?: boolean;
  }) {
    return request<{
      id: string;
      type: string;
      providerId: string;
      fallbackProviderIds: string[];
      enabled: boolean;
      createdAt: number;
      updatedAt: number;
    }>("PUT", `/admin/functional-routes/${type}`, { token, body: payload });
  },

  adminBatchSetFunctionalRoutes(token: string, payload: {
    routes: Array<{
      type: string;
      providerId: string;
      fallbackProviderIds?: string[];
      enabled?: boolean;
    }>;
  }) {
    return request<{
      routes: Array<{
        id: string;
        type: string;
        providerId: string;
        fallbackProviderIds: string[];
        enabled: boolean;
        createdAt: number;
        updatedAt: number;
      }>;
    }>("POST", "/admin/functional-routes/batch", { token, body: payload });
  },

  adminDeleteFunctionalRoute(token: string, type: string) {
    return request<{ ok: boolean }>("DELETE", `/admin/functional-routes/${type}`, { token });
  },
};