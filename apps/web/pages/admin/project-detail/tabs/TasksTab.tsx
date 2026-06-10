/**
 * Tasks Tab - 任务列表
 */

import React from 'react';

interface TasksTabProps {
  detail: any;
}

const formatTimestamp = (ts: number) => {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const TasksTab: React.FC<TasksTabProps> = ({ detail }) => {
  return (
    <div className="space-y-3">
      {detail.tasks.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          <span className="material-icons-round text-4xl">task_alt</span>
          <p className="mt-2">暂无任务记录</p>
        </div>
      ) : (
        detail.tasks.map((task: any) => (
          <div
            key={task.id}
            className="bg-gray-50 rounded-lg p-4 flex items-center justify-between"
          >
            <div>
              <div className="font-medium text-gray-900">{task.job_type || '-'}</div>
              <div className="text-xs text-gray-500 mt-1">
                创建: {formatTimestamp(task.created_at)}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  task.status === 'completed'
                    ? 'bg-green-100 text-green-700'
                    : task.status === 'failed'
                      ? 'bg-red-100 text-red-700'
                      : task.status === 'running'
                        ? 'bg-blue-100 text-blue-700 animate-pulse'
                        : 'bg-gray-100 text-gray-700'
                }`}
              >
                {task.status}
              </span>
              {task.error && (
                <span
                  className="text-xs text-red-500 max-w-[200px] truncate"
                  title={typeof task.error === 'string' ? task.error : JSON.stringify(task.error)}
                >
                  {typeof task.error === 'string' ? task.error : (task.error as any).message || '错误'}
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
};