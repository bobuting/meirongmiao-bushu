import React from 'react';
import { getOssThumbnailUrl, getOssVideoSnapshotUrl } from '../../../utils/ossImage';

export interface FissionTaskCardData {
  id: string;
  category: 'image_video' | 'new_story';
  storyboardIndex: number;
  imageStatus: 'pending' | 'processing' | 'completed' | 'failed';
  videoStatus: 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl: string | null;
  videoUrl: string | null;
  imageErrorMessage: string | null;
  videoErrorMessage: string | null;
}

interface FissionTaskCardProps {
  item: FissionTaskCardData;
  onRetry: (category: 'image_video' | 'new_story', itemIndex: number) => void;
  onPreview: (type: 'image' | 'video', url: string) => void;
  retryLoading: boolean;
}

/** 判断视频任务是否已启动/结束（用于锁定图片重试） */
function isVideoStarted(item: FissionTaskCardData): boolean {
  return item.videoStatus === 'processing' || item.videoStatus === 'completed' || item.videoStatus === 'failed';
}

export const FissionTaskCard = React.memo(function FissionTaskCard({
  item,
  onRetry,
  onPreview,
  retryLoading,
}: FissionTaskCardProps) {
  // 整体状态：取图片和视频中更"靠后"的状态
  const getStatus = (): 'pending' | 'processing' | 'completed' | 'failed' | 'partial' => {
    if (item.imageStatus === 'processing' || item.videoStatus === 'processing') return 'processing';
    if (item.imageStatus === 'failed' || item.videoStatus === 'failed') {
      // 如果一个完成一个失败，算 partial
      if (item.imageStatus === 'completed' || item.videoStatus === 'completed') return 'partial';
      return 'failed';
    }
    if (item.imageStatus === 'completed' && item.videoStatus === 'completed') return 'completed';
    return 'pending';
  };

  const status = getStatus();
  const videoLocked = isVideoStarted(item) && item.imageStatus === 'failed';

  const statusConfig = {
    pending: {
      icon: 'schedule',
      label: '等待中',
      borderColor: 'border-slate-200',
      bgColor: 'bg-slate-50/50',
      textColor: 'text-slate-500',
    },
    processing: {
      icon: 'autorenew',
      label: '生成中',
      borderColor: 'border-amber-300',
      bgColor: 'bg-amber-50/50',
      textColor: 'text-amber-600',
    },
    completed: {
      icon: 'check_circle',
      label: '已完成',
      borderColor: 'border-emerald-300',
      bgColor: 'bg-emerald-50/50',
      textColor: 'text-emerald-600',
    },
    partial: {
      icon: 'warning',
      label: '部分完成',
      borderColor: 'border-orange-300',
      bgColor: 'bg-orange-50/50',
      textColor: 'text-orange-600',
    },
    failed: {
      icon: 'error',
      label: '失败',
      borderColor: 'border-red-300',
      bgColor: 'bg-red-50/50',
      textColor: 'text-red-600',
    },
  };

  const config = statusConfig[status];

  // 可重试：图片失败且视频未开始
  const canRetryImage = item.imageStatus === 'failed' && !videoLocked;
  const canRetryVideo = item.videoStatus === 'failed';

  const categoryLabel = item.category === 'image_video' ? '重新演绎' : '新故事';
  const categoryIcon = item.category === 'image_video' ? 'autorenew' : 'auto_stories';

  return (
    <div
      className={`
        relative rounded-2xl border-2 transition-all duration-300
        ${config.borderColor} ${config.bgColor}
        ${status === 'processing' ? 'shadow-lg shadow-amber-200/40' : 'shadow-sm'}
        ${status === 'completed' ? 'shadow-md' : ''}
      `}
      style={{
        animation: 'fission-card-enter 0.3s ease-out both',
      }}
    >
      {/* 类型标签 */}
      <div className="px-3 pt-2 pb-0">
        <div className="text-[10px] text-gray-400 flex items-center gap-1">
          <span className="material-icons-round text-[10px]">{categoryIcon}</span>
          {categoryLabel} · 分镜 {item.storyboardIndex + 1}
        </div>
      </div>

      {/* 内容区 - 左右布局 */}
      <div className="p-3 pt-1.5 flex gap-2">
        {/* 图片阶段 - 左侧 */}
        <div className="flex-1">
          <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1">
            <span className="material-icons-round text-xs text-green-400">image</span>
            图片
          </div>
          {renderStage(
            item.imageStatus,
            item.imageUrl,
            item.imageErrorMessage,
            'image',
            item,
            onPreview,
            onRetry,
            retryLoading,
            videoLocked,
          )}
        </div>

        {/* 视频阶段 - 右侧 */}
        <div className="flex-1">
          <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1">
            <span className="material-icons-round text-xs text-blue-400">videocam</span>
            视频
          </div>
          {renderStage(
            item.videoStatus,
            item.videoUrl,
            item.videoErrorMessage,
            'video',
            item,
            onPreview,
            onRetry,
            retryLoading,
            false,
          )}
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className={`px-3 py-1.5 border-t ${config.borderColor} rounded-b-2xl flex items-center justify-between`}>
        <span className={`text-[11px] font-medium ${config.textColor}`}>
          {status === 'processing' && (
            <span className="material-icons-round text-xs align-middle mr-0.5 animate-spin">autorenew</span>
          )}
          {status === 'completed' && (
            <span className="material-icons-round text-xs align-middle mr-0.5">check_circle</span>
          )}
          {config.label}
        </span>
      </div>
    </div>
  );
});

/** 渲染单个阶段（图片或视频） */
function renderStage(
  status: 'pending' | 'processing' | 'completed' | 'failed',
  url: string | null,
  errorMsg: string | null,
  type: 'image' | 'video',
  item: FissionTaskCardData,
  onPreview: (type: 'image' | 'video', url: string) => void,
  onRetry: (category: 'image_video' | 'new_story', itemIndex: number) => void,
  retryLoading: boolean,
  locked: boolean,
) {
  if (status === 'completed' && url) {
    return (
      <div
        className="aspect-[9/16] rounded-xl overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity relative"
        onClick={() => onPreview(type, url!)}
      >
        {type === 'video' ? (
          <>
            <img src={getOssVideoSnapshotUrl(url, 0, 300)} className="w-full h-full object-cover" alt="视频封面"  loading="lazy" />
            {/* 播放图标 */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                <span className="material-icons-round text-white text-xl">play_arrow</span>
              </div>
            </div>
          </>
        ) : (
          <img src={getOssThumbnailUrl(url, 300)} className="w-full h-full object-cover" alt=""  loading="lazy" />
        )}
      </div>
    );
  }

  if (status === 'processing') {
    return (
      <div className="aspect-[9/16] rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <span className="material-icons-round text-2xl text-amber-400 animate-spin">autorenew</span>
          <p className="text-[10px] text-amber-500 mt-1">生成中</p>
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="aspect-[9/16] rounded-xl bg-gradient-to-br from-red-50 to-rose-50 flex items-center justify-center px-2">
        <div className="text-center">
          <span className="material-icons-round text-2xl text-red-400">error_outline</span>
          {errorMsg && (
            <p className="text-[10px] text-red-400 mt-1 line-clamp-2 leading-tight">{errorMsg}</p>
          )}
          {locked ? (
            <div className="mt-2 px-2 py-0.5 bg-gray-100 rounded-full text-[10px] text-gray-400">
              <span className="material-icons-round text-[10px] align-middle mr-0.5">lock</span>
              视频已开始生成，图片不可重试
            </div>
          ) : (
            <button
              onClick={() => onRetry(item.category, item.storyboardIndex)}
              disabled={retryLoading}
              className="mt-2 px-3 py-0.5 bg-red-500 text-white text-[10px] rounded-full hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              重试
            </button>
          )}
        </div>
      </div>
    );
  }

  // pending — 慢脉冲动画提示任务在队列中等待
  return (
    <div className="aspect-[9/16] rounded-xl bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center animate-[fission-pulse_2s_ease-in-out_infinite]">
      <div className="text-center">
        <span className="material-icons-round text-2xl text-slate-400 animate-[fission-pulse_2s_ease-in-out_infinite]">hourglass_top</span>
        <p className="text-[11px] text-slate-400 mt-1 font-medium">排队等待</p>
      </div>
    </div>
  );
}
