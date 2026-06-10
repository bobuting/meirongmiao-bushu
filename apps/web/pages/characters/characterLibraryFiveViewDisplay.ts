import type { Character, CharacterViewDraft, CharacterViewKey } from "../../types";

export const CHARACTER_LIBRARY_FIVE_VIEW_ORDER: CharacterViewKey[] = [
  "front",
  "left",
  "right",
  "back",
  "closeup",
];

function normalizeUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isViewKey(value: unknown): value is CharacterViewKey {
  return value === "front" || value === "left" || value === "right" || value === "back" || value === "closeup";
}

function readCandidateFallback(view: CharacterViewDraft): string | null {
  if (!Array.isArray(view.candidates)) {
    return null;
  }
  for (const candidate of view.candidates) {
    const normalized = normalizeUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export interface CharacterLibraryFiveViewDisplayModel {
  byView: Record<CharacterViewKey, string | null>;
  closeupPreviewUrl: string | null;
  hasCompleteBoard: boolean;
}

export function buildCharacterLibraryFiveViewDisplayModel(
  character: Pick<Character, "thumbnail" | "fiveViewOssImageUrl" | "viewSession">,
): CharacterLibraryFiveViewDisplayModel {
  const byView: Record<CharacterViewKey, string | null> = {
    front: null,
    left: null,
    right: null,
    back: null,
    closeup: null,
  };

  for (const view of character.viewSession?.views ?? []) {
    if (!isViewKey(view?.key)) {
      continue;
    }
    const resolved = normalizeUrl(view.selectedImageUrl) ?? readCandidateFallback(view);
    byView[view.key] = resolved;
  }

  // 如果 viewSession 数据不完整，使用 fiveViewOssImageUrl 作为 front 视图的兜底
  if (!byView.front) {
    byView.front = normalizeUrl(character.fiveViewOssImageUrl);
  }

  const closeupPreviewUrl = byView.closeup ?? normalizeUrl(character.thumbnail);
  const hasCompleteBoard = CHARACTER_LIBRARY_FIVE_VIEW_ORDER.every((key) => Boolean(byView[key]));

  return {
    byView,
    closeupPreviewUrl,
    hasCompleteBoard,
  };
}
