import type {
  CharacterWorkflowStep1AutoReverseConfirmSource,
} from "../../../../src/contracts/character-workflow-system-settings";

export interface Step1AutoReverseTriggerInput {
  source: CharacterWorkflowStep1AutoReverseConfirmSource;
  selectedAssetCount: number;
}

export function shouldTriggerStep1AutoReverse(input: Step1AutoReverseTriggerInput): boolean {
  if (input.selectedAssetCount < 1) {
    return false;
  }
  return input.source === "upload_confirm" || input.source === "library_confirm";
}
