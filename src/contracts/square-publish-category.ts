export const SQUARE_PUBLISH_CATEGORIES = ["男装", "女装", "男童装", "女童装"] as const;

export type SquarePublishCategory = (typeof SQUARE_PUBLISH_CATEGORIES)[number];

export const SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS = [
  "全部",
  "精选",
  "热榜",
  ...SQUARE_PUBLISH_CATEGORIES,
] as const;

export type SquareCategoryFilterOption = (typeof SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS)[number];

export function isSquarePublishCategory(value: unknown): value is SquarePublishCategory {
  return SQUARE_PUBLISH_CATEGORIES.includes(value as SquarePublishCategory);
}

export function normalizeSquarePublishCategory(value: unknown): SquarePublishCategory | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return isSquarePublishCategory(trimmed) ? trimmed : null;
}
