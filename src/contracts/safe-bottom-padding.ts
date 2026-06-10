export type SafeBottomLayoutVariant = "default_flow" | "step5_priority";

export interface SafeBottomPaddingContract {
  readonly variant: SafeBottomLayoutVariant;
  readonly mobilePaddingRem: number;
  readonly desktopPaddingRem: number;
  readonly fixedBarBottomOffsetRem: number;
  readonly includesSafeAreaInset: true;
}

export const SAFE_BOTTOM_PADDING_CONTRACTS: Record<
  SafeBottomLayoutVariant,
  SafeBottomPaddingContract
> = {
  default_flow: {
    variant: "default_flow",
    mobilePaddingRem: 11,
    desktopPaddingRem: 11,
    fixedBarBottomOffsetRem: 1.5,
    includesSafeAreaInset: true,
  },
  step5_priority: {
    variant: "step5_priority",
    mobilePaddingRem: 14,
    desktopPaddingRem: 12,
    fixedBarBottomOffsetRem: 1.5,
    includesSafeAreaInset: true,
  },
};

export const SAFE_BOTTOM_LAYOUT_INVARIANTS = [
  "Scrollable containers must reserve bottom padding >= fixed bar height + interaction clearance.",
  "Padding values must include env(safe-area-inset-bottom) to avoid iOS home-indicator overlap.",
  "Step5 priority layout must have larger bottom padding than default flow.",
] as const;

const MOBILE_PADDING_PATTERN = /pb-\[calc\((\d+(?:\.\d+)?)rem\+env\(safe-area-inset-bottom\)\)\]/;
const DESKTOP_PADDING_PATTERN = /lg:pb-\[calc\((\d+(?:\.\d+)?)rem\+env\(safe-area-inset-bottom\)\)\]/;

export function buildSafeBottomPaddingClass(variant: SafeBottomLayoutVariant): string {
  const contract = SAFE_BOTTOM_PADDING_CONTRACTS[variant];
  return `pb-[calc(${contract.mobilePaddingRem}rem+env(safe-area-inset-bottom))] lg:pb-[calc(${contract.desktopPaddingRem}rem+env(safe-area-inset-bottom))]`;
}

export function isSafeBottomPaddingClassCompliant(
  className: string,
  variant: SafeBottomLayoutVariant,
): boolean {
  const mobileMatch = className.match(MOBILE_PADDING_PATTERN);
  const desktopMatch = className.match(DESKTOP_PADDING_PATTERN);
  if (!mobileMatch || !desktopMatch) {
    return false;
  }

  const mobilePaddingRem = Number(mobileMatch[1]);
  const desktopPaddingRem = Number(desktopMatch[1]);
  if (!Number.isFinite(mobilePaddingRem) || !Number.isFinite(desktopPaddingRem)) {
    return false;
  }

  const contract = SAFE_BOTTOM_PADDING_CONTRACTS[variant];
  return mobilePaddingRem >= contract.mobilePaddingRem && desktopPaddingRem >= contract.desktopPaddingRem;
}

export const SAFE_BOTTOM_PADDING_CONTRACT_VERSION = "N23-R3-01.v1";
