export type Step2PresetViewKey = "front" | "left" | "right" | "back" | "closeup";

export interface Step2PresetViewSessionItem {
  key: Step2PresetViewKey;
  label: string;
  selectedImageUrl: string | null;
  candidates: string[];
}

export interface Step2PresetViewSessionLike {
  views: Step2PresetViewSessionItem[];
}

export interface Step2PresetSource {
  id: string;
  kind: "basic" | "image" | "video";
  fiveViewOssImageUrl?: string | null;
  viewSession?: Step2PresetViewSessionLike | null;
}

export interface Step2PresetViewItem {
  id: string;
  label: string;
  imageUrl: string;
  viewKey: Step2PresetViewKey;
}

function pickLatestNonEmptyCandidate(candidates: readonly string[]): string {
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const item = candidates[index];
    if (typeof item !== "string") {
      continue;
    }
    const normalized = item.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return "";
}

const LEGACY_FALLBACK_ORDER: Step2PresetViewKey[] = ["front", "left", "right", "back", "closeup"];

function buildLegacyViewItems(
  preset: Step2PresetSource,
  labels: Record<Step2PresetViewKey, string>,
): Step2PresetViewItem[] {
  const items: Step2PresetViewItem[] = [];
  const imageUrl = preset.fiveViewOssImageUrl?.trim();
  if (!imageUrl) {
    return items;
  }
  // 使用 fiveViewOssImageUrl 作为正面视图
  items.push({
    id: `${preset.id}:legacy:front:0`,
    label: labels.front,
    imageUrl,
    viewKey: "front",
  });
  return items;
}

export function buildStep2PresetViewItems(
  preset: Step2PresetSource,
  labels: Record<Step2PresetViewKey, string>,
): Step2PresetViewItem[] {
  const legacyItems = buildLegacyViewItems(preset, labels);
  const legacyByKey = new Map<Step2PresetViewKey, Step2PresetViewItem>();
  legacyItems.forEach((item) => {
    legacyByKey.set(item.viewKey, item);
  });

  if (preset.viewSession?.views?.length) {
    const sessionByKey = new Map<Step2PresetViewKey, Step2PresetViewSessionItem>();
    preset.viewSession.views.forEach((view) => {
      sessionByKey.set(view.key, view);
    });

    const sessionResolvedViews = LEGACY_FALLBACK_ORDER.map((viewKey) => {
      const sessionView = sessionByKey.get(viewKey);
      const selectedImage =
        sessionView && typeof sessionView.selectedImageUrl === "string" ? sessionView.selectedImageUrl.trim() : "";
      const fallbackCandidate =
        sessionView && Array.isArray(sessionView.candidates) ? pickLatestNonEmptyCandidate(sessionView.candidates) : "";
      const imageUrl = selectedImage || fallbackCandidate || legacyByKey.get(viewKey)?.imageUrl || "";
      if (!imageUrl) {
        return null;
      }
      return {
        id: `${preset.id}:${viewKey}`,
        label: sessionView?.label || labels[viewKey],
        imageUrl,
        viewKey,
      } satisfies Step2PresetViewItem;
    }).filter((item): item is Step2PresetViewItem => Boolean(item));

    if (sessionResolvedViews.length > 0) {
      return sessionResolvedViews;
    }
  }

  if (preset.kind === "basic") {
    return [];
  }

  return legacyItems;
}
