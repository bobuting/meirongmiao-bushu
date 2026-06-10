export type OutfitRecommendationSourceType = "visual" | "analysis";

export interface OutfitRecommendationSelectionContract {
  readonly selectedPlanId: string;
  readonly selectedSource: OutfitRecommendationSourceType;
  readonly selectedAssetIds: readonly string[];
}

export interface OutfitRecommendationRequestContract {
  readonly projectId: string;
  readonly userId: string;
  readonly selection: OutfitRecommendationSelectionContract;
}

export const OUTFIT_RECOMMENDATION_SELECTION_REQUIRED_FIELDS = [
  "selectedPlanId",
  "selectedSource",
  "selectedAssetIds",
] as const;

export const OUTFIT_RECOMMENDATION_ALLOWED_SOURCES: readonly OutfitRecommendationSourceType[] = [
  "visual",
  "analysis",
];

export function isOutfitRecommendationSelectionContract(
  value: OutfitRecommendationSelectionContract,
): boolean {
  if (!value.selectedPlanId || value.selectedPlanId.trim().length === 0) {
    return false;
  }
  if (!OUTFIT_RECOMMENDATION_ALLOWED_SOURCES.includes(value.selectedSource)) {
    return false;
  }
  if (!Array.isArray(value.selectedAssetIds) || value.selectedAssetIds.length < 1) {
    return false;
  }
  return value.selectedAssetIds.every((assetId) => typeof assetId === "string" && assetId.trim().length > 0);
}

export const OUTFIT_RECOMMENDATION_REQUEST_CONTRACT_VERSION = "N23-R1-02.v1";
