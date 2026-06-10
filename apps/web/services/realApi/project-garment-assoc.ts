/**
 * realApi/project-garment-assoc.ts - 项目服饰关联 API 实现
 */

import { request } from "../backendApi.request";
import type { GarmentAsset } from "./garment-assets";

/** 项目服饰关联 */
export interface ProjectGarmentAssoc {
  id: string;
  projectId: string;
  garmentAssetId: string;
  createdAt: number;
  updatedAt: number;
}

/** 关联详情（包含服饰资产信息） */
export interface AssocWithAsset extends ProjectGarmentAssoc {
  asset?: GarmentAsset;
}

/** 项目服饰关联 API 接口 */
export interface RealProjectGarmentAssocApi {
  /** 获取项目的服饰资产关联列表 */
  listProjectGarmentAssocs(token: string, projectId: string): Promise<{ items: AssocWithAsset[] }>;
  /** 添加项目服饰关联 */
  addProjectGarmentAssoc(token: string, projectId: string, garmentAssetId: string): Promise<ProjectGarmentAssoc>;
  /** 移除项目服饰关联 */
  removeProjectGarmentAssoc(token: string, assocId: string): Promise<{ ok: boolean }>;
}

/** 项目服饰关联 API 实现 */
export const realProjectGarmentAssocApi: RealProjectGarmentAssocApi = {
  listProjectGarmentAssocs(token: string, projectId: string) {
    return request<{ items: AssocWithAsset[] }>("GET", `/project-garment-assoc?projectId=${projectId}`, { token });
  },

  addProjectGarmentAssoc(token: string, projectId: string, garmentAssetId: string) {
    return request<ProjectGarmentAssoc>("POST", "/project-garment-assoc", {
      token,
      body: { projectId, garmentAssetId },
    });
  },

  removeProjectGarmentAssoc(token: string, assocId: string) {
    return request<{ ok: boolean }>("DELETE", `/project-garment-assoc/${assocId}`, { token });
  },
};