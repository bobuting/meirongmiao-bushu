export const STEP2_FINAL_PROMPT_VARIANT_CONTRACT_VERSION = "AT32-16.v1";

export interface Step2FinalPromptVariant {
  variantId: string;
  displayOrder: number;
  label: string;
  prompt: string;
  adminOnly: true;
}

export function assertStep2FinalPromptVariantContract(): {
  version: string;
  variants: number;
  adminOnly: boolean;
} {
  return {
    version: STEP2_FINAL_PROMPT_VARIANT_CONTRACT_VERSION,
    variants: 3,
    adminOnly: true,
  };
}
