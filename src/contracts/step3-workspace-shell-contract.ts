export const STEP3_WORKSPACE_SHELL_CONTRACT_VERSION = "AT41-03.v1";

export const STEP3_WORKSPACE_SHELL_IDS = [
  "canonical-route-shell",
  "workspace-state-owner",
  "legacy-isolation",
  "navigation-handoff",
] as const;
export type Step3WorkspaceShellId = (typeof STEP3_WORKSPACE_SHELL_IDS)[number];

export interface Step3WorkspaceShellEntry {
  shellId: Step3WorkspaceShellId;
  currentOwnerFiles: readonly string[];
  targetFile: string;
  ownedSymbols: readonly string[];
  ownedConcerns: readonly string[];
  contractDependencies: readonly string[];
}

export interface Step3WorkspaceStateOwnerEntry {
  stateId: "workspace-seed" | "preview-parameters" | "navigation-context";
  currentOwnerFiles: readonly string[];
  targetOwnerFile: string;
  ownedStateKeys: readonly string[];
  ownershipRule: string;
  contractDependencies: readonly string[];
}

export const STEP3_WORKSPACE_SHELL_PAGE_REMAINING_RESPONSIBILITIES = [
  "route assembly",
  "error boundary wiring",
  "module injection",
  "step handoff navigation",
] as const;

export const STEP3_WORKSPACE_SHELL_INVARIANTS = [
  "The new Step3 workspace must be the canonical shell under /create/step3 and must own current Step3 product semantics behind a dedicated assembly layer.",
  "ScriptEditor.tsx remains the only donor implementation behind a dedicated Step3 script-editor bridge; removed Storyboard-era page modules must not re-enter the canonical route tree.",
  "The Step3 shell may own route assembly, recovery wiring, and module injection only; candidate pool behavior, parameter precedence, preview runtime, and mask editing must live in dedicated child modules.",
  "Step2 -> Step3 seed state and Step3 -> Step4 handoff state must stay serializable and store-backed; the shell must not invent page-local hidden owners that bypass useAppStore and snapshot contracts.",
  "Route labels and ownership metadata must use current canonical Step3 wording instead of reviving old script-editor or storyboard numbering semantics.",
] as const;

export const STEP3_WORKSPACE_SHELL_PLAN: readonly Step3WorkspaceShellEntry[] = [
  {
    shellId: "canonical-route-shell",
    currentOwnerFiles: [
      "apps/web/App.tsx",
      "apps/web/pages/project-flow/ProjectFlowRouteBoundary.tsx",
      "apps/web/components/layout/layoutNavigationController.ts",
      "apps/web/pages/project-flow/flow41RouteNormalization.ts",
    ],
    targetFile: "apps/web/pages/project-flow/step3-workspace/Step3WorkspaceRoute.tsx",
    ownedSymbols: [
      'path="step3"',
      "screenLabel=\"Step 3 分镜图片工作台\"",
      "layoutWorkflowSteps",
      "resolveFlow41CanonicalStepFromPath",
    ],
    ownedConcerns: [
      "canonical-step3-route-slot",
      "flow41-layout-step-resolution",
      "route-boundary-recovery",
      "layout-step-label-normalization",
    ],
    contractDependencies: [
      "src/contracts/project-last-step.ts",
      "src/contracts/project-step-snapshot.ts",
    ],
  },
  {
    shellId: "workspace-state-owner",
    currentOwnerFiles: [
      "apps/web/store/useAppStore.ts",
      "apps/web/pages/project-flow/ScriptEditor.tsx",
    ],
    targetFile: "apps/web/pages/project-flow/step3-workspace/Step3WorkspaceShell.tsx",
    ownedSymbols: [
      "step3CharacterReferencePool",
      "pendingStoryboardImport",
      "step4PreviewRatio",
      "step4PreviewResolution",
      "step4PreviewSharpness",
    ],
    ownedConcerns: [
      "workspace-seed-state",
      "preview-parameter-state-before-step4",
      "step3-shell-store-bridge",
      "serializable-workspace-handoff",
    ],
    contractDependencies: [
      "src/contracts/project-page-content-snapshot.ts",
      "src/contracts/project-flow-ui-shared-contract.ts",
    ],
  },
  {
    shellId: "legacy-isolation",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/ScriptEditor.tsx",
      "apps/web/pages/project-flow/step3-workspace/step3WorkspaceScriptEditorBridge.tsx",
      "src/contracts/step3-minimal-seam-contract.ts",
    ],
    targetFile: "apps/web/pages/project-flow/step3-workspace/step3WorkspaceScriptEditorBridge.tsx",
    ownedSymbols: [
      "Step3WorkspaceScriptEditorBridge",
      "STEP3_WORKSPACE_SCRIPT_EDITOR_BRIDGE_MODE",
      "ScriptEditor",
    ],
    ownedConcerns: [
      "script-editor-donor-bridge",
      "legacy-page-removal-guard",
      "new-step3-subtree-boundary",
      "hotspot-expansion-guard",
    ],
    contractDependencies: [
      "src/contracts/step3-minimal-seam-contract.ts",
    ],
  },
  {
    shellId: "navigation-handoff",
    currentOwnerFiles: [
      "apps/web/store/useAppStore.ts",
      "apps/web/App.tsx",
      "apps/web/pages/project-flow/ScriptEditor.tsx",
    ],
    targetFile: "apps/web/pages/project-flow/step3-workspace/step3WorkspaceNavigationBridge.ts",
    ownedSymbols: [
      "projectId",
      "projectStatus",
      "scriptId",
      "scriptVersion",
      "navigate",
    ],
    ownedConcerns: [
      "step2-to-step3-entry-context",
      "step3-to-step4-navigation-payload",
      "resume-safe-workflow-context",
      "step-shell-recovery-paths",
    ],
    contractDependencies: [
      "src/contracts/project-last-step.ts",
      "src/contracts/project-step-snapshot.ts",
      "src/contracts/project-page-content-snapshot.ts",
    ],
  },
] as const;

export const STEP3_WORKSPACE_STATE_OWNER_MAP: readonly Step3WorkspaceStateOwnerEntry[] = [
  {
    stateId: "workspace-seed",
    currentOwnerFiles: [
      "apps/web/store/useAppStore.ts",
      "apps/web/pages/project-flow/ScriptEditor.tsx",
    ],
    targetOwnerFile: "apps/web/pages/project-flow/step3-workspace/step3WorkspaceStoreBridge.ts",
    ownedStateKeys: ["script", "pendingScriptImport", "pendingStoryboardImport", "step3CharacterReferencePool"],
    ownershipRule:
      "Step3 shell seeds the workspace from store-backed serializable state only and must not create hidden route-local mirrors for script imports or reference pools.",
    contractDependencies: [
      "src/contracts/project-page-content-snapshot.ts",
      "src/contracts/step3-import-boundary.ts",
    ],
  },
  {
    stateId: "preview-parameters",
    currentOwnerFiles: [
      "apps/web/store/useAppStore.ts",
      "apps/web/pages/project-flow/ScriptEditor.tsx",
    ],
    targetOwnerFile: "apps/web/pages/project-flow/step3-workspace/step3WorkspacePreviewParameterBridge.ts",
    ownedStateKeys: ["step4PreviewRatio", "step4PreviewResolution", "step4PreviewSharpness"],
    ownershipRule:
      "Global ratio, resolution, and sharpness belong to the new Step3 workspace before handoff; Step4 consumes the saved result instead of remaining the canonical owner.",
    contractDependencies: [
      "src/contracts/project-page-content-snapshot.ts",
      "src/contracts/project-flow-ui-shared-contract.ts",
    ],
  },
  {
    stateId: "navigation-context",
    currentOwnerFiles: [
      "apps/web/store/useAppStore.ts",
      "apps/web/App.tsx",
    ],
    targetOwnerFile: "apps/web/pages/project-flow/step3-workspace/step3WorkspaceNavigationBridge.ts",
    ownedStateKeys: ["projectId", "projectName", "projectStatus", "scriptId", "scriptVersion"],
    ownershipRule:
      "Step3 shell navigation stays rooted in workflow context from useAppStore and route boundaries; child modules receive DTOs instead of reading HashRouter location state ad hoc.",
    contractDependencies: [
      "src/contracts/project-last-step.ts",
      "src/contracts/project-step-snapshot.ts",
    ],
  },
] as const;

function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`${fieldName} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function assertShellId(value: unknown, fieldName: string): Step3WorkspaceShellId {
  if (!STEP3_WORKSPACE_SHELL_IDS.includes(value as Step3WorkspaceShellId)) {
    throw new Error(
      `${fieldName} must be canonical-route-shell|workspace-state-owner|legacy-isolation|navigation-handoff`,
    );
  }
  return value as Step3WorkspaceShellId;
}

export function normalizeStep3WorkspaceShellPlan(input: unknown): Step3WorkspaceShellEntry[] {
  if (!Array.isArray(input)) {
    throw new Error("step3 workspace shell plan must be an array");
  }
  const seen = new Set<Step3WorkspaceShellId>();
  return input.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`plan[${index}] must be an object`);
    }
    const record = item as Record<string, unknown>;
    const shellId = assertShellId(record.shellId, `plan[${index}].shellId`);
    if (seen.has(shellId)) {
      throw new Error(`duplicate shellId: ${shellId}`);
    }
    seen.add(shellId);
    const targetFile = typeof record.targetFile === "string" ? record.targetFile.trim() : "";
    if (!targetFile) {
      throw new Error(`plan[${index}].targetFile must be a non-empty string`);
    }
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

export function assertStep3WorkspaceShellContract(): {
  version: string;
  shellCount: number;
  stateOwnerCount: number;
  routeTarget: string;
    hotspotCount: number;
} {
  return {
    version: STEP3_WORKSPACE_SHELL_CONTRACT_VERSION,
    shellCount: STEP3_WORKSPACE_SHELL_PLAN.length,
    stateOwnerCount: STEP3_WORKSPACE_STATE_OWNER_MAP.length,
    routeTarget: "/create/step3",
    hotspotCount: 1,
  };
}
