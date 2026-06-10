/**
 * Step1 搭配分析卡片（渲染层专用）
 * 用于前端卡片展示，保证字段必填
 */

import type { OutfitPlanDto, OutfitItemType } from "./outfit-plan.dto.js";

export const STEP1_OUTFIT_ANALYSIS_CARD_CONTRACT_VERSION = "AT30-01.v1";

/** 卡片渲染状态 */
export type Step1OutfitCardStatus = "pending" | "ready" | "failed";

/** 服饰单品展示模型 */
export interface OutfitItemDisplay {
  type: string; // 显示用："上装" | "下装" | "鞋履" | "配饰"
  name: string;
  description?: string;
}

/**
 * Step1 搭配分析卡片（渲染层专用）
 * 核心字段保证必填，用于前端卡片展示
 */
export interface Step1OutfitAnalysisCard {
  planId: string;
  index: number;
  title: string;
  styleName: string;
  /** 分析内容（必填，空字符串兜底） */
  analysis: string;
  /** 优化提示词（必填） */
  optimizedPrompt: string;
  suitableScene?: string;
  tags?: string[];
  /** 单品列表（必填数组） */
  items: OutfitItemDisplay[];
  status: Step1OutfitCardStatus;
  groundingSources?: Array<{ title: string; url: string }>;
}

const TYPE_LABEL_MAP: Record<OutfitItemType, string> = {
  top: "上装",
  bottom: "下装",
  shoes: "鞋履",
  accessory: "配饰",
  suit: "套装",
  dress: "连衣裙",
  outer: "外套",
};

/**
 * 从 OutfitPlanDto 转换为渲染模型
 * 必填字段由 validateOutfitPlanDto 保证，不做兜底
 */
export function normalizeStep1OutfitAnalysisCard(
  dto: OutfitPlanDto,
  status: Step1OutfitCardStatus = "ready"
): Step1OutfitAnalysisCard {
  return {
    planId: dto.id,
    index: dto.index,
    title: dto.title || `搭配方案 ${dto.index}`,
    styleName: dto.styleName || "时尚风格",
    analysis: dto.analysis, // 必填，由 validateOutfitPlanDto 保证
    optimizedPrompt: dto.optimizedPrompt, // 必填，由 validateOutfitPlanDto 保证
    suitableScene: dto.suitableScene,
    tags: dto.tags || [],
    items: normalizeOutfitItems(dto.items),
    status,
    groundingSources: dto.groundingSources,
  };
}

/**
 * 归一化服饰单品列表
 */
function normalizeOutfitItems(
  items?: OutfitPlanDto["items"],
): OutfitItemDisplay[] {
  if (items && items.length > 0) {
    return items.map((item) => ({
      type: TYPE_LABEL_MAP[item.type] || item.type,
      name: item.name,
      description: item.description,
    }));
  }

  return [];
}

/**
 * 批量转换 OutfitPlanDto 为渲染卡片
 */
export function normalizeStep1OutfitAnalysisCards(
  dtos: OutfitPlanDto[],
  defaultStatus: Step1OutfitCardStatus = "ready"
): Step1OutfitAnalysisCard[] {
  return dtos.map((dto) => normalizeStep1OutfitAnalysisCard(dto, defaultStatus));
}

/**
 * 验证卡片数据完整性（用于调试）
 */
export function validateStep1OutfitAnalysisCard(card: Step1OutfitAnalysisCard): void {
  if (!card.planId || card.planId.trim().length === 0) {
    throw new Error("Step1OutfitAnalysisCard.planId must be non-empty string");
  }
  if (typeof card.analysis !== "string") {
    throw new Error("Step1OutfitAnalysisCard.analysis must be string (empty allowed)");
  }
  if (!Array.isArray(card.items)) {
    throw new Error("Step1OutfitAnalysisCard.items must be array");
  }
}