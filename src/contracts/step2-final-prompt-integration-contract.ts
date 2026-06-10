export const STEP2_FINAL_PROMPT_INTEGRATION_CONTRACT_VERSION = "AT32-05.v1";

import { HiddenPromptCleaningPolicy, sanitizeHiddenPrompt } from "./hidden-prompt-cleaning-contract";
import { Step1RolePreset } from "./step1-role-preset-contract";
import { Step1RolePromptPayload, Step1PromptViewerRole } from "./step1-hidden-prompt-contract";

export interface Step2FinalPromptBuildInput {
  rolePreset: Step1RolePreset; // selected preset from Step1
  hiddenPrompt: Step1RolePromptPayload; // hidden/admin prompts from Step1
  cleaningPolicy: HiddenPromptCleaningPolicy; // from AT32-04
  viewerRole: Step1PromptViewerRole; // 'user' or 'admin'
}

export interface Step2FinalPromptIntegrationResult {
  version: string;
  userFacingPrompt: string; // what the user sees on Step2 cards/tooltips
  adminDebugPrompt: string | null; // only for admins
  sanitizedHidden: string; // sanitized hidden prompt actually used in generation
  meta: {
    presetId: string;
  };
}

function assertPreset(p: unknown): Step1RolePreset {
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error("rolePreset must be an object");
  const rec = p as any;
  if (typeof rec.presetId !== "string" || !rec.presetId) throw new Error("rolePreset.presetId required");
  return rec as Step1RolePreset;
}

function assertCleaningPolicy(pol: unknown): HiddenPromptCleaningPolicy {
  if (!pol || typeof pol !== "object" || Array.isArray(pol)) throw new Error("cleaningPolicy must be an object");
  return pol as HiddenPromptCleaningPolicy;
}

function assertHiddenPayload(pl: unknown): Step1RolePromptPayload {
  if (!pl || typeof pl !== "object" || Array.isArray(pl)) throw new Error("hiddenPrompt must be an object");
  return pl as Step1RolePromptPayload;
}

function joinUniqueWords(parts: string[]): string {
  const words = parts
    .join(" ")
    .split(/[,\s]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    const k = w.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(w); }
  }
  return out.join(", ");
}

export function buildStep2FinalPrompt(input: Step2FinalPromptBuildInput): Step2FinalPromptIntegrationResult {
  const preset = assertPreset(input.rolePreset);
  const policy = assertCleaningPolicy(input.cleaningPolicy);
  const hidden = assertHiddenPayload(input.hiddenPrompt);
  const viewerRole = input.viewerRole;

  const sanitizedHidden = sanitizeHiddenPrompt(hidden.hiddenRoleSettingPrompt, policy);

  const visibleParts = [
    preset.ethnicityOrRegion,
    preset.gender,
    String(preset.age),
    ...(preset.styleWords || []),
  ];
  const visibleSummary = joinUniqueWords(visibleParts);

  const userFacingPrompt = [visibleSummary, sanitizedHidden].filter(Boolean).join(" | ").trim();

  const adminDebugPrompt = viewerRole === "admin"
    ? (hidden.adminDebugPrompt ?? hidden.hiddenRoleSettingPrompt)
    : null;

  return {
    version: STEP2_FINAL_PROMPT_INTEGRATION_CONTRACT_VERSION,
    userFacingPrompt,
    adminDebugPrompt,
    sanitizedHidden,
    meta: { presetId: preset.presetId },
  };
}

export function assertStep2FinalPromptIntegrationContract(): { version: string; exposesAdminOnlyField: boolean } {
  return { version: STEP2_FINAL_PROMPT_INTEGRATION_CONTRACT_VERSION, exposesAdminOnlyField: true };
}
