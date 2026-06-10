/**
 * 资产仓库端口（ProjectGarment + OutfitPlan + ProjectOutfitPlanAssoc）
 */

import type { ProjectGarment, OutfitPlan, ProjectOutfitPlanAssoc } from "../types.js";

/** 项目服饰仓库端口 */
export interface IAssetRepository {
  findById(id: string): Promise<ProjectGarment | null>;
  findByProjectId(projectId: string): Promise<ProjectGarment[]>;
  upsert(asset: ProjectGarment): Promise<void>;
  upsertByProjectAndGarmentAsset(garment: ProjectGarment): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
  list(): Promise<ProjectGarment[]>;
}

/** 搭配方案仓库端口 */
export interface IOutfitPlanRepository {
  findById(id: string): Promise<OutfitPlan | null>;
  findByProjectId(projectId: string): Promise<OutfitPlan[]>;
  upsert(plan: OutfitPlan): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
}

/** 项目-搭配方案关联仓库端口 */
export interface IProjectOutfitPlanAssocRepository {
  findById(id: string): Promise<ProjectOutfitPlanAssoc | null>;
  findByProjectId(projectId: string): Promise<ProjectOutfitPlanAssoc[]>;
  findByProjectAndOutfit(projectId: string, outfitPlanId: string): Promise<ProjectOutfitPlanAssoc | null>;
  upsert(assoc: ProjectOutfitPlanAssoc): Promise<void>;
  setSelected(projectId: string, outfitPlanId: string): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
}