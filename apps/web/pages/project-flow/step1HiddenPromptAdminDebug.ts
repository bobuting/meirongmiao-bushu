import {
  normalizeStep1RolePromptPayload,
  resolveStep1PromptVisibility,
  type Step1PromptViewerRole,
  type Step1RolePromptPayload,
} from "../../../../src/contracts/step1-hidden-prompt-contract";
import {
  normalizeStep1CleanHiddenPromptInput,
  type Step1CleanHiddenPromptInput,
} from "../../../../src/contracts/step1-clean-hidden-prompt-contract";
import { sanitizeStep1CarryoverPromptText } from "../../utils/sanitizePromptText";

function normalizeGenderLabel(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "male") {
    return "男";
  }
  if (normalized === "female") {
    return "女";
  }
  if (normalized === "unknown" || normalized.length < 1) {
    return null;
  }
  return String(value ?? "").trim() || null;
}

function buildCleanRolePromptLine(input: Step1CleanHiddenPromptInput): string {
  const normalized = normalizeStep1CleanHiddenPromptInput(input);
  const parts = [
    normalized.ethnicityOrRegion,
    normalizeGenderLabel(normalized.gender),
    normalized.age !== null && normalized.age !== undefined ? `${normalized.age}岁` : null,
    normalized.styleWords && normalized.styleWords.length > 0 ? normalized.styleWords.join(" / ") : null,
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);

  if (parts.length > 0) {
    return parts.join("，");
  }

  return [normalized.directionTitle, normalized.directionSummary]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join("，") || "保持人物身份一致，延续 Step1 已确认人物设定。";
}

export function buildStep1RolePromptPayload(params: Step1CleanHiddenPromptInput): Step1RolePromptPayload {
  const normalized = normalizeStep1CleanHiddenPromptInput(params);
  const sanitizedOutfitSummary =
    typeof normalized.outfitSummary === "string" ? sanitizeStep1CarryoverPromptText(normalized.outfitSummary) : null;
  const promptLines = [
    `后续定妆整体提示词: ${buildCleanRolePromptLine(normalized)}`,
    `Step1搭配参考: ${sanitizedOutfitSummary || "暂无搭配参考"}`,
  ];
  const hiddenRoleSettingPrompt = promptLines.join("\n");
  return normalizeStep1RolePromptPayload({
    hiddenRoleSettingPrompt,
    adminDebugPrompt: hiddenRoleSettingPrompt,
  });
}

export function resolveStep1AdminDebugPrompt(
  payload: Step1RolePromptPayload,
  viewerRole: Step1PromptViewerRole,
): string | null {
  return resolveStep1PromptVisibility(payload, viewerRole).adminDebugPrompt;
}

export function applyStep1AdminDebugPromptEdit(
  payload: Step1RolePromptPayload,
  nextAdminDebugPrompt: string,
): Step1RolePromptPayload {
  const normalized = nextAdminDebugPrompt.trim();
  return normalizeStep1RolePromptPayload({
    hiddenRoleSettingPrompt: payload.hiddenRoleSettingPrompt,
    adminDebugPrompt: normalized.length > 0 ? normalized : payload.hiddenRoleSettingPrompt,
  });
}
