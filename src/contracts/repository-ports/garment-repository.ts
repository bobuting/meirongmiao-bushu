/**
 * 服饰资产仓库端口
 */

import type { GarmentAsset, ProjectGarmentAssoc } from "../types.js";

/** 服饰资产仓库端口 */
export interface IGarmentAssetRepository {
  findById(id: string): Promise<GarmentAsset | null>;
  findByUserId(userId: string): Promise<GarmentAsset[]>;
  findByIds(ids: string[]): Promise<GarmentAsset[]>;
  findPublicAssets(): Promise<GarmentAsset[]>; // user_id = "system"
  /** 用户资产 + 公共资产合并分页查询 */
  findByUserIdPaged(
    userId: string,
    options?: {
      page?: number;
      pageSize?: number;
      category?: string;
      keyword?: string;
    },
  ): Promise<{
    items: GarmentAsset[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }>;
  upsert(asset: GarmentAsset): Promise<void>;
  softDelete(id: string, deletedBy: string): Promise<void>;
  restore(id: string): Promise<void>;
  hardDelete(id: string): Promise<void>;
  /** 更新变体关联字段（仅项目内有效的同款不同色关联） */
  updateVariantFields(
    id: string,
    fields: { variantGroupId: string | null; variantColor: string | null; isPrimaryVariant: boolean },
  ): Promise<void>;
}

/** 项目服饰关联仓库端口 */
export interface IProjectGarmentAssocRepository {
  findById(id: string): Promise<ProjectGarmentAssoc | null>;
  findByProjectId(projectId: string): Promise<ProjectGarmentAssoc[]>;
  findByGarmentAssetId(assetId: string): Promise<ProjectGarmentAssoc[]>;
  findAssetIdsByProjectId(projectId: string): Promise<string[]>;
  upsert(assoc: ProjectGarmentAssoc): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
}