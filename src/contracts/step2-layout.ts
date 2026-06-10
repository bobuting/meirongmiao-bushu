export type Step2LayoutSectionKey =
  | "step1_reference_header"
  | "reference_prompt_editor"
  | "reference_assets_strip"
  | "styled_views_panel"
  | "confirm_action";

export const STEP2_REQUIRED_LAYOUT_SEQUENCE: readonly Step2LayoutSectionKey[] = [
  "step1_reference_header",
  "reference_prompt_editor",
  "reference_assets_strip",
  "styled_views_panel",
  "confirm_action",
];

export const STEP2_ILLEGAL_LAYOUT_MARKERS = [
  "legacy_placeholder_gap",
  "empty_reference_shell",
  "orphan_reference_prompt_without_step1_context",
] as const;

export const STEP2_LAYOUT_INVARIANTS = [
  "Step2 reference area must start with Step1 context header.",
  "Reference prompt editor must exist and be attached to Step1 context block.",
  "Reference assets strip cannot be replaced by empty spacer placeholders.",
  "Styled views panel and confirm action must remain after reference area.",
] as const;

export interface Step2LayoutContractShape {
  readonly sections: readonly Step2LayoutSectionKey[];
  readonly markers?: readonly string[];
}

export function isStep2LayoutContractShape(shape: Step2LayoutContractShape): boolean {
  const seen = new Set(shape.sections);
  for (const required of STEP2_REQUIRED_LAYOUT_SEQUENCE) {
    if (!seen.has(required)) {
      return false;
    }
  }

  const order = shape.sections
    .map((section) => STEP2_REQUIRED_LAYOUT_SEQUENCE.indexOf(section))
    .filter((index) => index >= 0);
  for (let index = 1; index < order.length; index += 1) {
    if (order[index] < order[index - 1]) {
      return false;
    }
  }

  const markers = shape.markers ?? [];
  return markers.every((marker) => !STEP2_ILLEGAL_LAYOUT_MARKERS.includes(marker as (typeof STEP2_ILLEGAL_LAYOUT_MARKERS)[number]));
}

export const STEP2_LAYOUT_CONTRACT_VERSION = "N23-R4-01.v1";
