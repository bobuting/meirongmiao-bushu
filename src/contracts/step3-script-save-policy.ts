export type Step3SaveTrigger = "manual-save-button";

export interface Step3ScriptSaveRequest {
  readonly trigger: Step3SaveTrigger;
  readonly scriptText: string;
  readonly clueTitle?: string | null;
  readonly projectName?: string | null;
}

export function assertStep3ManualSaveTrigger(trigger: string): Step3SaveTrigger {
  if (trigger !== "manual-save-button") {
    throw new Error("step3 script persistence must be triggered by manual save button");
  }
  return trigger;
}

function cleanText(input: string | null | undefined): string {
  return typeof input === "string" ? input.trim() : "";
}

function firstNonEmptyLine(text: string): string {
  const first = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return first ?? "完整口播脚本";
}

export function resolveStep3PrimaryTitle(input: Step3ScriptSaveRequest): string {
  const clueTitle = cleanText(input.clueTitle);
  if (clueTitle.length > 0) {
    return clueTitle.slice(0, 64);
  }
  const projectName = cleanText(input.projectName);
  if (projectName.length > 0) {
    return `${projectName} · 完整口播`.slice(0, 64);
  }
  return firstNonEmptyLine(input.scriptText).slice(0, 64);
}
