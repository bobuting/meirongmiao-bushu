import type { CharacterViewKey } from "../types";

export interface Step3CharacterReferenceItem {
  id: string;
  label: string;
  imageUrl: string;
  viewKey?: CharacterViewKey;
}

const VIEW_ORDER: CharacterViewKey[] = ["closeup", "front", "left", "right", "back"];

const VIEW_LABEL_BY_KEY: Record<CharacterViewKey, string> = {
  front: "正面",
  left: "左侧",
  right: "右侧",
  back: "背面",
  closeup: "特写",
};

function normalizeViewKey(value: unknown): CharacterViewKey | undefined {
  if (value === "front" || value === "left" || value === "right" || value === "back" || value === "closeup") {
    return value;
  }
  return undefined;
}

function isOriginalBoardReference(item: Step3CharacterReferenceItem): boolean {
  const normalizedId = item.id.toLowerCase();
  const normalizedLabel = item.label;
  return (
    normalizedId.includes("original") ||
    normalizedId.includes("five-view") ||
    normalizedId.includes("fiveview") ||
    normalizedLabel.includes("原始图") ||
    normalizedLabel.includes("五视图")
  );
}

export function normalizeStep3CharacterReferencePool(
  input: Array<Partial<Step3CharacterReferenceItem> | null | undefined>,
): Step3CharacterReferenceItem[] {
  const byView = new Map<CharacterViewKey, Step3CharacterReferenceItem>();
  const extras: Step3CharacterReferenceItem[] = [];
  const seenImages = new Set<string>();

  for (const [index, raw] of input.entries()) {
    const imageUrl = typeof raw?.imageUrl === "string" ? raw.imageUrl.trim() : "";
    if (!imageUrl) {
      continue;
    }
    if (seenImages.has(imageUrl)) {
      continue;
    }
    seenImages.add(imageUrl);
    const viewKey = normalizeViewKey(raw?.viewKey);
    const normalized: Step3CharacterReferenceItem = {
      id:
        typeof raw?.id === "string" && raw.id.trim().length > 0
          ? raw.id.trim()
          : `${viewKey ?? "ref"}-${index + 1}`,
      label:
        typeof raw?.label === "string" && raw.label.trim().length > 0
          ? raw.label.trim()
          : viewKey
            ? VIEW_LABEL_BY_KEY[viewKey]
            : `参考图 ${index + 1}`,
      imageUrl,
      ...(viewKey ? { viewKey } : {}),
    };
    if (viewKey) {
      byView.set(viewKey, normalized);
      continue;
    }
    extras.push(normalized);
  }

  const prioritizedExtras = extras.filter((item) => isOriginalBoardReference(item));
  const remainingExtras = extras.filter((item) => !isOriginalBoardReference(item));
  return [
    ...prioritizedExtras,
    ...VIEW_ORDER.map((key) => byView.get(key)).filter((item): item is Step3CharacterReferenceItem => Boolean(item)),
    ...remainingExtras,
  ];
}

export function buildStep3CharacterReferencePoolFromStep2Views(
  input: Array<{ id?: string; label?: string; imageUrl?: string; viewKey?: CharacterViewKey | null }>,
): Step3CharacterReferenceItem[] {
  return normalizeStep3CharacterReferencePool(
    input.map((item, index) => ({
      id: item.id ?? `step2-view-${index + 1}`,
      label: item.label ?? "",
      imageUrl: item.imageUrl ?? "",
      viewKey: item.viewKey ?? undefined,
    })),
  );
}
