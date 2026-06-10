import {
  resolveStep2GenerationDependencyState,
  type Step2GenerationDependencyState,
  type Step2SlotValues,
} from "../contracts/step2-generation-dependency-contract.js";

export interface Step2GenerationDependencyBridgeResult {
  sharedState: Step2GenerationDependencyState;
  variantStates: [Step2GenerationDependencyState, Step2GenerationDependencyState, Step2GenerationDependencyState];
}

function pickSlotVariant(input: readonly Step2SlotValues[], index: number): Step2SlotValues {
  return input[index] ?? input[0] ?? { coreFeatures: "", phase1Outfit: "" };
}

export function buildStep2GenerationDependencyBridge(input: {
  referenceImages: readonly string[];
  missingRequiredSlots: readonly string[];
  fixedTemplateSlotValues: readonly Step2SlotValues[];
}): Step2GenerationDependencyBridgeResult {
  const buildVariantState = (index: number) =>
    resolveStep2GenerationDependencyState({
      referenceImages: input.referenceImages,
      missingRequiredSlots: input.missingRequiredSlots,
      slotValueVariants: [pickSlotVariant(input.fixedTemplateSlotValues, index)],
    });

  return {
    sharedState: resolveStep2GenerationDependencyState({
      referenceImages: input.referenceImages,
      missingRequiredSlots: input.missingRequiredSlots,
      slotValueVariants: input.fixedTemplateSlotValues,
    }),
    variantStates: [buildVariantState(0), buildVariantState(1), buildVariantState(2)],
  };
}
