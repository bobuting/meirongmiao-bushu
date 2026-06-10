import {
  normalizeStep3FrameRatio,
  normalizeStep3FrameResolution,
  type Step3FrameRatio,
  type Step3FrameResolution,
} from "./step3-frame-parameter-contract";

export const STEP4_VIDEO_WORKSPACE_CONTRACT_VERSION = "AT41-06.v1";

export const STEP4_VIDEO_WORKSPACE_IDS = [
  "workspace-shell",
  "step3-handoff",
  "job-orchestrator",
  "preview-runtime",
  "variant-runtime",
] as const;
export type Step4VideoWorkspaceId = (typeof STEP4_VIDEO_WORKSPACE_IDS)[number];

export interface Step4VideoWorkspaceEntry {
  workspaceId: Step4VideoWorkspaceId;
  currentOwnerFiles: readonly string[];
  targetFile: string;
  ownedSymbols: readonly string[];
  ownedConcerns: readonly string[];
  contractDependencies: readonly string[];
}

export interface Step4VideoFrameHandoffEntry {
  frameId: string;
  promptText: string;
  imageUrl: string | null;
  ratio: Step3FrameRatio;
  resolution: Step3FrameResolution;
  source: "selected-frame" | "text-fallback";
}

export interface Step4Step3HandoffPayload {
  projectId: string;
  scriptId: string | null;
  scriptVersion: string | null;
  referenceImageUrls: readonly string[];
  frames: readonly Step4VideoFrameHandoffEntry[];
}

export const STEP4_VIDEO_WORKSPACE_PAGE_REMAINING_RESPONSIBILITIES = [
  "route assembly",
  "error boundary wiring",
  "module injection",
  "step5 handoff navigation",
] as const;

export const STEP4_VIDEO_WORKSPACE_RUNTIME_CONTRACT = {
  routeTarget: "/create/step4",
  previewFirst: true,
  fallbackMode: "text-to-video-allowed-when-frame-missing",
  legacyStateAsSourceOfTruth: false,
  variantOwner: "step4-video-workspace",
} as const;

export const STEP4_VIDEO_WORKSPACE_INVARIANTS = [
  "The new Step4 video workspace is the canonical owner under /create/step4 and replaces the old Step5 and Step6 product semantics with one preview-first shell.",
  "Legacy donor pages VideoGeneration.tsx, Step6Variants.tsx, and Copywriting.tsx have been removed; Step4 work lands only in the dedicated step4-video-workspace subtree.",
  "The new Step4 consumes only serialized handoff data from the new Step3 workspace, including current frame images, prompt text, and parameter selections; it must not restore old Step5 or Step6 page-local state as the source of truth.",
  "Video job creation, resume, polling, single-clip retry, preview cards, variant selection, and merge handoff must stay inside the new Step4 workspace boundary instead of leaking back into Step3 candidate pools or forward into Step5 delivery state.",
  "Missing-image clips require a uniform Step4 placeholder and must allow text-to-video fallback without inventing a separate legacy page branch.",
  "The Step4 shell may own route assembly and Step5 navigation only; backend calls and runtime polling belong to dedicated child modules behind explicit contracts.",
] as const;

export const STEP4_VIDEO_WORKSPACE_PLAN: readonly Step4VideoWorkspaceEntry[] = [
  {
    workspaceId: "workspace-shell",
    currentOwnerFiles: [
      "apps/web/App.tsx",
      "apps/web/pages/project-flow/step4-video-workspace/Step4VideoWorkspaceRoute.tsx",
    ],
    targetFile: "apps/web/pages/project-flow/step4-video-workspace/Step4VideoWorkspaceRoute.tsx",
    ownedSymbols: [
      'path="step4"',
      'path="step6"',
      'path="step7"',
      "Step4VideoWorkspaceRoute",
      'to="/create/step4"',
      'screenLabel="Step 4 视频工作台"',
    ],
    ownedConcerns: [
      "canonical-step4-route-shell",
      "legacy-step5-step6-route-collapse",
      "preview-first-route-entry",
      "step4-to-step5-handoff",
    ],
    contractDependencies: [
      "src/contracts/project-last-step.ts",
      "src/contracts/project-step-snapshot.ts",
    ],
  },
  {
    workspaceId: "step3-handoff",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/ScriptEditor.tsx",
      "apps/web/store/useAppStore.ts",
      "apps/web/pages/project-flow/step4-video-workspace/Step4VideoWorkspaceScreen.tsx",
      "apps/web/pages/project-flow/step4-video-workspace/step4Step3HandoffContract.ts",
    ],
    targetFile: "apps/web/pages/project-flow/step4-video-workspace/step4Step3HandoffContract.ts",
    ownedSymbols: [
      "step4PreviewRatio",
      "step4PreviewResolution",
      "step4FrameOverrideSettings",
      "step4Step3HandoffPayload",
      "buildStep3Step4HandoffProjectDataPatch",
      "resolveStep4Step3HandoffPayload",
      "projectResumeSnapshot",
      "snapshot.state.storyboardFrames",
      "latestVideoJob",
    ],
    ownedConcerns: [
      "serialized-step3-frame-handoff",
      "latest-script-and-reference-handoff",
      "frame-level-parameter-carryover",
      "no-legacy-step5-step6-state-resume",
    ],
    contractDependencies: [
      "src/contracts/step3-workspace-shell-contract.ts",
      "src/contracts/step3-frame-parameter-contract.ts",
      "src/contracts/project-page-content-snapshot.ts",
    ],
  },
  {
    workspaceId: "job-orchestrator",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/step4-video-workspace/Step4VideoWorkspaceScreen.tsx",
      "apps/web/pages/project-flow/step4-video-workspace/step4VideoJobOrchestrator.ts",
    ],
    targetFile: "apps/web/pages/project-flow/step4-video-workspace/step4VideoJobOrchestrator.ts",
    ownedSymbols: [
      "createVideoJob",
      "listVideoJobs",
      "getVideoJob",
      "collectStep4VideoClipPrompts",
      "buildStep4VideoClipStatusesFromJob",
      "buildStep4VideoJobCreatePayload",
      "resolveStep4ResumeVideoJob",
      "startStep4VideoJob",
      "pollStep4VideoJob",
      "runStep4SingleClipRetry",
    ],
    ownedConcerns: [
      "video-job-start-and-resume",
      "polling-and-runtime-progress",
      "single-clip-retry-boundary",
      "shared-job-controller-donor-extraction",
    ],
    contractDependencies: [
      "src/contracts/frontend-api-domain-contract.ts",
      "src/contracts/project-page-content-snapshot.ts",
    ],
  },
  {
    workspaceId: "preview-runtime",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/step4-video-workspace/Step4VideoWorkspaceScreen.tsx",
      "apps/web/pages/project-flow/step4-video-workspace/step4PreviewWorkspace.tsx",
      "apps/web/pages/project-flow/step4-video-workspace/step4VideoClipCardRuntimeUi.ts",
    ],
    targetFile: "apps/web/pages/project-flow/step4-video-workspace/step4PreviewWorkspace.tsx",
    ownedSymbols: [
      "STEP4_PREVIEW_WORKSPACE_TITLE",
      "Step4PreviewWorkspaceHeader",
      "buildStep4PreviewCardModel",
      "文生视频兜底",
      "loadingSceneAssets",
      "frameImageUrls",
    ],
    ownedConcerns: [
      "preview-first-card-shell",
      "clip-card-runtime-consistency",
      "missing-frame-placeholder",
      "text-to-video-fallback-entry",
    ],
    contractDependencies: [
      "src/contracts/project-flow-ui-shared-contract.ts",
      "src/contracts/step3-frame-parameter-contract.ts",
    ],
  },
  {
    workspaceId: "variant-runtime",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/step4-video-workspace/Step4FinalVideoMergeLoading.tsx",
      "apps/web/pages/project-flow/step4-video-workspace/Step4VideoWorkspaceScreen.tsx",
      "apps/web/pages/project-flow/step5-delivery-shell/step5ResultConsumptionContract.ts",
    ],
    targetFile: "apps/web/pages/project-flow/step4-video-workspace/Step4VideoWorkspaceScreen.tsx",
    ownedSymbols: [
      "sceneVariants",
      "previewModal",
      "Step4FinalVideoMergeLoading",
      'navigate("/create/step5")',
    ],
    ownedConcerns: [
      "variant-runtime-boundary",
      "preview-modal-selection",
      "merge-loading-runtime",
      "step5-delivery-handoff-compatibility",
    ],
    contractDependencies: [
      "src/contracts/frontend-api-domain-contract.ts",
      "src/contracts/project-last-step.ts",
      "src/contracts/project-step-snapshot.ts",
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

function assertWorkspaceId(value: unknown, fieldName: string): Step4VideoWorkspaceId {
  !STEP4_VIDEO_WORKSPACE_IDS.includes(value as Step4VideoWorkspaceId)
    ? fail(
        `${fieldName} must be workspace-shell|step3-handoff|job-orchestrator|preview-runtime|variant-runtime`,
      )
    : null;
  return value as Step4VideoWorkspaceId;
}

function assertNullableString(value: unknown, fieldName: string): string | null {
  value === null ? null : typeof value !== "string" ? fail(`${fieldName} must be a string or null`) : null;
  const nullableValue = value as string | null;
  nullableValue === null ? null : null;
  return nullableValue === null
    ? null
    : (() => {
        const normalized = nullableValue.trim();
        return normalized.length > 0 ? normalized : null;
      })();
}

function normalizeFrameEntry(input: unknown, index: number): Step4VideoFrameHandoffEntry {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : fail(`frames[${index}] must be an object`);
  const frameId = typeof record.frameId === "string" ? record.frameId.trim() : "";
  const promptText = typeof record.promptText === "string" ? record.promptText.trim() : "";
  !frameId ? fail(`frames[${index}].frameId must be a non-empty string`) : null;
  !promptText ? fail(`frames[${index}].promptText must be a non-empty string`) : null;
  const source =
    record.source === "selected-frame" || record.source === "text-fallback"
      ? record.source
      : fail(`frames[${index}].source must be selected-frame|text-fallback`);
  return {
    frameId,
    promptText,
    imageUrl: assertNullableString(record.imageUrl ?? null, `frames[${index}].imageUrl`),
    ratio: normalizeStep3FrameRatio(record.ratio),
    resolution: normalizeStep3FrameResolution(record.resolution),
    source,
  };
}

export function normalizeStep4VideoWorkspacePlan(input: unknown): Step4VideoWorkspaceEntry[] {
  const planInput = Array.isArray(input) ? input : fail("step4 video workspace plan must be an array");
  const seen = new Set<Step4VideoWorkspaceId>();
  return planInput.map((item, index) => {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : fail(`plan[${index}] must be an object`);
    const workspaceId = assertWorkspaceId(record.workspaceId, `plan[${index}].workspaceId`);
    seen.has(workspaceId) ? fail(`duplicate workspaceId: ${workspaceId}`) : null;
    seen.add(workspaceId);
    const targetFile = typeof record.targetFile === "string" ? record.targetFile.trim() : "";
    !targetFile ? fail(`plan[${index}].targetFile must be a non-empty string`) : null;
    return {
      workspaceId,
      currentOwnerFiles: assertStringArray(record.currentOwnerFiles, `plan[${index}].currentOwnerFiles`),
      targetFile,
      ownedSymbols: assertStringArray(record.ownedSymbols, `plan[${index}].ownedSymbols`),
      ownedConcerns: assertStringArray(record.ownedConcerns, `plan[${index}].ownedConcerns`),
      contractDependencies: assertStringArray(record.contractDependencies, `plan[${index}].contractDependencies`),
    };
  });
}

export function normalizeStep4Step3HandoffPayload(input: unknown): Step4Step3HandoffPayload {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : fail("step4 step3 handoff payload must be an object");
  const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
  !projectId ? fail("projectId must be a non-empty string") : null;
  const framesInput = Array.isArray(record.frames) ? record.frames : fail("frames must contain at least one entry");
  framesInput.length < 1 ? fail("frames must contain at least one entry") : null;
  return {
    projectId,
    scriptId: assertNullableString(record.scriptId ?? null, "scriptId"),
    scriptVersion: assertNullableString(record.scriptVersion ?? null, "scriptVersion"),
    referenceImageUrls: assertStringArray(record.referenceImageUrls ?? [], "referenceImageUrls"),
    frames: framesInput.map((item, index) => normalizeFrameEntry(item, index)),
  };
}

export function assertStep4VideoWorkspaceContract(): {
  version: string;
  boundaryCount: number;
  routeTarget: string;
  previewFirst: boolean;
  legacyHotspotCount: number;
} {
  return {
    version: STEP4_VIDEO_WORKSPACE_CONTRACT_VERSION,
    boundaryCount: STEP4_VIDEO_WORKSPACE_PLAN.length,
    routeTarget: STEP4_VIDEO_WORKSPACE_RUNTIME_CONTRACT.routeTarget,
    previewFirst: STEP4_VIDEO_WORKSPACE_RUNTIME_CONTRACT.previewFirst,
    legacyHotspotCount: 0,
  };
}
