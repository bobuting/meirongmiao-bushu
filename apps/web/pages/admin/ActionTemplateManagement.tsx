/**
 * 动作模板管理页面
 * 管理 AnimateAnyone 内置动作模板库
 *
 * 功能：
 * - 模板列表展示（表格布局）
 * - 新增/编辑模板弹窗
 * - 预览素材上传（缩略图、预览视频、预览 GIF）
 * - 启用/禁用切换
 * - 分类筛选
 * - 使用统计展示
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import {
  adminActionTemplatesApi,
  templateGenerateApi,
  type ActionTemplate,
  type ActionTemplateCategory,
  type AdminTemplateStatsResponse,
  type QueryGenerateTaskResponse,
} from '../../services/realApi/action-templates';
import { useConfirm } from '../../components/ui/ConfirmDialog';

// 分类选项配置
const CATEGORY_OPTIONS: { value: ActionTemplateCategory; label: string; icon: string }[] = [
  { value: 'dance', label: '舞蹈', icon: 'music_note' },
  { value: 'sport', label: '运动', icon: 'sports_soccer' },
  { value: 'expression', label: '表情', icon: 'sentiment_satisfied' },
  { value: 'daily', label: '日常', icon: 'directions_walk' },
  { value: 'special', label: '特殊', icon: 'star' },
];

// 来源选项配置
const SOURCE_OPTIONS = [
  { value: 'official', label: '官方' },
  { value: 'system', label: '系统' },
  { value: 'user_created', label: '用户创建' },
];

/**
 * 动作模板管理组件
 */
export const ActionTemplateManagement: React.FC = () => {
  const token = useAppStore(useShallow((state) => state.token));
  const { confirm } = useConfirm();

  // ========== 状态管理 ==========
  // 列表数据
  const [templateList, setTemplateList] = useState<ActionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // 统计数据
  const [stats, setStats] = useState<AdminTemplateStatsResponse | null>(null);

  // 筛选条件
  const [categoryFilter, setCategoryFilter] = useState<ActionTemplateCategory | ''>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'true' | 'false'>('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 分页
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 弹窗状态
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ActionTemplate | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 操作菜单
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // 模板生成状态
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    name: '',
    category: 'dance' as ActionTemplateCategory,
    description: '',
    tags: '',
    videoFile: null as File | null,
    videoUrl: '',
    thumbnailUrl: '',
    previewVideoUrl: '',
    previewGifUrl: '',
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateTaskId, setGenerateTaskId] = useState<string | null>(null);
  const [generateStatus, setGenerateStatus] = useState<'idle' | 'uploading' | 'generating' | 'polling' | 'succeeded' | 'failed'>('idle');
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generatedTemplate, setGeneratedTemplate] = useState<ActionTemplate | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 文件上传 ref（编辑用）
  const editThumbnailInputRef = useRef<HTMLInputElement>(null);
  const editVideoInputRef = useRef<HTMLInputElement>(null);
  const editGifInputRef = useRef<HTMLInputElement>(null);

  // 预览状态
  const [previewMedia, setPreviewMedia] = useState<{ type: 'image' | 'video'; url: string } | null>(null);

  // ========== 数据加载 ==========
  /** 加载模板列表 */
  const loadTemplateList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await adminActionTemplatesApi.listTemplates(token, {
        category: categoryFilter || undefined,
        isActive: activeFilter === 'all' ? undefined : activeFilter === 'true',
        sortBy: 'created_at',
        sortOrder: 'DESC',
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      if (result.success) {
        // 前端搜索过滤（名称匹配）
        let filtered = result.data.items;
        if (searchKeyword.trim()) {
          const keyword = searchKeyword.toLowerCase();
          filtered = filtered.filter((t) =>
            t.name.toLowerCase().includes(keyword) ||
            (t.description && t.description.toLowerCase().includes(keyword)) ||
            (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(keyword)))
          );
        }
        setTemplateList(filtered);
        setTotal(result.data.total);
      }
    } catch (error) {
      console.error('[ActionTemplateManagement] 加载模板列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [token, categoryFilter, activeFilter, page, searchKeyword]);

  /** 加载统计数据 */
  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const result = await adminActionTemplatesApi.getStats(token);
      if (result.success) {
        setStats(result.data);
      }
    } catch (error) {
      console.error('[ActionTemplateManagement] 加载统计失败:', error);
    }
  }, [token]);

  useEffect(() => {
    loadTemplateList();
    loadStats();
  }, [loadTemplateList, loadStats]);

  // 点击外部关闭操作菜单
  useEffect(() => {
    if (!openMenuId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-action-menu]') && !target.closest('[data-menu-trigger]')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openMenuId]);

  // 组件卸载时清理轮询 interval
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // ========== 文件上传处理 ==========
  /** 上传缩略图 */
  const uploadThumbnail = useCallback(async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/admin/action-templates/upload-thumbnail', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (data.success && data.data?.url) {
        return data.data.url;
      }
      return null;
    } catch (error) {
      console.error('[ActionTemplateManagement] 上传缩略图失败:', error);
      return null;
    }
  }, [token]);

  /** 上传预览视频 */
  const uploadPreviewVideo = useCallback(async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/admin/action-templates/upload-video', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (data.success && data.data?.url) {
        return data.data.url;
      }
      return null;
    } catch (error) {
      console.error('[ActionTemplateManagement] 上传预览视频失败:', error);
      return null;
    }
  }, [token]);

  /** 上传预览 GIF */
  const uploadPreviewGif = useCallback(async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/admin/action-templates/upload-gif', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (data.success && data.data?.url) {
        return data.data.url;
      }
      return null;
    } catch (error) {
      console.error('[ActionTemplateManagement] 上传预览 GIF 失败:', error);
      return null;
    }
  }, [token]);

  // ========== 操作处理 ==========
  /** 切换启用状态 */
  const toggleEnabled = useCallback(async (template: ActionTemplate) => {
    const message = template.isActive
      ? '禁用后该模板将不在换装项目中展示。'
      : '启用后该模板将在换装项目中展示。';
    const confirmed = await confirm(message, template.isActive ? '确认禁用？' : '确认启用？');
    if (!confirmed) return;

    try {
      await adminActionTemplatesApi.updateTemplate(token!, template.id, {
        isActive: !template.isActive,
      });
      loadTemplateList();
      loadStats();
    } catch (error) {
      console.error('[ActionTemplateManagement] 更新状态失败:', error);
      alert('更新状态失败，请重试');
    }
  }, [token, confirm, loadTemplateList, loadStats]);

  /** 删除模板 */
  const handleDelete = useCallback(async (template: ActionTemplate) => {
    const confirmed = await confirm(
      `删除后无法恢复，确定要删除「${template.name}」吗？`,
      '确认删除？'
    );
    if (!confirmed) return;

    try {
      await adminActionTemplatesApi.deleteTemplate(token!, template.id);
      loadTemplateList();
      loadStats();
    } catch (error) {
      console.error('[ActionTemplateManagement] 删除模板失败:', error);
      alert('删除失败，请重试');
    }
  }, [token, confirm, loadTemplateList, loadStats]);

  /** 打开编辑弹窗 */
  const openEditModal = useCallback((template: ActionTemplate) => {
    setEditingTemplate(template);
    setIsEditModalOpen(true);
  }, []);

  /** 保存编辑模板 */
  const handleEditSave = useCallback(async () => {
    if (!editingTemplate) return;

    setIsSaving(true);
    try {
      let thumbnailUrl = editingTemplate.thumbnailUrl;
      let previewVideoUrl = editingTemplate.previewVideoUrl;
      let previewGifUrl = editingTemplate.previewGifUrl;

      // 上传文件（如果有新文件）
      // 注意：编辑模式下需要额外处理文件上传状态，这里简化处理

      await adminActionTemplatesApi.updateTemplate(token!, editingTemplate.id, {
        name: editingTemplate.name,
        category: editingTemplate.category,
        thumbnailUrl,
        previewVideoUrl,
        previewGifUrl,
        description: editingTemplate.description,
        tags: editingTemplate.tags,
        isActive: editingTemplate.isActive,
      });

      setIsEditModalOpen(false);
      setEditingTemplate(null);
      loadTemplateList();
    } catch (error) {
      console.error('[ActionTemplateManagement] 更新模板失败:', error);
      alert('更新失败，请重试');
    } finally {
      setIsSaving(false);
    }
  }, [editingTemplate, token, loadTemplateList]);

  /** 格式化日期 */
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /** 格式化时长 */
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}秒`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}分${secs}秒` : `${mins}分钟`;
  };

  // ========== 渲染 ==========
  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#FDFBF7]">
      {/* 头部 */}
      <header className="px-6 py-4 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">动作模板管理</h1>
            <p className="text-sm text-text-secondary mt-1">
              AnimateAnyone 内置动作模板库 · 共 {total} 条记录
            </p>
          </div>
          <button
            onClick={() => setIsGenerateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium hover:from-purple-600 hover:to-pink-600 transition-colors"
          >
            <span className="material-icons-round text-lg">auto_awesome</span>
            生成模板
          </button>
        </div>
      </header>

      {/* 统计卡片 */}
      {stats && (
        <div className="px-6 py-4 bg-white border-b border-gray-100">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-icons-round text-gray-400">inventory_2</span>
                <span className="text-sm text-text-secondary">总模板数</span>
              </div>
              <p className="text-2xl font-bold text-text-primary">{stats.total}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-icons-round text-emerald-500">check_circle</span>
                <span className="text-sm text-text-secondary">已启用</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-icons-round text-red-500">cancel</span>
                <span className="text-sm text-text-secondary">已禁用</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{stats.inactive}</p>
            </div>
            <div className="bg-primary-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-icons-round text-primary">trending_up</span>
                <span className="text-sm text-text-secondary">热门模板</span>
              </div>
              <p className="text-lg font-bold text-primary truncate">
                {stats.topTemplates[0]?.name || '暂无'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 搜索和筛选 */}
      <div className="px-6 py-4 bg-white border-b border-gray-100">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px] max-w-md relative">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              search
            </span>
            <input
              type="text"
              placeholder="搜索名称、描述或标签..."
              value={searchKeyword}
              onChange={(e) => { setSearchKeyword(e.target.value); setPage(1); }}
              onKeyDown={(e) => { if (e.key === 'Enter') loadTemplateList(); }}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
          <button
            onClick={() => { loadTemplateList(); loadStats(); }}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-text-secondary hover:border-primary hover:text-primary transition-colors"
            title="刷新数据"
          >
            <span className="material-icons-round text-lg">refresh</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">分类:</span>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value as ActionTemplateCategory | ''); setPage(1); }}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="">全部</option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">状态:</span>
            <select
              value={activeFilter}
              onChange={(e) => { setActiveFilter(e.target.value as 'all' | 'true' | 'false'); setPage(1); }}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="all">全部</option>
              <option value="true">已启用</option>
              <option value="false">已禁用</option>
            </select>
          </div>
        </div>
      </div>

      {/* 模板列表 */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="material-icons-round animate-spin text-primary text-4xl">sync</span>
          </div>
        ) : templateList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <span className="material-icons-round text-6xl mb-4">directions_run</span>
            <p>暂无模板数据</p>
            <button
              onClick={() => setIsGenerateModalOpen(true)}
              className="mt-4 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm hover:from-purple-600 hover:to-pink-600"
            >
              生成第一个模板
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-16">
                    预览
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    名称
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-20">
                    分类
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-24">
                    时长
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-20">
                    热度
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-24">
                    来源
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-24">
                    状态
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-36">
                    创建时间
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider w-32">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {templateList.map((template) => (
                  <tr key={template.id} className="hover:bg-gray-50 transition-colors">
                    {/* 预览（缩略图/GIF/视频） */}
                    <td className="px-4 py-3">
                      <div className="relative w-12 h-16 rounded-lg overflow-hidden bg-gray-100 group">
                        {template.thumbnailUrl ? (
                          <img loading="lazy"                             src={template.thumbnailUrl}
                            alt={template.name}
                            className="w-full h-full object-cover"
                          />
                        ) : template.previewGifUrl ? (
                          <img loading="lazy"                             src={template.previewGifUrl}
                            alt={template.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="material-icons-round text-gray-400 text-sm">image</span>
                          </div>
                        )}
                        {/* 悬停播放预览 */}
                        {template.previewVideoUrl && (
                          <button
                            onClick={() => setPreviewMedia({ type: 'video', url: template.previewVideoUrl! })}
                            className="absolute bottom-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 hover:bg-primary flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                            title="播放预览视频"
                          >
                            <span className="material-icons-round text-white text-xs">play_arrow</span>
                          </button>
                        )}
                      </div>
                    </td>
                    {/* 名称 */}
                    <td className="px-4 py-3">
                      <div className="max-w-xs">
                        <p className="text-sm font-medium text-text-primary truncate" title={template.name}>
                          {template.name}
                        </p>
                        {template.description && (
                          <p className="text-xs text-text-muted truncate mt-0.5" title={template.description}>
                            {template.description}
                          </p>
                        )}
                        {template.tags && template.tags.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {template.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-text-muted text-xs rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    {/* 分类 */}
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-text-secondary text-xs rounded-lg">
                        <span className="material-icons-round text-xs">
                          {CATEGORY_OPTIONS.find(c => c.value === template.category)?.icon || 'category'}
                        </span>
                        {CATEGORY_OPTIONS.find(c => c.value === template.category)?.label || template.category}
                      </span>
                    </td>
                    {/* 时长 */}
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {formatDuration(template.durationSec)}
                    </td>
                    {/* 热度 */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="material-icons-round text-orange-400 text-sm">local_fire_department</span>
                        <span className="text-sm font-medium text-text-primary">{template.popularity}</span>
                      </div>
                    </td>
                    {/* 来源 */}
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {SOURCE_OPTIONS.find(s => s.value === template.source)?.label || template.source}
                    </td>
                    {/* 状态 */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => toggleEnabled(template)}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
                          template.isActive
                            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            : 'bg-red-50 text-red-500 hover:bg-red-100'
                        }`}
                        title={template.isActive ? '点击禁用该模板' : '点击启用该模板'}
                      >
                        <span className="material-icons-round text-xs">
                          {template.isActive ? 'toggle_on' : 'toggle_off'}
                        </span>
                        {template.isActive ? '已启用' : '已禁用'}
                      </button>
                    </td>
                    {/* 创建时间 */}
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {formatDate(template.createdAt)}
                    </td>
                    {/* 操作 */}
                    <td className="px-4 py-3 text-right relative">
                      <button
                        data-menu-trigger
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === template.id ? null : template.id);
                        }}
                        className="p-1.5 rounded-md text-gray-400 hover:text-text-primary hover:bg-gray-100 transition-colors"
                        title="更多操作"
                      >
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>more_vert</span>
                      </button>
                      {openMenuId === template.id && (
                        <div
                          data-action-menu
                          className="absolute right-0 top-full z-40 min-w-[120px] bg-white rounded-lg shadow-lg border border-gray-100 py-1"
                        >
                          <button
                            onClick={() => { setOpenMenuId(null); openEditModal(template); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-gray-50 transition-colors"
                          >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>edit</span>
                            编辑
                          </button>
                          <button
                            onClick={() => { setOpenMenuId(null); handleDelete(template); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>delete</span>
                            删除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {total > pageSize && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-50 hover:border-primary hover:text-primary transition-colors"
            >
              上一页
            </button>
            <span className="text-sm text-text-secondary">
              第 {page} / {Math.ceil(total / pageSize)} 页
            </span>
            <button
              onClick={() => setPage(p => Math.min(Math.ceil(total / pageSize), p + 1))}
              disabled={page >= Math.ceil(total / pageSize)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-50 hover:border-primary hover:text-primary transition-colors"
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {/* 媒体预览弹窗 */}
      {previewMedia && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setPreviewMedia(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewMedia(null)}
              className="absolute -top-10 right-0 p-2 text-white/80 hover:text-white"
            >
              <span className="material-icons-round text-2xl">close</span>
            </button>
            {previewMedia.type === 'image' ? (
              <img loading="lazy"                 src={previewMedia.url}
                alt="预览"
                className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
              />
            ) : (
              <video
                src={previewMedia.url}
                controls
                autoPlay
                loop
                className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
              />
            )}
          </div>
        </div>
      )}

      {/* 编辑模板弹窗 */}
      {isEditModalOpen && editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-lg font-bold text-text-primary">编辑动作模板</h3>
              <button
                onClick={() => { setIsEditModalOpen(false); setEditingTemplate(null); }}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">模板名称</label>
                  <input
                    type="text"
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, name: e.target.value } : null)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">阿里云模板 ID</label>
                  <input
                    type="text"
                    value={editingTemplate.aliTemplateId || ''}
                    disabled
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-gray-50 text-text-muted"
                    placeholder="不可修改"
                  />
                  <p className="text-xs text-text-muted mt-1">模板 ID 创建后不可修改</p>
                </div>
              </div>

              {/* 分类 */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">分类</label>
                <select
                  value={editingTemplate.category}
                  onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, category: e.target.value as ActionTemplateCategory } : null)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                >
                  {CATEGORY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* 预览素材 */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">预览素材</label>
                <div className="flex gap-4">
                  {/* 缩略图 */}
                  <div className="flex flex-col items-center">
                    <input
                      ref={editThumbnailInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = await uploadThumbnail(file);
                          if (url) setEditingTemplate(prev => prev ? { ...prev, thumbnailUrl: url } : null);
                        }
                      }}
                    />
                    <div
                      className="relative w-20 h-28 rounded-xl overflow-hidden cursor-pointer border border-gray-200 group bg-gray-50"
                      onClick={() => editingTemplate.thumbnailUrl ? setPreviewMedia({ type: 'image', url: editingTemplate.thumbnailUrl! }) : editThumbnailInputRef.current?.click()}
                    >
                      {editingTemplate.thumbnailUrl ? (
                        <img loading="lazy" src={editingTemplate.thumbnailUrl} alt="缩略图" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center">
                          <span className="material-icons-round text-gray-400 text-2xl">add_photo_alternate</span>
                          <span className="text-xs text-gray-400 mt-1">缩略图</span>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-text-muted mt-1">缩略图</span>
                  </div>
                  {/* 预览视频 */}
                  <div className="flex flex-col items-center">
                    <input
                      ref={editVideoInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = await uploadPreviewVideo(file);
                          if (url) setEditingTemplate(prev => prev ? { ...prev, previewVideoUrl: url } : null);
                        }
                      }}
                    />
                    <div
                      className="relative w-20 h-28 rounded-xl overflow-hidden cursor-pointer border border-gray-200 group bg-gray-50"
                      onClick={() => editingTemplate.previewVideoUrl ? setPreviewMedia({ type: 'video', url: editingTemplate.previewVideoUrl! }) : editVideoInputRef.current?.click()}
                    >
                      {editingTemplate.previewVideoUrl ? (
                        <video src={editingTemplate.previewVideoUrl} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center">
                          <span className="material-icons-round text-gray-400 text-2xl">videocam</span>
                          <span className="text-xs text-gray-400 mt-1">预览视频</span>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-text-muted mt-1">预览视频</span>
                  </div>
                  {/* 预览 GIF */}
                  <div className="flex flex-col items-center">
                    <input
                      ref={editGifInputRef}
                      type="file"
                      accept="image/gif"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = await uploadPreviewGif(file);
                          if (url) setEditingTemplate(prev => prev ? { ...prev, previewGifUrl: url } : null);
                        }
                      }}
                    />
                    <div
                      className="relative w-20 h-28 rounded-xl overflow-hidden cursor-pointer border border-gray-200 group bg-gray-50"
                      onClick={() => editingTemplate.previewGifUrl ? setPreviewMedia({ type: 'image', url: editingTemplate.previewGifUrl! }) : editGifInputRef.current?.click()}
                    >
                      {editingTemplate.previewGifUrl ? (
                        <img loading="lazy" src={editingTemplate.previewGifUrl} alt="预览 GIF" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center">
                          <span className="material-icons-round text-gray-400 text-2xl">gif_box</span>
                          <span className="text-xs text-gray-400 mt-1">预览 GIF</span>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-text-muted mt-1">预览 GIF</span>
                  </div>
                </div>
              </div>

              {/* 描述 */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">描述</label>
                <textarea
                  value={editingTemplate.description || ''}
                  onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, description: e.target.value } : null)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
                />
              </div>

              {/* 启用状态 */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-isActive"
                  checked={editingTemplate.isActive}
                  onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, isActive: e.target.checked } : null)}
                  className="shrink-0"
                />
                <label htmlFor="edit-isActive" className="text-sm text-text-secondary">启用该模板</label>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button
                onClick={() => { setIsEditModalOpen(false); setEditingTemplate(null); }}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-primary hover:text-primary transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleEditSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving && (
                  <span className="material-icons-round text-base animate-spin">sync</span>
                )}
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 生成模板弹窗 */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-lg font-bold text-text-primary">上传视频生成模板</h3>
              <button
                onClick={() => {
                  setIsGenerateModalOpen(false);
                  if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                  setGenerateForm({
                    name: '',
                    category: 'dance',
                    description: '',
                    tags: '',
                    videoFile: null,
                    videoUrl: '',
                    thumbnailUrl: '',
                    previewVideoUrl: '',
                    previewGifUrl: '',
                  });
                  setGenerateStatus('idle');
                  setGenerateTaskId(null);
                  setGenerateError(null);
                  setGeneratedTemplate(null);
                }}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6">
              {/* 步骤说明 */}
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-3 mb-5">
                <div className="flex items-center gap-2">
                  <span className="material-icons-round text-purple-500 text-lg">info</span>
                  <span className="text-sm text-purple-600">
                    上传参考视频 → AI 提取动作模板 → 自动保存
                  </span>
                </div>
              </div>

              {/* 主内容区域：左视频 + 右表单 */}
              <div className="flex gap-6">
                {/* 左边：参考视频预览（竖屏比例） */}
                <div className="flex-shrink-0 w-48">
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    参考视频 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setGenerateForm(prev => {
                          if (prev.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(prev.videoUrl);
                          const url = URL.createObjectURL(file);
                          return { ...prev, videoFile: file, videoUrl: url };
                        });
                      }}
                      className="hidden"
                      id="generate-video-input"
                      disabled={generateStatus !== 'idle'}
                    />
                    <label
                      htmlFor="generate-video-input"
                      className={`block cursor-pointer transition-colors ${
                        generateStatus !== 'idle' ? 'cursor-not-allowed' : ''
                      }`}
                    >
                      {generateForm.videoUrl ? (
                        /* 已上传视频预览 - 竖屏比例 9:16 */
                        <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-gray-100 border-2 border-emerald-300 shadow-sm">
                          <video
                            src={generateForm.videoUrl}
                            className="w-full h-full object-cover"
                            controls
                            muted
                          />
                          {/* 更换按钮 */}
                          {generateStatus === 'idle' && (
                            <div className="absolute bottom-2 right-2">
                              <span className="material-icons-round bg-white/90 rounded-full p-1 text-sm text-gray-600 hover:text-primary">
                                refresh
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* 未上传 - 上传提示框 */
                        <div className={`aspect-[9/16] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors ${
                          generateStatus !== 'idle'
                            ? 'border-gray-200 bg-gray-50'
                            : 'border-gray-300 bg-gray-50 hover:border-primary hover:bg-primary-50'
                        }`}>
                          <span className="material-icons-round text-3xl text-gray-400">videocam_add</span>
                          <span className="text-xs text-gray-500 text-center px-2">
                            点击上传<br/>动作视频
                          </span>
                        </div>
                      )}
                    </label>
                  </div>
                  {/* 视频要求提示 */}
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    建议竖屏动作视频<br/>时长 5-30秒
                  </p>
                </div>

                {/* 右边：表单内容 */}
                <div className="flex-1 space-y-4">
                  {/* 状态显示 */}
                  {generateStatus !== 'idle' && (
                    <div className={`rounded-xl p-3 ${
                      generateStatus === 'succeeded' ? 'bg-emerald-50 border border-emerald-200' :
                      generateStatus === 'failed' ? 'bg-red-50 border border-red-200' :
                      'bg-blue-50 border border-blue-200'
                    }`}>
                      <div className="flex items-center gap-2">
                        {generateStatus === 'uploading' || generateStatus === 'generating' || generateStatus === 'polling' ? (
                          <span className="material-icons-round animate-spin text-blue-500 text-lg">sync</span>
                        ) : generateStatus === 'succeeded' ? (
                          <span className="material-icons-round text-emerald-500 text-lg">check_circle</span>
                        ) : (
                          <span className="material-icons-round text-red-500 text-lg">error</span>
                        )}
                        <p className={`font-medium text-sm ${
                          generateStatus === 'succeeded' ? 'text-emerald-700' :
                          generateStatus === 'failed' ? 'text-red-700' :
                          'text-blue-700'
                        }`}>
                          {generateStatus === 'uploading' ? '上传视频中...' :
                           generateStatus === 'generating' ? '创建生成任务...' :
                           generateStatus === 'polling' ? 'AI 处理中...' :
                           generateStatus === 'succeeded' ? '模板生成成功！' :
                           '生成失败'}
                        </p>
                      </div>
                      {generateError && (
                        <p className="text-xs text-red-600 mt-1 ml-7">{generateError}</p>
                      )}
                    </div>
                  )}

                  {/* 成功后显示模板信息 */}
                  {generatedTemplate && (
                    <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                      <h4 className="font-medium text-emerald-700 text-sm mb-2">生成的模板</h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-emerald-600">模板ID：</span>
                          <span className="text-emerald-800 font-mono">{generatedTemplate.aliTemplateId?.slice(0, 12)}...</span>
                        </div>
                        <div>
                          <span className="text-emerald-600">时长：</span>
                          <span className="text-emerald-800">{formatDuration(generatedTemplate.durationSec)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 模板信息表单 */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">模板名称</label>
                    <input
                      type="text"
                      value={generateForm.name}
                      onChange={(e) => setGenerateForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      placeholder="可选，如：流行舞蹈"
                      disabled={generateStatus !== 'idle'}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">分类</label>
                    <select
                      value={generateForm.category}
                      onChange={(e) => setGenerateForm(prev => ({ ...prev, category: e.target.value as ActionTemplateCategory }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      disabled={generateStatus !== 'idle'}
                    >
                      {CATEGORY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">描述</label>
                    <textarea
                      value={generateForm.description}
                      onChange={(e) => setGenerateForm(prev => ({ ...prev, description: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
                      placeholder="模板描述（可选）"
                      disabled={generateStatus !== 'idle'}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">标签</label>
                    <input
                      type="text"
                      value={generateForm.tags}
                      onChange={(e) => setGenerateForm(prev => ({ ...prev, tags: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      placeholder="多个标签用逗号分隔"
                      disabled={generateStatus !== 'idle'}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button
                onClick={() => {
                  setIsGenerateModalOpen(false);
                  if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                  setGenerateForm({
                    name: '',
                    category: 'dance',
                    description: '',
                    tags: '',
                    videoFile: null,
                    videoUrl: '',
                    thumbnailUrl: '',
                    previewVideoUrl: '',
                    previewGifUrl: '',
                  });
                  setGenerateStatus('idle');
                  setGenerateTaskId(null);
                  setGenerateError(null);
                  setGeneratedTemplate(null);
                }}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-primary hover:text-primary transition-colors"
                disabled={generateStatus !== 'idle' && generateStatus !== 'succeeded' && generateStatus !== 'failed'}
              >
                关闭
              </button>
              {generateStatus === 'succeeded' && (
                <button
                  onClick={() => {
                    setIsGenerateModalOpen(false);
                    setGenerateForm({
                      name: '',
                      category: 'dance',
                      description: '',
                      tags: '',
                      videoFile: null,
                      videoUrl: '',
                      thumbnailUrl: '',
                      previewVideoUrl: '',
                      previewGifUrl: '',
                    });
                    setGenerateStatus('idle');
                    setGenerateTaskId(null);
                    setGenerateError(null);
                    setGeneratedTemplate(null);
                    loadTemplateList();
                    loadStats();
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors"
                >
                  完成
                </button>
              )}
              {generateStatus === 'idle' && (
                <button
                  onClick={async () => {
                    if (!generateForm.videoFile) {
                      alert('请上传参考视频');
                      return;
                    }

                    setIsGenerating(true);
                    setGenerateStatus('uploading');
                    setGenerateError(null);

                    try {
                      // 1. 上传视频到 OSS
                      const uploadResult = await templateGenerateApi.uploadVideo(token!, generateForm.videoFile);
                      if (!uploadResult.success || !uploadResult.data?.url) {
                        throw new Error('上传视频失败');
                      }
                      const videoUrl = uploadResult.data.url;

                      // 1.5 自动截取视频第一帧作为缩略图
                      let thumbnailUrl = '';
                      try {
                        const videoEl = document.createElement('video');
                        videoEl.crossOrigin = 'anonymous';
                        videoEl.src = videoUrl;
                        videoEl.muted = true;
                        await new Promise<void>((resolve) => {
                          videoEl.onloadeddata = () => { videoEl.currentTime = 0.5; };
                          videoEl.onseeked = () => resolve();
                        });
                        const canvas = document.createElement('canvas');
                        canvas.width = 180;
                        canvas.height = 320;
                        canvas.getContext('2d')!.drawImage(videoEl, 0, 0, 180, 320);
                        const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8));
                        const thumbFile = new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' });
                        thumbnailUrl = (await uploadThumbnail(thumbFile)) || '';
                      } catch (e) {
                        // 截帧失败不影响主流程
                      }

                      // 2. 创建生成任务
                      setGenerateStatus('generating');
                      const taskResult = await templateGenerateApi.createGenerateTask(token!, {
                        videoUrl,
                        name: generateForm.name || undefined,
                        category: generateForm.category,
                        description: generateForm.description || undefined,
                        tags: generateForm.tags ? generateForm.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
                      });

                      if (!taskResult.success || !taskResult.data?.taskId) {
                        throw new Error('创建生成任务失败');
                      }

                      setGenerateTaskId(taskResult.data.taskId);
                      setGenerateStatus('polling');

                      // 3. 轮询任务状态
                      const taskId = taskResult.data.taskId;
                      let pollCount = 0;
                      const maxPollCount = 200; // 最多轮询 200 次（约 10 分钟），阿里云模板生成可能较长且有排队

                      const pollTask = async () => {
                        pollCount++;
                        if (pollCount > maxPollCount) {
                          setGenerateStatus('failed');
                          setGenerateError('生成超时（超过10分钟），请稍后重试或查看任务状态');
                          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                          return;
                        }

                        const statusResult = await templateGenerateApi.queryGenerateTask(
                          token!,
                          taskId,
                          {
                            name: generateForm.name || undefined,
                            category: generateForm.category,
                            description: generateForm.description || undefined,
                            tags: generateForm.tags || undefined,
                            previewVideoUrl: videoUrl,
                            thumbnailUrl: thumbnailUrl || undefined,
                          }
                        );

                        // 处理成功和失败状态（无论 success 是 true 还是 false）
                        if (statusResult.data?.status === 'succeeded' && statusResult.data.template) {
                          setGenerateStatus('succeeded');
                          setGeneratedTemplate(statusResult.data.template);
                          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                        } else if (statusResult.data?.status === 'failed') {
                          setGenerateStatus('failed');
                          const errorInfo = statusResult.data.error;
                          const errorMsg = typeof errorInfo === 'object' && errorInfo !== null
                            ? `${(errorInfo as Record<string, unknown>).code || 'ERROR'}: ${(errorInfo as Record<string, unknown>).message || '生成失败'}`
                            : (errorInfo || '生成失败');
                          setGenerateError(errorMsg);
                          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                        }
                      };

                      // 开始轮询（每 3 秒）
                      pollIntervalRef.current = setInterval(pollTask, 3000);
                      // 立即查询一次
                      await pollTask();

                    } catch (error) {
                      const message = error instanceof Error ? error.message : '生成失败';
                      setGenerateStatus('failed');
                      setGenerateError(message);
                      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    } finally {
                      setIsGenerating(false);
                    }
                  }}
                  disabled={!generateForm.videoFile || isGenerating}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium hover:from-purple-600 hover:to-pink-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isGenerating && (
                    <span className="material-icons-round text-base animate-spin">sync</span>
                  )}
                  开始生成
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActionTemplateManagement;