export const STYLING_MASTER_PROMPT_STATE_VERSION = "AT32-15.v1";

export interface StylingMasterPromptState {
  masterPrompt: string;
  source: "step1HiddenRoleSettingPrompt";
  legacyVariantEditorVisible: false;
}

export function resolveStylingMasterPromptState(input: {
  masterPrompt: string | null | undefined;
}): StylingMasterPromptState {
  return {
    masterPrompt: typeof input.masterPrompt === "string" ? input.masterPrompt.trim() : "",
    source: "step1HiddenRoleSettingPrompt",
    legacyVariantEditorVisible: false,
  };
}

export function assertStylingMasterPromptStateContract(): {
  version: string;
  source: string;
  legacyVariantEditorVisible: boolean;
} {
  return {
    version: STYLING_MASTER_PROMPT_STATE_VERSION,
    source: "step1HiddenRoleSettingPrompt",
    legacyVariantEditorVisible: false,
  };
}
