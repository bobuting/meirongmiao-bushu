/**
 * realApi/credits.ts - 额度管理相关 API 实现
 */

import { request } from "../backendApi.request";

export interface RealCreditsApi {
  loadCredits(token: string): Promise<{
    balance: number;
    expiresAt: number;
  }>;
  creditPricing(token: string): Promise<{
    singleImageCreditCost: number;
    singleVideoCreditCost: number;
    videoExportCreditCost: number;
    fissionPerVideoCreditCost: number;
    allRouteKeyCosts?: Record<string, number>;
  }>;
  spendCredits(
    token: string,
    payload: { routeKey: string; operation?: string; count?: number; reason?: string },
  ): Promise<{
    balance: number;
    expiresAt: number;
    spent: number;
  }>;
  creditHistory(
    token: string,
    limit?: number,
  ): Promise<{
    items: Array<{
      id: string;
      userId: string;
      createdAt: number;
      activity: string;
      success: boolean;
      chargeAmount: number;
    }>;
  }>;
  changePassword(
    token: string,
    payload: { currentPassword: string; nextPassword: string },
  ): Promise<{ updatedAt: number }>;
}

export const realCreditsApi: RealCreditsApi = {
  loadCredits(token: string) {
    return request<{
      balance: number;
      expiresAt: number;
    }>("GET", "/me/credits/mock", { token });
  },

  creditPricing(token: string) {
    return request<{
      singleImageCreditCost: number;
      singleVideoCreditCost: number;
      videoExportCreditCost: number;
      fissionPerVideoCreditCost: number;
    }>("GET", "/me/credits/pricing", { token });
  },

  spendCredits(
    token: string,
    payload: { routeKey: string; operation?: string; count?: number; reason?: string; projectId?: string },
  ) {
    return request<{
      balance: number;
      expiresAt: number;
      spent: number;
    }>("POST", "/me/credits/spend", {
      token,
      body: payload,
    });
  },

  creditHistory(token: string, limit = 100) {
    return request<{
      items: Array<{
        id: string;
        userId: string;
        createdAt: number;
        activity: string;
        success: boolean;
        chargeAmount: number;
      }>;
    }>("GET", `/me/credits/history?limit=${limit}`, { token });
  },

  changePassword(
    token: string,
    payload: { currentPassword: string; nextPassword: string },
  ) {
    return request<{ updatedAt: number }>("POST", "/me/password", {
      token,
      body: payload,
    });
  },
};