// apps/web/components/shared/LoadMoreButton.tsx
/**
 * "加载更多"按钮组件
 * 用于分页列表的增量加载
 */

import React from "react";
import { Button } from "../ui/Button";

export interface LoadMoreButtonProps {
  /** 是否正在加载 */
  isLoading?: boolean;
  /** 是否还有更多数据 */
  hasMore?: boolean;
  /** 当前已显示条数 */
  currentCount?: number;
  /** 总条数 */
  totalCount?: number;
  /** 点击加载更多 */
  onClick?: () => void;
  /** 加载文本（默认"加载更多"） */
  loadText?: string;
  /** 没有更多数据时的提示文本（默认"已加载全部数据"） */
  noMoreText?: string;
  /** 显示进度信息（默认 true） */
  showProgress?: boolean;
  /** 进度文本格式化函数 */
  progressFormatter?: (current: number, total: number) => string;
}

/**
 * "加载更多"按钮组件
 *
 * @example
 * <LoadMoreButton
 *   isLoading={isLoadingMore}
 *   hasMore={hasMore}
 *   currentCount={items.length}
 *   totalCount={total}
 *   onClick={loadNextPage}
 * />
 */
export const LoadMoreButton: React.FC<LoadMoreButtonProps> = ({
  isLoading = false,
  hasMore = false,
  currentCount = 0,
  totalCount = 0,
  onClick,
  loadText = "加载更多",
  noMoreText = "已加载全部数据",
  showProgress = true,
  progressFormatter = (current, total) => `已显示 ${current}/${total} 条`,
}) => {
  // 没有数据时不显示
  if (totalCount === 0) {
    return null;
  }

  // 进度信息
  const progressText = showProgress && totalCount > 0 ? progressFormatter(currentCount, totalCount) : null;

  // 没有更多数据
  if (!hasMore) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        {progressText && (
          <div className="text-xs text-gray-500 font-medium">{progressText}</div>
        )}
        <div className="text-xs text-gray-400">{noMoreText}</div>
      </div>
    );
  }

  // 有更多数据，显示按钮
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      {progressText && (
        <div className="text-xs text-gray-500 font-medium">{progressText}</div>
      )}
      <Button
        variant="outline"
        onClick={onClick}
        disabled={isLoading}
        className="w-full max-w-xs"
      >
        {isLoading ? (
          <>
            <span className="material-icons-round text-sm animate-spin mr-1.5">refresh</span>
            加载中...
          </>
        ) : (
          <>
            <span className="material-icons-round text-sm mr-1.5">arrow_downward</span>
            {loadText}
          </>
        )}
      </Button>
    </div>
  );
};