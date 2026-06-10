type OutfitSource = "visual" | "analysis" | null;
type Step2PreviewOwnerSource = "generated" | "library";

type StepStateLike = {
  step1?: Record<string, unknown>;
  step2?: Record<string, unknown>;
} | null;

export interface Step1PageContentSnapshot {
  step1OutfitModules: unknown[];
  generatedOutfits: unknown[];
  outfitAnalysisCards: unknown[];
  step1RoleDirectionCards: unknown[];
  selectedOutfitId: string | number | null;
  selectedOutfitSource: OutfitSource;
  step1SelectedRoleDirectionId: string | null;
  step1Step2Ready: boolean;
  step1HiddenRoleSettingPrompt: string | null;
  step1AdminDebugPrompt: string | null;
  step1RoleDirectionDrawerOpen: boolean;
}

export interface Step2PageContentSnapshot {
  outfitSummary: string | null;
  selectedCharacterId: string | null;
  confirmedModel: boolean;
  step2V2ConfirmedCandidateId: string | null;
  step2V2GeneratedCandidateUrls: string[];
  step2CharacterViews: unknown[];
  step2StyledViews: unknown[];
  step2PreviewGenerationStarted: boolean;
  selectedPreviewImageUrl: string | null;
}

export interface Step2PreviewContextSnapshot {
  activePanel: string | null;
  focusedViewKey: string | null;
  focusedPreviewId: string | null;
  focusedPresetId: string | null;
  warehouseMode: string | null;
  activePreviewSource: Step2PreviewOwnerSource | null;
  focusedGeneratedCandidateId: string | null;
  focusedLibraryCandidateId: string | null;
}

export interface ProjectPageContentSnapshotEnvelope {
  contractVersion: string;
  updatedAt: number;
  step1: Step1PageContentSnapshot;
  step2: Step2PageContentSnapshot;
  previewContext: Step2PreviewContextSnapshot;
}

export const PROJECT_PAGE_CONTENT_SNAPSHOT_CONTRACT_VERSION = "AT33-S2-25.v1";
const STEP2_GENERATED_SLOT_COUNT = 3;

function toPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toOutfitSource(value: unknown, fallback: OutfitSource = null): OutfitSource {
  if (value === "visual" || value === "analysis") {
    return value;
  }
  return fallback;
}

function toStep2PreviewOwnerSource(
  value: unknown,
  fallback: Step2PreviewOwnerSource | null = null,
): Step2PreviewOwnerSource | null {
  if (value === "generated" || value === "library") {
    return value;
  }
  return fallback;
}

function toJsonArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value;
}

function toBooleanOrFallback(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

function toArrayOrFallback(value: unknown, fallback: unknown[]): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (Array.isArray(fallback)) {
    return [...fallback];
  }
  return [];
}

function inferStep2GeneratedCandidateSlotIndex(url: string): number | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/\/dressedup5in1\/[^/?#]+\/(01|02|03)(?:\/|[?#]|$)/i);
  if (!match || !match[1]) {
    return null;
  }
  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > STEP2_GENERATED_SLOT_COUNT) {
    return null;
  }
  return parsed - 1;
}

export function normalizeStep2GeneratedCandidateSlotUrls(value: unknown, fallback: string[] = []): string[] {
  const normalizedFallback = Array.isArray(fallback)
    ? fallback.map((item) => (typeof item === "string" ? item.trim() : ""))
    : [];
  const source = Array.isArray(value) ? value : null;
  if (!source) {
    return [...normalizedFallback];
  }
  const normalized = Array.from(
    { length: Math.max(STEP2_GENERATED_SLOT_COUNT, source.length, normalizedFallback.length) },
    (_, index) => normalizedFallback[index] ?? "",
  );
  source.forEach((item, index) => {
    const normalizedItem = typeof item === "string" ? item.trim() : "";
    if (!normalizedItem) {
      if (index < normalized.length) {
        normalized[index] = "";
      }
      return;
    }
    const inferredIndex = inferStep2GeneratedCandidateSlotIndex(normalizedItem);
    if (inferredIndex !== null) {
      normalized[inferredIndex] = normalizedItem;
      return;
    }
    if (index >= normalized.length) {
      normalized.push(normalizedItem);
      return;
    }
    normalized[index] = normalizedItem;
  });
  return normalized;
}

function toNullableSelectedOutfitId(
  value: unknown,
  fallback: string | number | null,
): string | number | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : fallback;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value === null) {
    return null;
  }
  return fallback;
}

function pickDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

export function createEmptyProjectPageContentSnapshot(
  updatedAt: number = Date.now(),
): ProjectPageContentSnapshotEnvelope {
  return {
    contractVersion: PROJECT_PAGE_CONTENT_SNAPSHOT_CONTRACT_VERSION,
    updatedAt,
    step1: {
      step1OutfitModules: [],
      generatedOutfits: [],
      outfitAnalysisCards: [],
      step1RoleDirectionCards: [],
      selectedOutfitId: null,
      selectedOutfitSource: null,
      step1SelectedRoleDirectionId: null,
      step1Step2Ready: false,
      step1HiddenRoleSettingPrompt: null,
      step1AdminDebugPrompt: null,
      step1RoleDirectionDrawerOpen: false,
    },
    step2: {
      outfitSummary: null,
      selectedCharacterId: null,
      confirmedModel: false,
      step2V2ConfirmedCandidateId: null,
      step2V2GeneratedCandidateUrls: [],
      step2CharacterViews: [],
      step2StyledViews: [],
      step2PreviewGenerationStarted: false,
      selectedPreviewImageUrl: null,
    },
    previewContext: {
      activePanel: null,
      focusedViewKey: null,
      focusedPreviewId: null,
      focusedPresetId: null,
      warehouseMode: null,
      activePreviewSource: null,
      focusedGeneratedCandidateId: null,
      focusedLibraryCandidateId: null,
    },
  };
}

export function isProjectPageContentSnapshotEnvelope(value: unknown): value is ProjectPageContentSnapshotEnvelope {
  const source = toPlainRecord(value);
  if (!source) {
    return false;
  }
  if (typeof source.contractVersion !== "string" || source.contractVersion.trim().length < 1) {
    return false;
  }
  if (!Number.isFinite(Number(source.updatedAt))) {
    return false;
  }
  const step1 = toPlainRecord(source.step1);
  const step2 = toPlainRecord(source.step2);
  const previewContext = toPlainRecord(source.previewContext);
  if (!step1 || !step2 || !previewContext) {
    return false;
  }
  if (
    !(step1.step1OutfitModules === undefined || Array.isArray(step1.step1OutfitModules)) ||
    !Array.isArray(step1.generatedOutfits) ||
    !Array.isArray(step1.outfitAnalysisCards) ||
    !(step1.step1RoleDirectionCards === undefined || Array.isArray(step1.step1RoleDirectionCards))
  ) {
    return false;
  }
  if (
    !(
      typeof step1.selectedOutfitId === "string" ||
      typeof step1.selectedOutfitId === "number" ||
      step1.selectedOutfitId === null
    )
  ) {
    return false;
  }
  if (!["visual", "analysis", null].includes((step1.selectedOutfitSource as OutfitSource) ?? null)) {
    return false;
  }
  if (
    !(
      step1.step1SelectedRoleDirectionId === undefined ||
      typeof step1.step1SelectedRoleDirectionId === "string" ||
      step1.step1SelectedRoleDirectionId === null
    )
  ) {
    return false;
  }
  if (!(step1.step1Step2Ready === undefined || typeof step1.step1Step2Ready === "boolean")) {
    return false;
  }
  if (
    !(
      step1.step1HiddenRoleSettingPrompt === undefined ||
      typeof step1.step1HiddenRoleSettingPrompt === "string" ||
      step1.step1HiddenRoleSettingPrompt === null
    )
  ) {
    return false;
  }
  if (
    !(
      step1.step1AdminDebugPrompt === undefined ||
      typeof step1.step1AdminDebugPrompt === "string" ||
      step1.step1AdminDebugPrompt === null
    )
  ) {
    return false;
  }
  if (
    !(
      step1.step1RoleDirectionDrawerOpen === undefined ||
      typeof step1.step1RoleDirectionDrawerOpen === "boolean"
    )
  ) {
    return false;
  }
  if (
    !(typeof step2.outfitSummary === "string" || step2.outfitSummary === null) ||
    !(typeof step2.selectedCharacterId === "string" || step2.selectedCharacterId === null) ||
    typeof step2.confirmedModel !== "boolean" ||
    !(
      step2.step2V2ConfirmedCandidateId === undefined ||
      typeof step2.step2V2ConfirmedCandidateId === "string" ||
      step2.step2V2ConfirmedCandidateId === null
    ) ||
    !(step2.step2V2GeneratedCandidateUrls === undefined || Array.isArray(step2.step2V2GeneratedCandidateUrls)) ||
    !Array.isArray(step2.step2CharacterViews) ||
    !Array.isArray(step2.step2StyledViews) ||
    typeof step2.step2PreviewGenerationStarted !== "boolean" ||
    !(typeof step2.selectedPreviewImageUrl === "string" || step2.selectedPreviewImageUrl === null)
  ) {
    return false;
  }
  if (
    !(
      (typeof previewContext.activePanel === "string" || previewContext.activePanel === null) &&
      (typeof previewContext.focusedViewKey === "string" || previewContext.focusedViewKey === null) &&
      (typeof previewContext.focusedPreviewId === "string" || previewContext.focusedPreviewId === null) &&
      (typeof previewContext.focusedPresetId === "string" || previewContext.focusedPresetId === null) &&
      (typeof previewContext.warehouseMode === "string" || previewContext.warehouseMode === null) &&
      (previewContext.activePreviewSource === undefined ||
        previewContext.activePreviewSource === "generated" ||
        previewContext.activePreviewSource === "library" ||
        previewContext.activePreviewSource === null) &&
      (previewContext.focusedGeneratedCandidateId === undefined ||
        typeof previewContext.focusedGeneratedCandidateId === "string" ||
        previewContext.focusedGeneratedCandidateId === null) &&
      (previewContext.focusedLibraryCandidateId === undefined ||
        typeof previewContext.focusedLibraryCandidateId === "string" ||
        previewContext.focusedLibraryCandidateId === null)
    )
  ) {
    return false;
  }
  return true;
}

export function buildProjectPageContentSnapshot(input: {
  projectData: Record<string, unknown> | null;
  workflow?: Record<string, unknown> | null;
  stepState?: StepStateLike;
  previous?: ProjectPageContentSnapshotEnvelope | null;
  updatedAt?: number;
}): ProjectPageContentSnapshotEnvelope {
  const previous = isProjectPageContentSnapshotEnvelope(input.previous)
    ? input.previous
    : createEmptyProjectPageContentSnapshot(0);
  const projectData = toPlainRecord(input.projectData) ?? {};
  const workflow = toPlainRecord(input.workflow) ?? {};
  const stepState = input.stepState ?? null;
  const step1State = toPlainRecord(stepState?.step1) ?? {};
  const step2State = toPlainRecord(stepState?.step2) ?? {};
  const selectedOutfitId = pickDefined(projectData.selectedOutfitId, step1State.selectedOutfitId);
  const selectedOutfitSource = pickDefined(projectData.selectedOutfitSource, step1State.selectedOutfitSource);
  const step1SelectedRoleDirectionId = pickDefined(
    projectData.step1SelectedRoleDirectionId,
    step1State.step1SelectedRoleDirectionId,
  );
  const step1Step2Ready = pickDefined(projectData.step1Step2Ready, step1State.step1Step2Ready);
  const step1HiddenRoleSettingPrompt = pickDefined(
    projectData.step1HiddenRoleSettingPrompt,
    step1State.step1HiddenRoleSettingPrompt,
  );
  const step1AdminDebugPrompt = pickDefined(
    projectData.step1AdminDebugPrompt,
    step1State.step1AdminDebugPrompt,
  );
  const step1RoleDirectionDrawerOpen = pickDefined(
    projectData.step1RoleDirectionDrawerOpen,
    step1State.step1RoleDirectionDrawerOpen,
  );
  const generatedOutfits = pickDefined(projectData.generatedOutfits, step1State.generatedOutfits);
  const outfitAnalysisCards = pickDefined(projectData.outfitAnalysisCards, step1State.outfitAnalysisCards);
  const step1OutfitModules = pickDefined(projectData.step1OutfitModules, step1State.step1OutfitModules);
  const normalizedStep1OutfitModules = toArrayOrFallback(step1OutfitModules, previous.step1.step1OutfitModules);
  const step1RoleDirectionCards = pickDefined(
    projectData.step1RoleDirectionCards,
    step1State.step1RoleDirectionCards,
  );
  const outfitSummary = pickDefined(projectData.outfitSummary, step2State.outfitSummary);
  const selectedCharacterId = pickDefined(projectData.selectedCharacterId, step2State.selectedCharacterId);
  const confirmedModel = pickDefined(projectData.confirmedModel, step2State.confirmedModel);
  const step2V2ConfirmedCandidateId = pickDefined(
    projectData.step2V2ConfirmedCandidateId,
    step2State.step2V2ConfirmedCandidateId,
  );
  const step2V2GeneratedCandidateUrls = pickDefined(
    projectData.step2V2GeneratedCandidateUrls,
    step2State.step2V2GeneratedCandidateUrls,
  );
  const step2CharacterViews = pickDefined(projectData.step2CharacterViews, step2State.step2CharacterViews);
  const step2StyledViews = pickDefined(projectData.step2StyledViews, step2State.step2StyledViews);
  const step2PreviewGenerationStarted = pickDefined(
    projectData.step2PreviewGenerationStarted,
    step2State.step2PreviewGenerationStarted,
  );
  const selectedPreviewImageUrl = pickDefined(projectData.selectedPreviewImageUrl, step2State.selectedPreviewImageUrl);
  const step2V2ActivePreviewSource = pickDefined(
    projectData.step2V2ActivePreviewSource,
    step2State.step2V2ActivePreviewSource,
  );
  const step2V2ActiveGeneratedCandidateId = pickDefined(
    projectData.step2V2ActiveGeneratedCandidateId,
    step2State.step2V2ActiveGeneratedCandidateId,
  );
  const step2V2ActiveLibraryCandidateId = pickDefined(
    projectData.step2V2ActiveLibraryCandidateId,
    step2State.step2V2ActiveLibraryCandidateId,
  );

  return {
    contractVersion: PROJECT_PAGE_CONTENT_SNAPSHOT_CONTRACT_VERSION,
    updatedAt: toFiniteNumber(input.updatedAt, Date.now()),
    step1: {
      step1OutfitModules: normalizedStep1OutfitModules,
      generatedOutfits: toArrayOrFallback(generatedOutfits, previous.step1.generatedOutfits),
      outfitAnalysisCards: toArrayOrFallback(outfitAnalysisCards, previous.step1.outfitAnalysisCards),
      step1RoleDirectionCards: toArrayOrFallback(
        step1RoleDirectionCards,
        previous.step1.step1RoleDirectionCards,
      ),
      selectedOutfitId: toNullableSelectedOutfitId(
        selectedOutfitId,
        previous.step1.selectedOutfitId,
      ),
      selectedOutfitSource: toOutfitSource(selectedOutfitSource, previous.step1.selectedOutfitSource),
      step1SelectedRoleDirectionId:
        toNullableString(step1SelectedRoleDirectionId) ?? previous.step1.step1SelectedRoleDirectionId ?? null,
      step1Step2Ready: toBooleanOrFallback(step1Step2Ready, previous.step1.step1Step2Ready ?? false),
      step1HiddenRoleSettingPrompt:
        toNullableString(step1HiddenRoleSettingPrompt) ?? previous.step1.step1HiddenRoleSettingPrompt ?? null,
      step1AdminDebugPrompt:
        toNullableString(step1AdminDebugPrompt) ?? previous.step1.step1AdminDebugPrompt ?? null,
      step1RoleDirectionDrawerOpen: toBooleanOrFallback(
        step1RoleDirectionDrawerOpen,
        previous.step1.step1RoleDirectionDrawerOpen ?? false,
      ),
    },
    step2: {
      outfitSummary: toNullableString(outfitSummary) ?? previous.step2.outfitSummary,
      selectedCharacterId: toNullableString(selectedCharacterId) ?? previous.step2.selectedCharacterId,
      confirmedModel: toBooleanOrFallback(confirmedModel, previous.step2.confirmedModel),
      step2V2ConfirmedCandidateId:
        toNullableString(step2V2ConfirmedCandidateId) ?? previous.step2.step2V2ConfirmedCandidateId ?? null,
      step2V2GeneratedCandidateUrls: normalizeStep2GeneratedCandidateSlotUrls(
        step2V2GeneratedCandidateUrls,
        previous.step2.step2V2GeneratedCandidateUrls ?? [],
      ),
      step2CharacterViews: toArrayOrFallback(step2CharacterViews, previous.step2.step2CharacterViews),
      step2StyledViews: toArrayOrFallback(step2StyledViews, previous.step2.step2StyledViews),
      step2PreviewGenerationStarted: toBooleanOrFallback(
        step2PreviewGenerationStarted,
        previous.step2.step2PreviewGenerationStarted,
      ),
      selectedPreviewImageUrl: toNullableString(selectedPreviewImageUrl) ?? previous.step2.selectedPreviewImageUrl,
    },
    previewContext: {
      activePanel:
        toNullableString(pickDefined(projectData.step2ActivePanel, step2State.step2ActivePanel)) ??
        previous.previewContext.activePanel,
      focusedViewKey:
        toNullableString(pickDefined(projectData.step2FocusedViewKey, step2State.step2FocusedViewKey)) ??
        previous.previewContext.focusedViewKey,
      focusedPreviewId:
        toNullableString(
          pickDefined(projectData.selectedPreviewId, workflow.selectedPreviewId, step2State.selectedPreviewId),
        ) ?? previous.previewContext.focusedPreviewId,
      focusedPresetId:
        toNullableString(pickDefined(projectData.selectedCharacterId, step2State.selectedCharacterId)) ??
        previous.previewContext.focusedPresetId,
      warehouseMode:
        toNullableString(pickDefined(projectData.step2WarehouseMode, step2State.step2WarehouseMode)) ??
        previous.previewContext.warehouseMode,
      activePreviewSource:
        toStep2PreviewOwnerSource(step2V2ActivePreviewSource) ??
        toStep2PreviewOwnerSource(previous.previewContext.activePreviewSource, null),
      focusedGeneratedCandidateId:
        toNullableString(step2V2ActiveGeneratedCandidateId) ??
        toNullableString(previous.previewContext.focusedGeneratedCandidateId),
      focusedLibraryCandidateId:
        toNullableString(step2V2ActiveLibraryCandidateId) ??
        toNullableString(previous.previewContext.focusedLibraryCandidateId),
    },
  };
}

export function normalizeProjectPageContentSnapshot(input: {
  value: unknown;
  projectData?: Record<string, unknown> | null;
  workflow?: Record<string, unknown> | null;
  stepState?: StepStateLike;
  updatedAt?: number;
}): ProjectPageContentSnapshotEnvelope {
  if (isProjectPageContentSnapshotEnvelope(input.value)) {
    return buildProjectPageContentSnapshot({
      projectData: input.projectData ?? null,
      workflow: input.workflow ?? null,
      stepState: input.stepState ?? null,
      previous: input.value,
      updatedAt: input.updatedAt ?? input.value.updatedAt,
    });
  }
  return buildProjectPageContentSnapshot({
    projectData: input.projectData ?? null,
    workflow: input.workflow ?? null,
    stepState: input.stepState ?? null,
    previous: createEmptyProjectPageContentSnapshot(0),
    updatedAt: input.updatedAt,
  });
}
