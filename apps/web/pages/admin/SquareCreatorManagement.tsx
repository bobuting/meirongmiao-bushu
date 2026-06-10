/**
 * 达人管理 Tab
 * 达人列表（筛选/搜索/启用禁用/手动添加/删除）
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { createApiRequest } from '../../services/backendApi.request';
import { useConfirm } from '../../components/ui/ConfirmDialog';

// 内容类型选项
const CONTENT_TYPE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'aesthetic', label: '生活美学' },
  { value: 'fashion_film', label: '时尚短片' },
  { value: 'scene', label: '场景种草' },
];

// 来源选项
const SOURCE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'discovery', label: '自动发现' },
  { value: 'manual', label: '手动添加' },
];

// 内容类型标签映射
const CONTENT_TYPE_LABEL: Record<string, string> = {
  aesthetic: '生活美学',
  fashion_film: '时尚短片',
  scene: '场景种草',
};

// 来源标签映射
const SOURCE_LABEL: Record<string, string> = {
  discovery: '自动发现',
  manual: '手动添加',
};

interface CreatorTarget {
  id: string;
  secUid: string;
  nickname: string;
  avatarUrl: string | null;
  fansCount: number;
  contentType: string;
  enabled: boolean;
  confidenceScore: number;
  source: string;
  discoveryKeywords: string | null;
  llmEvaluation: string | null;
  lastSyncedAt: number | null;
  videoCount: number;
  createdAt: number;
  updatedAt: number;
}

interface ListResponse {
  success: boolean;
  data: CreatorTarget[];
  total: number;
  page: number;
  pageSize: number;
}

export const SquareCreatorManagement: React.FC = () => {
  const token = useAppStore((state) => state.token);
  const { confirm } = useConfirm();
  const apiRequest = useCallback(createApiRequest(token), [token]);

  // 列表状态
  const [creators, setCreators] = useState<CreatorTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 筛选
  const [contentTypeFilter, setContentTypeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [enabledFilter, setEnabledFilter] = useState('');

  // 新增弹窗
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ douyinUrl: '', nickname: '', contentType: 'aesthetic' });
  const [isSaving, setIsSaving] = useState(false);
  const [addError, setAddError] = useState('');

  // 从抖音主页 URL 提取 sec_uid
  const extractSecUid = (url: string): string | null => {
    const match = url.match(/douyin\.com\/user\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  };

  // 加载列表
  const loadCreators = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...(contentTypeFilter && { contentType: contentTypeFilter }),
        ...(sourceFilter && { source: sourceFilter }),
        ...(enabledFilter !== '' && { enabled: enabledFilter }),
      });
      const data: ListResponse = await apiRequest(`/admin/square-creators?${params}`);
      if (data.success) {
        setCreators(data.data);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('加载达人列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, contentTypeFilter, sourceFilter, enabledFilter, token, apiRequest]);

  useEffect(() => { loadCreators(); }, [loadCreators]);

  // 启用/禁用切换
  const handleToggle = useCallback(async (creator: CreatorTarget) => {
    const action = creator.enabled ? '禁用' : '启用';
    const confirmed = await confirm(`${action}后该达人${creator.enabled ? '将不再被自动拉取' : '将恢复自动拉取'}。`, `确认${action}？`);
    if (!confirmed) return;
    try {
      await apiRequest(`/admin/square-creators/${creator.id}/toggle`, { method: 'POST' });
      loadCreators();
    } catch (error) {
      console.error('切换状态失败:', error);
    }
  }, [apiRequest, loadCreators, confirm]);

  // 删除
  const handleDelete = useCallback(async (id: string) => {
    const confirmed = await confirm('删除后无法恢复，确定要删除此达人吗？', '确认删除？');
    if (!confirmed) return;
    try {
      await apiRequest(`/admin/square-creators/${id}`, { method: 'DELETE' });
      loadCreators();
    } catch (error) {
      console.error('删除达人失败:', error);
    }
  }, [apiRequest, loadCreators, confirm]);

  // 手动添加
  const handleAdd = useCallback(async () => {
    if (!addForm.douyinUrl.trim() || !addForm.contentType) return;
    const secUid = extractSecUid(addForm.douyinUrl.trim());
    if (!secUid) {
      setAddError('无法识别抖音主页链接，请检查格式（如 https://www.douyin.com/user/MS4wLj...）');
      return;
    }
    setAddError('');
    setIsSaving(true);
    try {
      await apiRequest('/admin/square-creators', {
        method: 'POST',
        body: {
          secUid,
          nickname: addForm.nickname.trim() || secUid,
          contentType: addForm.contentType,
        },
      });
      setIsAddModalOpen(false);
      setAddForm({ douyinUrl: '', nickname: '', contentType: 'aesthetic' });
      loadCreators();
    } catch (error) {
      console.error('添加达人失败:', error);
    } finally {
      setIsSaving(false);
    }
  }, [addForm, apiRequest, loadCreators]);

  const totalPages = Math.ceil(total / pageSize);
  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('zh-CN');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 工具栏 */}
      <div className="px-6 py-4 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-text-secondary">共 {total} 条达人记录</p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            <span className="material-icons-round text-lg">person_add</span>
            手动添加达人
          </button>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => loadCreators()}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-text-secondary hover:border-primary hover:text-primary transition-colors"
            title="刷新数据"
          >
            <span className="material-icons-round text-lg">refresh</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">内容类型:</span>
            <select
              value={contentTypeFilter}
              onChange={(e) => { setContentTypeFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              {CONTENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">来源:</span>
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">状态:</span>
            <select
              value={enabledFilter}
              onChange={(e) => { setEnabledFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="">全部</option>
              <option value="true">已启用</option>
              <option value="false">已禁用</option>
            </select>
          </div>
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="material-icons-round animate-spin text-primary text-4xl">sync</span>
          </div>
        ) : creators.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <span className="material-icons-round text-6xl mb-4">group_off</span>
            <p>暂无达人数据</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-28">昵称</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-36">secUid</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-20">粉丝</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-24">内容类型</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-20">置信度</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-20">来源</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-20">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-20">视频数</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-24">最后同步</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider w-24">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {creators.map((creator) => (
                  <tr key={creator.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {creator.avatarUrl ? (
                          <img loading="lazy" src={creator.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                            <span className="material-icons-round text-gray-400 text-sm">person</span>
                          </div>
                        )}
                        <span className="text-sm font-medium text-text-primary truncate max-w-[80px]" title={creator.nickname}>
                          {creator.nickname}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary font-mono truncate max-w-[140px]" title={creator.secUid}>
                      {creator.secUid}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {creator.fansCount >= 10000 ? `${(creator.fansCount / 10000).toFixed(1)}万` : creator.fansCount}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-lg">
                        {CONTENT_TYPE_LABEL[creator.contentType] || creator.contentType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {(creator.confidenceScore * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-lg ${
                        creator.source === 'manual' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-text-secondary'
                      }`}>
                        {SOURCE_LABEL[creator.source] || creator.source}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggle(creator)}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
                          creator.enabled ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-red-50 text-red-500 hover:bg-red-100'
                        }`}
                      >
                        <span className="material-icons-round text-xs">{creator.enabled ? 'toggle_on' : 'toggle_off'}</span>
                        {creator.enabled ? '启用' : '禁用'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{creator.videoCount}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {creator.lastSyncedAt ? formatDate(creator.lastSyncedAt) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(creator.id)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="删除"
                      >
                        <span className="material-icons-round text-lg">delete_outline</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-50 hover:border-primary hover:text-primary transition-colors"
            >
              上一页
            </button>
            <span className="text-sm text-text-secondary">第 {page} / {totalPages} 页</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-50 hover:border-primary hover:text-primary transition-colors"
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {/* 手动添加弹窗 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-text-primary">手动添加达人</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">抖音主页链接 *</label>
                <input
                  type="text"
                  value={addForm.douyinUrl}
                  onChange={(e) => { setAddForm(prev => ({ ...prev, douyinUrl: e.target.value })); setAddError(''); }}
                  className={`w-full px-3 py-2 rounded-lg border text-sm focus:ring-1 outline-none ${
                    addError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-200 focus:border-primary focus:ring-primary'
                  }`}
                  placeholder="https://www.douyin.com/user/MS4wLj..."
                />
                {addError && <p className="mt-1 text-xs text-red-500">{addError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">昵称</label>
                <input
                  type="text"
                  value={addForm.nickname}
                  onChange={(e) => setAddForm(prev => ({ ...prev, nickname: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder="达人昵称（可选）"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">内容类型 *</label>
                <select
                  value={addForm.contentType}
                  onChange={(e) => setAddForm(prev => ({ ...prev, contentType: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="aesthetic">生活美学</option>
                  <option value="fashion_film">时尚短片</option>
                  <option value="scene">场景种草</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-primary hover:text-primary transition-colors">
                取消
              </button>
              <button
                onClick={handleAdd}
                disabled={!addForm.douyinUrl.trim() || isSaving}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving && <span className="material-icons-round text-base animate-spin">sync</span>}
                {isSaving ? '添加中...' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SquareCreatorManagement;
