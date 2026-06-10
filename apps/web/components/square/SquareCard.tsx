// apps/web/components/square/SquareCard.tsx
/**
 * 广场模板卡片组件
 * 仅展示模板内容
 */

import React, { useState } from "react";

// ============================================================================
// 类型定义
// ============================================================================

interface SquareCardProps {
  id: string;
  title: string;
  coverUrl: string;
  videoUrl: string | null;
  category: string;
  author: string | null;
  views: number;
  likes: number;
  createdAt: number;
  onPlay?: () => void;
}

// ============================================================================
// 常量定义
// ============================================================================

/** 占位图路径 */
const FALLBACK_POSTER = "/images/placeholder.png";

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 格式化数量显示（如 10000 -> 1w）
 */
const formatCount = (count: number): string => {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}w`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
};

// ============================================================================
// 组件实现
// ============================================================================

export const SquareCard = React.memo(function SquareCard({
  title,
  coverUrl,
  videoUrl,
  category,
  author,
  views,
  likes,
  onPlay,
}: SquareCardProps) {
  // 图片加载失败状态
  const [coverError, setCoverError] = useState(false);

  // 最终显示的封面：加载失败时使用占位图
  const displayCover = coverError ? FALLBACK_POSTER : (coverUrl || FALLBACK_POSTER);

  // 图片加载失败时触发
  const handleImageError = () => {
    setCoverError(true);
  };

  // 卡片点击处理
  const handleClick = () => {
    if (videoUrl && onPlay) {
      onPlay();
    }
  };

  return (
    <div
      className="group relative break-inside-avoid rounded-2xl overflow-hidden bg-white border border-gray-100 transition-shadow duration-200 hover:shadow-xl cursor-pointer motion-reduce:transition-none"
      onClick={handleClick}
    >
      {/* 封面区域 */}
      <div className="aspect-[3/4] relative bg-gray-100 overflow-hidden">
        <img
          src={displayCover}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
          onError={handleImageError}
        />

        {/* 来源标签 - 左上角（仅模板） */}
        <div className="absolute top-3 left-3">
          <span
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-500/30"
          >
            <span className="material-icons-round text-sm">folder_special</span>
            ✨精选
          </span>
        </div>

        {/* 分类标签 - 右上角 */}
        <div className="absolute top-3 right-3">
          <span className="px-2.5 py-1 rounded-md bg-white/90 backdrop-blur-md text-xs font-medium text-gray-700 border border-gray-200/50 shadow-sm">
            {category}
          </span>
        </div>

        {/* 视频播放按钮 - 仅当有视频时显示，始终半透明提示可点击 */}
        {videoUrl && (
          <div className="absolute inset-0 flex items-center justify-center opacity-30 group-hover:opacity-100 transition-opacity duration-200 bg-black/10 backdrop-blur-[1px] motion-reduce:transition-none">
            <div className="w-12 h-12 rounded-full bg-white/90 backdrop-blur shadow-lg flex items-center justify-center text-primary">
              <span className="material-icons-round text-3xl ml-1">play_arrow</span>
            </div>
          </div>
        )}

        {/* 底部信息区 */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent pt-12">
          {/* 标题行 - 两行截断 */}
          <p className="text-sm text-white font-medium line-clamp-2 mb-2">{title}</p>

        </div>
      </div>
    </div>
  );
});

export default SquareCard;