/**
 * Step4 预览 Modal（支持变体导航）
 *
 * 在预览单个视频时，支持"上一个/下一个"切换同场景的其他版本。
 * 视频：poster 封面 + 右上角加载指示器 + 耗时显示
 */

import React, { useCallback, useRef, useState, useEffect } from "react";
import { isStep4VideoAsset } from "./step4VideoJobOrchestrator";
import { getOssVideoSnapshotUrl } from "../../../utils/ossImage";

export interface Step4VariantPreviewModalProps {
  modal: {
    sceneIndex: number;
    variantIndex: number;
    url: string;
  };
  variants: Array<{ url: string; isVideo: boolean }>;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelect: () => void;
  hasMultipleVariants: boolean;
}

export const Step4VariantPreviewModal: React.FC<Step4VariantPreviewModalProps> = ({
  modal,
  variants,
  onClose,
  onPrev,
  onNext,
  onSelect: _onSelect,
  hasMultipleVariants,
}) => {
  const isVideo = isStep4VideoAsset(modal.url);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoLoading, setIsVideoLoading] = useState(isVideo);
  const [loadStartTime, setLoadStartTime] = useState<number | null>(isVideo ? Date.now() : null);
  const [loadDuration, setLoadDuration] = useState<number | null>(null);

  // 生成 poster URL
  const posterUrl = modal.url ? getOssVideoSnapshotUrl(modal.url, 0, 800) : undefined;

  // 视频切换时重置加载状态
  useEffect(() => {
    if (isVideo) {
      setIsVideoLoading(true);
      setLoadStartTime(Date.now());
      setLoadDuration(null);
      if (videoRef.current) {
        videoRef.current.src = modal.url;
        videoRef.current.load();
      }
    }
  }, [modal.url, isVideo]);

  const handleLoadedData = useCallback(() => {
    if (loadStartTime) {
      const duration = Date.now() - loadStartTime;
      setLoadDuration(duration);
      console.log(`[Step4VideoPreview] 加载耗时: ${duration}ms`);
    }
    setIsVideoLoading(false);
  }, [loadStartTime]);

  const handleWaiting = useCallback(() => { setIsVideoLoading(true); }, []);
  const handlePlaying = useCallback(() => { setIsVideoLoading(false); }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft" && hasMultipleVariants) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && hasMultipleVariants) {
        e.preventDefault();
        onNext();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [hasMultipleVariants, onPrev, onNext, onClose],
  );

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      onKeyDown={handleKeyDown}
    >
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/20 bg-[#0b1020] shadow-2xl">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
          <div className="flex items-center gap-3 text-sm font-semibold">
            <span>镜头 {modal.sceneIndex + 1} · 版本 {modal.variantIndex + 1}</span>
            {hasMultipleVariants && (
              <span className="text-xs text-gray-400">
                ({modal.variantIndex + 1}/{variants.length})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white"
            >
              <span className="material-icons-round text-base">close</span>
            </button>
          </div>
        </div>

        {/* 媒体区域 + 导航箭头 */}
        <div className="relative aspect-video bg-black">
          {isVideo ? (
            <>
              <video
                ref={videoRef}
                poster={posterUrl}
                preload="auto"
                controls
                autoPlay
                muted
                playsInline
                onLoadedData={handleLoadedData}
                onWaiting={handleWaiting}
                onPlaying={handlePlaying}
                className="h-full w-full object-contain"
              />
              {/* 加载指示器 */}
              {isVideoLoading && (
                <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="url(#step4-loading-gradient)" strokeWidth="3" strokeLinecap="round" style={{ strokeDasharray: '20 42.83' }} />
                    <defs>
                      <linearGradient id="step4-loading-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="text-white/80 text-xs">
                    {loadDuration !== null ? `${(loadDuration / 1000).toFixed(1)}s` : '加载中'}
                  </span>
                </div>
              )}
            </>
          ) : (
            <img src={modal.url} className="h-full w-full object-contain"  loading="lazy" />
          )}

          {/* 左箭头 */}
          {hasMultipleVariants && (
            <button
              onClick={onPrev}
              disabled={modal.variantIndex <= 0}
              className="absolute inset-y-0 left-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="上一个版本"
            >
              <span className="material-icons-round text-2xl">chevron_left</span>
            </button>
          )}

          {/* 右箭头 */}
          {hasMultipleVariants && (
            <button
              onClick={onNext}
              disabled={modal.variantIndex >= variants.length - 1}
              className="absolute inset-y-0 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="下一个版本"
            >
              <span className="material-icons-round text-2xl">chevron_right</span>
            </button>
          )}

          {/* 底部提示 */}
          {hasMultipleVariants && (
            <div className="absolute bottom-3 inset-x-0 text-center text-xs text-white/50">
              ← → 切换版本
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
