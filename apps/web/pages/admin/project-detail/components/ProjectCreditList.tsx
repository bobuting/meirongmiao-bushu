/**
 * 项目积分消耗列表组件
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../../../store/useAppStore';
import { backendApi } from '../../../../services/backendApi';

interface ProjectCreditListProps {
  projectId: string;
}

export const ProjectCreditList: React.FC<ProjectCreditListProps> = ({ projectId }) => {
  const { token } = useAppStore(useShallow((state) => ({ token: state.token })));
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'project-credits', projectId],
    queryFn: () => backendApi.adminCreditAudits(token!, 50, 0, { projectId }),
    enabled: !!token,
  });

  const items = data?.items ?? [];

  if (isLoading) return <div className="text-center text-sm text-gray-400 py-4">加载中...</div>;
  if (items.length === 0) return <div className="text-center text-sm text-gray-400 py-4">暂无积分记录</div>;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">时间</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">活动</th>
            <th className="px-4 py-2.5 text-left font-medium text-gray-600">用户</th>
            <th className="px-4 py-2.5 text-right font-medium text-gray-600">积分</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
              <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                {new Date(item.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="px-4 py-2.5 text-gray-800">{item.activity || item.label}</td>
              <td className="px-4 py-2.5 text-gray-600">{item.userEmail || item.actorEmail || '-'}</td>
              <td className="px-4 py-2.5 text-right font-mono font-medium text-amber-600">
                {item.label === '管理员调账' ? (item.delta > 0 ? `+${item.delta}` : item.delta) : `-${item.chargeAmount}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};