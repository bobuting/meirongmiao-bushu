export interface Step1RolePresetEntryGuardInput {
  projectStatus?: string | null;
  step1RolePresetConfirmed?: boolean | null;
  selectedCharacterId?: string | null;
  selectedPreviewImageUrl?: string | null;
  workflowSelectedPreviewId?: string | null;
  /** 项目角色列表（video/image 项目通用） */
  characters?: unknown[] | null;
  script?: unknown[] | null;
  step3CharacterReferencePool?: unknown[] | null;
  clipStatuses?: unknown[] | null;
  pendingStoryboardImport?: unknown | null;
  pendingScriptImport?: boolean | null;
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasArrayItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export function hasStep2OrBeyondWorkflowProgress(input: Step1RolePresetEntryGuardInput): boolean {
  return (
    hasNonEmptyString(input.selectedCharacterId) ||
    hasNonEmptyString(input.selectedPreviewImageUrl) ||
    hasNonEmptyString(input.workflowSelectedPreviewId) ||
    hasArrayItems(input.characters) ||
    hasArrayItems(input.script) ||
    hasArrayItems(input.step3CharacterReferencePool) ||
    hasArrayItems(input.clipStatuses) ||
    Boolean(input.pendingStoryboardImport) ||
    input.pendingScriptImport === true
  );
}

export function shouldRequireStep1RolePresetFirstPass(input: Step1RolePresetEntryGuardInput): boolean {
  // Step1 角色预设已确认，不需要守卫
  if (input.step1RolePresetConfirmed === true) {
    return false;
  }
  // 已有 Step2+ 的工作流进度，不需要守卫
  if (hasStep2OrBeyondWorkflowProgress(input)) {
    return false;
  }
  // 只有 DRAFT、GARMENT_UPLOADED、空状态需要守卫，其他状态都不需要
  const projectStatus = typeof input.projectStatus === "string" ? input.projectStatus.trim() : "";
  return projectStatus.length < 1 || projectStatus === "DRAFT" || projectStatus === "GARMENT_UPLOADED";
}
