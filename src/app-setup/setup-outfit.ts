/**
 * Outfit 推荐服务初始化模块
 *
 * 阶段 3: 创建 outfit 相关 helper 函数。
 */

import type { AppContext } from "../core/app-context.js";
import type { OutfitPlan } from "../contracts/types.js";
import type {
  OutfitSetupResult,
} from "./app-services.js";

/**
 * 阶段 3: Outfit 服务初始化
 *
 * 创建角色方向任务状态 Map 和相关 helper 函数。
 */
export function setupOutfit(ctx: AppContext): OutfitSetupResult {
  // 最大分析卡片数固定为 3（前端已固定）
  const resolveMaxOutfitAnalysisCards = (): number => 3;

  // 标准化搭配方案
  const normalizeOutfitPlans = (plans: OutfitPlan[]): OutfitPlan[] =>
    plans.map((plan) => ({
      ...plan,
      title: plan.title ?? `搭配方案 ${plan.index}`,
      reason: plan.reason ?? "突出版型与层次，适合短视频电商展示。",
    }));

  // 列出项目的搭配方案
  const listOutfitPlansByProject = async (projectId: string): Promise<OutfitPlan[]> =>
    [...await ctx.repos.outfitPlans.list()]
      .filter((plan) => plan.projectId === projectId)
      .sort((a, b) => a.index - b.index);

  return {
    resolveMaxOutfitAnalysisCards,
    normalizeOutfitPlans,
    listOutfitPlansByProject,
  };
}