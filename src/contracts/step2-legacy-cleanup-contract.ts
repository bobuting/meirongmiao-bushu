export const STEP2_LEGACY_CLEANUP_CONTRACT_VERSION = "AT41-02.v1";

export const STEP2_LEGACY_CLEANUP_BOUNDARY_IDS = [
  "workflow-mode",
  "preview-owner",
  "snapshot-recovery",
  "legacy-copy",
] as const;
export type Step2LegacyCleanupBoundaryId = (typeof STEP2_LEGACY_CLEANUP_BOUNDARY_IDS)[number];

export interface Step2LegacyCleanupBoundaryEntry {
  boundaryId: Step2LegacyCleanupBoundaryId;
  currentOwnerFiles: readonly string[];
  targetFile: string | null;
  ownedSymbols: readonly string[];
  removalScope: readonly string[];
  contractDependencies: readonly string[];
}

export const STEP2_FORBIDDEN_LEGACY_PROJECT_FIELDS = [
  "step2WorkflowMode",
  "selectedPreviewImageUrl",
  "step2ActivePanel",
  "step2WarehouseMode",
] as const;

export const STEP2_FORBIDDEN_LEGACY_PREVIEW_CONTEXT_FIELDS = [
  "workflow.selectedPreviewId",
  "previewContext.activePanel",
  "previewContext.focusedPreviewId",
  "previewContext.focusedPresetId",
  "previewContext.warehouseMode",
] as const;

export const STEP2_FORBIDDEN_LEGACY_COPY_MARKERS = [
  "定妆预览",
  "候选角色预览",
  "Step2 新模式已启用",
  "Step2 旧模式",
] as const;

export const STEP2_LEGACY_CLEANUP_INVARIANTS = [
  "Step2 cleanup must remove legacy workflow-mode branching instead of carrying legacy and v2 side by side.",
  "Preview ownership must converge on generated/library candidate ownership and must stop restoring focusedPreviewId/focusedPresetId style state.",
  "Historical Step2 snapshots are not a compatibility target once the new Step2 chain is cut over.",
  "User-facing Step2 copy must not keep the old 定妆预览 / 候选角色预览 dual-panel language after the cleanup lands.",
] as const;

export const STEP2_LEGACY_CLEANUP_PLAN: readonly Step2LegacyCleanupBoundaryEntry[] = [
  {
    boundaryId: "workflow-mode",
    currentOwnerFiles: [
      "apps/web/store/useAppStore.ts",
      "apps/web/pages/project-flow/CharacterSelection.tsx",
      "apps/web/pages/project-flow/Assets.tsx",
    ],
    targetFile: null,
    ownedSymbols: ["step2WorkflowMode"],
    removalScope: [
      "projectData default legacy mode",
      "step1 direct-enter step2 mode handoff",
      "step2 page-level legacy/v2 branching",
    ],
    contractDependencies: [
      "src/contracts/character-workflow-system-settings.ts",
      "src/contracts/project-flow-ui-shared-contract.ts",
    ],
  },
  {
    boundaryId: "preview-owner",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/CharacterSelection.tsx",
      "apps/web/services/backendApi.ts",
      "apps/web/pages/projects/MyProjects.tsx",
      "src/contracts/project-page-content-snapshot.ts",
    ],
    targetFile: null,
    ownedSymbols: ["selectedPreviewImageUrl", "focusedPreviewId", "focusedPresetId", "activePanel", "warehouseMode"],
    removalScope: [
      "legacy preview image selection owner",
      "legacy focused preview/preset owner persistence",
      "legacy warehouse and active panel persistence",
    ],
    contractDependencies: [
      "src/contracts/project-page-content-snapshot.ts",
      "test/project_resume_project_data_merge.unit.test.ts",
    ],
  },
  {
    boundaryId: "snapshot-recovery",
    currentOwnerFiles: [
      "src/contracts/project-page-content-snapshot.ts",
      "apps/web/pages/projects/MyProjects.tsx",
      "apps/web/services/backendApi.ts",
    ],
    targetFile: null,
    ownedSymbols: ["previewContext", "selectedPreviewId", "selectedCharacterId", "selectedPreviewImageUrl"],
    removalScope: [
      "page snapshot previewContext recovery",
      "resume merge of legacy preview owner fields",
      "workflow payload persistence for legacy preview state",
    ],
    contractDependencies: [
      "test/project_page_content_snapshot_contract.unit.test.ts",
      "test/project_resume_page_snapshot_fallback.integration.test.ts",
    ],
  },
  {
    boundaryId: "legacy-copy",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/CharacterSelection.tsx",
      "apps/web/pages/project-flow/step2V2CandidatePreviewPanel.tsx",
      "src/contracts/step2-copy-cleanup-contract.ts",
    ],
    targetFile: null,
    ownedSymbols: ["STEP2_COPY_BLACKLIST", "STEP2_USER_FACING_TITLE_CONTRACT", "角色定妆", "角色库推荐"],
    removalScope: [
      "dual-panel titles",
      "legacy mode badge copy",
      "pre-cutover user-facing labels",
    ],
    contractDependencies: [
      "src/contracts/step2-copy-cleanup-contract.ts",
      "test/at35_step2_copy_cleanup_contract.unit.test.ts",
    ],
  },
] as const;

function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`${fieldName} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function assertBoundaryId(value: unknown, fieldName: string): Step2LegacyCleanupBoundaryId {
  if (!STEP2_LEGACY_CLEANUP_BOUNDARY_IDS.includes(value as Step2LegacyCleanupBoundaryId)) {
    throw new Error(`${fieldName} must be workflow-mode|preview-owner|snapshot-recovery|legacy-copy`);
  }
  return value as Step2LegacyCleanupBoundaryId;
}

export function normalizeStep2LegacyCleanupPlan(input: unknown): Step2LegacyCleanupBoundaryEntry[] {
  if (!Array.isArray(input)) {
    throw new Error("step2 legacy cleanup plan must be an array");
  }
  const seen = new Set<Step2LegacyCleanupBoundaryId>();
  return input.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`plan[${index}] must be an object`);
    }
    const record = item as Record<string, unknown>;
    const boundaryId = assertBoundaryId(record.boundaryId, `plan[${index}].boundaryId`);
    if (seen.has(boundaryId)) {
      throw new Error(`duplicate boundaryId: ${boundaryId}`);
    }
    seen.add(boundaryId);
    return {
      boundaryId,
      currentOwnerFiles: assertStringArray(record.currentOwnerFiles, `plan[${index}].currentOwnerFiles`),
      targetFile: record.targetFile === null ? null : typeof record.targetFile === "string" ? record.targetFile.trim() : null,
      ownedSymbols: assertStringArray(record.ownedSymbols, `plan[${index}].ownedSymbols`),
      removalScope: assertStringArray(record.removalScope, `plan[${index}].removalScope`),
      contractDependencies: assertStringArray(record.contractDependencies, `plan[${index}].contractDependencies`),
    };
  });
}

export function assertStep2LegacyCleanupContract(): {
  version: string;
  boundaryCount: number;
  forbiddenProjectFieldCount: number;
  forbiddenPreviewContextFieldCount: number;
  forbiddenCopyMarkerCount: number;
} {
  return {
    version: STEP2_LEGACY_CLEANUP_CONTRACT_VERSION,
    boundaryCount: STEP2_LEGACY_CLEANUP_PLAN.length,
    forbiddenProjectFieldCount: STEP2_FORBIDDEN_LEGACY_PROJECT_FIELDS.length,
    forbiddenPreviewContextFieldCount: STEP2_FORBIDDEN_LEGACY_PREVIEW_CONTEXT_FIELDS.length,
    forbiddenCopyMarkerCount: STEP2_FORBIDDEN_LEGACY_COPY_MARKERS.length,
  };
}
