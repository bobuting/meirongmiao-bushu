export const STEP1_PROGRESSIVE_CARD_CONTRACT_VERSION = "AT30-06.v1";

export const STEP1_CARD_RENDER_STATES = ["pending", "partial", "ready", "failed"] as const;

export type Step1CardRenderState = (typeof STEP1_CARD_RENDER_STATES)[number];

export interface Step1ProgressViewModel {
  renderState: Step1CardRenderState;
  progressPercent: number;
  cardsVisible: boolean;
  pageBlank: boolean;
}

export function resolveStep1ProgressViewModel(input: {
  renderState: Step1CardRenderState;
  progressPercent: number;
  cardCount: number;
}): Step1ProgressViewModel {
  if (!STEP1_CARD_RENDER_STATES.includes(input.renderState)) {
    throw new Error("renderState must be one of pending|partial|ready|failed");
  }
  if (!Number.isFinite(input.progressPercent) || input.progressPercent < 0 || input.progressPercent > 100) {
    throw new Error("progressPercent must be a finite number between 0 and 100");
  }
  if (!Number.isInteger(input.cardCount) || input.cardCount < 0) {
    throw new Error("cardCount must be an integer greater than or equal to 0");
  }

  const cardsVisible = input.cardCount > 0 || input.renderState === "pending" || input.renderState === "partial";
  return {
    renderState: input.renderState,
    progressPercent: input.progressPercent,
    cardsVisible,
    pageBlank: false,
  };
}

export function assertStep1ProgressiveCardContract(): {
  version: string;
  renderStateCount: number;
  forbidsBlankPage: boolean;
} {
  return {
    version: STEP1_PROGRESSIVE_CARD_CONTRACT_VERSION,
    renderStateCount: STEP1_CARD_RENDER_STATES.length,
    forbidsBlankPage: true,
  };
}

