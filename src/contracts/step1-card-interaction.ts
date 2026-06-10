export type Step1CardKind = "visual" | "analysis";

export interface Step1SelectableCardDomContract {
  readonly cardKind: Step1CardKind;
  readonly planId: string;
  readonly role: "button";
  readonly tabIndex: 0 | -1;
  readonly ariaPressed: boolean;
  readonly dataTestId: string;
}

export const STEP1_CARD_TESTID_PREFIX: Record<Step1CardKind, string> = {
  visual: "step1-visual-card-",
  analysis: "step1-analysis-card-",
};

export const STEP1_CARD_KEYBOARD_SELECT_KEYS = ["Enter", " "] as const;

export const STEP1_CARD_ACCESSIBILITY_INVARIANTS = [
  "Selectable cards must expose role=button.",
  "Selectable cards must expose aria-pressed state.",
  "Disabled cards must use tabIndex=-1; enabled cards must use tabIndex=0.",
  "Visual and analysis cards must each expose stable data-testid with card prefix + planId.",
  "Keyboard selection must support Enter and Space.",
] as const;

export function buildStep1CardTestId(cardKind: Step1CardKind, planId: string): string {
  const normalizedPlanId = planId.trim();
  return `${STEP1_CARD_TESTID_PREFIX[cardKind]}${normalizedPlanId}`;
}

export function isStep1SelectableCardDomContract(value: Step1SelectableCardDomContract): boolean {
  if (!value.planId || value.planId.trim().length === 0) {
    return false;
  }
  if (value.role !== "button") {
    return false;
  }
  if (value.tabIndex !== 0 && value.tabIndex !== -1) {
    return false;
  }
  if (typeof value.ariaPressed !== "boolean") {
    return false;
  }

  const expectedPrefix = STEP1_CARD_TESTID_PREFIX[value.cardKind];
  if (!value.dataTestId.startsWith(expectedPrefix)) {
    return false;
  }

  const expectedTestId = buildStep1CardTestId(value.cardKind, value.planId);
  return value.dataTestId === expectedTestId;
}

export const STEP1_CARD_INTERACTION_CONTRACT_VERSION = "N23-R2-01.v1";
