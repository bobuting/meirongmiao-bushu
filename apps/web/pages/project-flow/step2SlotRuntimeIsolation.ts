export type Step2SlotRuntimeKey = "closeup" | "front" | "left" | "right" | "back";

export interface Step2SlotRuntimePreviewItem {
  id: string;
  presetId: string;
  imageUrl: string;
  label?: string;
  sourceImageUrl?: string;
  viewKey?: Step2SlotRuntimeKey;
}

export interface Step2SlotRuntimeViewItem {
  id: string;
  label: string;
  imageUrl: string;
  viewKey?: Step2SlotRuntimeKey;
}

export interface Step2SlotRuntimeSelection {
  viewKey: Step2SlotRuntimeKey;
  targetId?: string | null;
  presetId: string;
  label: string;
  imageUrl: string;
  sourceImageUrl?: string | null;
}

export interface Step2SlotRuntimeIsolationResult {
  nextPreviews: Step2SlotRuntimePreviewItem[];
  nextStyledViews: Step2SlotRuntimeViewItem[];
  resolvedSelectedPreviewId: string | null;
  selectedPreviewImageUrl: string | null;
  touchedPreviewIds: string[];
}

const DEFAULT_SLOT_ORDER: readonly Step2SlotRuntimeKey[] = ["front", "left", "right", "back", "closeup"];

function buildOrderedList<T extends { id: string }>(
  currentItems: readonly T[],
  slotOrder: readonly Step2SlotRuntimeKey[],
  resolveSlotKey: (item: T) => Step2SlotRuntimeKey | null,
  itemBySlot: Map<Step2SlotRuntimeKey, T>,
): T[] {
  const ordered = slotOrder.flatMap((slot) => {
    const item = itemBySlot.get(slot);
    return item ? [item] : [];
  });
  const extras = currentItems.filter((item) => {
    const slot = resolveSlotKey(item);
    return !slot || !itemBySlot.has(slot);
  });
  return [...ordered, ...extras];
}

export function mergeStep2SlotRuntimeSelection(input: {
  currentPreviews: readonly Step2SlotRuntimePreviewItem[];
  currentStyledViews: readonly Step2SlotRuntimeViewItem[];
  selections: readonly Step2SlotRuntimeSelection[];
  selectedPreviewId: string | null;
  resolvePreviewSlotKey: (item: Step2SlotRuntimePreviewItem) => Step2SlotRuntimeKey | null;
  resolveStyledSlotKey: (item: Step2SlotRuntimeViewItem) => Step2SlotRuntimeKey | null;
  slotOrder?: readonly Step2SlotRuntimeKey[];
}): Step2SlotRuntimeIsolationResult {
  const slotOrder = input.slotOrder ?? DEFAULT_SLOT_ORDER;
  const previewBySlot = new Map<Step2SlotRuntimeKey, Step2SlotRuntimePreviewItem>();
  const styledBySlot = new Map<Step2SlotRuntimeKey, Step2SlotRuntimeViewItem>();

  for (const preview of input.currentPreviews) {
    const slot = input.resolvePreviewSlotKey(preview);
    if (slot && !previewBySlot.has(slot)) {
      previewBySlot.set(slot, preview);
    }
  }
  for (const view of input.currentStyledViews) {
    const slot = input.resolveStyledSlotKey(view);
    if (slot && !styledBySlot.has(slot)) {
      styledBySlot.set(slot, view);
    }
  }

  const targetIdBySlot = new Map<Step2SlotRuntimeKey, string>();
  for (const selection of input.selections) {
    const fallbackId =
      selection.targetId?.trim() ||
      previewBySlot.get(selection.viewKey)?.id ||
      styledBySlot.get(selection.viewKey)?.id ||
      `step2-slot-${selection.viewKey}`;
    targetIdBySlot.set(selection.viewKey, fallbackId);
    previewBySlot.set(selection.viewKey, {
      id: fallbackId,
      presetId: selection.presetId,
      imageUrl: selection.imageUrl,
      sourceImageUrl: selection.sourceImageUrl ?? selection.imageUrl,
      label: selection.label,
      viewKey: selection.viewKey,
    });
    styledBySlot.set(selection.viewKey, {
      id: fallbackId,
      label: selection.label,
      imageUrl: selection.imageUrl,
      viewKey: selection.viewKey,
    });
  }

  const nextPreviews = buildOrderedList(input.currentPreviews, slotOrder, input.resolvePreviewSlotKey, previewBySlot);
  const nextStyledViews = buildOrderedList(input.currentStyledViews, slotOrder, input.resolveStyledSlotKey, styledBySlot);

  const selectedPreview =
    input.currentPreviews.find((item) => item.id === input.selectedPreviewId) ??
    nextPreviews.find((item) => item.id === input.selectedPreviewId) ??
    null;
  const selectedSlot = selectedPreview ? input.resolvePreviewSlotKey(selectedPreview) : null;

  let resolvedSelectedPreviewId =
    input.selectedPreviewId && nextPreviews.some((item) => item.id === input.selectedPreviewId) ? input.selectedPreviewId : null;
  if (selectedSlot && targetIdBySlot.has(selectedSlot)) {
    resolvedSelectedPreviewId = targetIdBySlot.get(selectedSlot) ?? resolvedSelectedPreviewId;
  }
  if (!resolvedSelectedPreviewId) {
    resolvedSelectedPreviewId = nextPreviews[0]?.id ?? null;
  }

  return {
    nextPreviews,
    nextStyledViews,
    resolvedSelectedPreviewId,
    selectedPreviewImageUrl:
      nextPreviews.find((item) => item.id === resolvedSelectedPreviewId)?.imageUrl ?? null,
    touchedPreviewIds: input.selections
      .map((selection) => targetIdBySlot.get(selection.viewKey) ?? null)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  };
}
