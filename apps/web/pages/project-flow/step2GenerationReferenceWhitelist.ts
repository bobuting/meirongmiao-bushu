import type { Step2OutfitReferenceItem } from "./step2OutfitReference";
import { STEP2_GENERATION_DEPENDENCY_BLOCKED_REASONS } from "../../../../src/contracts/step2-generation-dependency-contract";

type RequiredStep2OutfitSlot = "top" | "bottom";
export type Step2GenerationReferencePolicyMode = "complete-outfit" | "single-confirmed";

const REQUIRED_STEP2_OUTFIT_SLOTS: RequiredStep2OutfitSlot[] = ["top", "bottom"];
const STEP2_GENERATION_BLOCK_MESSAGE = STEP2_GENERATION_DEPENDENCY_BLOCKED_REASONS.incompleteConfirmedOutfit;

export interface Step2GenerationReferenceWhitelistResult {
  referenceImages: string[];
  missingRequiredSlots: RequiredStep2OutfitSlot[];
  blockedReason: string | null;
}

export function resolveStep2GenerationReferenceWhitelist(
  outfitReferenceItems: Step2OutfitReferenceItem[],
  options?: { policyMode?: Step2GenerationReferencePolicyMode },
): Step2GenerationReferenceWhitelistResult {
  const policyMode = options?.policyMode === "single-confirmed" ? "single-confirmed" : "complete-outfit";
  const slotToImage = new Map<string, string>();
  for (const item of outfitReferenceItems) {
    const imageUrl = typeof item.imageUrl === "string" ? item.imageUrl.trim() : "";
    if (!imageUrl || slotToImage.has(item.category)) {
      continue;
    }
    slotToImage.set(item.category, imageUrl);
  }

  const referenceImages = Array.from(new Set(slotToImage.values()));
  // 只要有平铺图就放行，不再强制要求 top+bottom
  const missingRequiredSlots: RequiredStep2OutfitSlot[] = [];
  const blockedReason =
    referenceImages.length < 1
      ? STEP2_GENERATION_DEPENDENCY_BLOCKED_REASONS.missingConfirmedOutfitReference
      : null;
  return {
    referenceImages,
    missingRequiredSlots,
    blockedReason,
  };
}
