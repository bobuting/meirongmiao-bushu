/**
 * 模糊背景填充图片组件
 * 底层同图模糊+暗化铺满容器，上层 object-contain 完整展示原图
 * 解决 16:9 板图和 9:16 主图混合展示时的裁切问题
 */

import React, { useState, useMemo } from "react";
import { getOssThumbnailUrl } from "../../utils/ossImage";

export interface BlurFillImageProps {
  /** 图片 URL */
  src: string;
  /** 替代文本 */
  alt: string;
  /** 容器额外 class（覆盖 aspect、rounded 等） */
  className?: string;
  /** 默认 aspect-square，可传入 aspect-[3/4] 等 */
  aspectClass?: string;
  /** hover 缩放动画 class */
  hoverClass?: string;
  /** 是否使用缩略图（默认 true） */
  useThumbnail?: boolean;
}

export const BlurFillImage: React.FC<BlurFillImageProps> = ({
  src,
  alt,
  className = "",
  aspectClass = "aspect-square",
  hoverClass = "",
  useThumbnail = true,
}) => {
  const [hasError, setHasError] = useState(!src);

  const thumbnailUrl = useMemo(() => {
    if (!src || !useThumbnail) return src;
    return getOssThumbnailUrl(src);
  }, [src, useThumbnail]);

  if (hasError) {
    return (
      <div
        className={`relative overflow-hidden ${aspectClass} ${className}`}
        style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="material-icons-round text-gray-600 text-4xl">image</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-gray-900 ${aspectClass} ${className}`}>
      {/* 底层：模糊 + 暗化 + 放大（避免白边） */}
      <img
        src={thumbnailUrl}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover scale-125 blur-xl brightness-[0.3]"
        onError={() => setHasError(true)}
      />
      {/* 上层：原图完整展示，带圆角和内缩 */}
      <div className={`relative z-10 flex h-full w-full items-center justify-center p-2 transition-transform duration-500 ${hoverClass}`}>
        <img
          src={thumbnailUrl}
          alt={alt}
          className="max-h-full max-w-full rounded-lg object-contain shadow-lg"
          onError={() => setHasError(true)}
        />
      </div>
    </div>
  );
};
