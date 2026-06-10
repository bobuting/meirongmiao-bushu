export const ADMIN_MINIMAL_SEAM_CONTRACT_VERSION = "AT35-05.v1";

export const ADMIN_MINIMAL_SEAM_IDS = [
  "navigation-ia",
  "system-settings-surface",
  "image-generation-entry",
] as const;
export type AdminMinimalSeamId = (typeof ADMIN_MINIMAL_SEAM_IDS)[number];

export interface AdminMinimalSeamEntry {
  seamId: AdminMinimalSeamId;
  currentOwnerFiles: readonly string[];
  targetFile: string | null;
  ownedSymbols: readonly string[];
  ownedConcerns: readonly string[];
  contractDependencies: readonly string[];
}

export const ADMIN_MINIMAL_SEAM_PAGE_REMAINING_RESPONSIBILITIES = [
  "admin access guard",
  "layout shell",
  "section ordering",
  "shared feedback presentation",
] as const;

export const ADMIN_MINIMAL_SEAM_INVARIANTS = [
  "Admin navigation IA must route through layoutNavigationController/App route registration instead of scattering hard-coded titles and paths across pages.",
  "System-settings surface must stay normalized by character-workflow-system-settings and must not patch raw admin config payloads directly from the page.",
  "Image-generation-entry seam owns image prompt/reference input shaping plus audit refresh trigger and must not keep expanding CapabilityLab.tsx with more page-local branches.",
  "AT35 admin tasks that touch navigation IA, system settings, or admin image generation entry must land on a named seam instead of re-expanding CapabilityLab.tsx or SystemSettings.tsx.",
] as const;

export const ADMIN_MINIMAL_SEAM_PLAN: readonly AdminMinimalSeamEntry[] = [
  {
    seamId: "navigation-ia",
    currentOwnerFiles: [
      "apps/web/components/layout/layoutNavigationController.ts",
      "apps/web/components/Layout.tsx",
      "apps/web/App.tsx",
    ],
    targetFile: null,
    ownedSymbols: [
      "isLayoutRouteActive",
      "resolveLayoutTitle",
      "CapabilityLab",
      "SystemSettings",
    ],
    ownedConcerns: [
      "admin-route-title-mapping",
      "sidebar-admin-entry-visibility",
      "admin-route-registration",
      "admin-subpage-active-state",
    ],
    contractDependencies: [
      "apps/web/components/Layout.tsx",
      "apps/web/App.tsx",
    ],
  },
  {
    seamId: "system-settings-surface",
    currentOwnerFiles: [
      "src/contracts/character-workflow-system-settings.ts",
      "apps/web/pages/admin/SystemSettings.tsx",
      "apps/web/services/backendApi.squareAdminLibrary.ts",
    ],
    targetFile: "apps/web/pages/admin/adminSystemSettingsSurface.ts",
    ownedSymbols: [
      "createDefaultCharacterWorkflowSystemSettings",
      "normalizeCharacterWorkflowSystemSettingsInput",
      "handleSave",
      "handleRefresh",
    ],
    ownedConcerns: [
      "character-workflow-settings-normalization",
      "query-to-draft-hydration",
      "save-refresh-action-surface",
      "step1-step2-prompt-setting-visibility",
    ],
    contractDependencies: [
      "apps/web/pages/project-flow/step1AutoReverseTrigger.ts",
      "apps/web/pages/project-flow/CharacterSelection.tsx",
    ],
  },
  {
    seamId: "image-generation-entry",
    currentOwnerFiles: [
      "apps/web/pages/admin/CapabilityLab.tsx",
      "apps/web/services/backendApi.squareAdminLibrary.ts",
    ],
    targetFile: "apps/web/pages/admin/adminCapabilityLabImageEntry.ts",
    ownedSymbols: [
      "parsedImageRefs",
      "imageState",
      "withCall",
      "adminCapabilityLabImageGenerate",
    ],
    ownedConcerns: [
      "image-mode-and-ref-normalization",
      "admin-image-generation-entry",
      "capability-lab-audit-refresh",
      "result-card-shaping",
    ],
    contractDependencies: [
      "src/contracts/frontend-api-domain-contract.ts",
      "src/contracts/provider-route-policy-contract.ts",
    ],
  },
] as const;

function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`${fieldName} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function assertSeamId(value: unknown, fieldName: string): AdminMinimalSeamId {
  if (!ADMIN_MINIMAL_SEAM_IDS.includes(value as AdminMinimalSeamId)) {
    throw new Error(`${fieldName} must be navigation-ia|system-settings-surface|image-generation-entry`);
  }
  return value as AdminMinimalSeamId;
}

export function normalizeAdminMinimalSeamPlan(input: unknown): AdminMinimalSeamEntry[] {
  if (!Array.isArray(input)) {
    throw new Error("admin minimal seam plan must be an array");
  }

  const seen = new Set<AdminMinimalSeamId>();
  return input.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`plan[${index}] must be an object`);
    }
    const record = item as Record<string, unknown>;
    const seamId = assertSeamId(record.seamId, `plan[${index}].seamId`);
    if (seen.has(seamId)) {
      throw new Error(`duplicate seamId: ${seamId}`);
    }
    seen.add(seamId);

    const targetFile = record.targetFile;
    if (targetFile !== null && (typeof targetFile !== "string" || targetFile.trim().length === 0)) {
      throw new Error(`plan[${index}].targetFile must be a non-empty string or null`);
    }

    return {
      seamId,
      currentOwnerFiles: assertStringArray(record.currentOwnerFiles, `plan[${index}].currentOwnerFiles`),
      targetFile: targetFile === null ? null : targetFile.trim(),
      ownedSymbols: assertStringArray(record.ownedSymbols, `plan[${index}].ownedSymbols`),
      ownedConcerns: assertStringArray(record.ownedConcerns, `plan[${index}].ownedConcerns`),
      contractDependencies: assertStringArray(record.contractDependencies, `plan[${index}].contractDependencies`),
    };
  });
}

export function getAdminMinimalSeamEntry(seamId: AdminMinimalSeamId): AdminMinimalSeamEntry {
  const entry = ADMIN_MINIMAL_SEAM_PLAN.find((item) => item.seamId === seamId);
  if (!entry) {
    throw new Error(`unknown seamId: ${seamId}`);
  }
  return entry;
}

export function assertAdminMinimalSeamContract(): {
  version: string;
  seamCount: number;
  extractionTargetCount: number;
  hotspotFile: string;
  existingSeamCount: number;
} {
  return {
    version: ADMIN_MINIMAL_SEAM_CONTRACT_VERSION,
    seamCount: ADMIN_MINIMAL_SEAM_PLAN.length,
    extractionTargetCount: ADMIN_MINIMAL_SEAM_PLAN.filter((entry) => entry.targetFile).length,
    hotspotFile: "apps/web/pages/admin/CapabilityLab.tsx",
    existingSeamCount: ADMIN_MINIMAL_SEAM_PLAN.filter((entry) => entry.targetFile === null).length,
  };
}
