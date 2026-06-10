/**
 * 文件注册中心管理页面
 * 管理员可查看文件统计、管理零引用文件、监控存储使用情况
 */

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useAppStore } from '../../store/useAppStore';
import {
  realFileRegistryApi,
  type FileRegistryRecord,
  type FileBusinessDomain,
  type FileType,
  type FileRegistryFilters,
} from '../../services/realApi/fileRegistry';

/* ===================== 辅助函数 ===================== */

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 格式化时间戳 */
function formatTimestamp(ts: number | null): string {
  if (!ts) return '从未';
  return new Date(ts).toLocaleString('zh-CN');
}

/** 业务域中文映射 */
const DOMAIN_LABELS: Record<FileBusinessDomain, string> = {
  project: '项目流程',
  library: '素材库',
  square: '广场',
  hot_trend: '热榜',
  fission: '裂变',
};

/** 文件类型中文映射 */
const FILE_TYPE_LABELS: Record<FileType, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  document: '文档',
};

/** 存储驱动中文映射 */
const DRIVER_LABELS: Record<string, string> = {
  alioss: '阿里云 OSS',
  local: '本地存储',
};

/* ==================== 主组件 ==================== */

export const FileRegistryManagement: React.FC = () => {
  const queryClient = useQueryClient();
  const token = useAppStore((state) => state.token);
  const currentUser = useAppStore((state) => state.currentUser);
  const { confirm } = useConfirm();

  // 权限检查
  const canAccess = currentUser?.role === 'admin' && Boolean(token);

  // 状态
  const [filters, setFilters] = useState<FileRegistryFilters>({ page: 1, pageSize: 20 });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 查询统计数据
  const statsQuery = useQuery({
    queryKey: ['file-registry-stats', token],
    queryFn: () => realFileRegistryApi.fileRegistryStats(token!),
    enabled: canAccess,
    refetchInterval: 60000, // 每分钟刷新
  });

  // 查询清理状态
  const cleanupStatusQuery = useQuery({
    queryKey: ['file-registry-cleanup-status', token],
    queryFn: () => realFileRegistryApi.fileRegistryCleanupStatus(token!),
    enabled: canAccess,
  });

  // 查询文件列表
  const listQuery = useQuery({
    queryKey: ['file-registry-list', token, filters],
    queryFn: () => realFileRegistryApi.fileRegistryList(token!, filters),
    enabled: canAccess,
  });

  // 查询零引用文件列表
  useQuery({
    queryKey: ['file-registry-zero-ref', token, filters.refCountZero],
    queryFn: () => realFileRegistryApi.fileRegistryZeroRefFiles(token!, 30, undefined, 100),
    enabled: canAccess && filters.refCountZero === true,
  });

  // 删除 mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => realFileRegistryApi.fileRegistryDelete(token!, id),
    onSuccess: (data) => {
      setFeedback({ type: 'success', message: data.message || '文件已删除' });
      queryClient.invalidateQueries({ queryKey: ['file-registry-stats'] });
      queryClient.invalidateQueries({ queryKey: ['file-registry-list'] });
      queryClient.invalidateQueries({ queryKey: ['file-registry-zero-ref'] });
    },
    onError: (error: Error) => {
      setFeedback({ type: 'error', message: error.message });
    },
  });

  // 事件处理
  const handleDelete = useCallback(async (record: FileRegistryRecord) => {
    if (record.refCount > 0) {
      setFeedback({ type: 'error', message: '只能删除零引用文件' });
      return;
    }
    const confirmed = await confirm(
      `确定要删除此文件吗？文件大小：${formatFileSize(record.fileSizeBytes)}，此操作不可撤销。`,
      '删除文件确认'
    );
    if (confirmed) {
      deleteMutation.mutate(record.id);
    }
  }, [confirm, deleteMutation]);

  const handleFilterChange = useCallback((newFilters: Partial<FileRegistryFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: newFilters.page ?? 1 }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  // 渲染统计面板
  const renderStatsPanel = () => {
    const stats = statsQuery.data;
    if (!stats) return null;

    return (
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">存储统计</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">总文件数</div>
            <div className="font-medium text-lg">{stats.totalFiles}</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">总存储量</div>
            <div className="font-medium text-lg">{formatFileSize(stats.totalSizeBytes)}</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">零引用文件</div>
            <div className="font-medium text-lg">{stats.zeroRefFiles}</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">零引用存储量</div>
            <div className="font-medium text-lg">{formatFileSize(stats.zeroRefSizeBytes)}</div>
          </div>
        </div>

        {/* 按文件类型统计 */}
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">按文件类型</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(stats.byFileType).map(([type, data]) => (
              <div key={type} className="p-3 bg-gray-50 rounded text-sm">
                <span className="text-gray-600">{FILE_TYPE_LABELS[type as FileType] || type}：</span>
                <span className="font-medium">{data.count}</span>
                <span className="text-gray-400 ml-1">({formatFileSize(data.sizeBytes)})</span>
              </div>
            ))}
          </div>
        </div>

        {/* 按业务域统计 */}
        <div className="mt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">按业务域</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {Object.entries(stats.byDomain).map(([domain, data]) => (
              <div key={domain} className="p-3 bg-gray-50 rounded text-sm">
                <span className="text-gray-600">{DOMAIN_LABELS[domain as FileBusinessDomain] || domain}：</span>
                <span className="font-medium">{data.count}</span>
                <span className="text-gray-400 ml-1">({formatFileSize(data.sizeBytes)})</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // 渲染清理状态面板
  const renderCleanupPanel = () => {
    const status = cleanupStatusQuery.data;
    if (!status) return null;

    return (
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">清理任务状态</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">状态</div>
            <span className={`px-2 py-1 rounded text-xs ${status.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
              {status.enabled ? '已启用' : '已禁用'}
            </span>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">保留期限</div>
            <div className="font-medium">{status.retentionDays} 天</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">上次清理</div>
            <div className="font-medium">{formatTimestamp(status.lastRunAt)}</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">已清理总数</div>
            <div className="font-medium">{status.totalCleaned}</div>
          </div>
        </div>
        {!status.enabled && (
          <div className="mt-4 p-3 bg-yellow-50 text-yellow-700 rounded text-sm">
            清理任务当前已禁用，零引用文件不会自动清理。可通过环境变量 FILE_CLEANUP_ENABLED=true 启用。
          </div>
        )}
      </div>
    );
  };

  // 渲染筛选区域
  const renderFilterBar = () => (
    <div className="flex flex-wrap gap-4 p-4 bg-white rounded-lg shadow mb-6">
      <select
        className="px-3 py-2 border rounded-md text-sm"
        value={filters.fileType || ''}
        onChange={(e) => handleFilterChange({ fileType: e.target.value as FileType || undefined })}
      >
        <option value="">全部类型</option>
        {Object.entries(FILE_TYPE_LABELS).map(([type, label]) => (
          <option key={type} value={type}>{label}</option>
        ))}
      </select>
      <select
        className="px-3 py-2 border rounded-md text-sm"
        value={filters.businessDomain || ''}
        onChange={(e) => handleFilterChange({ businessDomain: e.target.value as FileBusinessDomain || undefined })}
      >
        <option value="">全部业务域</option>
        {Object.entries(DOMAIN_LABELS).map(([domain, label]) => (
          <option key={domain} value={domain}>{label}</option>
        ))}
      </select>
      <select
        className="px-3 py-2 border rounded-md text-sm"
        value={filters.refCountZero?.toString() || ''}
        onChange={(e) => handleFilterChange({ refCountZero: e.target.value === 'true' ? true : e.target.value === 'false' ? false : undefined })}
      >
        <option value="">全部引用状态</option>
        <option value="true">零引用</option>
        <option value="false">有引用</option>
      </select>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => listQuery.refetch()}
        isLoading={listQuery.isRefetching}
      >
        刷新
      </Button>
    </div>
  );

  // 渲染文件列表
  const renderFileList = () => {
    if (listQuery.isLoading) {
      return <div className="text-center py-10 bg-white rounded-lg shadow">加载中...</div>;
    }

    const data = listQuery.data;
    if (!data) {
      return <div className="text-center py-10 bg-white rounded-lg shadow">暂无数据</div>;
    }

    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">文件名</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">大小</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">业务域</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">存储</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">引用</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">上传者</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">上传时间</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-4 text-center text-gray-500">
                  暂无文件
                </td>
              </tr>
            ) : (
              data.items.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="max-w-[200px] truncate text-sm" title={record.fileName || record.storageKey}>
                      {record.fileName || record.storageKey.split('/').pop()}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700">
                      {FILE_TYPE_LABELS[record.fileType] || record.fileType}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatFileSize(record.fileSizeBytes)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {record.businessDomain ? DOMAIN_LABELS[record.businessDomain] || record.businessDomain : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {DRIVER_LABELS[record.storageDriver] || record.storageDriver}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs ${record.refCount === 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                      {record.refCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {record.uploaderId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatTimestamp(record.createdAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {record.refCount === 0 ? (
                      <button
                        className="text-red-600 hover:text-red-800 disabled:opacity-50 text-sm"
                        onClick={() => handleDelete(record)}
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending && deleteMutation.variables === record.id ? '删除中...' : '删除'}
                      </button>
                    ) : (
                      <span className="text-gray-400 text-sm">有引用</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* 分页 */}
        {data.total > filters.pageSize! && (
          <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
            <div className="text-sm text-gray-600">
              共 {data.total} 条，当前第 {filters.page!} 页
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(filters.page! - 1)}
                disabled={filters.page! <= 1}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(filters.page! + 1)}
                disabled={filters.page! * filters.pageSize! >= data.total}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // 权限检查
  if (!canAccess) {
    return (
      <>
        <div className="flex h-full items-center justify-center bg-[#f8fafc] p-6 md:p-8">
          <div className="mx-auto max-w-3xl border border-red-100 bg-white p-6 text-red-700">
            此页面仅管理员可访问。
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="h-full overflow-auto p-6 md:p-8 bg-[#f8fafc]">
        <div className="max-w-7xl mx-auto">
          {/* 页面标题 */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">文件注册中心</h1>
            <p className="mt-1 text-sm text-gray-500">统一管理所有上传文件的元数据、去重和引用追踪</p>
          </div>

          {/* 反馈消息 */}
          {feedback && (
            <div className={`mb-4 p-4 rounded-lg ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {feedback.message}
              <button className="ml-4 underline" onClick={() => setFeedback(null)}>关闭</button>
            </div>
          )}

          {/* 统计面板 */}
          {renderStatsPanel()}

          {/* 清理状态面板 */}
          {renderCleanupPanel()}

          {/* 筛选区域 */}
          {renderFilterBar()}

          {/* 文件列表 */}
          {renderFileList()}
        </div>
      </div>
    </>
  );
};

export default FileRegistryManagement;