import type { CharacterWorkflowStep2PromptMode } from "../contracts/character-workflow-system-settings.js";
import type { Step1RoleDirectionCard } from "../contracts/step1-joint-reverse-contract.js";
import { buildStep2FixedTemplatePromptBundle, type Step2FixedTemplatePromptBundle } from "../contracts/step2-fixed-template-prompt-contract.js";
import { buildControlledRolePresetFromDirection } from "./step1-role-preset-adapter.js";
import { buildStep2Phase1OutfitBridge, type Step2Phase1OutfitBridgeResult, type Step2Phase1OutfitSeed } from "./step2-phase1-outfit-bridge.js";
import { mapStep1RolePresetToEnglishCoreFeatures, type Step2RoleCoreFeaturesResult } from "./step2-role-core-features-mapper.js";

const FALLBACK_ROLE_DIRECTION: Partial<Step1RoleDirectionCard> & { directionId: string } = {
  directionId: "step2-fixed-template-fallback",
  ethnicityOrRegion: "Asian",
  gender: "unknown",
  age: 16,
  styleWords: ["clean", "natural"],
};

export interface Step2FixedTemplatePromptAssemblerInput {
  selectedRoleDirection?: (Partial<Step1RoleDirectionCard> & { directionId: string }) | null;
  selectedPlanId?: string | number | null;
  selectedOutfitSource?: "visual" | "analysis" | null;
  promptDraftByPlanId?: unknown;
  analysisCards?: unknown;
  persistedOutfitSummary?: string | null;
  variantModes?: readonly CharacterWorkflowStep2PromptMode[];
  variantSlotOverrides?: Array<Partial<{ coreFeatures: string; phase1Outfit: string }>>;
}

export interface Step2FixedTemplatePromptAssemblerResult {
  bundle: Step2FixedTemplatePromptBundle;
  coreFeatures: Step2RoleCoreFeaturesResult;
  phase1Outfit: Step2Phase1OutfitBridgeResult;
  usedFallbackRoleDirection: boolean;
  /** 已废弃：提示词由后端数据库模板渲染 */
  sharedAssemblyCore: string;
  adminDebugBasePrompt: string;
}

function normalizeSelectedPlanId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePromptDraftByPlanId(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const planId = normalizeSelectedPlanId(key);
    if (!planId || typeof value !== "string") {
      continue;
    }
    normalized[planId] = value.trim();
  }
  return normalized;
}

function normalizeAnalysisCards(input: unknown): Step2Phase1OutfitSeed[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    const planId = normalizeSelectedPlanId(record.planId);
    if (!planId) {
      return [];
    }
    return [
      {
        planId,
        optimizedPrompt: typeof record.optimizedPrompt === "string" ? record.optimizedPrompt : null,
        analysis: typeof record.analysis === "string" ? record.analysis : null,
      },
    ];
  });
}

export function buildStep2FixedTemplatePromptAssembler(
  input: Step2FixedTemplatePromptAssemblerInput,
): Step2FixedTemplatePromptAssemblerResult {
  const selectedRoleDirection = input.selectedRoleDirection ?? FALLBACK_ROLE_DIRECTION;
  const usedFallbackRoleDirection = !input.selectedRoleDirection;
  const rolePreset = buildControlledRolePresetFromDirection(selectedRoleDirection);
  const coreFeatures = mapStep1RolePresetToEnglishCoreFeatures(rolePreset);
  const phase1Outfit = buildStep2Phase1OutfitBridge({
    selectedPlanId: normalizeSelectedPlanId(input.selectedPlanId),
    selectedOutfitSource: input.selectedOutfitSource ?? null,
    promptDraftByPlanId: normalizePromptDraftByPlanId(input.promptDraftByPlanId),
    analysisCards: normalizeAnalysisCards(input.analysisCards),
    persistedOutfitSummary: input.persistedOutfitSummary ?? null,
  });

  const bundle = buildStep2FixedTemplatePromptBundle({
    coreFeatures: coreFeatures.coreFeatures,
    phase1Outfit: phase1Outfit.phase1OutfitEnglish,
    variantSeeds: [0, 1, 2].map((index) => ({
      coreFeatures: input.variantSlotOverrides?.[index]?.coreFeatures,
      phase1Outfit: input.variantSlotOverrides?.[index]?.phase1Outfit,
      mode: input.variantModes?.[index],
    })),
  });

  // 从首组 slotValues 组装废弃的 prompt 文本，仅用于 admin debug 展示
  const firstSlot = bundle.variants[0]?.slotValues ?? bundle.slotValues;
  const deprecatedPrompt = `coreFeatures: ${firstSlot.coreFeatures}\nphase1Outfit: ${firstSlot.phase1Outfit}`;

  return {
    bundle,
    coreFeatures,
    phase1Outfit,
    usedFallbackRoleDirection,
    sharedAssemblyCore: deprecatedPrompt,
    adminDebugBasePrompt: deprecatedPrompt,
  };
}
