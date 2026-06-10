import {
  SQUARE_PUBLISH_CATEGORIES,
  type SquarePublishCategory,
} from "../../../../../src/contracts/square-publish-category";

export interface Step5SquarePublishCategoryOption {
  value: SquarePublishCategory;
  description: string;
}

export const STEP5_SQUARE_PUBLISH_CATEGORY_OPTIONS: readonly Step5SquarePublishCategoryOption[] =
  SQUARE_PUBLISH_CATEGORIES.map((value) => ({
    value,
    description:
      value === "男装"
        ? "发布到创作广场男装分类"
        : value === "女装"
          ? "发布到创作广场女装分类"
          : value === "男童装"
            ? "发布到创作广场男童装分类"
            : "发布到创作广场女童装分类",
  }));

export function buildStep5SquarePublishFeedback(category: SquarePublishCategory | null): string {
  if (!category) {
    return "发布到创作广场前，请先选择分类标签。";
  }
  return `站内发布后会按「${category}」进入创作广场审核与展示链路。`;
}
