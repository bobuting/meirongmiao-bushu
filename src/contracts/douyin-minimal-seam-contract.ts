export const DOUYIN_MINIMAL_SEAM_CONTRACT_VERSION = "AT36-03.v1";

export const DOUYIN_MINIMAL_SEAM_IDS = [
  "auth-surface",
  "publish-surface",
  "history-diagnostics-surface",
  "step5-entry-surface",
] as const;

export type DouyinMinimalSeamId = (typeof DOUYIN_MINIMAL_SEAM_IDS)[number];

export interface DouyinMinimalSeamEntry {
  seamId: DouyinMinimalSeamId;
  currentOwnerFiles: readonly string[];
  targetFile: string | null;
  ownedSymbols: readonly string[];
  ownedConcerns: readonly string[];
  contractDependencies: readonly string[];
}

export const DOUYIN_MINIMAL_SEAM_INVARIANTS = [
  "Douyin auth surface must route through project-flow route registrar plus douyin-route-handlers instead of re-expanding src/app.ts with inline auth endpoints.",
  "Douyin publish surface must keep src/app.ts and apps/web/services/backendApi.ts as minimal seams; route logic belongs in src/modules/* and facade logic belongs in backendApi.douyinPublish.ts.",
  "History and diagnostics surface owns publish history persistence plus screenshot index metadata; runtime screenshot binaries may stay file-based but routing/summary state must stay structured.",
  "Step5 entry surface owns douyin auth panel, publish history, and small-yellow-cart short-title wiring without regressing main-repo square publish category structure.",
] as const;

export const DOUYIN_MINIMAL_SEAM_PLAN: readonly DouyinMinimalSeamEntry[] = [
  {
    seamId: "auth-surface",
    currentOwnerFiles: [
      "src/app.ts",
      "src/modules/douyin-auth-service.ts",
      "src/modules/douyin-remote-login-service.ts",
      "src/routes/project-flow-routes.ts",
    ],
    targetFile: "src/modules/douyin-route-handlers.ts",
    ownedSymbols: [
      "getDouyinAuthStatus",
      "generateDouyinQRCode",
      "checkDouyinScanStatus",
      "createDouyinRemoteSession",
      "getDouyinRemoteSession",
      "closeDouyinRemoteSession",
      "clearDouyinCookie",
    ],
    ownedConcerns: [
      "qr-login",
      "remote-login-fallback",
      "cookie-binding-status",
      "auth-surface-route-delegation",
    ],
    contractDependencies: [
      "src/contracts/douyin-auth-contract.ts",
      "src/modules/douyin-cookie-metadata.ts",
      "src/routes/project-flow-routes.ts",
    ],
  },
  {
    seamId: "publish-surface",
    currentOwnerFiles: [
      "src/app.ts",
      "src/modules/douyin-publish-service.ts",
      "scripts/douyin_publish_bridge.py",
      "src/routes/project-flow-routes.ts",
    ],
    targetFile: "src/modules/douyin-route-handlers.ts",
    ownedSymbols: [
      "getDouyinPublishStatus",
      "publishToDouyin",
      "getPublishJob",
      "getPublishJobs",
      "getPublishStagingScreenshot",
    ],
    ownedConcerns: [
      "publish-job-creation",
      "publish-job-status",
      "publish-history-query",
      "upload-bridge-protocol",
    ],
    contractDependencies: [
      "src/contracts/douyin-publish-contract.ts",
      "src/contracts/douyin-publish-history-contract.ts",
      "src/routes/project-flow-routes.ts",
    ],
  },
  {
    seamId: "history-diagnostics-surface",
    currentOwnerFiles: [
      "src/modules/douyin-publish-service.ts",
      "src/modules/douyin-cookie-metadata.ts",
      "src/modules/douyin-publish-history-store.ts",
    ],
    targetFile: "src/modules/douyin-publish-history-store.ts",
    ownedSymbols: [
      "DouyinPublishHistoryStore",
      "readDouyinCookieMetadata",
      "writeDouyinCookieMetadata",
      "inferDouyinCookieExpiry",
    ],
    ownedConcerns: [
      "publish-history-persistence",
      "diagnostic-screenshot-index",
      "auth-metadata-sidecar",
      "structured-auth-status",
    ],
    contractDependencies: [
      "src/contracts/douyin-publish-history-contract.ts",
      "src/contracts/douyin-auth-contract.ts",
    ],
  },
  {
    seamId: "step5-entry-surface",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/step5-delivery-shell/Step5DeliveryShellRoute.tsx",
      "apps/web/pages/project-flow/step5-delivery-shell/step5DeliveryActionController.ts",
      "apps/web/pages/project-flow/step5-delivery-shell/step5ResultConsumptionContract.ts",
      "apps/web/services/backendApi.ts",
    ],
    targetFile: "apps/web/services/backendApi.douyinPublish.ts",
    ownedSymbols: [
      "runStep5DeliveryAction",
      "normalizeStep5TitleCandidates",
      "createDouyinPublishBackendApi",
    ],
    ownedConcerns: [
      "step5-douyin-panel",
      "step5-auth-state",
      "step5-publish-history",
      "small-yellow-cart-short-title",
    ],
    contractDependencies: [
      "src/contracts/douyin-auth-contract.ts",
      "src/contracts/douyin-publish-contract.ts",
      "src/contracts/square-publish-category.ts",
    ],
  },
] as const;

function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`${fieldName} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function assertSeamId(value: unknown, fieldName: string): DouyinMinimalSeamId {
  if (!DOUYIN_MINIMAL_SEAM_IDS.includes(value as DouyinMinimalSeamId)) {
    throw new Error(`${fieldName} must be auth-surface|publish-surface|history-diagnostics-surface|step5-entry-surface`);
  }
  return value as DouyinMinimalSeamId;
}

export function normalizeDouyinMinimalSeamPlan(input: unknown): DouyinMinimalSeamEntry[] {
  if (!Array.isArray(input)) {
    throw new Error("douyin minimal seam plan must be an array");
  }

  const seen = new Set<DouyinMinimalSeamId>();
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

export function getDouyinMinimalSeamEntry(seamId: DouyinMinimalSeamId): DouyinMinimalSeamEntry {
  const entry = DOUYIN_MINIMAL_SEAM_PLAN.find((item) => item.seamId === seamId);
  if (!entry) {
    throw new Error(`unknown seamId: ${seamId}`);
  }
  return entry;
}

export function assertDouyinMinimalSeamContract(): {
  version: string;
  seamCount: number;
  extractionTargetCount: number;
  hotspotFiles: readonly string[];
} {
  return {
    version: DOUYIN_MINIMAL_SEAM_CONTRACT_VERSION,
    seamCount: DOUYIN_MINIMAL_SEAM_PLAN.length,
    extractionTargetCount: DOUYIN_MINIMAL_SEAM_PLAN.filter((entry) => entry.targetFile).length,
    hotspotFiles: [
      "src/app.ts",
      "apps/web/services/backendApi.ts",
      "apps/web/pages/project-flow/step5-delivery-shell/Step5DeliveryShellRoute.tsx",
    ],
  };
}
