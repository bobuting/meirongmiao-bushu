export const PROJECT_FLOW_UI_SHARED_CONTRACT_VERSION = "AT28-17.v1";

export type ProjectFlowCharacterViewKey = "front" | "left" | "right" | "back" | "closeup";

export type ProjectFlowStoryboardFrameLoadState = "pending" | "ready" | "error";

export interface ProjectFlowStep2CharacterViewDto {
  id: string;
  label: string;
  imageUrl: string;
  viewKey?: ProjectFlowCharacterViewKey;
}

export interface ProjectFlowStep3SceneReferenceDto {
  id: string;
  frameIndex: number;
  title: string;
  prompt: string;
  candidates: string[];
  selectedImageUrl: string | null;
}

export interface ProjectFlowStep3ScriptSegmentDto {
  time: string;
  title: string;
  content: string;
  visualCue: string;
  videoCue?: string;
  sceneImageUrl?: string | null;
  selectedSceneReferenceId?: string | null;
  selectedCharacterReferenceId?: string | null;
}

export interface ProjectFlowStep4StoryboardFrameDto {
  id: string;
  index: number;
  imageUrl: string;
  variants: string[];
  selectedVariantIndex: number;
  loadState: ProjectFlowStoryboardFrameLoadState;
  errorMessage: string;
  requestId: string | null;
}

export type ProjectFlowUiControllerHookId =
  | "useStep2CharacterSelectionController"
  | "useStep3ScriptEditorController"
  | "useStep4StoryboardController";

export interface ProjectFlowUiControllerHookContractEntry {
  hookId: ProjectFlowUiControllerHookId;
  ownerStep: "step2" | "step3" | "step4";
  consumesDtos: readonly string[];
  emitsDtos: readonly string[];
  requiredStateKeys: readonly string[];
  requiredActionKeys: readonly string[];
}

export const PROJECT_FLOW_UI_SHARED_DTO_IDS = [
  "ProjectFlowStep2CharacterViewDto",
  "ProjectFlowStep3SceneReferenceDto",
  "ProjectFlowStep3ScriptSegmentDto",
  "ProjectFlowStep4StoryboardFrameDto",
] as const;

export const PROJECT_FLOW_UI_SHARED_HOOK_CONTRACT: readonly ProjectFlowUiControllerHookContractEntry[] = [
  {
    hookId: "useStep2CharacterSelectionController",
    ownerStep: "step2",
    consumesDtos: ["ProjectFlowStep2CharacterViewDto"],
    emitsDtos: ["ProjectFlowStep2CharacterViewDto"],
    requiredStateKeys: [
      "step2CandidateBoard",
      "step2SelectedCharacterView",
      "step2Step3Gate",
      "step2WorkflowMode",
      "step2Feedback",
    ],
    requiredActionKeys: [
      "selectCandidate",
      "regenerateCandidate",
      "confirmCandidate",
      "openRoleDirectionPanel",
      "syncStep3CharacterReferencePool",
    ],
  },
  {
    hookId: "useStep3ScriptEditorController",
    ownerStep: "step3",
    consumesDtos: [
      "ProjectFlowStep2CharacterViewDto",
      "ProjectFlowStep3SceneReferenceDto",
      "ProjectFlowStep3ScriptSegmentDto",
    ],
    emitsDtos: [
      "ProjectFlowStep3SceneReferenceDto",
      "ProjectFlowStep3ScriptSegmentDto",
    ],
    requiredStateKeys: [
      "step3Segments",
      "step3FullScriptDraft",
      "step3SceneReferences",
      "step3CharacterReferencePool",
      "step3Feedback",
    ],
    requiredActionKeys: [
      "setSegments",
      "saveScript",
      "generateSceneReferences",
      "applySceneReferenceSelection",
      "hydrateImportedStoryboard",
    ],
  },
  {
    hookId: "useStep4StoryboardController",
    ownerStep: "step4",
    consumesDtos: [
      "ProjectFlowStep3ScriptSegmentDto",
      "ProjectFlowStep4StoryboardFrameDto",
    ],
    emitsDtos: ["ProjectFlowStep4StoryboardFrameDto"],
    requiredStateKeys: [
      "step4Segments",
      "step4Frames",
      "step4RenderState",
      "step4BatchRegenerate",
      "step4Feedback",
    ],
    requiredActionKeys: [
      "generateStoryboard",
      "selectFrameVariant",
      "regenerateVideoPrompt",
      "stopBatchRegenerate",
    ],
  },
] as const;

export const PROJECT_FLOW_UI_SHARED_CONTRACT_INVARIANTS = [
  "Shared DTOs are serializable and contain no ReactNode/JSX fields.",
  "Step2->Step3 reference handoff flows only via ProjectFlowStep2CharacterViewDto.",
  "Step3->Step4 handoff flows only via ProjectFlowStep3ScriptSegmentDto and ProjectFlowStep4StoryboardFrameDto.",
  "Controller hooks expose state/actions only; presentational JSX stays in page/components layer.",
  "Contract phase freezes boundaries only and must not change runtime behavior.",
] as const;

function assertObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length < 1) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function assertOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string when provided`);
  }
  return value;
}

function assertNullableString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or null`);
  }
  return value;
}

function assertCharacterViewKey(value: unknown, fieldName: string): ProjectFlowCharacterViewKey | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "front" || value === "left" || value === "right" || value === "back" || value === "closeup") {
    return value;
  }
  throw new Error(`${fieldName} must be front|left|right|back|closeup`);
}

function assertFrameLoadState(value: unknown, fieldName: string): ProjectFlowStoryboardFrameLoadState {
  if (value === "pending" || value === "ready" || value === "error") {
    return value;
  }
  throw new Error(`${fieldName} must be pending|ready|error`);
}

export function normalizeProjectFlowCharacterViews(input: unknown): ProjectFlowStep2CharacterViewDto[] {
  if (!Array.isArray(input)) {
    throw new Error("character views must be an array");
  }
  return input.map((item, index) => {
    const record = assertObject(item, `characterViews[${index}]`);
    const normalized: ProjectFlowStep2CharacterViewDto = {
      id: assertNonEmptyString(record.id, `characterViews[${index}].id`),
      label: assertNonEmptyString(record.label, `characterViews[${index}].label`),
      imageUrl: assertNonEmptyString(record.imageUrl, `characterViews[${index}].imageUrl`),
    };
    const viewKey = assertCharacterViewKey(record.viewKey, `characterViews[${index}].viewKey`);
    if (viewKey) {
      normalized.viewKey = viewKey;
    }
    return normalized;
  });
}

export function normalizeProjectFlowSceneReferences(input: unknown): ProjectFlowStep3SceneReferenceDto[] {
  if (!Array.isArray(input)) {
    throw new Error("scene references must be an array");
  }
  return input.map((item, index) => {
    const record = assertObject(item, `sceneReferences[${index}]`);
    const frameIndex = Number(record.frameIndex);
    if (!Number.isInteger(frameIndex) || frameIndex < 1) {
      throw new Error(`sceneReferences[${index}].frameIndex must be a positive integer`);
    }
    const candidatesRaw = record.candidates;
    if (!Array.isArray(candidatesRaw)) {
      throw new Error(`sceneReferences[${index}].candidates must be an array`);
    }
    const candidates = candidatesRaw.map((candidate, candidateIndex) =>
      assertNonEmptyString(candidate, `sceneReferences[${index}].candidates[${candidateIndex}]`),
    );
    return {
      id: assertNonEmptyString(record.id, `sceneReferences[${index}].id`),
      frameIndex,
      title: assertNonEmptyString(record.title, `sceneReferences[${index}].title`),
      prompt: assertNonEmptyString(record.prompt, `sceneReferences[${index}].prompt`),
      candidates,
      selectedImageUrl: assertNullableString(record.selectedImageUrl, `sceneReferences[${index}].selectedImageUrl`),
    };
  });
}

export function normalizeProjectFlowScriptSegments(input: unknown): ProjectFlowStep3ScriptSegmentDto[] {
  if (!Array.isArray(input)) {
    throw new Error("script segments must be an array");
  }
  return input.map((item, index) => {
    const record = assertObject(item, `scriptSegments[${index}]`);
    return {
      time: assertNonEmptyString(record.time, `scriptSegments[${index}].time`),
      title: assertNonEmptyString(record.title, `scriptSegments[${index}].title`),
      content: assertNonEmptyString(record.content, `scriptSegments[${index}].content`),
      visualCue: assertNonEmptyString(record.visualCue, `scriptSegments[${index}].visualCue`),
      videoCue: assertOptionalString(record.videoCue, `scriptSegments[${index}].videoCue`),
      sceneImageUrl: assertNullableString(record.sceneImageUrl, `scriptSegments[${index}].sceneImageUrl`),
      selectedSceneReferenceId: assertNullableString(
        record.selectedSceneReferenceId,
        `scriptSegments[${index}].selectedSceneReferenceId`,
      ),
      selectedCharacterReferenceId: assertNullableString(
        record.selectedCharacterReferenceId,
        `scriptSegments[${index}].selectedCharacterReferenceId`,
      ),
    };
  });
}

export function normalizeProjectFlowStoryboardFrames(input: unknown): ProjectFlowStep4StoryboardFrameDto[] {
  if (!Array.isArray(input)) {
    throw new Error("storyboard frames must be an array");
  }
  return input.map((item, index) => {
    const record = assertObject(item, `storyboardFrames[${index}]`);
    const frameIndex = Number(record.index);
    if (!Number.isInteger(frameIndex) || frameIndex < 1) {
      throw new Error(`storyboardFrames[${index}].index must be a positive integer`);
    }
    const selectedVariantIndex = Number(record.selectedVariantIndex ?? 0);
    if (!Number.isInteger(selectedVariantIndex) || selectedVariantIndex < 0) {
      throw new Error(`storyboardFrames[${index}].selectedVariantIndex must be a non-negative integer`);
    }
    const variantsRaw = record.variants ?? [];
    if (!Array.isArray(variantsRaw)) {
      throw new Error(`storyboardFrames[${index}].variants must be an array`);
    }
    const variants = variantsRaw.map((variant, variantIndex) =>
      assertNonEmptyString(variant, `storyboardFrames[${index}].variants[${variantIndex}]`),
    );
    return {
      id: assertNonEmptyString(record.id, `storyboardFrames[${index}].id`),
      index: frameIndex,
      imageUrl: assertNonEmptyString(record.imageUrl, `storyboardFrames[${index}].imageUrl`),
      variants,
      selectedVariantIndex,
      loadState: assertFrameLoadState(record.loadState ?? "ready", `storyboardFrames[${index}].loadState`),
      errorMessage: typeof record.errorMessage === "string" ? record.errorMessage : "",
      requestId: assertNullableString(record.requestId, `storyboardFrames[${index}].requestId`),
    };
  });
}

export function assertProjectFlowUiSharedContract(): {
  version: string;
  dtoCount: number;
  hookCount: number;
  hookStateKeyCount: number;
  hookActionKeyCount: number;
  invariantCount: number;
} {
  const hookStateKeyCount = PROJECT_FLOW_UI_SHARED_HOOK_CONTRACT.reduce(
    (total, item) => total + item.requiredStateKeys.length,
    0,
  );
  const hookActionKeyCount = PROJECT_FLOW_UI_SHARED_HOOK_CONTRACT.reduce(
    (total, item) => total + item.requiredActionKeys.length,
    0,
  );
  return {
    version: PROJECT_FLOW_UI_SHARED_CONTRACT_VERSION,
    dtoCount: PROJECT_FLOW_UI_SHARED_DTO_IDS.length,
    hookCount: PROJECT_FLOW_UI_SHARED_HOOK_CONTRACT.length,
    hookStateKeyCount,
    hookActionKeyCount,
    invariantCount: PROJECT_FLOW_UI_SHARED_CONTRACT_INVARIANTS.length,
  };
}
