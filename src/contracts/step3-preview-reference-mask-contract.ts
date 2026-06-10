export const STEP3_PREVIEW_REFERENCE_MASK_CONTRACT_VERSION = "AT41-05.v1";

export const STEP3_PREVIEW_REFERENCE_MASK_IDS = [
  "main-preview",
  "reference-board",
  "candidate-strip",
  "mask-editor",
  "prompt-actions",
] as const;
export type Step3PreviewReferenceMaskId = (typeof STEP3_PREVIEW_REFERENCE_MASK_IDS)[number];

export interface Step3PreviewReferenceMaskEntry {
  boundaryId: Step3PreviewReferenceMaskId;
  currentOwnerFiles: readonly string[];
  targetFile: string;
  ownedSymbols: readonly string[];
  ownedConcerns: readonly string[];
  contractDependencies: readonly string[];
}

export const STEP3_PREVIEW_RUNTIME_CONTRACT = {
  mainPreviewPlacement: "embedded-per-card",
  frameParameterPlacement: "left-of-main-preview",
  candidateLimit: 8,
  candidateClickAction: "switch-main-preview",
  candidatePreviewButton: true,
  candidateDoubleClickEnabled: false,
  mainPreviewDoubleClickEnabled: true,
  desktopCandidatePersistence: true,
  mobileCandidateLayout: "horizontal-strip",
  mobileCardModes: ["text", "reference", "generated-image"] as const,
  hoverActions: ["change-image", "mask-repaint"] as const,
} as const;

export const STEP3_REFERENCE_BOARD_CONTRACT = {
  title: "人物场景参考图",
  characterSectionLabel: "人物参考图",
  sceneSectionLabel: "场景参考图",
  characterSlotCount: 6,
  sceneMaxCount: 8,
  sceneGenerationModes: ["global", "single-card"] as const,
  sceneImagePolicy: "single-image-overwrite",
  hoverEditorMode: "sticky",
  visualTagStyle: "edge-tag",
} as const;

export const STEP3_MASK_EDITOR_CONTRACT = {
  title: "局部蒙版编辑",
  tools: ["brush", "brush-size", "undo", "erase", "confirm"] as const,
  repaintMode: "current-image-plus-prompt",
  outputOwner: "step3-workspace",
} as const;

export const STEP3_PROMPT_ACTION_PLACEMENT_CONTRACT = {
  actions: ["optimize", "translate"] as const,
  placement: "prompt-bottom-right",
  semanticsChanged: false,
} as const;

export const STEP3_PREVIEW_REFERENCE_MASK_INVARIANTS = [
  "Step3 embeds one 9:16 main preview area inside each storyboard card instead of using a page-level fixed-right preview owner.",
  "Candidate thumbnails stay visible while switching the main preview; single-click switches the big image, preview remains a separate action, and candidate double-click is intentionally disabled.",
  "Main preview hover owns change-image and mask-repaint entry points, while double-click on the main image opens preview mode.",
  "Reference board title is fixed to 人物场景参考图, with character references above scene references, six character slots, at most eight scene cards, and one-image overwrite semantics for each scene slot.",
  "Scene reference board must keep both global generation and single-card generation entry points, and scene hover editor remains sticky even after an image exists.",
  "Mask editing is an explicit Step3 workspace tool with brush, size, undo, erase, and confirm semantics; saved mask data returns to the current Step3 frame workspace instead of flowing directly into Step4.",
  "Optimize and translate are old actions moved to the main prompt textarea bottom-right only; the relocation must not change backend route semantics.",
] as const;

export const STEP3_PREVIEW_REFERENCE_MASK_PLAN: readonly Step3PreviewReferenceMaskEntry[] = [
  {
    boundaryId: "main-preview",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/ScriptEditor.tsx",
      "apps/web/pages/project-flow/step3StoryboardPromptCard.tsx",
      "apps/web/pages/project-flow/step3-workspace/step3PreviewCardRuntime.tsx",
      "apps/web/pages/project-flow/step3-workspace/step3StoryboardCardPreviewPanel.tsx",
      "apps/web/pages/project-flow/step3-workspace/step3ReferenceBoardLayout.tsx",
    ],
    targetFile: "apps/web/pages/project-flow/step3-workspace/step3StoryboardCardPreviewPanel.tsx",
    ownedSymbols: [
      "ImagePreviewModal",
      "data-testid=\"step3-image-preview-modal\"",
      "onDoubleClick={() => onOpenPreview(viewModel.previewImageUrl!, viewModel.previewImageLabel)}",
      "onPreviewImage",
    ],
    ownedConcerns: [
      "main-preview-modal",
      "main-image-double-click-preview",
      "preview-button-separation",
      "card-embedded-preview-runtime",
    ],
    contractDependencies: [
      "src/contracts/project-flow-ui-shared-contract.ts",
      "src/contracts/step3-workspace-shell-contract.ts",
    ],
  },
  {
    boundaryId: "reference-board",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/ScriptEditor.tsx",
      "src/contracts/step3-scene-workbench-contract.ts",
      "apps/web/pages/project-flow/step3-workspace/step3ReferenceBoardLayout.tsx",
      "apps/web/pages/project-flow/step3-workspace/step3SceneReferenceHoverEditor.tsx",
    ],
    targetFile: "apps/web/pages/project-flow/step3-workspace/step3ReferenceBoardLayout.tsx",
    ownedSymbols: [
      "STEP3_REFERENCE_BOARD_CONTRACT.sceneMaxCount",
      "data-testid=\"step3-scene-hover-editor\"",
      "data-testid=\"step3-scene-generate-all-button\"",
      "data-hover-editor-mode={STEP3_REFERENCE_BOARD_CONTRACT.hoverEditorMode}",
    ],
    ownedConcerns: [
      "reference-board-title-and-layout",
      "character-section-above-scene-section",
      "scene-card-cap-at-eight",
      "single-image-overwrite-scene-slot",
      "sticky-hover-editor-runtime",
    ],
    contractDependencies: [
      "src/contracts/step3-scene-workbench-contract.ts",
      "src/contracts/project-flow-ui-shared-contract.ts",
    ],
  },
  {
    boundaryId: "candidate-strip",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/ScriptEditor.tsx",
      "apps/web/pages/project-flow/step3StoryboardPromptCard.tsx",
      "apps/web/pages/project-flow/step3-workspace/step3CandidateStripRuntime.tsx",
      "apps/web/pages/project-flow/step3-workspace/step3StoryboardCardPreviewPanel.tsx",
    ],
    targetFile: "apps/web/pages/project-flow/step3-workspace/step3CandidateStripRuntime.tsx",
    ownedSymbols: [
      "viewModel.candidates.map((candidate, index) =>",
      "data-testid={`step3-scene-candidate-${viewModel.frameIndex}-${index + 1}`}",
      "onPreviewImage",
      "预览",
    ],
    ownedConcerns: [
      "candidate-strip-persistence",
      "thumbnail-preview-button",
      "single-click-main-image-switch",
      "mobile-horizontal-strip-handshake",
    ],
    contractDependencies: [
      "src/contracts/project-flow-ui-shared-contract.ts",
      "src/contracts/step3-frame-parameter-contract.ts",
    ],
  },
  {
    boundaryId: "mask-editor",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/ScriptEditor.tsx",
      "apps/web/pages/project-flow/step3-workspace/step3MaskEditorBridge.tsx",
      "apps/web/pages/project-flow/step3-workspace/step3MaskEditorRuntime.tsx",
    ],
    targetFile: "apps/web/pages/project-flow/step3-workspace/step3MaskEditorRuntime.tsx",
    ownedSymbols: [
      "Step3MaskEditorRuntime",
      "画笔尺寸",
      "撤销",
      "擦除",
      "保存蒙版",
    ],
    ownedConcerns: [
      "mask-editor-entry",
      "mask-save-to-current-frame",
      "explicit-mask-tooling",
      "step3-mask-bridge-runtime",
    ],
    contractDependencies: [
      "src/contracts/step3-frame-parameter-contract.ts",
      "src/contracts/project-flow-ui-shared-contract.ts",
    ],
  },
  {
    boundaryId: "prompt-actions",
    currentOwnerFiles: [
      "apps/web/pages/project-flow/ScriptEditor.tsx",
      "apps/web/pages/project-flow/step3StoryboardPromptCard.tsx",
      "apps/web/pages/project-flow/step3-workspace/step3PromptActionPlacement.tsx",
    ],
    targetFile: "apps/web/pages/project-flow/step3-workspace/step3PromptActionPlacement.tsx",
    ownedSymbols: [
      "handleMainPromptAction",
      "optimizeStoryboardPrompt",
      "translateStoryboardPrompt",
      "auto_fix_high",
      "translate",
    ],
    ownedConcerns: [
      "optimize-action-relocation",
      "translate-action-relocation",
      "no-semantics-change-relocation",
      "storyboard-prompt-action-boundary",
    ],
    contractDependencies: [
      "src/contracts/frontend-api-domain-contract.ts",
      "src/contracts/project-flow-ui-shared-contract.ts",
    ],
  },
] as const;

function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`${fieldName} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function assertBoundaryId(value: unknown, fieldName: string): Step3PreviewReferenceMaskId {
  if (!STEP3_PREVIEW_REFERENCE_MASK_IDS.includes(value as Step3PreviewReferenceMaskId)) {
    throw new Error(`${fieldName} must be main-preview|reference-board|candidate-strip|mask-editor|prompt-actions`);
  }
  return value as Step3PreviewReferenceMaskId;
}

export function normalizeStep3PreviewReferenceMaskPlan(input: unknown): Step3PreviewReferenceMaskEntry[] {
  if (!Array.isArray(input)) {
    throw new Error("step3 preview/reference/mask plan must be an array");
  }
  const seen = new Set<Step3PreviewReferenceMaskId>();
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
    const targetFile = typeof record.targetFile === "string" ? record.targetFile.trim() : "";
    if (!targetFile) {
      throw new Error(`plan[${index}].targetFile must be a non-empty string`);
    }
    return {
      boundaryId,
      currentOwnerFiles: assertStringArray(record.currentOwnerFiles, `plan[${index}].currentOwnerFiles`),
      targetFile,
      ownedSymbols: assertStringArray(record.ownedSymbols, `plan[${index}].ownedSymbols`),
      ownedConcerns: assertStringArray(record.ownedConcerns, `plan[${index}].ownedConcerns`),
      contractDependencies: assertStringArray(record.contractDependencies, `plan[${index}].contractDependencies`),
    };
  });
}

export function assertStep3PreviewReferenceMaskContract(): {
  version: string;
  boundaryCount: number;
  candidateLimit: number;
  characterSlotCount: number;
  sceneMaxCount: number;
  maskToolCount: number;
} {
  return {
    version: STEP3_PREVIEW_REFERENCE_MASK_CONTRACT_VERSION,
    boundaryCount: STEP3_PREVIEW_REFERENCE_MASK_PLAN.length,
    candidateLimit: STEP3_PREVIEW_RUNTIME_CONTRACT.candidateLimit,
    characterSlotCount: STEP3_REFERENCE_BOARD_CONTRACT.characterSlotCount,
    sceneMaxCount: STEP3_REFERENCE_BOARD_CONTRACT.sceneMaxCount,
    maskToolCount: STEP3_MASK_EDITOR_CONTRACT.tools.length,
  };
}
