/**
 * 功能路由类型定义
 * 按 3 种统一类型切换模型：文本、图像、视频
 */

import type { ProviderType } from "./types.js";

/** 功能路由类型（统一为 3 种 ProviderType） */
export type FunctionalRouteType = ProviderType;

/** 所有功能路由类型 */
export const FUNCTIONAL_ROUTE_TYPES: FunctionalRouteType[] = ["text", "image", "video"];

/** 功能路由类型元数据 */
export const FUNCTIONAL_ROUTE_TYPE_META: Record<FunctionalRouteType, { label: string; description: string; supported: boolean }> = {
  text: { label: "文本模型", description: "纯文本、图片理解、视频理解等文本生成能力", supported: true },
  image: { label: "图像模型", description: "文生图、图生图等图像生成能力", supported: true },
  video: { label: "视频模型", description: "文生视频、图生视频等视频生成能力", supported: true },
};

/** 功能路由实体 */
export interface FunctionalRoute {
  id: string;
  type: FunctionalRouteType;
  providerId: string;
  fallbackProviderIds: string[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 创建功能路由输入 */
export interface CreateFunctionalRouteInput {
  type: FunctionalRouteType;
  providerId: string;
  fallbackProviderIds?: string[];
  enabled?: boolean;
}

/** 更新功能路由输入 */
export interface UpdateFunctionalRouteInput {
  providerId?: string;
  fallbackProviderIds?: string[];
  enabled?: boolean;
}

/** 功能路由配置 DTO（前端展示用） */
export interface FunctionalRouteDto {
  type: FunctionalRouteType;
  label: string;
  description: string;
  supported: boolean;
  providerId: string | null;
  providerName: string | null;
  providerVendor: string | null;
  providerModel: string | null;
  fallbackProviderIds: string[];
  enabled: boolean;
}

/** 校验功能路由类型 */
export function isFunctionalRouteType(value: unknown): value is FunctionalRouteType {
  return typeof value === "string" && FUNCTIONAL_ROUTE_TYPES.includes(value as FunctionalRouteType);
}

/** 解析功能路由类型 */
export function parseFunctionalRouteType(value: unknown): FunctionalRouteType {
  if (!isFunctionalRouteType(value)) {
    throw new Error(`Invalid functional route type: ${value}. Must be one of: ${FUNCTIONAL_ROUTE_TYPES.join(", ")}`);
  }
  return value;
}
