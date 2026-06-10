/**
 * realApi/themes.ts - 主题管理相关 API 实现
 */

import { request } from "../backendApi.request";
import type { Theme, ThemeCategory, ThemeConfig } from "../../types";

/**
 * 用户主题偏好响应（后端 /themes/current 返回格式）
 */
export interface UserThemeResponse {
  userId: string;
  themeId: string;
  systemName: string;
  customConfig?: Partial<ThemeConfig>;
  customLogoUrl: string;
  updatedAt: number;
  theme: Theme;
}

export interface RealThemesApi {
  listEnabledThemes(): Promise<Theme[]>;
  getCurrentUserTheme(token: string): Promise<UserThemeResponse>;
  setCurrentUserTheme(
    token: string,
    payload: { themeId: string; systemName?: string; customConfig?: Partial<ThemeConfig> },
  ): Promise<UserThemeResponse>;
  uploadUserLogo(
    token: string,
    logoUrl: string,
  ): Promise<{ logoUrl: string }>;
  getUserCreatedTheme(token: string): Promise<Theme | null>;
  listAllThemes(token: string): Promise<{ themes: Theme[] }>;
  listThemesPaginated(
    token: string,
    query?: {
      page?: number;
      pageSize?: number;
      category?: ThemeCategory;
      enabled?: boolean;
    },
  ): Promise<{
    items: Theme[];
    total: number;
    page: number;
    pageSize: number;
  }>;
  createTheme(
    token: string,
    payload: {
      name: string;
      displayName: string;
      category: ThemeCategory;
      config: ThemeConfig;
      logoUrl?: string;
    },
  ): Promise<Theme>;
  updateTheme(
    token: string,
    themeId: string,
    payload: Partial<{ name: string; displayName: string; category: ThemeCategory; config: ThemeConfig; logoUrl: string }>,
  ): Promise<Theme>;
  deleteTheme(token: string, themeId: string): Promise<{ ok: boolean }>;
  toggleTheme(
    token: string,
    themeId: string,
    enabled: boolean,
  ): Promise<{ ok: boolean }>;
}

export const realThemesApi: RealThemesApi = {
  listEnabledThemes() {
    return request<Theme[]>("GET", "/themes");
  },

  getCurrentUserTheme(token: string) {
    return request<UserThemeResponse>("GET", "/themes/current", { token });
  },

  setCurrentUserTheme(token: string, payload: { themeId: string; systemName?: string; customConfig?: Partial<ThemeConfig> }) {
    return request<UserThemeResponse>("PUT", "/themes/current", {
      token,
      body: payload,
    });
  },

  uploadUserLogo(token: string, logoUrl: string) {
    return request<{ logoUrl: string }>("POST", "/themes/current/logo", {
      token,
      body: { logoUrl },
    });
  },

  getUserCreatedTheme(token: string) {
    return request<Theme | null>("GET", "/themes/my-theme", { token });
  },

  listAllThemes(token: string) {
    return request<{ themes: Theme[] }>("GET", "/admin/themes", { token });
  },

  listThemesPaginated(
    token: string,
    query?: {
      page?: number;
      pageSize?: number;
      category?: ThemeCategory;
      enabled?: boolean;
    },
  ) {
    const params = new URLSearchParams();
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    if (query?.category) params.set("category", query.category);
    if (query?.enabled !== undefined) params.set("enabled", String(query.enabled));
    return request<{
      items: Theme[];
      total: number;
      page: number;
      pageSize: number;
    }>("GET", `/admin/themes/paginated?${params.toString()}`, { token });
  },

  createTheme(
    token: string,
    payload: {
      name: string;
      displayName: string;
      category: ThemeCategory;
      config: ThemeConfig;
      logoUrl?: string;
    },
  ) {
    return request<Theme>("POST", "/admin/themes", {
      token,
      body: payload,
    });
  },

  updateTheme(
    token: string,
    themeId: string,
    payload: Partial<{ name: string; displayName: string; category: ThemeCategory; config: ThemeConfig; logoUrl: string }>,
  ) {
    return request<Theme>("PUT", `/admin/themes/${themeId}`, {
      token,
      body: payload,
    });
  },

  deleteTheme(token: string, themeId: string) {
    return request<{ ok: boolean }>("DELETE", `/admin/themes/${themeId}`, { token });
  },

  toggleTheme(token: string, themeId: string, enabled: boolean) {
    return request<{ ok: boolean }>("PUT", `/admin/themes/${themeId}/toggle`, {
      token,
      body: { enabled },
    });
  },
};