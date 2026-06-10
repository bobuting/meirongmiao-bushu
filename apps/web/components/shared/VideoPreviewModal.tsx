/**
 * 视频预览模态框组件
 *
 * 功能：
 * - 环形进度加载动画 + 耗时显示
 * - 自动 poster 封面（使用 OSS 视频快照）
 * - 上一个/下一个视频切换
 * - 键盘快捷键（← → ESC）
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getOssVideoSnapshotUrl } from '../../utils/ossImage';

export interface VideoPreviewItem {
  /** 视频 URL */
  url: string;
  /** 标题 */
  title?: string;
}

export interface VideoPreviewModalProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 视频列表 */
  videos: VideoPreviewItem[];
  /** 当前索引 */
  currentIndex: number;
  /** 索引变化回调 */
  onIndexChange: (index: number) => void;
  /** 关闭回调 */
  onClose: () => void;
}

export const VideoPreviewModal: React.FC<VideoPreviewModalProps> = ({
  isOpen,
  videos,
  currentIndex,
  onIndexChange,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [loadStartTime, setLoadStartTime] = useState<number | null>(null);
  const [loadDuration, setLoadDuration] = useState<number | null>(null);

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `0:${s.toString().padStart(2, '0')}`;
  };

  const currentVideo = videos[currentIndex];
  const hasMultipleVideos = videos.length > 1;

  // 生成 poster URL（使用较小尺寸加速加载）
  const posterUrl = currentVideo?.url
    ? getOssVideoSnapshotUrl(currentVideo.url, 0, 400)
    : undefined;

  // 切换到上一个视频
  const handlePrev = useCallback(() => {
    if (!hasMultipleVideos) return;
    const newIndex = currentIndex > 0 ? currentIndex - 1 : videos.length - 1;
    onIndexChange(newIndex);
  }, [hasMultipleVideos, currentIndex, videos.length, onIndexChange]);

  // 切换到下一个视频
  const handleNext = useCallback(() => {
    if (!hasMultipleVideos) return;
    const newIndex = currentIndex < videos.length - 1 ? currentIndex + 1 : 0;
    onIndexChange(newIndex);
  }, [hasMultipleVideos, currentIndex, videos.length, onIndexChange]);

  // 键盘事件
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrev, handleNext, onClose]);

  // 视频切换时重置加载状态
  useEffect(() => {
    if (isOpen && currentVideo?.url) {
      setIsVideoLoading(true);
      setVideoDuration(null);
      setLoadStartTime(Date.now());
      setLoadDuration(null);
    }
  }, [isOpen, currentVideo?.url]);

  // 视频加载完成
  const handleLoadedData = useCallback(() => {
    if (loadStartTime) {
      const duration = Date.now() - loadStartTime;
      setLoadDuration(duration);
      console.log(`[VideoPreview] 加载耗时: ${duration}ms`);
    }
    setIsVideoLoading(false);
  }, [loadStartTime]);

  // 视频缓冲中
  const handleWaiting = useCallback(() => {
    setIsVideoLoading(true);
  }, []);

  // 视频播放中
  const handlePlaying = useCallback(() => {
    setIsVideoLoading(false);
  }, []);

  // 更新视频 src（不用 key 重建 DOM）
  useEffect(() => {
    if (videoRef.current && currentVideo?.url) {
      videoRef.current.src = currentVideo.url;
      videoRef.current.load();
    }
  }, [currentVideo?.url]);

  if (!isOpen || !currentVideo) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          className="absolute -top-10 right-0 w-10 h-10 flex items-center justify-center text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          onClick={onClose}
        >
          <span className="material-icons-round text-2xl">close</span>
        </button>

        {/* 标题栏 */}
        <div className="text-center text-white/80 text-sm mb-3">
          {currentVideo.title ?? `片段 ${currentIndex + 1}`}
          {hasMultipleVideos && (
            <span className="ml-2 text-white/60">
              ({currentIndex + 1} / {videos.length})
            </span>
          )}
          {videoDuration !== null && (
            <span className="ml-2 text-white/50 text-xs font-mono">{formatDuration(videoDuration)}</span>
          )}
        </div>

        {/* 视频区域 */}
        <div className="flex items-center justify-center gap-4">
          {/* 左箭头 */}
          {hasMultipleVideos && (
            <button
              className="shrink-0 z-20 w-10 h-10 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors"
              onClick={handlePrev}
            >
              <span className="material-icons-round text-2xl">chevron_left</span>
            </button>
          )}

          {/* 视频容器 */}
          <div className="relative bg-black flex items-center justify-center rounded-lg" style={{ maxHeight: '600px' }}>
            {/* 骨架覆盖层 - 封面图模糊占位 */}
            {isVideoLoading && posterUrl && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center rounded"
                style={{
                  backgroundImage: `url(${posterUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(20px)',
                  transform: 'scale(1.1)',
                  aspectRatio: '9/16',
                  height: '70vh',
                  maxHeight: '600px',
                }}
              >
                {/* 加载指示器覆盖层 */}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <span className="material-icons-round text-5xl text-white/60 animate-pulse">play_circle_outline</span>
                    <div className="flex items-center gap-2 px-4 py-2 bg-black/60 rounded-full backdrop-blur-sm">
                      <div className="w-4 h-4 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-spin"></div>
                      <span className="text-white/90 text-sm font-medium">
                        {loadDuration !== null ? `${(loadDuration / 1000).toFixed(1)}s` : '加载中'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* 无封面图时的备用骨架屏 */}
            {isVideoLoading && !posterUrl && (
              <div className="absolute inset-0 bg-gray-900 animate-pulse flex items-center justify-center z-10 rounded">
                <div className="flex flex-col items-center gap-3">
                  <svg
                    className="w-10 h-10 animate-spin text-primary"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      style={{ strokeDasharray: '20 42.83', opacity: 0.3 }}
                    />
                    <path
                      d="M12 2a10 10 0 0 1 10 10"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="text-white/60 text-sm">
                    {loadDuration !== null
                      ? `${(loadDuration / 1000).toFixed(1)}s`
                      : '加载中...'}
                  </span>
                </div>
              </div>
            )}

            <video
              ref={videoRef}
              poster={posterUrl}
              preload="metadata"
              controls
              autoPlay
              playsInline
              onLoadedMetadata={() => {
                const dur = videoRef.current?.duration;
                if (dur && isFinite(dur)) setVideoDuration(dur);
              }}
              onLoadedData={handleLoadedData}
              onWaiting={handleWaiting}
              onPlaying={handlePlaying}
              className="max-h-[600px]"
              style={{ aspectRatio: '9/16' }}
            />
          </div>

          {/* 右箭头 */}
          {hasMultipleVideos && (
            <button
              className="shrink-0 z-20 w-10 h-10 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors"
              onClick={handleNext}
            >
              <span className="material-icons-round text-2xl">chevron_right</span>
            </button>
          )}
        </div>

        {/* 底部提示 */}
        {hasMultipleVideos && (
          <div className="text-center text-white/60 text-xs mt-3">
            使用键盘 ← → 键切换视频，ESC 键关闭
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default VideoPreviewModal;
