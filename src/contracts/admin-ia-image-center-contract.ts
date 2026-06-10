import {
  ADMIN_MINIMAL_SEAM_CONTRACT_VERSION,
  ADMIN_MINIMAL_SEAM_IDS,
} from "./admin-minimal-seam-contract.js";
import { CHARACTER_WORKFLOW_SYSTEM_SETTINGS_CONTRACT_VERSION } from "./character-workflow-system-settings.js";

export const ADMIN_IA_IMAGE_CENTER_CONTRACT_VERSION = "AT34-05.v1";

export const ADMIN_IA_IMAGE_CENTER_REUSED_CONTRACTS = [
  ADMIN_MINIMAL_SEAM_CONTRACT_VERSION,
  CHARACTER_WORKFLOW_SYSTEM_SETTINGS_CONTRACT_VERSION,
] as const;

export const ADMIN_IA_IMAGE_CENTER_INVARIANTS = [
  "AT34 admin work must reuse the AT35 admin seams instead of reopening Layout.tsx or CapabilityLab.tsx as the owner of IA changes.",
  "System settings remains discoverable under the admin section even after the image-generation entry is moved under character management.",
  "Character image generation center reuses the existing admin image-generation capability inputs and audit refresh flow instead of forking a second backend route family.",
  "Navigation copy and route registration must stay single-sourced from layout navigation plus App route registration, not duplicated in page-local arrays.",
] as const;

export interface AdminNavigationRoutePlan {
  routePath: string;
  navGroup: "characters" | "admin";
  navLabel: string;
  pageTitle: string;
}

export interface AdminImageCenterOwnerEntry {
  seamId: (typeof ADMIN_MINIMAL_SEAM_IDS)[number];
  currentOwnerFiles: readonly string[];
  targetFile: string | null;
  ownedSymbols: readonly string[];
  ownedConcerns: readonly string[];
}

export const ADMIN_IA_IMAGE_CENTER_ROUTE_PLAN: readonly AdminNavigationRoutePlan[] = [
  {
    routePath: "/characters",
    navGroup: "characters",
    navLabel: "角色管理",
    pageTitle: "角色管理",
  },
  {
    routePath: "/admin/system-settings",
    navGroup: "admin",
    navLabel: "系统参数",
    pageTitle: "系统参数",
  },
  {
    routePath: "/admin/capability-lab",
    navGroup: "admin",
    navLabel: "能力实验室",
    pageTitle: "能力实验室",
  },
] as const;

export const ADMIN_IA_IMAGE_CENTER_OWNER_PLAN: readonly AdminImageCenterOwnerEntry[] = [
  {
    seamId: "navigation-ia",
    currentOwnerFiles: [
      "apps/web/components/layout/layoutNavigationController.ts",
      "apps/web/components/Layout.tsx",
      "apps/web/App.tsx",
    ],
    targetFile: null,
    ownedSymbols: ["resolveLayoutTitle", "isLayoutRouteActive", "CapabilityLab", "SystemSettings"],
    ownedConcerns: ["route-registration", "sidebar-grouping", "title-mapping"],
  },
  {
    seamId: "system-settings-surface",
    currentOwnerFiles: [
      "src/contracts/character-workflow-system-settings.ts",
      "apps/web/pages/admin/SystemSettings.tsx",
    ],
    targetFile: "apps/web/pages/admin/adminSystemSettingsSurface.ts",
    ownedSymbols: [
      "createDefaultCharacterWorkflowSystemSettings",
      "normalizeCharacterWorkflowSystemSettingsInput",
      "handleSave",
    ],
    ownedConcerns: ["settings-visibility", "save-surface", "refresh-surface"],
  },
  {
    seamId: "image-generation-entry",
    currentOwnerFiles: [
      "apps/web/pages/admin/CapabilityLab.tsx",
      "apps/web/pages/characters/CharacterManagement.tsx",
    ],
    targetFile: "apps/web/pages/characters/characterImageGenerationCenter.ts",
    ownedSymbols: ["parsedImageRefs", "imageState", "withCall", "CharacterManagement"],
    ownedConcerns: ["shared-image-generation-inputs", "character-entry-surface", "audit-refresh-reuse"],
  },
] as const;

export function assertAdminIaImageCenterContract(): {
  version: string;
  reusedContractCount: number;
  routePlanCount: number;
  seamOwnerCount: number;
} {
  return {
    version: ADMIN_IA_IMAGE_CENTER_CONTRACT_VERSION,
    reusedContractCount: ADMIN_IA_IMAGE_CENTER_REUSED_CONTRACTS.length,
    routePlanCount: ADMIN_IA_IMAGE_CENTER_ROUTE_PLAN.length,
    seamOwnerCount: ADMIN_IA_IMAGE_CENTER_OWNER_PLAN.length,
  };
}
