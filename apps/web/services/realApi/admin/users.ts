/**
 * 用户管理 API
 */

import { request } from "../../backendApi.request";
import type {
  AdminUser,
  AdminCreateUserPayload,
  AdminUpdateUserPayload,
  AdminImportUsersPayload,
  AdminImportUsersResult,
  AdminCreditAuditItem,
} from "./types";

export const usersApi = {
  adminUsers(token: string) {
    return request<{ users: AdminUser[] }>("GET", "/admin/users", { token });
  },

  adminCreateUser(token: string, payload: AdminCreateUserPayload) {
    return request<AdminUser>("POST", "/admin/users", { token, body: payload });
  },

  adminUpdateUser(token: string, userId: string, payload: AdminUpdateUserPayload) {
    return request<AdminUser>("PATCH", `/admin/users/${userId}`, { token, body: payload });
  },

  adminDeleteUser(token: string, userId: string) {
    return request<{ ok: boolean }>("DELETE", `/admin/users/${userId}`, { token });
  },

  adminImportUsers(token: string, payload: AdminImportUsersPayload) {
    return request<AdminImportUsersResult>("POST", "/admin/users/import", { token, body: payload });
  },

  adminExportUsers(token: string) {
    return request<{
      users: Array<{
        id: string;
        email: string;
        role: "admin" | "user";
        createdAt: number;
      }>;
    }>("GET", "/admin/users/export", { token });
  },

  adminSetUserLock(token: string, userId: string, locked: boolean) {
    return request<{ ok: boolean }>("POST", `/admin/users/${userId}/lock`, {
      token,
      body: { locked },
    });
  },

  adminAdjustUserCredits(token: string, userId: string, payload: { delta: number; reason?: string }) {
    return request<{ balance: number }>("POST", `/admin/users/${userId}/credits/adjust`, {
      token,
      body: payload,
    });
  },

  adminCreditAudits(token: string, limit = 50, offset = 0, filters?: { userEmail?: string; projectId?: string; activity?: string }) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (filters?.userEmail) params.set("userEmail", filters.userEmail);
    if (filters?.projectId) params.set("projectId", filters.projectId);
    if (filters?.activity) params.set("activity", filters.activity);
    return request<{ items: AdminCreditAuditItem[]; total: number }>(
      "GET",
      `/admin/credit-audits?${params.toString()}`,
      { token }
    );
  },

  // 审核相关
  adminReviews(token: string) {
    return request<{
      reviews: Array<{
        id: string;
        resourceId: string;
        squareCategory: "男装" | "女装" | "男童装" | "女童装" | null;
        status: "pending" | "approved" | "rejected" | "needs_changes";
        published: boolean;
        authorEmail: string;
      }>;
    }>("GET", "/admin/reviews", { token });
  },

  adminReviewAction(token: string, reviewId: string, status: "approved" | "rejected") {
    return request<{ ok: boolean }>("POST", `/admin/reviews/${reviewId}/action`, {
      token,
      body: { status },
    });
  },

  adminConfirmPublish(token: string, reviewId: string) {
    return request<{ ok: boolean }>("POST", `/admin/reviews/${reviewId}/confirm-publish`, { token });
  },
};
