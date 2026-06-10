export const STEP2_FIVE_VIEW_CANDIDATE_BOARD_CONTRACT_VERSION = "AT30-07.v1";

export const STEP2_CANDIDATE_SOURCES = ["generated", "library"] as const;
export type Step2CandidateSource = (typeof STEP2_CANDIDATE_SOURCES)[number];

export const STEP2_FIVE_VIEW_GENERATION_STATUSES = ["pending", "ready", "failed"] as const;
export type Step2FiveViewGenerationStatus = (typeof STEP2_FIVE_VIEW_GENERATION_STATUSES)[number];

export interface FiveViewCropMeta {
  cropMode: "left_closeup";
  previewField: "closeupPreviewUrl";
  panelField: "fiveViewAssetUrl";
}

export interface Step2FiveViewCandidateCard {
  /** 角色库角色 ID，仅 library 类型需要，generated 类型用 displayOrder 标识 */
  candidateId?: string | null;
  sourceType: Step2CandidateSource;
  rowIndex: 1 | 2;
  displayOrder: number;
  title: string;
  closeupPreviewUrl: string | null;
  fiveViewAssetUrl: string | null;
  generationStatus: Step2FiveViewGenerationStatus;
  progressPercent: number;
  /** 角色生成槽位，generationSlot=5 表示手动从角色库选入的角色 */
  generationSlot?: number | null;
  /** 是否已选中为项目主角色 */
  isSelected?: boolean;
}

export interface Step2FiveViewCandidateBoard {
  cards: Step2FiveViewCandidateCard[];
  cropMeta: FiveViewCropMeta;
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value;
}

function assertNullableUrl(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or null`);
  }
  return value;
}

function normalizeCard(raw: unknown, index: number): Step2FiveViewCandidateCard {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`cards[${index}] must be an object`);
  }
  const card = raw as Record<string, unknown>;

  const title = assertNonEmptyString(card.title, `cards[${index}].title`);

  const sourceType = card.sourceType;
  if (!STEP2_CANDIDATE_SOURCES.includes(sourceType as Step2CandidateSource)) {
    throw new Error(`cards[${index}].sourceType must be generated or library`);
  }

  const rowIndex = Number(card.rowIndex);
  if (rowIndex !== 1 && rowIndex !== 2) {
    throw new Error(`cards[${index}].rowIndex must be 1 or 2`);
  }

  const displayOrder = Number(card.displayOrder);
  if (!Number.isInteger(displayOrder) || displayOrder < 1) {
    throw new Error(`cards[${index}].displayOrder must be a positive integer`);
  }

  const generationStatus = card.generationStatus;
  if (!STEP2_FIVE_VIEW_GENERATION_STATUSES.includes(generationStatus as Step2FiveViewGenerationStatus)) {
    throw new Error(`cards[${index}].generationStatus must be pending|ready|failed`);
  }

  const progressPercent = Number(card.progressPercent);
  if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) {
    throw new Error(`cards[${index}].progressPercent must be a finite number between 0 and 100`);
  }

  // candidateId 可选，仅 library 类型需要
  const candidateId = typeof card.candidateId === "string" && card.candidateId.trim().length > 0
    ? card.candidateId.trim()
    : undefined;

  return {
    candidateId,
    sourceType: sourceType as Step2CandidateSource,
    rowIndex: rowIndex as 1 | 2,
    displayOrder,
    title,
    closeupPreviewUrl: assertNullableUrl(card.closeupPreviewUrl, `cards[${index}].closeupPreviewUrl`),
    fiveViewAssetUrl: assertNullableUrl(card.fiveViewAssetUrl, `cards[${index}].fiveViewAssetUrl`),
    generationStatus: generationStatus as Step2FiveViewGenerationStatus,
    progressPercent,
  };
}

export function normalizeStep2FiveViewCandidateBoard(input: unknown): Step2FiveViewCandidateBoard {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("step2 five-view candidate board must be an object");
  }
  const record = input as Record<string, unknown>;
  if (!Array.isArray(record.cards)) {
    throw new Error("cards must be an array");
  }

  const cards = record.cards.map((item, index) => normalizeCard(item, index));
  if (cards.length !== 7) {
    throw new Error("cards must contain exactly 7 candidates");
  }

  const row1 = cards.filter((card) => card.rowIndex === 1);
  const row2 = cards.filter((card) => card.rowIndex === 2);
  if (row1.length !== 3) {
    throw new Error("row 1 must contain exactly 3 generated candidates");
  }
  if (row2.length !== 4) {
    throw new Error("row 2 must contain exactly 4 library candidates");
  }

  if (row1.some((card) => card.sourceType !== "generated")) {
    throw new Error("row 1 candidates must all be generated");
  }
  if (row2.some((card) => card.sourceType !== "library")) {
    throw new Error("row 2 candidates must all be library");
  }

  const row1Orders = row1.map((card) => card.displayOrder).sort((a, b) => a - b);
  const row2Orders = row2.map((card) => card.displayOrder).sort((a, b) => a - b);
  if (row1Orders.join(",") !== "1,2,3") {
    throw new Error("row 1 displayOrder must be 1,2,3");
  }
  if (row2Orders.join(",") !== "1,2,3,4") {
    throw new Error("row 2 displayOrder must be 1,2,3,4");
  }

  return {
    cards,
    cropMeta: {
      cropMode: "left_closeup",
      previewField: "closeupPreviewUrl",
      panelField: "fiveViewAssetUrl",
    },
  };
}

export function assertStep2FiveViewCandidateBoardContract(): {
  version: string;
  totalCandidates: number;
  row1GeneratedCount: number;
  row2LibraryCount: number;
  closeupOnlyCardFace: boolean;
} {
  return {
    version: STEP2_FIVE_VIEW_CANDIDATE_BOARD_CONTRACT_VERSION,
    totalCandidates: 7,
    row1GeneratedCount: 3,
    row2LibraryCount: 4,
    closeupOnlyCardFace: true,
  };
}
