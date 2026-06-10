/**
 * 异步前置任务状态卡片
 * 显示 Step6 裂变准备的执行状态（新故事生成、专业提示词生成）
 */

import React from 'react';

export interface AsyncPrepStatusData {
  newStoryAsyncStatus: 'pending' | 'processing' | 'completed' | 'failed';
  shotPromptsAsyncStatus: 'pending' | 'processing' | 'completed' | 'failed';
  asyncFailedStage: string | null;
  asyncErrorMessage: string | null;
}

interface AsyncPrepStatusCardProps {
  projectId: string;
  status: AsyncPrepStatusData;
  loading: boolean;
}

/** 状态中文名称映射 */
const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  processing: '执行中',
  completed: '已完成',
  failed: '失败',
};

/** 状态对应的颜色样式 */
const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-500',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

/** 状态对应的图标 */
const STATUS_ICONS: Record<string, string> = {
  pending: 'schedule',
  processing: 'sync',
  completed: 'check_circle',
  failed: 'error',
};

export const AsyncPrepStatusCard: React.FC<AsyncPrepStatusCardProps> = ({
  projectId,
  status,
  loading,
}) => {
  const { newStoryAsyncStatus, shotPromptsAsyncStatus, asyncErrorMessage } = status;

  // 判断整体状态
  const isProcessing = newStoryAsyncStatus === 'processing' || shotPromptsAsyncStatus === 'processing';
  const hasFailed = newStoryAsyncStatus === 'failed' || shotPromptsAsyncStatus === 'failed';
  const isAllComplete = newStoryAsyncStatus === 'completed' && shotPromptsAsyncStatus === 'completed';

  // 保持显示（完成后显示完成状态，不隐藏）
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      {/* 头部标题 */}
      <div className="flex items-center gap-2 mb-4">
        {isProcessing ? (
          <>
            <span className="material-icons-round text-blue-500 animate-spin text-xl">sync</span>
            <span className="text-sm font-bold text-gray-800">前置任务执行中</span>
            <span className="ml-auto text-xs text-gray-400">正在后台准备裂变素材</span>
          </>
        ) : hasFailed ? (
          <>
            <span className="material-icons-round text-red-500 text-xl">warning</span>
            <span className="text-sm font-bold text-gray-800">前置任务失败</span>
            <span className="ml-auto text-xs text-gray-400">请重新发起裂变</span>
          </>
        ) : (
          <>
            <span className="material-icons-round text-blue-500 text-xl">hourglass_top</span>
            <span className="text-sm font-bold text-gray-800">前置任务等待中</span>
          </>
        )}
      </div>

      {/* 错误信息提示 */}
      {asyncErrorMessage && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 flex items-center gap-2">
          <span className="material-icons-round text-red-500 text-base">error_outline</span>
          <span className="text-xs text-red-700">{asyncErrorMessage}</span>
        </div>
      )}

      {/* 任务列表 */}
      <div className="space-y-3">
        {/* 新故事生成状态 */}
        <div className="flex items-center gap-3">
          <span className={`material-icons-round text-sm ${
            newStoryAsyncStatus === 'processing' ? 'animate-spin' : ''
          } ${
            newStoryAsyncStatus === 'completed' ? 'text-green-500' :
            newStoryAsyncStatus === 'failed' ? 'text-red-500' :
            'text-gray-400'
          }`}>
            {STATUS_ICONS[newStoryAsyncStatus] || 'schedule'}
          </span>
          <span className="text-sm text-gray-700 flex-1">新故事生成</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[newStoryAsyncStatus]}`}>
            {STATUS_LABELS[newStoryAsyncStatus]}
          </span>
        </div>

        {/* 专业提示词生成状态 */}
        <div className="flex items-center gap-3">
          <span className={`material-icons-round text-sm ${
            shotPromptsAsyncStatus === 'processing' ? 'animate-spin' : ''
          } ${
            shotPromptsAsyncStatus === 'completed' ? 'text-green-500' :
            shotPromptsAsyncStatus === 'failed' ? 'text-red-500' :
            'text-gray-400'
          }`}>
            {STATUS_ICONS[shotPromptsAsyncStatus] || 'schedule'}
          </span>
          <span className="text-sm text-gray-700 flex-1">专业提示词生成</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[shotPromptsAsyncStatus]}`}>
            {STATUS_LABELS[shotPromptsAsyncStatus]}
          </span>
        </div>
      </div>
    </div>
  );
};
