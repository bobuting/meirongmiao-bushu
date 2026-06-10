/**
 * 伪删除数据管理页面
 * 管理员可查看、恢复伪删除数据，以及管理清理任务
 */

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useAppStore } from '../../store/useAppStore';
import { request } from '../../services/backendApi.request';

/* ===================== 类型定义 ===================== */

/** 清理任务状态 */
interface CleanupStatus {
  lastRunAt: number | null;
  nextRunAt: number;
  retentionDays: number;
  enabled: boolean;
}

/** 清理结果 */
interface CleanupResult {
  tables: Record<string, number>;
  totalDeleted: number;
  lastRunAt: number;
}

/** 已删除记录 */
interface DeletedRecord {
  id: string;
  deletedAt: number | null;
  deletedBy: string | null;
}

/** 表统计信息 */
interface TableStats {
  count: number;
}

/** 列表响应（无指定表） */
interface ListAllResponse {
  tables: Record<string, TableStats>;
}

/** 列表响应（指定表） */
interface ListTableResponse {
  table: string;
  count: number;
  records: DeletedRecord[];
}

/** 支持清理的软删除表名 */
const SOFT_DELETE_TABLES = [
  'projects',
  'assets',
  'outfit_plans',
  'storyboard_frames',
  'library_characters',
  'library_scripts',
  'users',
  'credits',
  'providers',
  'provider_secrets',
  'provider_policies',
  'video_musics',
];

/** 表名中文映射 */
const TABLE_LABELS: Record<string, string> = {
  projects: '项目',
  assets: '素材',
  outfit_plans: '穿搭方案',
  storyboard_frames: '分镜帧',
  library_characters: '角色库',
  library_scripts: '脚本库',
  users: '用户',
  credits: '积分',
  providers: '服务提供商',
  provider_secrets: '服务密钥',
  provider_policies: '服务策略',
  video_musics: '视频音乐',
};

/** 列表响应（联合类型） */
type ListResponse = ListAllResponse | ListTableResponse;

/** 类型守卫：检查是否为 ListAllResponse */
function isListAllResponse(data: ListResponse): data is ListAllResponse {
  return 'tables' in data;
}

/* ===================== API 服务 ===================== */

/** 获取清理状态 */
function fetchCleanupStatus(token: string): Promise<CleanupStatus> {
  return request<CleanupStatus>('GET', '/admin/deleted-data/cleanup/status', { token });
}

/** 启用/禁用清理调度 */
function toggleCleanup(token: string, enabled: boolean): Promise<{ ok: boolean; enabled: boolean; status: CleanupStatus }> {
  return request<{ ok: boolean; enabled: boolean; status: CleanupStatus }>('POST', '/admin/deleted-data/cleanup/toggle', {
    token,
    body: { enabled },
  });
}

/** 手动清理 */
function manualCleanup(token: string, table?: string, retentionDays?: number): Promise<{ ok: boolean } & CleanupResult> {
  return request<{ ok: boolean } & CleanupResult>('POST', '/admin/deleted-data/cleanup', {
    token,
    body: { table, retentionDays },
  });
}

/** 获取列表（根据是否指定表返回不同类型） */
function fetchList(token: string, table: string | undefined): Promise<ListResponse> {
  if (table) {
    return request<ListTableResponse>('GET', `/admin/deleted-data?table=${table}`, { token });
  }
  return request<ListAllResponse>('GET', '/admin/deleted-data', { token });
}

/** 恢复数据 */
function restoreData(token: string, table: string, id: string): Promise<{ ok: boolean; table: string; id: string; restoredAt: number }> {
  return request<{ ok: boolean; table: string; id: string; restoredAt: number }>('POST', `/admin/deleted-data/${table}/${id}/restore`, { token });
}

/* ===================== 辅助函数 ===================== */

/** 格式化时间戳 */
function formatTimestamp(ts: number | null): string {
  if (!ts) return '从未';
  return new Date(ts).toLocaleString('zh-CN');
}

/** 格式化相对时间 */
function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = ts - now;
  if (diff < 0) return '已过期';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return `${hours} 小时后`;
  const days = Math.floor(hours / 24);
  return `${days} 天后`;
}

/* ==================== 主组件 ==================== */

export const DeletedDataManagement: React.FC = () => {
  const queryClient = useQueryClient();
  const token = useAppStore((state) => state.token);
  const currentUser = useAppStore((state) => state.currentUser);
  const { confirm } = useConfirm();

  // 权限检查
  const canAccess = currentUser?.role === 'admin' && Boolean(token);

  // 状态
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);
  const [cleanupTable, setCleanupTable] = useState<string>('');
  const [cleanupRetentionDays, setCleanupRetentionDays] = useState<number>(60);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 查询数据
  const statusQuery = useQuery({
    queryKey: ['deleted-data-cleanup-status', token],
    queryFn: () => fetchCleanupStatus(token!),
    enabled: canAccess,
    refetchInterval: 60000, // 每分钟刷新
  });

  const listQuery = useQuery({
    queryKey: ['deleted-data-list', token, selectedTable],
    queryFn: () => fetchList(token!, selectedTable),
    enabled: canAccess,
  });

  // Mutations
  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => toggleCleanup(token!, enabled),
    onSuccess: (data) => {
      setFeedback({ type: 'success', message: data.enabled ? '清理任务已启用' : '清理任务已禁用' });
      queryClient.invalidateQueries({ queryKey: ['deleted-data-cleanup-status'] });
    },
    onError: (error: Error) => {
      setFeedback({ type: 'error', message: error.message });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: ({ table, retentionDays }: { table?: string; retentionDays?: number }) =>
      manualCleanup(token!, table, retentionDays),
    onSuccess: (data) => {
      setFeedback({ type: 'success', message: `清理完成，共删除 ${data.totalDeleted} 条数据` });
      queryClient.invalidateQueries({ queryKey: ['deleted-data-cleanup-status'] });
      queryClient.invalidateQueries({ queryKey: ['deleted-data-list'] });
      setCleanupModalOpen(false);
    },
    onError: (error: Error) => {
      setFeedback({ type: 'error', message: error.message });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: ({ table, id }: { table: string; id: string }) => restoreData(token!, table, id),
    onSuccess: () => {
      setFeedback({ type: 'success', message: '数据已恢复' });
      queryClient.invalidateQueries({ queryKey: ['deleted-data-list'] });
    },
    onError: (error: Error) => {
      setFeedback({ type: 'error', message: error.message });
    },
  });

  // 事件处理
  const handleToggleCleanup = useCallback(async (enabled: boolean) => {
    const action = enabled ? '启用' : '禁用';
    const confirmed = await confirm(`确定要${action}定时清理任务吗？`, `${action}清理任务`);
    if (confirmed) {
      toggleMutation.mutate(enabled);
    }
  }, [confirm, toggleMutation]);

  const handleManualCleanup = useCallback(async () => {
    const tableLabel = cleanupTable ? TABLE_LABELS[cleanupTable] || cleanupTable : '所有表';
    const confirmed = await confirm(
      `确定要清理 ${tableLabel} 超过 ${cleanupRetentionDays} 天的已删除数据吗？此操作不可撤销。`,
      '手动清理确认',
    );
    if (confirmed) {
      cleanupMutation.mutate({ table: cleanupTable || undefined, retentionDays: cleanupRetentionDays });
    }
  }, [confirm, cleanupTable, cleanupRetentionDays, cleanupMutation]);

  const handleRestore = useCallback(async (table: string, id: string) => {
    const confirmed = await confirm(`确定要恢复此数据吗？数据将恢复到正常状态。`, '恢复数据确认');
    if (confirmed) {
      restoreMutation.mutate({ table, id });
    }
  }, [confirm, restoreMutation]);

  // 渲染清理状态面板
  const renderStatusPanel = () => {
    const status = statusQuery.data;
    if (!status) return null;

    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">清理任务状态</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">上次清理时间</div>
            <div className="font-medium">{formatTimestamp(status.lastRunAt)}</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">下次清理时间</div>
            <div className="font-medium">{formatTimestamp(status.nextRunAt)}</div>
            <div className="text-xs text-gray-400">{formatRelativeTime(status.nextRunAt)}</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">保留期限</div>
            <div className="font-medium">{status.retentionDays} 天</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">状态</div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded text-xs ${status.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                {status.enabled ? '已启用' : '已禁用'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-4 mt-4">
          <Button
            variant={status.enabled ? 'secondary' : 'primary'}
            onClick={() => handleToggleCleanup(!status.enabled)}
            isLoading={toggleMutation.isPending}
          >
            {status.enabled ? '禁用清理' : '启用清理'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setCleanupModalOpen(true)}
          >
            手动清理
          </Button>
        </div>
      </div>
    );
  };

  // 渲染筛选区域
  const renderFilterBar = () => (
    <div className="flex flex-wrap gap-4 p-4 bg-white rounded-lg shadow">
      <select
        className="px-3 py-2 border rounded-md"
        value={selectedTable}
        onChange={(e) => setSelectedTable(e.target.value)}
      >
        <option value="">全部表（统计）</option>
        {SOFT_DELETE_TABLES.map((table) => (
          <option key={table} value={table}>
            {TABLE_LABELS[table] || table}
          </option>
        ))}
      </select>
      <Button
        variant="secondary"
        onClick={() => listQuery.refetch()}
        isLoading={listQuery.isRefetching}
      >
        刷新
      </Button>
    </div>
  );

  // 渲染数据列表
  const renderDataList = () => {
    if (listQuery.isLoading) {
      return <div className="text-center py-10">加载中...</div>;
    }

    if (!listQuery.data) {
      return <div className="text-center py-10">暂无数据</div>;
    }

    // 全部表统计模式
    if (isListAllResponse(listQuery.data)) {
      const data = listQuery.data;
      return (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">表名</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">已删除数量</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(data.tables).map(([table, stats]) => (
                <tr key={table} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-medium">{TABLE_LABELS[table] || table}</span>
                    <span className="text-xs text-gray-400 ml-2">({table})</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded ${stats.count > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                      {stats.count}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      className="text-blue-600 hover:text-blue-800"
                      onClick={() => setSelectedTable(table)}
                    >
                      查看详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // 单个表详情模式
    const data = listQuery.data;
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 bg-gray-50 border-b">
          <div className="flex items-center gap-4">
            <button
              className="text-gray-500 hover:text-gray-700"
              onClick={() => setSelectedTable('')}
            >
              返回全部统计
            </button>
            <span className="text-gray-400">|</span>
            <span className="font-medium">{TABLE_LABELS[data.table] || data.table}</span>
            <span className="text-sm text-gray-500">共 {data.count} 条已删除数据</span>
          </div>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">删除时间</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">删除者</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.records.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                  暂无已删除数据
                </td>
              </tr>
            ) : (
              data.records.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">{record.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {formatTimestamp(record.deletedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {record.deletedBy || '未知'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      className="text-green-600 hover:text-green-800 disabled:opacity-50"
                      onClick={() => handleRestore(data.table, record.id)}
                      disabled={restoreMutation.isPending}
                    >
                      {restoreMutation.isPending && restoreMutation.variables?.id === record.id ? '恢复中...' : '恢复'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // 简化的清理弹窗（使用原生对话框）
  const renderCleanupDialog = () => {
    if (!cleanupModalOpen) return null;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
        onClick={() => setCleanupModalOpen(false)}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-1 bg-gradient-to-r from-primary via-amber-400 to-primary" />
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">手动清理已删除数据</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择清理表</label>
                <select
                  className="w-full px-3 py-2 border rounded-md"
                  value={cleanupTable}
                  onChange={(e) => setCleanupTable(e.target.value)}
                >
                  <option value="">全部表</option>
                  {SOFT_DELETE_TABLES.map((table) => (
                    <option key={table} value={table}>
                      {TABLE_LABELS[table] || table}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">保留期限（天）</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border rounded-md"
                  value={cleanupRetentionDays}
                  onChange={(e) => setCleanupRetentionDays(Number(e.target.value))}
                  min={1}
                  max={365}
                />
                <p className="text-xs text-gray-400 mt-1">仅清理超过此天数的已删除数据</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setCleanupModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={handleManualCleanup}
                disabled={cleanupMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 shadow-lg disabled:opacity-50"
              >
                {cleanupMutation.isPending ? '清理中...' : '执行清理'}
              </button>
            </div>
          </div>
        </div>
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
            <h1 className="text-2xl font-bold text-gray-900">伪删除数据管理</h1>
            <p className="mt-1 text-sm text-gray-500">管理软删除数据，包括查看、恢复和清理</p>
          </div>

          {/* 反馈消息 */}
          {feedback && (
            <div className={`mb-4 p-4 rounded-lg ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {feedback.message}
              <button className="ml-4 underline" onClick={() => setFeedback(null)}>关闭</button>
            </div>
          )}

          {/* 清理状态面板 */}
          <div className="mb-6">
            {renderStatusPanel()}
          </div>

          {/* 筛选区域 */}
          <div className="mb-6">
            {renderFilterBar()}
          </div>

          {/* 数据列表 */}
          {renderDataList()}

          {/* 清理弹窗 */}
          {renderCleanupDialog()}
        </div>
      </div>
    </>
  );
};

export default DeletedDataManagement;