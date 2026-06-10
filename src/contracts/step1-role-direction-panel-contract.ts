import type { Step1RoleDirectionCard } from "./step1-joint-reverse-contract";

export const STEP1_ROLE_DIRECTION_PANEL_CONTRACT_VERSION = "AT30-04.v1";

export interface Step1RoleDirectionPanelState {
  panelOpen: boolean;
  roleDirections: Step1RoleDirectionCard[];
  selectedDirectionId: string | null;
  confirmRoleEnabled: boolean;
  step2GateLocked: boolean;
}

export interface Step1RoleDirectionConfirmResult {
  selectedDirectionId: string;
  step2Ready: boolean;
}

export function resolveStep1RoleDirectionPanelState(params: {
  panelOpen: boolean;
  roleDirections: Step1RoleDirectionCard[];
  selectedDirectionId: string | null;
}): Step1RoleDirectionPanelState {
  const hasSelection =
    typeof params.selectedDirectionId === "string" &&
    params.roleDirections.some((item) => item.directionId === params.selectedDirectionId);
  return {
    panelOpen: params.panelOpen,
    roleDirections: params.roleDirections,
    selectedDirectionId: hasSelection ? params.selectedDirectionId : null,
    confirmRoleEnabled: hasSelection,
    step2GateLocked: !hasSelection,
  };
}

export function createStep1RoleDirectionConfirmResult(
  selectedDirectionId: string,
): Step1RoleDirectionConfirmResult {
  if (typeof selectedDirectionId !== "string" || selectedDirectionId.trim().length === 0) {
    throw new Error("selectedDirectionId must be a non-empty string");
  }
  return {
    selectedDirectionId,
    step2Ready: true,
  };
}

export function assertStep1RoleDirectionPanelContract(): {
  version: string;
  requiresSelectionBeforeStep2: boolean;
  confirmResultStep2Ready: boolean;
} {
  return {
    version: STEP1_ROLE_DIRECTION_PANEL_CONTRACT_VERSION,
    requiresSelectionBeforeStep2: true,
    confirmResultStep2Ready: true,
  };
}

