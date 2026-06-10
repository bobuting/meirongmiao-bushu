export const STEP2_GENERATION_DEPENDENCY_CONTRACT_VERSION = "AT35-26.v1";

export const STEP2_GENERATION_DEPENDENCY_REQUIRED_REFERENCE_SLOTS = ["top", "bottom"] as const;

export const STEP2_GENERATION_DEPENDENCY_BLOCKED_REASONS = {
  incompleteConfirmedOutfit: "当前已确认服装不完整，请补齐后再生成。",
  missingConfirmedOutfitReference: "缺少已确认服装参考图，无法触发生图。",
  missingSlotValues: "固定模板提示词尚未就绪，请返回上一步确认角色设定。",
} as const;

export const STEP2_GENERATION_DEPENDENCY_INVARIANTS = [
  "Step2 board generation must only use confirmed Step1 outfit reference images as manual references.",
  "Step2 board generation prompt is rendered by the database template using slot values (coreFeatures + phase1Outfit).",
  "A dependency state is ready only when confirmed outfit references are complete and valid slot values are available.",
] as const;

/** 提示词槽位值：角色核心特征和穿搭描述 */
export interface Step2SlotValues {
  coreFeatures: string;
  phase1Outfit: string;
}

export interface Step2GenerationDependencyState {
  version: string;
  status: "blocked" | "ready";
  selectedSlotValues: Step2SlotValues | null;
  referenceImages: string[];
  slotVariantCount: number;
  blockedReason: string | null;
}

function normalizeStringList(values: readonly string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter((item) => item.length > 0))];
}

function normalizeSlotValues(values: readonly Step2SlotValues[]): Step2SlotValues[] {
  return values.filter((v) => v.coreFeatures.trim().length > 0 && v.phase1Outfit.trim().length > 0);
}

export function resolveStep2GenerationDependencyState(input: {
  referenceImages: readonly string[];
  missingRequiredSlots: readonly string[];
  slotValueVariants: readonly Step2SlotValues[];
  variantIndex?: number | null;
}): Step2GenerationDependencyState {
  const referenceImages = normalizeStringList(input.referenceImages);
  const validVariants = normalizeSlotValues(input.slotValueVariants);
  const preferredIndex =
    typeof input.variantIndex === "number" && Number.isInteger(input.variantIndex) && input.variantIndex >= 0
      ? input.variantIndex
      : 0;
  const selectedSlotValues = validVariants[preferredIndex] ?? validVariants[0] ?? null;

  let blockedReason: string | null = null;
  if (input.missingRequiredSlots.length > 0) {
    blockedReason = STEP2_GENERATION_DEPENDENCY_BLOCKED_REASONS.incompleteConfirmedOutfit;
  } else if (referenceImages.length < 1) {
    blockedReason = STEP2_GENERATION_DEPENDENCY_BLOCKED_REASONS.missingConfirmedOutfitReference;
  } else if (!selectedSlotValues) {
    blockedReason = STEP2_GENERATION_DEPENDENCY_BLOCKED_REASONS.missingSlotValues;
  }

  return {
    version: STEP2_GENERATION_DEPENDENCY_CONTRACT_VERSION,
    status: blockedReason ? "blocked" : "ready",
    selectedSlotValues,
    referenceImages,
    slotVariantCount: validVariants.length,
    blockedReason,
  };
}
