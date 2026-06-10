export const STEP5_DELIVERY_SHELL_CONTRACT_VERSION = "AT41-07.v1";

export const STEP5_DELIVERY_SHELL_IDS = [
  "route-shell",
  "result-consumption",
  "delivery-actions",
  "legacy-isolation",
] as const;
export type Step5DeliveryShellId = (typeof STEP5_DELIVERY_SHELL_IDS)[number];

export interface Step5DeliveryShellEntry {
  shellId: Step5DeliveryShellId;
  currentOwnerFiles: readonly string[];
  targetFile: string;
  ownedSymbols: readonly string[];
  ownedConcerns: readonly string[];
  contractDependencies: readonly string[];
}

export interface Step5DeliveryPayload {
  projectId: string;
  scriptId: string | null;
  finalVideoUrl: string | null;
  clipVideoUrls: readonly string[];
  videoCoverImageUrl: string | null;
  titleCandidates: readonly string[];
  squarePublishCategory: "男装" | "女装" | "男童装" | "女童装" | null;
  sourceStep: "step4";
  /** 视频总时长（秒），优先使用合并后的实际时长 */
  durationSec?: number | null;
}

export const STEP5_DELIVERY_SHELL_PAGE_REMAINING_RESPONSIBILITIES = [
  "route assembly",
  "error boundary wiring",
  "module injection",
  "final action navigation",
] as const;

export const STEP5_DELIVERY_SHELL_RUNTIME_CONTRACT = {
  routeTarget: "/create/step5",
  heavyWorkspace: false,
  sourceOfTruth: "step4-delivery-payload",
  legacyStateAsSourceOfTruth: false,
} as const;

export const STEP5_DELIVERY_SHELL_INVARIANTS = [
  "The new Step5 delivery shell is the canonical owner under /create/step5 and replaces the old Step7 page number with a thin result-consumption shell.",
  "The new Step5 consumes only serialized output from the new Step4 video workspace and must not restore old Step7 local page state as the source of truth.",
  "Legacy donor pages for the old delivery experience have been removed; Step5 work lands only in the dedicated step5-delivery-shell subtree.",
  "Export and publish actions belong to dedicated Step5 action controllers behind API contracts; the route shell stays thin and does not become a new hotspot page.",
  "Legacy step6/step7 URLs may exist only as no-state redirects or prompts during migration and must not bring back old numbering semantics.",
] as const;

export const STEP5_DELIVERY_SHELL_PLAN: readonly Step5DeliveryShellEntry[] = [
  {
    shellId: "route-shell",
    currentOwnerFiles: [
      "apps/web/App.tsx",
      "apps/web/pages/project-flow/step5-delivery-shell/Step5DeliveryShellRoute.tsx",
      "apps/web/pages/project-flow/step5-delivery-shell/step5LegacyRouteBridge.ts",
    ],
    targetFile: "apps/web/pages/project-flow/step5-delivery-shell/Step5DeliveryShellRoute.tsx",
    ownedSymbols: [
      'path="step5"',
      'path="step7"',
      "Step5DeliveryShellRoute",
      'to="/create/step5"',
      'navigate("/create/step4")',
    ],
    ownedConcerns: [
      "canonical-step5-route-shell",
      "legacy-step6-step7-route-collapse",
      "step4-to-step5-entry",
      "no-state-legacy-redirect-entry",
    ],
    contractDependencies: [
      "src/contracts/project-last-step.ts",
      "src/contracts/project-step-snapshot.ts",
      "src/contracts/step4-video-workspace-contract.ts",
    ],
  },
  {
    shellId: "result-consumption",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/step4-video-workspace/Step4VideoWorkspaceScreen.tsx",
      "apps/web/store/useAppStore.ts",
      "apps/web/pages/project-flow/step5-delivery-shell/step5ResultConsumptionContract.ts",
      "apps/web/pages/project-flow/step5-delivery-shell/Step5DeliveryShellRoute.tsx",
    ],
    targetFile: "apps/web/pages/project-flow/step5-delivery-shell/step5ResultConsumptionContract.ts",
    ownedSymbols: [
      "step5DeliveryPayload",
      "buildStep5DeliveryProjectDataPatch",
      "resolveStep5DeliveryPayload",
      "titleCandidates",
      'sourceStep: "step4"',
    ],
    ownedConcerns: [
      "step4-result-preview-consumption",
      "title-shell-selection",
      "serializable-delivery-payload",
      "no-step7-local-resume-source",
    ],
    contractDependencies: [
      "src/contracts/project-page-content-snapshot.ts",
      "src/contracts/step4-video-workspace-contract.ts",
    ],
  },
  {
    shellId: "delivery-actions",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/step5-delivery-shell/Step5DeliveryShellRoute.tsx",
      "apps/web/pages/project-flow/step5-delivery-shell/step5DeliveryActionController.ts",
      "apps/web/services/backendApi.ts",
      "apps/web/store/useAppStore.ts",
    ],
    targetFile: "apps/web/pages/project-flow/step5-delivery-shell/step5DeliveryActionController.ts",
    ownedSymbols: [
      "exportVideo",
      "submitReview",
      "READY_TO_PUBLISH",
      "pushTaskNotification",
      "resetProjectData",
    ],
    ownedConcerns: [
      "download-action-boundary",
      "publish-action-boundary",
      "final-status-writeback",
      "project-cleanup-after-delivery",
    ],
    contractDependencies: [
      "src/contracts/frontend-api-domain-contract.ts",
      "src/contracts/project-flow-ui-shared-contract.ts",
    ],
  },
  {
    shellId: "legacy-isolation",
    currentOwnerFiles: [
      "apps/web/App.tsx",
      "apps/web/store/useAppStore.ts",
      "apps/web/pages/project-flow/step5-delivery-shell/step5LegacyRouteBridge.ts",
    ],
    targetFile: "apps/web/pages/project-flow/step5-delivery-shell/step5LegacyRouteBridge.ts",
    ownedSymbols: [
      "STEP5_LEGACY_ROUTE_TARGET",
      'path="step7"',
      "resolveStep5LegacyRouteTarget",
      "reviewId",
      "exportUrl",
    ],
    ownedConcerns: [
      "copywriting-donor-only-status",
      "legacy-step7-numbering-isolation",
      "thin-shell-growth-guard",
      "delivery-state-owned-by-contract",
    ],
    contractDependencies: [
      "src/contracts/project-last-step.ts",
      "src/contracts/step4-video-workspace-contract.ts",
    ],
  },
] as const;

function fail(message: string): never {
  throw new Error(message);
}

function assertStringArray(value: unknown, fieldName: string): string[] {
  const normalizedValue = Array.isArray(value) ? value : fail(`${fieldName} must be an array of non-empty strings`);
  normalizedValue.some((item) => typeof item !== "string" || item.trim().length === 0)
    ? fail(`${fieldName} must be an array of non-empty strings`)
    : null;
  return normalizedValue.map((item) => item.trim());
}

function assertShellId(value: unknown, fieldName: string): Step5DeliveryShellId {
  !STEP5_DELIVERY_SHELL_IDS.includes(value as Step5DeliveryShellId)
    ? fail(`${fieldName} must be route-shell|result-consumption|delivery-actions|legacy-isolation`)
    : null;
  return value as Step5DeliveryShellId;
}

function assertNullableString(value: unknown, fieldName: string): string | null {
  value === null ? null : typeof value !== "string" ? fail(`${fieldName} must be a string or null`) : null;
  const nullableValue = value as string | null;
  return nullableValue === null
    ? null
    : (() => {
        const normalized = nullableValue.trim();
        return normalized.length > 0 ? normalized : null;
      })();
}

export function normalizeStep5DeliveryShellPlan(input: unknown): Step5DeliveryShellEntry[] {
  const planInput = Array.isArray(input) ? input : fail("step5 delivery shell plan must be an array");
  const seen = new Set<Step5DeliveryShellId>();
  return planInput.map((item, index) => {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : fail(`plan[${index}] must be an object`);
    const shellId = assertShellId(record.shellId, `plan[${index}].shellId`);
    seen.has(shellId) ? fail(`duplicate shellId: ${shellId}`) : null;
    seen.add(shellId);
    const targetFile = typeof record.targetFile === "string" ? record.targetFile.trim() : "";
    !targetFile ? fail(`plan[${index}].targetFile must be a non-empty string`) : null;
    return {
      shellId,
      currentOwnerFiles: assertStringArray(record.currentOwnerFiles, `plan[${index}].currentOwnerFiles`),
      targetFile,
      ownedSymbols: assertStringArray(record.ownedSymbols, `plan[${index}].ownedSymbols`),
      ownedConcerns: assertStringArray(record.ownedConcerns, `plan[${index}].ownedConcerns`),
      contractDependencies: assertStringArray(record.contractDependencies, `plan[${index}].contractDependencies`),
    };
  });
}

export function normalizeStep5DeliveryPayload(input: unknown): Step5DeliveryPayload {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : fail("step5 delivery payload must be an object");
  const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
  !projectId ? fail("projectId must be a non-empty string") : null;
  const sourceStep = record.sourceStep === "step4" ? record.sourceStep : fail("sourceStep must be step4");
  // 解析 durationSec：支持 number 类型，必须是正数
  const durationSecRaw = record.durationSec;
  const durationSec =
    typeof durationSecRaw === "number" && durationSecRaw > 0
      ? durationSecRaw
      : typeof durationSecRaw === "string"
        ? (() => {
            const parsed = Number(durationSecRaw);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
          })()
        : null;
  return {
    projectId,
    scriptId: assertNullableString(record.scriptId ?? null, "scriptId"),
    finalVideoUrl: assertNullableString(record.finalVideoUrl ?? null, "finalVideoUrl"),
    clipVideoUrls: assertStringArray(record.clipVideoUrls ?? [], "clipVideoUrls"),
    videoCoverImageUrl: assertNullableString(record.videoCoverImageUrl ?? null, "videoCoverImageUrl"),
    titleCandidates: assertStringArray(record.titleCandidates ?? [], "titleCandidates"),
    squarePublishCategory:
      record.squarePublishCategory === "男装" ||
      record.squarePublishCategory === "女装" ||
      record.squarePublishCategory === "男童装" ||
      record.squarePublishCategory === "女童装"
        ? record.squarePublishCategory
        : null,
    sourceStep,
    durationSec,
  };
}

export function assertStep5DeliveryShellContract(): {
  version: string;
  shellCount: number;
  routeTarget: string;
  heavyWorkspace: boolean;
  donorPageCount: number;
} {
  return {
    version: STEP5_DELIVERY_SHELL_CONTRACT_VERSION,
    shellCount: STEP5_DELIVERY_SHELL_PLAN.length,
    routeTarget: STEP5_DELIVERY_SHELL_RUNTIME_CONTRACT.routeTarget,
    heavyWorkspace: STEP5_DELIVERY_SHELL_RUNTIME_CONTRACT.heavyWorkspace,
    donorPageCount: 0,
  };
}
