/**
 * 穿搭方案 DTO（前后端共用）
 * 统一搭配方案数据结构
 */

import { GARMENT_CATEGORY, type GarmentCategory } from "../contant-config/shared_dict.js";

/** 服饰类型常量数组（从 shared_dict 导出，供 Zod schema、映射等使用） */
export const OUTFIT_ITEM_TYPES: readonly GarmentCategory[] = Object.values(GARMENT_CATEGORY);

/** 服饰类型（复用系统统一定义） */
export type OutfitItemType = GarmentCategory;

/** 服饰单品来源 */
export type OutfitItemSource = "user" | "generated";

/** 服饰单品 DTO */
export interface OutfitItemDto {
  type: OutfitItemType;
  name: string;
  style?: string;
  description?: string;
  assetId?: string;
  source?: OutfitItemSource;
}

/** Grounding 搜索来源 */
export interface OutfitGroundingSourceDto {
  title: string;
  url: string;
}

/**
 * 穿搭方案 DTO（前后端共用）
 * API 响应、前端存储统一使用此类型
 *
 * 必填字段约束：
 * - analysis: LLM 分析内容，不能为空字符串
 * - optimizedPrompt: Step2 角色生成提示词，不能为空字符串
 */
export interface OutfitPlanDto {
  id: string;
  index: number;
  userId?: string;
  projectId?: string;
  assetIds: string[];
  garmentAssetId?: string;

  title: string;
  reason: string;
  styleName: string;
  /** LLM 分析内容（必填，不能为空字符串） */
  analysis: string;
  /** Step2 角色生成提示词（必填，不能为空字符串） */
  optimizedPrompt: string;

  analysisPrompt?: string;
  suitableScene?: string;
  tags?: string[];
  items?: OutfitItemDto[];
  trendSummary?: string;
  groundingSources?: OutfitGroundingSourceDto[];

  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number | null;
}

/** 获取搭配方案列表 API 响应 */
export interface GetOutfitPlansResponseDto {
  outfitPlans: OutfitPlanDto[];
  selectedOutfitPlanId: string | null;
}

/**
 * 验证 OutfitPlanDto 必填字段
 * 空字符串视为无效，抛出错误
 */
export function validateOutfitPlanDto(plan: Partial<OutfitPlanDto>, index: number): OutfitPlanDto {
  if (!plan.id || plan.id.trim().length === 0) {
    throw new Error(`搭配方案 ${index + 1}: id 不能为空`);
  }
  if (!plan.analysis || plan.analysis.trim().length === 0) {
    throw new Error(`搭配方案 ${index + 1}: LLM 分析内容 (analysis) 不能为空`);
  }
  if (!plan.optimizedPrompt || plan.optimizedPrompt.trim().length === 0) {
    throw new Error(`搭配方案 ${index + 1}: Step2 提示词 (optimizedPrompt) 不能为空`);
  }
  return {
    id: plan.id,
    index: plan.index ?? index + 1,
    userId: plan.userId,
    projectId: plan.projectId,
    assetIds: plan.assetIds ?? [],
    garmentAssetId: plan.garmentAssetId,
    title: plan.title || `搭配方案 ${plan.index ?? index + 1}`,
    reason: plan.reason || "",
    styleName: plan.styleName || "时尚风格",
    analysis: plan.analysis,
    optimizedPrompt: plan.optimizedPrompt,
    analysisPrompt: plan.analysisPrompt,
    suitableScene: plan.suitableScene,
    tags: plan.tags ?? [],
    items: plan.items ?? [],
    trendSummary: plan.trendSummary,
    groundingSources: plan.groundingSources ?? [],
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    deletedAt: plan.deletedAt,
  };
}