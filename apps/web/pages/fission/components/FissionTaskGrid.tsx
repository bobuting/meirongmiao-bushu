import React, { useState } from 'react';
import { FissionTaskCard, type FissionTaskCardData } from './FissionTaskCard';

interface FissionTaskGridProps {
  items: FissionTaskCardData[];
  onRetry: (category: 'image_video' | 'new_story', itemIndex: number) => void;
  onPreview: (type: 'image' | 'video', url: string) => void;
  retryLoading: boolean;
}

export const FissionTaskGrid: React.FC<FissionTaskGridProps> = ({
  items,
  onRetry,
  onPreview,
  retryLoading,
}) => {
  // 折叠状态
  const [collapsed, setCollapsed] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* 标题栏：折叠按钮 */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-3">
          <span className="material-icons-round text-lg text-gray-400 transition-transform duration-200">
            {collapsed ? 'expand_more' : 'expand_less'}
          </span>
          <h3 className="text-base font-semibold text-gray-900">任务卡片:生成不同分镜</h3>
          <span className="text-xs text-gray-500">({items.length} 个分镜)</span>
        </div>
      </div>

      {/* 卡片网格 - 支持折叠动画 */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          collapsed ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-[2000px] opacity-100'
        }`}
      >
        <div className="px-5 pb-5">
          {/* 统一 Grid：所有卡片一排显示，多了往下排 */}
          <div className="grid grid-cols-6 gap-3">
            {items.map(item => (
              <FissionTaskCard
                key={`${item.category}-${item.storyboardIndex}`}
                item={item}
                onRetry={onRetry}
                onPreview={onPreview}
                retryLoading={retryLoading}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
