/**
 * 配置管理 API
 */

import { request } from "../../backendApi.request";
import type {
  AdminConfig,
  AdminConfigPatch,
  RouteKeyCreditCostsResponse,
} from "./types";

export const configApi = {
  async adminConfigGet(token: string) {
    const response = await request<{ config: AdminConfig }>("GET", "/admin/config", { token });
    return response.config;
  },

  async adminConfigPatch(token: string, payload: AdminConfigPatch) {
    const response = await request<{ config: AdminConfig }>("PATCH", "/admin/config", {
      token,
      body: payload,
    });
    return response.config;
  },

  async adminRouteKeyCreditCostsGet(token: string) {
    return request<RouteKeyCreditCostsResponse>("GET", "/admin/config/route-key-credit-costs", { token });
  },

  async adminRouteKeyCreditCostUpdate(token: string, key: string, cost: number) {
    return request<{ success: boolean; data: { key: string; cost: number } }>(
      "PUT",
      `/admin/config/route-key-credit-costs/${encodeURIComponent(key)}`,
      { token, body: { cost } },
    );
  },

  async adminRouteKeyCreditCostDelete(token: string, key: string) {
    return request<{ success: boolean; message: string }>(
      "DELETE",
      `/admin/config/route-key-credit-costs/${encodeURIComponent(key)}`,
      { token },
    );
  },

  reverseUiSettingsGet(token: string) {
    return request<{
      copyModuleHidden: boolean;
      pasteEnabled: boolean;
    }>("GET", "/system/reverse-ui-settings", { token });
  },
};
