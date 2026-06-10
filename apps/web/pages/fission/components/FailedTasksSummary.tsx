import React from 'react';

interface FailedTaskItem {
  id: string;
  category: 'image_video' | 'new_story';
  storyboardIndex: number;
  imageStatus: 'failed' | 'processing' | 'pending' | 'completed';
  videoStatus: 'failed' | 'processing' | 'pending' | 'completed';
  imageErrorMessage: string | null;
  videoErrorMessage: string | null;
  retryCount: number;
  maxRetryCount: number;
}

interface FailedTasksSummaryProps {
  failedItems: FailedTaskItem[];
  onRetryItem: (category: 'image_video' | 'new_story', itemIndex: number) => void;
  onRetryAll: () => void;
  retryLoading: boolean;
}

const categoryLabel = (cat: string) => cat === 'image_video' ? '新镜像' : '新故事';

export const FailedTasksSummary: React.FC<FailedTasksSummaryProps> = ({
  failedItems,
  onRetryItem,
  onRetryAll,
  retryLoading,
}) => {
  if (failedItems.length === 0) return null;

  // 可重试的项（未达上限）
  const retryable = failedItems.filter(item => {
    const hasFailed = item.imageStatus === 'failed' || item.videoStatus === 'failed';
    return hasFailed && item.retryCount < item.maxRetryCount;
  });

  return (
    <div className="bg-white rounded-2xl border border-red-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="material-icons-round text-red-500 text-lg">warning</span>
          <h3 className="text-base font-semibold text-gray-900">失败项汇总</h3>
          <span className="text-xs text-red-400 font-medium">({failedItems.length})</span>
        </div>
        {retryable.length > 1 && (
          <button
            onClick={onRetryAll}
            disabled={retryLoading}
            className="px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {retryLoading ? '重试中...' : '重试全部'}
          </button>
        )}
      </div>

      <div className="space-y-2 max-h-52 overflow-y-auto">
        {failedItems.map(item => {
          const imgFailed = item.imageStatus === 'failed';
          const vidFailed = item.videoStatus === 'failed';
          const errorMsg = item.imageErrorMessage || item.videoErrorMessage || '生成失败';
          const canRetry = item.retryCount < item.maxRetryCount && (imgFailed || vidFailed);

          return (
            <div
              key={item.id}
              className="flex items-start justify-between bg-red-50 rounded-xl px-3 py-2.5 border border-red-100"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-gray-700">
                    {categoryLabel(item.category)}
                  </span>
                  <span className="text-xs text-gray-400">
                    分镜 #{item.storyboardIndex + 1}
                  </span>
                  {imgFailed && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">
                      图片失败
                    </span>
                  )}
                  {vidFailed && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">
                      视频失败
                    </span>
                  )}
                </div>
                <p className="text-xs text-red-500 mt-0.5 line-clamp-1">{errorMsg}</p>
                {item.retryCount > 0 && (
                  <span className="text-[10px] text-gray-400">已重试 {item.retryCount}/{item.maxRetryCount}</span>
                )}
              </div>
              {canRetry && (
                <button
                  onClick={() => onRetryItem(item.category, item.storyboardIndex)}
                  disabled={retryLoading}
                  className="ml-2 shrink-0 px-2.5 py-1 bg-red-500 text-white text-[11px] rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  重试
                </button>
              )}
              {!canRetry && (
                <span className="ml-2 shrink-0 text-[10px] text-gray-400">已达上限</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
