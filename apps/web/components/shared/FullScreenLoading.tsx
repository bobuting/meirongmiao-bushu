import React from "react";

interface FullScreenLoadingProps {
  text?: string;
}

/**
 * 全屏 Loading 组件
 * 数据加载期间覆盖整个页面，样式与 ProjectLayout 一致
 */
export const FullScreenLoading: React.FC<FullScreenLoadingProps> = ({
  text = "加载项目中...",
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-primary" />
        <p className="text-sm text-gray-500">{text}</p>
      </div>
    </div>
  );
};