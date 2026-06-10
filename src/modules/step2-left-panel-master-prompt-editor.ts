import { STEP2_USER_FACING_TITLE_CONTRACT } from "../contracts/step2-copy-cleanup-contract.js";

export const STEP2_LEFT_PANEL_MASTER_PROMPT_EDITOR_VERSION = "AT38-01.v1";

export const STEP2_LEFT_PANEL_MASTER_PROMPT_EDITOR_HELPER_TEXT =
  "Step1已确认结果自动生成";

export const STEP2_LEFT_PANEL_MASTER_PROMPT_EDITOR_PLACEHOLDER =
  "等待 Step1 生成角色定妆提示词。";

export const STEP2_LEFT_PANEL_MASTER_PROMPT_EDITOR_TEXTAREA_CLASSNAME =
  "h-auto min-h-[264px] max-h-[312px] w-full resize-none overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm leading-6 text-gray-700 outline-none focus:border-primary/40";

export function stripBeforeFullBodyPrompt(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "";
  }
  const anchor = /full[\s-]?body/i.exec(normalized);
  const anchorIndex = typeof anchor?.index === "number" ? anchor.index : -1;
  if (anchorIndex < 0) {
    return normalized;
  }
  return normalized.slice(anchorIndex).trim();
}

export function buildStep2LeftPanelMasterPromptEditorView() {
  return {
    version: STEP2_LEFT_PANEL_MASTER_PROMPT_EDITOR_VERSION,
    inputTitle: STEP2_USER_FACING_TITLE_CONTRACT.leftPanelInputTitle,
    referenceTitle: STEP2_USER_FACING_TITLE_CONTRACT.leftPanelReferenceTitle,
    helperText: STEP2_LEFT_PANEL_MASTER_PROMPT_EDITOR_HELPER_TEXT,
    placeholder: STEP2_LEFT_PANEL_MASTER_PROMPT_EDITOR_PLACEHOLDER,
    readOnly: true as const,
    textareaClassName: STEP2_LEFT_PANEL_MASTER_PROMPT_EDITOR_TEXTAREA_CLASSNAME,
    textareaStyle: {
      scrollbarGutter: "stable" as const,
      aspectRatio: "5 / 3",
    },
  };
}
