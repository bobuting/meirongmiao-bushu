export const FIVE_VIEW_CHARACTER_LIBRARY_CONTRACT_VERSION = "AT30-09.v1";

export interface FiveViewCharacterLibraryItem {
  characterId: string;
  name: string;
  closeupPreviewUrl: string | null;
  fiveViewAssetUrl: string | null;
  tags: string[];
}

export interface FiveViewCharacterDisplayCard {
  characterId: string;
  title: string;
  closeupPreviewUrl: string | null;
  fiveViewAssetUrl: string;
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value;
}

function assertNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or null`);
  }
  return value;
}

function normalizeLibraryItem(raw: unknown, index: number): FiveViewCharacterLibraryItem {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`items[${index}] must be an object`);
  }
  const item = raw as Record<string, unknown>;
  const tags = Array.isArray(item.tags)
    ? item.tags.map((tag, tagIndex) => assertNonEmptyString(tag, `items[${index}].tags[${tagIndex}]`))
    : [];

  return {
    characterId: assertNonEmptyString(item.characterId, `items[${index}].characterId`),
    name: assertNonEmptyString(item.name, `items[${index}].name`),
    closeupPreviewUrl: assertNullableString(item.closeupPreviewUrl, `items[${index}].closeupPreviewUrl`),
    fiveViewAssetUrl: assertNullableString(item.fiveViewAssetUrl, `items[${index}].fiveViewAssetUrl`),
    tags,
  };
}

export function filterFiveViewCharacterLibraryItems(input: unknown): FiveViewCharacterLibraryItem[] {
  if (!Array.isArray(input)) {
    throw new Error("library items must be an array");
  }
  return input
    .map((item, index) => normalizeLibraryItem(item, index))
    .filter((item) => typeof item.fiveViewAssetUrl === "string" && item.fiveViewAssetUrl.trim().length > 0);
}

export function toFiveViewCharacterDisplayCards(items: FiveViewCharacterLibraryItem[]): FiveViewCharacterDisplayCard[] {
  return items.map((item) => {
    if (!item.fiveViewAssetUrl || item.fiveViewAssetUrl.trim().length === 0) {
      throw new Error("display card requires fiveViewAssetUrl");
    }
    return {
      characterId: item.characterId,
      title: item.name,
      closeupPreviewUrl: item.closeupPreviewUrl,
      fiveViewAssetUrl: item.fiveViewAssetUrl,
    };
  });
}

export function assertFiveViewCharacterLibraryContract(): {
  version: string;
  filtersNonFiveViewItems: boolean;
  closeupCardFaceOnly: boolean;
  fullBoardShownInPanel: boolean;
} {
  return {
    version: FIVE_VIEW_CHARACTER_LIBRARY_CONTRACT_VERSION,
    filtersNonFiveViewItems: true,
    closeupCardFaceOnly: true,
    fullBoardShownInPanel: true,
  };
}
