import {
  CHARACTER_WORKFLOW_SYSTEM_SETTINGS_DEFAULTS,
  type CharacterWorkflowStep2PromptMode,
} from "./character-workflow-system-settings.js";

export const STEP2_FIXED_TEMPLATE_PROMPT_CONTRACT_VERSION = "AT36-03.v1";

export const STEP2_FIXED_TEMPLATE_DIRTY_TOKEN_BLACKLIST = [
  "后续定妆整体提示词",
  "Step1搭配参考",
  "hiddenRoleSettingPrompt",
  "adminDebugPrompt",
  "角色方向ID",
  "角色方向标题",
  "角色方向摘要",
  "方向 ID",
  "搭配方案 ID",
  "prompt:",
  "optimized prompt:",
  "json",
  "return only",
  "Generate one ecommerce-ready",
  "Character core features:",
  "The character is wearing outfit from Phase 1:",
] as const;

export interface Step2FixedTemplateVariantSeedInput {
  coreFeatures?: string;
  phase1Outfit?: string;
  mode?: CharacterWorkflowStep2PromptMode;
}

export interface Step2FixedTemplatePromptInput {
  coreFeatures: string;
  phase1Outfit: string;
  variantSeeds?: readonly Step2FixedTemplateVariantSeedInput[];
}

export interface Step2FixedTemplateVariant {
  variantId: "image-1" | "image-2" | "image-3";
  displayOrder: 1 | 2 | 3;
  label: string;
  mode: CharacterWorkflowStep2PromptMode;
  slotValues: {
    coreFeatures: string;
    phase1Outfit: string;
  };
}

export interface Step2FixedTemplatePromptBundle {
  version: string;
  slotValues: {
    coreFeatures: string;
    phase1Outfit: string;
  };
  variants: readonly Step2FixedTemplateVariant[];
}

const STEP2_FIXED_TEMPLATE_VARIANT_IDS = ["image-1", "image-2", "image-3"] as const;

const STEP2_FIXED_TEMPLATE_DEFAULT_MODES: readonly CharacterWorkflowStep2PromptMode[] = [
] as const;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanSlotValue(rawValue: string, slotName: "coreFeatures" | "phase1Outfit"): string {
  const normalized = collapseWhitespace(String(rawValue ?? ""));
  if (!normalized) {
    throw new Error(`${slotName} slot must be a non-empty string`);
  }

  let cleaned = normalized;
  const blacklistTokens = [...STEP2_FIXED_TEMPLATE_DIRTY_TOKEN_BLACKLIST].sort((left, right) => right.length - left.length);
  for (const token of blacklistTokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(escaped, "gi"), " ");
  }
  cleaned = collapseWhitespace(cleaned).replace(/^[,;:]+|[,;:]+$/g, "").trim();
  if (!cleaned) {
    throw new Error(`${slotName} slot must remain non-empty after blacklist cleaning`);
  }
  return cleaned;
}

export function buildStep2FixedTemplatePromptBundle(
  input: Step2FixedTemplatePromptInput,
): Step2FixedTemplatePromptBundle {
  const coreFeatures = cleanSlotValue(input.coreFeatures, "coreFeatures");
  const phase1Outfit = cleanSlotValue(input.phase1Outfit, "phase1Outfit");

  const variants: Step2FixedTemplateVariant[] = [0, 1, 2].map((index) => {
    const seed = input.variantSeeds?.[index];
    const variantCoreFeatures = cleanSlotValue(seed?.coreFeatures ?? coreFeatures, "coreFeatures");
    const variantPhase1Outfit = cleanSlotValue(seed?.phase1Outfit ?? phase1Outfit, "phase1Outfit");
    return {
      variantId: STEP2_FIXED_TEMPLATE_VARIANT_IDS[index],
      displayOrder: (index + 1) as Step2FixedTemplateVariant["displayOrder"],
      label: `角色定妆提示词 ${index + 1}`,
      mode: (seed?.mode ?? STEP2_FIXED_TEMPLATE_DEFAULT_MODES[index]) as CharacterWorkflowStep2PromptMode,
      slotValues: {
        coreFeatures: variantCoreFeatures,
        phase1Outfit: variantPhase1Outfit,
      },
    };
  });

  return {
    version: STEP2_FIXED_TEMPLATE_PROMPT_CONTRACT_VERSION,
    slotValues: {
      coreFeatures,
      phase1Outfit,
    },
    variants,
  };
}

export const STEP2_FIXED_TEMPLATE_PROMPT_INVARIANTS = [
  "Step2 fixed-template assembly must always produce exactly two dynamic slot values: coreFeatures and phase1Outfit.",
  "All three Step2 prompt variants may only vary through their slot values.",
  "Dirty labels, debug field names, and prompt-wrapper residue must be stripped from slot values.",
] as const;
