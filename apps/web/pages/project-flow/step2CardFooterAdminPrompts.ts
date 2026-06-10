import type { Step1PromptViewerRole } from "../../../../src/contracts/step1-hidden-prompt-contract";
import type { Step2FinalPromptVariant } from "../../../../src/contracts/step2-final-prompt-variant";
import type { Step2FixedTemplatePromptBundle } from "../../../../src/contracts/step2-fixed-template-prompt-contract";

export function buildStep2CardFooterAdminPrompts(input: {
  fixedTemplatePromptBundle: Step2FixedTemplatePromptBundle | null;
  viewerRole: Step1PromptViewerRole;
}): Step2FinalPromptVariant[] {
  if (input.viewerRole !== "admin" || !input.fixedTemplatePromptBundle) {
    return [];
  }

  return input.fixedTemplatePromptBundle.variants.map((variant) => ({
    variantId: variant.variantId as Step2FinalPromptVariant["variantId"],
    displayOrder: variant.displayOrder as Step2FinalPromptVariant["displayOrder"],
    label: variant.label,
    prompt: `coreFeatures: ${variant.slotValues.coreFeatures}\nphase1Outfit: ${variant.slotValues.phase1Outfit}`,
    adminOnly: true as const,
  }));
}
