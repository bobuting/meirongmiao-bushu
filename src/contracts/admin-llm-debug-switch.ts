export type LlmDebugBubbleRole = "admin" | "user";

export interface AdminLlmDebugSwitchContract {
  readonly configKey: "adminLlmDebugBubbleEnabled";
  readonly defaultValue: boolean;
  readonly editableRoles: readonly LlmDebugBubbleRole[];
  readonly visibleRoles: readonly LlmDebugBubbleRole[];
}

export const ADMIN_LLM_DEBUG_SWITCH_CONTRACT: AdminLlmDebugSwitchContract = {
  configKey: "adminLlmDebugBubbleEnabled",
  defaultValue: true,
  editableRoles: ["admin"],
  visibleRoles: ["admin"],
};

export function canEditAdminLlmDebugSwitch(role: LlmDebugBubbleRole): boolean {
  return ADMIN_LLM_DEBUG_SWITCH_CONTRACT.editableRoles.includes(role);
}

export function canViewAdminLlmDebugBubble(role: LlmDebugBubbleRole, enabled: boolean): boolean {
  return enabled && ADMIN_LLM_DEBUG_SWITCH_CONTRACT.visibleRoles.includes(role);
}

export function normalizeAdminLlmDebugSwitchInput(input: unknown): boolean {
  if (typeof input !== "boolean") {
    throw new Error("adminLlmDebugBubbleEnabled must be boolean");
  }
  return input;
}

export const ADMIN_LLM_DEBUG_SWITCH_CONTRACT_VERSION = "N23-R6-02.v1";
