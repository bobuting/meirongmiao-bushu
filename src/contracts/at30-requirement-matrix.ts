import {
  type CharacterWorkflowSystemSettings,
  CHARACTER_WORKFLOW_SYSTEM_SETTINGS_DEFAULTS,
} from "./character-workflow-system-settings";

export const AT30_REQUIREMENT_MATRIX_CONTRACT_VERSION = "AT30-01.v1";

export const AT30_PAUSED_REQUIREMENTS = [
  "step1_uncategorized_multi_image_upload",
  "step3_case_entry",
  "step3_case_source_expansion",
] as const;

export const AT30_ACTIVE_REQUIREMENTS = [
  "R-STEP30-01",
  "R-STEP30-02",
  "R-STEP30-03",
  "R-STEP30-04",
  "R-STEP30-05",
  "R-STEP30-06",
  "R-STEP30-07",
  "R-STEP30-08",
  "R-STEP30-09",
  "R-STEP30-10",
  "R-STEP30-11",
  "R-STEP30-12",
  "R-STEP30-13",
  "R-STEP30-14",
  "R-STEP30-15",
  "R-STEP30-16",
  "R-STEP30-17",
  "R-STEP30-18",
  "R-STEP30-19",
  "R-STEP30-20",
  "R-STEP30-21",
  "R-STEP30-22",
] as const;

export const AT30_STEP3_STRUCTURED_SCRIPT_FIELDS = [
  "title",
  "scenario",
  "durationSec",
  "storyboardCount",
  "coreSellingPoint",
  "rhythmTags",
] as const;

export type CharacterWorkflowSystemSettingsDefaults = CharacterWorkflowSystemSettings;

export const AT30_SYSTEM_SETTINGS_DEFAULTS: CharacterWorkflowSystemSettingsDefaults =
  CHARACTER_WORKFLOW_SYSTEM_SETTINGS_DEFAULTS;

export const AT30_SCOPE_INVARIANTS = [
  "Paused Step1 multi-image upload work stays outside the AT30 implementation batch.",
  "Step1 role-direction guidance and outfit reverse outputs must share the same future multimodal task.",
  "The Step2 canonical chain stays always-on and must not reintroduce legacy/v2 mode branching.",
  "Step3 stays limited to the minimal structured script-card fields and excludes case-entry capabilities.",
] as const;

export function isAt30PausedRequirement(value: string): value is (typeof AT30_PAUSED_REQUIREMENTS)[number] {
  return AT30_PAUSED_REQUIREMENTS.includes(value as (typeof AT30_PAUSED_REQUIREMENTS)[number]);
}

export function assertAt30RequirementMatrix(): {
  version: string;
  activeRequirementCount: number;
  pausedRequirementCount: number;
  step3FieldCount: number;
} {
  const activeSet = new Set<string>();
  for (const requirementId of AT30_ACTIVE_REQUIREMENTS) {
    if (activeSet.has(requirementId)) {
      throw new Error(`Duplicate active requirement id: ${requirementId}`);
    }
    activeSet.add(requirementId);
  }

  const pausedSet = new Set<string>();
  for (const requirementId of AT30_PAUSED_REQUIREMENTS) {
    if (pausedSet.has(requirementId)) {
      throw new Error(`Duplicate paused requirement id: ${requirementId}`);
    }
    pausedSet.add(requirementId);
  }

  const fieldSet = new Set<string>();
  for (const field of AT30_STEP3_STRUCTURED_SCRIPT_FIELDS) {
    if (fieldSet.has(field)) {
      throw new Error(`Duplicate Step3 structured field: ${field}`);
    }
    fieldSet.add(field);
  }

  if (AT30_ACTIVE_REQUIREMENTS.length !== 22) {
    throw new Error(`Expected 22 active requirements, received ${AT30_ACTIVE_REQUIREMENTS.length}`);
  }
  if (AT30_PAUSED_REQUIREMENTS.length !== 3) {
    throw new Error(`Expected 3 paused requirements, received ${AT30_PAUSED_REQUIREMENTS.length}`);
  }
  return {
    version: AT30_REQUIREMENT_MATRIX_CONTRACT_VERSION,
    activeRequirementCount: AT30_ACTIVE_REQUIREMENTS.length,
    pausedRequirementCount: AT30_PAUSED_REQUIREMENTS.length,
    step3FieldCount: AT30_STEP3_STRUCTURED_SCRIPT_FIELDS.length,
  };
}
