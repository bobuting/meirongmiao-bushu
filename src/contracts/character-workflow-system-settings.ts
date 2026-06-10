/**
 * @deprecated 此文件已废弃，所有配置已合并到 AdminConfig。
 * 请使用 src/modules/admin-config-service.ts 中的 AdminConfig 类型。
 * 此文件将在后续版本中删除。
 */
export const CHARACTER_WORKFLOW_SYSTEM_SETTINGS_CONTRACT_VERSION = "AT36-03.v6";

export const CHARACTER_WORKFLOW_STEP2_PROMPT_MODES = ["code", "llm"] as const;

export type CharacterWorkflowStep2PromptMode = (typeof CHARACTER_WORKFLOW_STEP2_PROMPT_MODES)[number];

export const CHARACTER_WORKFLOW_STEP1_AUTO_REVERSE_CONFIRM_SOURCES = [
  "upload_confirm",
  "library_confirm",
] as const;

export type CharacterWorkflowStep1AutoReverseConfirmSource =
  (typeof CHARACTER_WORKFLOW_STEP1_AUTO_REVERSE_CONFIRM_SOURCES)[number];

export interface CharacterWorkflowSystemSettings {}

export const CHARACTER_WORKFLOW_SYSTEM_SETTINGS_DEFAULTS: CharacterWorkflowSystemSettings = {};

export type CharacterWorkflowSystemSettingKey = never;

export function createDefaultCharacterWorkflowSystemSettings(): CharacterWorkflowSystemSettings {
  return {};
}

export function normalizeCharacterWorkflowSystemSettingsInput(
  _input: unknown,
): CharacterWorkflowSystemSettings {
  return {};
}

export function isCharacterWorkflowAutoReverseCoveredSource(
  value: string,
): value is CharacterWorkflowStep1AutoReverseConfirmSource {
  return CHARACTER_WORKFLOW_STEP1_AUTO_REVERSE_CONFIRM_SOURCES.includes(
    value as CharacterWorkflowStep1AutoReverseConfirmSource,
  );
}

export function assertCharacterWorkflowSystemSettingsContract(): {
  version: string;
} {
  return {
    version: CHARACTER_WORKFLOW_SYSTEM_SETTINGS_CONTRACT_VERSION,
  };
}
