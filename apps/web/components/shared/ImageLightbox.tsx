/**
 * 统一图片预览组件（Lightbox）
 *
 * 功能：
 * - 入场动画：遮罩淡入 + 内容微缩放淡入，避免黑框"弹出"
 * - 缩略图占位：原图加载前先用 OSS 缩略图模糊展示，避免空白等待
 * - 加载指示器：右上角浮动环形 SVG 旋转 + 耗时秒数，不遮挡图片内容
 * - 原图加载完成后平滑淡入替换缩略图，指示器自动消失
 * - 支持单图和多图浏览（frames + onNavigate）
 * - 底部 label 文字条（可选）
 * - ESC 关闭 + 方向键导航 + 背景滚动锁定
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getOssThumbnailUrl } from "../../utils/ossImage";

export interface ImageLightboxProps {
  /** 当前显示的图片 URL（原图） */
  url: string;
  /** 图片 alt 文本 */
  alt?: string;
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 多图浏览：所有图片 URL 列表 */
  frames?: string[];
  /** 多图浏览：当前索引 */
  currentIndex?: number;
  /** 多图浏览：切换回调 */
  onNavigate?: (index: number) => void;
  /** 底部标签文字（如 "镜头 1 主预览"） */
  label?: string;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  url,
  alt = "图片预览",
  open,
  onClose,
  frames,
  currentIndex = 0,
  onNavigate,
  label,
}) => {
  const isGallery = frames && frames.length > 1;
  const canPrev = isGallery && currentIndex > 0;
  const canNext = isGallery && currentIndex < frames!.length - 1;

  const goPrev = useCallback(() => {
    if (canPrev && onNavigate) onNavigate(currentIndex - 1);
  }, [canPrev, currentIndex, onNavigate]);

  const goNext = useCallback(() => {
    if (canNext && onNavigate) onNavigate(currentIndex + 1);
  }, [canNext, currentIndex, onNavigate]);

  // 图片加载状态
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [loadStartTime, setLoadStartTime] = useState<number | null>(null);
  const [loadDuration, setLoadDuration] = useState<number | null>(null);
  const [fullImageReady, setFullImageReady] = useState(false);

  // 切换图片时重置加载状态
  useEffect(() => {
    if (open && url) {
      setIsImageLoading(true);
      setLoadStartTime(Date.now());
      setLoadDuration(null);
      setFullImageReady(false);
    }
  }, [open, url]);

  // ESC 关闭 + 方向键导航 + 背景滚动锁定
  const scrollLockRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    scrollLockRef.current = true;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      if (scrollLockRef.current) {
        document.body.style.overflow = originalOverflow;
        scrollLockRef.current = false;
      }
    };
  }, [open, onClose, goPrev, goNext]);

  // 原图加载完成
  const handleImageLoad = useCallback(() => {
    if (loadStartTime) {
      const duration = Date.now() - loadStartTime;
      setLoadDuration(duration);
    }
    setIsImageLoading(false);
    requestAnimationFrame(() => setFullImageReady(true));
  }, [loadStartTime]);

  // 原图加载失败
  const handleImageError = useCallback(() => {
    setIsImageLoading(false);
    setFullImageReady(true);
  }, []);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      style={{ animation: 'lightbox-backdrop-enter 200ms ease-out both' }}
      onClick={onClose}
    >
      {/* 左箭头 */}
      {canPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <span className="material-icons-round">chevron_left</span>
        </button>
      )}

      {/* 右箭头 */}
      {canNext && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="absolute right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <span className="material-icons-round">chevron_right</span>
        </button>
      )}

      {/* 图片容器 + 关闭按钮 */}
      <div className="relative" style={{ animation: 'lightbox-content-enter 250ms ease-out both' }}>
        {/* 关闭按钮（图片外侧右上角） */}
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute -top-3 -right-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white/80 hover:bg-white/40 hover:text-white transition-colors shadow-lg"
        >
          <span className="material-icons-round text-base">close</span>
        </button>
        <div
          className="relative rounded-lg overflow-hidden"
          style={{ minHeight: '300px', minWidth: '170px' }}
          onClick={(e) => e.stopPropagation()}
        >
        {/* 骨架占位：原图加载完成前显示（竖屏比例） */}
        {!fullImageReady && (
          <div className="flex items-center justify-center rounded-lg bg-white/5 animate-pulse" style={{ width: 'min(50vw, 360px)', aspectRatio: '9/16' }}>
            <div className="flex flex-col items-center gap-3">
              <svg className="w-10 h-10 animate-spin text-white/30" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ strokeDasharray: '20 42.83' }} />
              </svg>
              <span className="text-white/40 text-sm">加载中...</span>
            </div>
          </div>
        )}

        {/* 原图层：加载完成后淡入 */}
        <img
          src={url}
          alt={alt}
          onLoad={handleImageLoad}
          onError={handleImageError}
          className={`rounded-lg transition-opacity duration-300 max-h-[70vh] max-w-[70vw] ${
            fullImageReady ? "opacity-100" : "opacity-0 absolute inset-0"
          }`}
        />

        {/* 加载指示器（右上角浮动，不遮挡图片内容） */}
        {isImageLoading && (
          <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg z-20">
            <svg
              className="w-4 h-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="url(#image-loading-gradient)"
                strokeWidth="3"
                strokeLinecap="round"
                style={{ strokeDasharray: '20 42.83' }}
              />
              <defs>
                <linearGradient id="image-loading-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-white/80 text-xs">
              {loadDuration !== null
                ? `${(loadDuration / 1000).toFixed(1)}s`
                : '加载中'}
            </span>
          </div>
        )}

        {/* 底部 label 文字条 */}
        {label && (
          <div className="border-t border-white/20 bg-black/50 backdrop-blur-sm px-4 py-3 text-sm font-semibold text-white/90 rounded-b-lg">
            {label}
          </div>
        )}

        {/* 多图计数器 */}
        {isGallery && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white z-20">
            {currentIndex + 1} / {frames!.length}
          </div>
        )}
      </div>
      </div>
    </div>,
    document.body
  );
};