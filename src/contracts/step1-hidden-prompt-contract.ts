export const STEP1_HIDDEN_PROMPT_CONTRACT_VERSION = "AT30-05.v1";

export type Step1PromptViewerRole = "admin" | "user";

export interface Step1RolePromptPayload {
  hiddenRoleSettingPrompt: string;
  adminDebugPrompt: string | null;
}

function assertNonEmptyPrompt(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value;
}

export function normalizeStep1RolePromptPayload(input: unknown): Step1RolePromptPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("step1 role prompt payload must be an object");
  }

  const record = input as Record<string, unknown>;
  const hiddenRoleSettingPrompt = assertNonEmptyPrompt(
    record.hiddenRoleSettingPrompt,
    "hiddenRoleSettingPrompt",
  );
  const adminDebugPrompt = record.adminDebugPrompt;
  if (adminDebugPrompt !== null && typeof adminDebugPrompt !== "string") {
    throw new Error("adminDebugPrompt must be string or null");
  }
  const normalizedAdminDebugPrompt = adminDebugPrompt === null ? null : (adminDebugPrompt as string);

  return {
    hiddenRoleSettingPrompt,
    adminDebugPrompt: normalizedAdminDebugPrompt,
  };
}

export function resolveStep1PromptVisibility(
  payload: Step1RolePromptPayload,
  role: Step1PromptViewerRole,
): {
  hiddenRoleSettingPrompt: null;
  adminDebugPrompt: string | null;
} {
  if (role === "admin") {
    return {
      hiddenRoleSettingPrompt: null,
      adminDebugPrompt: payload.adminDebugPrompt ?? payload.hiddenRoleSettingPrompt,
    };
  }
  return {
    hiddenRoleSettingPrompt: null,
    adminDebugPrompt: null,
  };
}

export function assertStep1HiddenPromptContract(): {
  version: string;
  userVisibleHiddenPrompt: boolean;
  adminCanSeeDebugPrompt: boolean;
} {
  return {
    version: STEP1_HIDDEN_PROMPT_CONTRACT_VERSION,
    userVisibleHiddenPrompt: false,
    adminCanSeeDebugPrompt: true,
  };
}
