/**
 * runtime-config.ts - 运行时配置 API（获取环境信息）
 */

import { request } from "../backendApi.request";

export interface RuntimeConfigData {
  nodeEnv: string;
  isProduction: boolean;
  outfitChangeEnabled: boolean;
}

export interface RealRuntimeConfigApi {
  getConfig(): Promise<{ success: boolean; data: RuntimeConfigData }>;
}

export const realRuntimeConfigApi: RealRuntimeConfigApi = {
  getConfig() {
    return request<{ success: boolean; data: RuntimeConfigData }>("GET", "/runtime-config", {});
  },
};