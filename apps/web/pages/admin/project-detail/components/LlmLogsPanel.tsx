/**
 * LLM 日志面板组件
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { backendApi } from '../../../../services/backendApi';
import { LogDetailModal } from '../../logs/LogDetailModal';

interface LlmLogsPanelProps {
  token: string;
  projectId: string;
  selectedLogId: string | null;
  page: number;
  onLogSelect: (id: string | null) => void;
  onPageChange: (page: number) => void;
}

export const LlmLogsPanel: React.FC<LlmLogsPanelProps> = ({
  token,
  projectId,
  selectedLogId,
  page,
  onLogSelect,
  onPageChange,
}) => {
  const pageSize = 15;

  const { data: auditsData, isLoading } = useQuery({
    queryKey: ['callAudits', { projectId, page, pageSize }],
    queryFn: () => backendApi.callAuditsList(token, { projectId, page, pageSize }),
  });

  const { data: stats } = useQuery({
    queryKey: ['callAuditsStats', projectId],
    queryFn: () => backendApi.callAuditsStats(token, undefined, undefined, projectId),
  });

  const items = (auditsData as any)?.items ?? [];
  const total = (auditsData as any)?.total ?? 0;

  const formatDate = (ts: number) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const statusBadge = (status: string) => {
    if (status === 'success') return <span className="text-green-600 font-medium">成功</span>;
    if (status === 'error' || status === 'timeout') return <span className="text-red-600 font-medium">失败</span>;
    return <span className="text-gray-500">{status}</span>;
  };

  if (isLoading) return <div className="p-8 text-center text-gray-500">加载中...</div>;

  return (
    <div className="space-y-3">
      {/* 统计卡片 */}
      <div className="flex gap-4 text-sm">
        <div className="bg-blue-50 rounded-lg px-4 py-2">
          <span className="text-gray-500">总调用：</span>
          <span className="font-bold text-gray-800">{stats?.total ?? 0}</span>
        </div>
        <div className="bg-green-50 rounded-lg px-4 py-2">
          <span className="text-gray-500">成功率：</span>
          <span className="font-bold text-gray-800">{stats ? `${(stats.successRate * 100).toFixed(1)}%` : '-'}</span>
        </div>
        <div className="bg-purple-50 rounded-lg px-4 py-2">
          <span className="text-gray-500">平均延迟：</span>
          <span className="font-bold text-gray-800">{stats ? `${(stats.avgLatency / 1000).toFixed(1)}s` : '-'}</span>
        </div>
        <div className="bg-amber-50 rounded-lg px-4 py-2">
          <span className="text-gray-500">总费用：</span>
          <span className="font-bold text-gray-800">${stats?.totalCost?.toFixed(4) ?? '0'}</span>
        </div>
      </div>

      {/* 日志表格 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left font-medium text-gray-500 w-[130px]">时间</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 w-[100px]">模型</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 w-[100px]">功能</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 w-[120px]">调用来源</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 w-[50px]">状态</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 w-[60px]">延迟</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 w-[50px]">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => (
              <tr key={item.id} className="border-t border-gray-100 hover:bg-blue-50/30">
                <td className="px-3 py-2 text-gray-600">{formatDate(item.createdAt)}</td>
                <td className="px-3 py-2 text-gray-800 truncate max-w-[100px]" title={item.actualModel || item.providerId}>
                  {item.actualModel || item.providerId}
                </td>
                <td className="px-3 py-2 text-gray-500 truncate max-w-[100px]" title={item.routeKey}>
                  {item.routeKey || '-'}
                </td>
                <td className="px-3 py-2 text-gray-500 truncate max-w-[120px]" title={item.callContext || ''}>
                  {item.callContext?.split(' -> ')[0] || '-'}
                </td>
                <td className="px-3 py-2">{statusBadge(item.status)}</td>
                <td className="px-3 py-2 text-gray-500">{(item.latencyMs / 1000).toFixed(1)}s</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => onLogSelect(item.id)}
                    className="text-indigo-600 hover:text-indigo-800 hover:underline"
                  >
                    详情
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-gray-400">暂无该项目的 LLM 调用记录</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 分页 */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs">
          <span className="text-gray-500">共 {total} 条</span>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <span className="px-3 py-1 text-gray-600">第 {page} 页</span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={items.length < pageSize}
              className="px-3 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {/* 详情弹窗 */}
      {selectedLogId && (
        <LogDetailModal
          token={token}
          logId={selectedLogId}
          logType="llm"
          onClose={() => onLogSelect(null)}
        />
      )}
    </div>
  );
};