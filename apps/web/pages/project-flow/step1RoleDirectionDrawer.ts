import {
  createStep1RoleDirectionConfirmResult,
  resolveStep1RoleDirectionPanelState,
  type Step1RoleDirectionPanelState,
} from "../../../../src/contracts/step1-role-direction-panel-contract";
import type { Step1RoleDirectionCard } from "../../../../src/contracts/step1-joint-reverse-contract";

export interface Step1RoleDirectionDrawerState {
  panelState: Step1RoleDirectionPanelState;
  selectedDirectionId: string | null;
  step2Ready: boolean;
}

export function resolveStep1RoleDirectionDrawerState(params: {
  panelOpen: boolean;
  roleDirections: Step1RoleDirectionCard[];
  selectedDirectionId: string | null;
  step2Ready: boolean;
}): Step1RoleDirectionDrawerState {
  const panelState = resolveStep1RoleDirectionPanelState({
    panelOpen: params.panelOpen,
    roleDirections: params.roleDirections,
    selectedDirectionId: params.selectedDirectionId,
  });
  return {
    panelState,
    selectedDirectionId: panelState.selectedDirectionId,
    step2Ready: params.step2Ready && !panelState.step2GateLocked,
  };
}

export function confirmStep1RoleDirectionSelection(selectedDirectionId: string): {
  selectedDirectionId: string;
  step2Ready: boolean;
} {
  const result = createStep1RoleDirectionConfirmResult(selectedDirectionId);
  return {
    selectedDirectionId: result.selectedDirectionId,
    step2Ready: result.step2Ready,
  };
}
