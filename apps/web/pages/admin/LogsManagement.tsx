/**
 * 日志管理主页面
 * Tab切换：错误日志、LLM调用、操作审计
 */
import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { LogsFilterBar } from './logs/LogsFilterBar';
import { ErrorLogTab } from './logs/ErrorLogTab';
import { CallAuditTab } from './logs/CallAuditTab';
import { AuditLogTab } from './logs/AuditLogTab';
import { LogsExportButton } from './logs/LogsExportButton';

type LogType = 'error' | 'llm' | 'audit';

interface FiltersState {
  startDate: number;
  endDate: number;
  keyword: string;
  page: number;
  pageSize: number;
}

export const LogsManagement: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const logType = (searchParams.get('type') as LogType) || 'error';

  const { token } = useAppStore(useShallow((state) => ({ token: state.token })));
  const safeToken = token ?? '';
  const [filters, setFilters] = useState<FiltersState>({
    startDate: Date.now() - 7 * 24 * 60 * 60 * 1000,
    endDate: Date.now(),
    keyword: '',
    page: 1,
    pageSize: 50,
  });

  const handleTabChange = (type: LogType) => {
    setSearchParams({ type });
    setFilters(prev => ({ ...prev, page: 1 }));
  };

  const handleFilterChange = (newFilters: Partial<FiltersState>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden bg-gray-50">
        {/* 顶部固定区域 */}
        <div className="flex-shrink-0 p-6 pb-0">
          {/* 页面标题 */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-1 px-3 py-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <span className="text-lg">←</span>
                <span>返回首页</span>
              </button>
              <h1 className="text-2xl font-semibold text-gray-900">日志管理</h1>
            </div>
            <LogsExportButton token={token ?? ''} logType={logType} filters={filters} />
          </div>

          {/* Tab 切换 */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => handleTabChange('error')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                logType === 'error'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              错误日志
            </button>
            <button
              onClick={() => handleTabChange('llm')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                logType === 'llm'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              LLM调用
            </button>
            <button
              onClick={() => handleTabChange('audit')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                logType === 'audit'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              操作审计
            </button>
          </div>

          {/* 筛选栏 */}
          <LogsFilterBar filters={filters} onChange={handleFilterChange} />
        </div>

        {/* 可滚动内容区域 */}
        <div className="flex-1 overflow-auto p-6 pt-4">
          {logType === 'error' && (
            <ErrorLogTab
              token={safeToken}
              filters={filters}
              onPageChange={handlePageChange}
            />
          )}
          {logType === 'llm' && (
            <CallAuditTab
              token={safeToken}
              filters={filters}
              onPageChange={handlePageChange}
            />
          )}
          {logType === 'audit' && (
            <AuditLogTab
              token={safeToken}
              filters={filters}
              onPageChange={handlePageChange}
            />
          )}
        </div>
      </div>
    </>
  );
};

export default LogsManagement;