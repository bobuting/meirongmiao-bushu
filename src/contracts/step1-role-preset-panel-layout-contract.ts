import type { Step1RolePreset } from "./step1-role-preset-contract";

export const STEP1_ROLE_PRESET_PANEL_LAYOUT_CONTRACT_VERSION = "AT35-12.v1";
export const STEP1_ROLE_PRESET_CONFIRM_DIRECT_ENTER_LABEL = "确认并直接进入 Step2";
export const STEP1_ROLE_PRESET_CONFIRMED_DIRECT_ENTER_LABEL = "已确认，可直接进入 Step2";
export const STEP1_ROLE_PRESET_PANEL_CONFIRM_ACTION = "confirm-and-enter-step2";

export const STEP1_ROLE_PRESET_PANEL_EMPHASIS_FIELD_KEYS = [
  "styleWords",
] as const satisfies (keyof Pick<Step1RolePreset, "styleWords">)[];

export const STEP1_ROLE_PRESET_PANEL_SUPPORT_FIELD_KEYS = [
  "ethnicityOrRegion",
  "gender",
  "age",
] as const satisfies (keyof Pick<Step1RolePreset, "ethnicityOrRegion" | "gender" | "age">)[];

export type Step1RolePresetPanelLayoutFieldKey =
  | (typeof STEP1_ROLE_PRESET_PANEL_EMPHASIS_FIELD_KEYS)[number]
  | (typeof STEP1_ROLE_PRESET_PANEL_SUPPORT_FIELD_KEYS)[number];

export interface Step1RolePresetPanelLayoutLineGroup {
  lineId: "hero" | "support" | "style";
  fieldKeys: Step1RolePresetPanelLayoutFieldKey[];
  maxLines: number;
  emphasis: boolean;
}

export interface Step1RolePresetPanelLayoutMeta {
  version: string;
  hideConfidence: boolean;
  compactCardLineCount: number;
  lineGroups: Step1RolePresetPanelLayoutLineGroup[];
  confirmAction: string;
  confirmIdleLabel: string;
  confirmConfirmedLabel: string;
}

export const STEP1_ROLE_PRESET_PANEL_LAYOUT_LINE_GROUPS: readonly Step1RolePresetPanelLayoutLineGroup[] = [
  {
    lineId: "hero",
    fieldKeys: ["styleWords"],
    maxLines: 1,
    emphasis: true,
  },
  {
    lineId: "support",
    fieldKeys: ["ethnicityOrRegion", "gender", "age"],
    maxLines: 1,
    emphasis: false,
  },
  {
    lineId: "style",
    fieldKeys: ["styleWords"],
    maxLines: 1,
    emphasis: true,
  },
] as const;

export const STEP1_ROLE_PRESET_PANEL_LAYOUT_INVARIANTS = [
  "Step1 role preset cards stay within a compact 2-3 line layout so the text block remains visually close to the avatar height.",
  "Confidence must not be user-visible once the compact layout contract is enabled.",
  "styleWords remains the emphasis field for the right-side preset card.",
  "Confirming a role preset means the flow should continue directly to Step2 after the selection is persisted.",
] as const;

export function resolveStep1RolePresetPanelLayoutMeta(): Step1RolePresetPanelLayoutMeta {
  return {
    version: STEP1_ROLE_PRESET_PANEL_LAYOUT_CONTRACT_VERSION,
    hideConfidence: true,
    compactCardLineCount: STEP1_ROLE_PRESET_PANEL_LAYOUT_LINE_GROUPS.length,
    lineGroups: STEP1_ROLE_PRESET_PANEL_LAYOUT_LINE_GROUPS.map((group) => ({
      ...group,
      fieldKeys: [...group.fieldKeys],
    })),
    confirmAction: STEP1_ROLE_PRESET_PANEL_CONFIRM_ACTION,
    confirmIdleLabel: STEP1_ROLE_PRESET_CONFIRM_DIRECT_ENTER_LABEL,
    confirmConfirmedLabel: STEP1_ROLE_PRESET_CONFIRMED_DIRECT_ENTER_LABEL,
  };
}
