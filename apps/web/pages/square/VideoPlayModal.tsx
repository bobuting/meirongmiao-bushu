import React, { useEffect, useRef } from 'react';

/**
 * 视频播放弹窗属性
 */
interface VideoPlayModalProps {
  isOpen: boolean;
  videoUrl: string;
  title: string;
  author?: string;
  views?: number | string;
  likes?: number | string;
  onClose: () => void;
}

/**
 * 格式化数字显示（如 1200 -> 1.2k）
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

/**
 * 视频播放弹窗组件
 * 参考管理后台预览尺寸，提供更大的视频预览体验
 */
export const VideoPlayModal: React.FC<VideoPlayModalProps> = ({
  isOpen,
  videoUrl,
  title,
  author,
  views,
  likes,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // 弹窗打开时自动播放，关闭时暂停
  useEffect(() => {
    if (isOpen && videoRef.current) {
      videoRef.current.play().catch(() => {
        // 自动播放可能被浏览器阻止，忽略错误
      });
    } else if (!isOpen && videoRef.current) {
      videoRef.current.pause();
    }
  }, [isOpen]);

  // 按 ESC 键关闭弹窗
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4"
      onClick={onClose}
    >
      {/* 视频预览容器 - 参考管理后台预览尺寸 */}
      <div
        className="relative max-w-4xl max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-colors"
        >
          <span className="material-icons-round text-xl">close</span>
        </button>

        {/* 视频播放区域 */}
        <div className="bg-black">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
            className="max-w-full max-h-[80vh] rounded-lg"
          />
        </div>

        {/* 底部信息区 */}
        <div className="p-4 bg-gray-900 rounded-b-2xl">
          <h3 className="text-white font-medium text-base line-clamp-2 mb-2 font-display">
            {title}
          </h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gray-200 border border-white/30"></div>
              <span className="text-sm text-white/90 font-medium">{author || '未知作者'}</span>
            </div>
            {(views !== undefined || likes !== undefined) && (
              <div className="flex items-center gap-3 text-sm text-white/80 font-medium">
                {views !== undefined && (
                  <span className="flex items-center gap-1">
                    <span className="material-icons-round text-base">visibility</span>
                    {typeof views === 'number' ? formatCount(views) : views}
                  </span>
                )}
                {likes !== undefined && (
                  <span className="flex items-center gap-1">
                    <span className="material-icons-round text-base text-red-400">favorite</span>
                    {typeof likes === 'number' ? formatCount(likes) : likes}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayModal;