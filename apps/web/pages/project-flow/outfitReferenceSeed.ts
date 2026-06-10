import type { Step1OutfitSource } from "./step1SelectionState";
import { sanitizeStep1CarryoverPromptText } from "../../utils/sanitizePromptText";
import type { OutfitPlanDto } from "../../../../src/contracts/outfit-plan.dto";

/** 搭配方案种子数据（简化接口，用于引用构建） */
export type GeneratedOutfitSeed = Pick<OutfitPlanDto, "id" | "title" | "reason">;

interface AnalysisCardSeed {
  planId: string;
  optimizedPrompt: string;
  analysis?: string;
}

interface OutfitReferenceSeedInput {
  selectedPlanId: string;
  selectedSource: Step1OutfitSource;
  generatedOutfits: readonly GeneratedOutfitSeed[];
  analysisCards: readonly AnalysisCardSeed[];
  promptDraftByPlanId: Readonly<Record<string, string>>;
}

function normalizePlanId(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function buildOutfitReferenceSeed(input: OutfitReferenceSeedInput): string | null {
  const planId = normalizePlanId(input.selectedPlanId);
  if (!planId) {
    return null;
  }

  if (input.selectedSource === "analysis") {
    const draft = sanitizeStep1CarryoverPromptText(normalizePlanId(input.promptDraftByPlanId[planId]));
    if (draft) {
      return draft;
    }

    const card = input.analysisCards.find((item) => normalizePlanId(item.planId) === planId);
    if (!card) {
      return null;
    }
    return (
      sanitizeStep1CarryoverPromptText(normalizePlanId(card.optimizedPrompt)) ||
      sanitizeStep1CarryoverPromptText(normalizePlanId(card.analysis)) ||
      null
    );
  }

  const visualPlan = input.generatedOutfits.find((item) => normalizePlanId(item.id) === planId);
  if (!visualPlan) {
    return null;
  }

  const title = normalizePlanId(visualPlan.title);
  const reason = normalizePlanId(visualPlan.reason);

  if (title && reason) {
    return `${title}：${reason}`;
  }
  return title || reason || null;
}
