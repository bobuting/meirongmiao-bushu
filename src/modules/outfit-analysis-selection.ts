export interface OutfitAnalysisSeedAsset {
  readonly libraryAssetId: string;
  readonly category: string;
}

export function pickOutfitAnalysisSeedAssets<T extends OutfitAnalysisSeedAsset>(
  assets: readonly T[],
  preferredAssetIds: readonly string[],
  categoryPriority: readonly string[],
): T[] {
  const normalizedPreferred = preferredAssetIds
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  if (normalizedPreferred.length < 1) {
    return rankOutfitAnalysisSeedAssets(assets, [], categoryPriority);
  }

  const assetsById = new Map<string, T>();
  for (const asset of assets) {
    if (!assetsById.has(asset.libraryAssetId)) {
      assetsById.set(asset.libraryAssetId, asset);
    }
  }

  const picked: T[] = [];
  for (const assetId of normalizedPreferred) {
    const match = assetsById.get(assetId);
    if (!match) {
      continue;
    }
    picked.push(match);
  }
  return picked;
}

export function rankOutfitAnalysisSeedAssets<T extends OutfitAnalysisSeedAsset>(
  assets: readonly T[],
  preferredAssetIds: readonly string[],
  categoryPriority: readonly string[],
): T[] {
  if (assets.length < 2) {
    return [...assets];
  }

  const preferredRank = new Map<string, number>();
  preferredAssetIds.forEach((assetId, index) => {
    if (!preferredRank.has(assetId)) {
      preferredRank.set(assetId, index);
    }
  });

  const categoryRank = new Map<string, number>();
  categoryPriority.forEach((category, index) => categoryRank.set(category, index));

  return [...assets].sort((a, b) => {
    const aPreferred = preferredRank.get(a.libraryAssetId);
    const bPreferred = preferredRank.get(b.libraryAssetId);

    if (aPreferred !== undefined || bPreferred !== undefined) {
      if (aPreferred === undefined) return 1;
      if (bPreferred === undefined) return -1;
      if (aPreferred !== bPreferred) {
        return aPreferred - bPreferred;
      }
    }

    return (categoryRank.get(a.category) ?? 99) - (categoryRank.get(b.category) ?? 99);
  });
}
