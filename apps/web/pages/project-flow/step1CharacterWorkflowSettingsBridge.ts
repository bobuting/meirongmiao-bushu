import {
  createDefaultCharacterWorkflowSystemSettings,
  normalizeCharacterWorkflowSystemSettingsInput,
  type CharacterWorkflowSystemSettings,
} from "../../../../src/contracts/character-workflow-system-settings";
import { backendApi } from "../../services/backendApi";

export async function loadStep1CharacterWorkflowSettings(
  token: string | null | undefined,
): Promise<CharacterWorkflowSystemSettings> {
  if (!token) {
    return createDefaultCharacterWorkflowSystemSettings();
  }
  try {
    const settings = await backendApi.adminCharacterWorkflowSystemSettingsGet(token);
    // 防御性检查：API 可能返回 null/undefined
    if (!settings) {
      return createDefaultCharacterWorkflowSystemSettings();
    }
    return normalizeCharacterWorkflowSystemSettingsInput(settings);
  } catch {
    return createDefaultCharacterWorkflowSystemSettings();
  }
}
