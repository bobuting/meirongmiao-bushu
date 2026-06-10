/**
 * realApi/garment-assets.ts - 服饰资产 API 实现
 */

import { request } from "../backendApi.request";
import type { GarmentAsset } from "../../../../src/contracts/types";

// 统一使用后端契约定义，避免前后端重复
export { type GarmentAsset };

/** 创建服饰资产参数 */
export interface CreateGarmentAssetInput {
  name: string;
  type: "image" | "video";
  category: "top" | "bottom" | "shoes" | "accessory" | "suit" | "dress" | "outer" | "outfit" | "video";
  mainImageUrl: string;
  subImageUrl1?: string | null;
  subImageUrl2?: string | null;
  subImageUrl3?: string | null;
  flatLayImageUrl?: string | null;
  sizeMb?: number;
  source?: string;
  // 服饰扩展属性
  description?: string | null;
  mainColor?: string | null;
  material?: string | null;
  pattern?: string | null;
  fit?: string | null;
  length?: string | null;
  neckline?: string | null;
  sleeve?: string | null;
  style?: string | null;
  occasion?: string | null;
  // 分类结果（含 garmentRegions）
  classification?: {
    category: string;
    viewLabel: string;
    confidence: number;
    reason: string;
    garmentRegions?: GarmentAsset["garmentRegions"];
  };
  /** 电商卖点 */
  sellingPoints?: Array<{
    point: string;
    category: string;
    priority: number;
  }>;
}

/** 更新服饰资产参数 */
export interface UpdateGarmentAssetInput {
  name?: string;
  category?: "top" | "bottom" | "shoes" | "accessory" | "suit" | "dress" | "outer" | "outfit";
  mainImageUrl?: string;
  subImageUrl1?: string | null;
  subImageUrl2?: string | null;
  subImageUrl3?: string | null;
  flatLayImageUrl?: string | null;
  sizeMb?: number;
  // 服饰扩展属性
  description?: string | null;
  mainColor?: string | null;
  material?: string | null;
  pattern?: string | null;
  fit?: string | null;
  length?: string | null;
  neckline?: string | null;
  sleeve?: string | null;
  style?: string | null;
  occasion?: string | null;
  /** 电商卖点 */
  sellingPoints?: Array<{
    point: string;
    category: string;
    priority: number;
  }> | null;
}

/** 服饰资产 API 接口 */
export interface RealGarmentAssetsApi {
  /** 获取服饰资产列表 */
  listGarmentAssets(token: string, params?: { page?: number; pageSize?: number; category?: string; keyword?: string }): Promise<{
    items: GarmentAsset[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }>;
  /** 获取单个服饰资产 */
  getGarmentAsset(token: string, assetId: string): Promise<GarmentAsset>;
  /** 创建服饰资产 */
  createGarmentAsset(token: string, input: CreateGarmentAssetInput): Promise<GarmentAsset>;
  /** 更新服饰资产 */
  updateGarmentAsset(token: string, assetId: string, input: UpdateGarmentAssetInput): Promise<GarmentAsset>;
  /** 删除服饰资产 */
  deleteGarmentAsset(token: string, assetId: string): Promise<{ ok: boolean }>;
  /** 生成服饰平铺图（传入 assetId 或图片 URL 数组，可选 projectId） */
  generateGarmentFlatLay(token: string, imageUrlsOrAssetId: string[] | { assetId: string; projectId?: string }): Promise<{ generatedImageUrl: string }>;
  /** 检查服饰资产是否被项目引用 */
  checkGarmentAssetReferenced(token: string, assetId: string): Promise<{ referenced: boolean; count: number }>;
  /** 设置主色变体 */
  setPrimaryVariant(token: string, assetId: string): Promise<{ success: boolean }>;
}

/** 服饰资产 API 实现 */
export const realGarmentAssetsApi: RealGarmentAssetsApi = {
  listGarmentAssets(token: string, params?: { page?: number; pageSize?: number; category?: string; keyword?: string }) {
    const queryParts: string[] = [];
    if (params?.page) queryParts.push(`page=${params.page}`);
    if (params?.pageSize) queryParts.push(`pageSize=${params.pageSize}`);
    if (params?.category && params.category !== 'all') queryParts.push(`category=${encodeURIComponent(params.category)}`);
    if (params?.keyword) queryParts.push(`keyword=${encodeURIComponent(params.keyword)}`);
    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    return request<{
      items: GarmentAsset[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      hasMore: boolean;
    }>("GET", `/garment-assets${qs}`, { token });
  },

  getGarmentAsset(token: string, assetId: string) {
    return request<GarmentAsset>("GET", `/garment-assets/${assetId}`, { token });
  },

  createGarmentAsset(token: string, input: CreateGarmentAssetInput) {
    return request<GarmentAsset>("POST", "/garment-assets", { token, body: input });
  },

  updateGarmentAsset(token: string, assetId: string, input: UpdateGarmentAssetInput) {
    return request<GarmentAsset>("PUT", `/garment-assets/${assetId}`, { token, body: input });
  },

  deleteGarmentAsset(token: string, assetId: string) {
    return request<{ ok: boolean }>("DELETE", `/garment-assets/${assetId}`, { token });
  },

  generateGarmentFlatLay(token: string, imageUrlsOrAssetId: string[] | { assetId: string; projectId?: string }) {
    // 支持两种调用方式：传 assetId 或传图片 URL 数组
    if (typeof imageUrlsOrAssetId === "object" && "assetId" in imageUrlsOrAssetId) {
      return request<{ generatedImageUrl: string }>("POST", "/garment-assets/generate-flat-lay", {
        token,
        body: { assetId: imageUrlsOrAssetId.assetId, projectId: imageUrlsOrAssetId.projectId }
      });
    }
    return request<{ generatedImageUrl: string }>("POST", "/garment-assets/generate-flat-lay", {
      token,
      body: { imageUrls: imageUrlsOrAssetId }
    });
  },

  checkGarmentAssetReferenced(token: string, assetId: string) {
    return request<{ referenced: boolean; count: number }>("GET", `/garment-assets/${assetId}/referenced`, { token });
  },

  setPrimaryVariant(token: string, assetId: string) {
    return request<{ success: boolean }>("PUT", `/garment-assets/${assetId}/set-primary-variant`, { token });
  },
};