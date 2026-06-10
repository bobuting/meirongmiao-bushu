import React from 'react';
import type { TaskProgress } from '../../fission/useFissionVideo';

interface FissionProgressOverviewProps {
  imageVideo: TaskProgress;
  newStory: TaskProgress;
  canMerge: boolean;
  allDone: boolean;
  onStartMerge: () => void;
  mergeLoading: boolean;
}

export const FissionProgressOverview: React.FC<FissionProgressOverviewProps> = ({
  imageVideo,
  newStory,
  canMerge,
  allDone,
  onStartMerge,
  mergeLoading,
}) => {
  const total = imageVideo.total + newStory.total;
  const completed = imageVideo.completed + newStory.completed;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-3">裂变进度</h3>

      {/* 总进度条 */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-500 mb-1.5">
          <span>总进度</span>
          <span className="font-medium text-gray-700">{completed}/{total} ({percent}%)</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${percent}%`,
              background: 'linear-gradient(90deg, #e68c19 0%, #f5a623 100%)',
            }}
          />
        </div>
      </div>

      {/* 分类进度卡片 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <CategoryProgressCard
          label="新镜像"
          icon="flip"
          progress={imageVideo}
          accentColor="orange"
        />
        <CategoryProgressCard
          label="新故事"
          icon="auto_awesome"
          progress={newStory}
          accentColor="blue"
        />
      </div>

      {/* 合并按钮 */}
      {canMerge && (
        <button
          onClick={onStartMerge}
          disabled={mergeLoading}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'linear-gradient(135deg, #e68c19 0%, #f5a623 100%)',
            boxShadow: '0 4px 12px rgba(230, 140, 25, 0.3)',
          }}
        >
          {mergeLoading ? (
            <span className="flex items-center justify-center gap-1">
              <span className="material-icons-round text-sm animate-spin">autorenew</span>
              合并中...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1">
              <span className="material-icons-round text-sm">merge_type</span>
              开始合并
            </span>
          )}
        </button>
      )}

      {allDone && !canMerge && (
        <div className="text-center py-2 text-sm text-amber-600 bg-amber-50 rounded-lg">
          <span className="material-icons-round text-sm align-middle mr-1">info</span>
          部分任务未完成，请重试后再合并
        </div>
      )}
    </div>
  );
};

interface CategoryProgressCardProps {
  label: string;
  icon: string;
  progress: TaskProgress;
  accentColor: 'orange' | 'blue';
}

function CategoryProgressCard({ label, icon, progress, accentColor }: CategoryProgressCardProps) {
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const isComplete = progress.completed === progress.total && progress.total > 0;

  const accentClasses = {
    orange: {
      bg: 'bg-orange-50',
      border: 'border-orange-100',
      text: 'text-orange-600',
      bar: 'bg-orange-400',
    },
    blue: {
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      text: 'text-blue-600',
      bar: 'bg-blue-400',
    },
  };

  const c = accentClasses[accentColor];

  return (
    <div className={`${c.bg} ${c.border} border rounded-xl p-3`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`material-icons-round text-sm ${c.text}`}>{icon}</span>
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {isComplete && (
          <span className="material-icons-round text-xs text-emerald-500 ml-auto">check_circle</span>
        )}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className={`text-lg font-bold ${c.text}`}>{progress.completed}</div>
          <div className="text-[10px] text-gray-400">/ {progress.total}</div>
        </div>
        {progress.failed > 0 && (
          <div className="text-[10px] text-red-500 font-medium">
            {progress.failed} 失败
          </div>
        )}
        {progress.processing > 0 && (
          <div className="text-[10px] text-amber-500 font-medium">
            {progress.processing} 进行中
          </div>
        )}
      </div>
      <div className="mt-2 h-1.5 bg-white/60 rounded-full overflow-hidden">
        <div
          className={`h-full ${c.bar} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
