/**
 * 创作广场模板管理页面
 * 采用表格布局，支持视频和图片预览
 * 包含 3 个子 Tab：模板管理 / 达人管理 / 自动化
 */

import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { createApiRequest } from '../../services/backendApi.request';
import { extractFirstFrame } from '../../libs/video-frame-extract';
import { useConfirm } from '../../components/ui/ConfirmDialog';

// 子 Tab 组件（懒加载）
const SquareCreatorManagement = lazy(() => import('./SquareCreatorManagement').then(m => ({ default: m.SquareCreatorManagement })));
const SquareAutomationTab = lazy(() => import('./SquareAutomationTab').then(m => ({ default: m.SquareAutomationTab })));

// 子 Tab 定义
const SQUARE_SUB_TABS = [
  { id: 'templates', label: '模板管理', icon: 'grid_view' },
  { id: 'creators', label: '达人管理', icon: 'group' },
  { id: 'automation', label: '自动化', icon: 'auto_awesome' },
] as const;

type SquareSubTab = typeof SQUARE_SUB_TABS[number]['id'];

// 分类选项
const CATEGORY_OPTIONS = [
  { value: '女装', label: '女装' },
  { value: '男装', label: '男装' },
  { value: '男童装', label: '男童装' },
  { value: '女童装', label: '女童装' },
];

/**
 * 模板数据结构
 */
interface SquareTemplate {
  id: string;
  title: string;
  category: string;
  author: string;
  coverUrl: string;
  videoUrl: string | null;
  views: number;
  likes: number;
  sortOrder: number;
  isEnabled: boolean;
  creatorId: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewerId: string | null;
  reviewedAt: number | null;
  rejectReason: string | null;
  createdAt: number;
  updatedAt: number;
  coverFile?: File | null;
  videoFile?: File | null;
}

/**
 * 分页响应结构
 */
interface PaginatedResponse {
  success: boolean;
  data: SquareTemplate[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * 上传封面响应
 */
interface UploadCoverResponse {
  success: boolean;
  data: { coverUrl: string };
}

/**
 * 上传视频响应
 */
interface UploadVideoResponse {
  success: boolean;
  data: { videoUrl: string };
}

/**
 * 创作广场模板管理组件
 */
export const SquareTemplateManagement: React.FC = () => {
  const token = useAppStore((state) => state.token);
  const { confirm } = useConfirm();

  // 子 Tab 状态
  const [activeSubTab, setActiveSubTab] = useState<SquareSubTab>('templates');

  // 列表数据状态
  const [templateList, setTemplateList] = useState<SquareTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [reviewStatusFilter, setReviewStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // 编辑弹窗状态
  const [editingTemplate, setEditingTemplate] = useState<Partial<SquareTemplate> | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const editCoverInputRef = useRef<HTMLInputElement>(null);
  const editVideoInputRef = useRef<HTMLInputElement>(null);
  const editVideoRef = useRef<HTMLVideoElement>(null);

  // 新增弹窗状态
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState<{
    title: string;
    category: string;
    author: string;
    coverUrl: string;
    videoUrl: string;
    views: number;
    likes: number;
    sortOrder: number;
    isEnabled: boolean;
    coverFile: File | null;
    videoFile: File | null;
  }>({
    title: '',
    category: '女装',
    author: '',
    coverUrl: '',
    videoUrl: '',
    views: 0,
    likes: 0,
    sortOrder: 0,
    isEnabled: true,
    coverFile: null,
    videoFile: null,
  });
  const addCoverInputRef = useRef<HTMLInputElement>(null);
  const addVideoInputRef = useRef<HTMLInputElement>(null);
  const addVideoRef = useRef<HTMLVideoElement>(null);

  // 预览状态
  const [previewMedia, setPreviewMedia] = useState<{ type: 'image' | 'video'; url: string } | null>(null);

  // 首帧截取失败提示
  const [firstFrameExtractFailed, setFirstFrameExtractFailed] = useState(false);

  // 审核弹窗状态
  const [reviewModal, setReviewModal] = useState<{ open: boolean; template: SquareTemplate | null; action: 'approve' | 'reject'; reason: string }>({
    open: false,
    template: null,
    action: 'approve',
    reason: '',
  });

  // 保存中状态
  const [isSaving, setIsSaving] = useState(false);

  // 操作菜单状态
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // 批量选择状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 批量审核弹窗状态
  const [batchReviewModal, setBatchReviewModal] = useState<{ open: boolean; action: 'approve' | 'reject'; reason: string }>({
    open: false,
    action: 'approve',
    reason: '',
  });

  /**
   * 统一的 API 请求函数
   * 使用 createApiRequest，401 由 backendApi.request.ts 统一拦截
   */
  const apiRequest = useCallback(createApiRequest(token), [token]);

  /**
   * 加载模板列表
   */
  const loadTemplateList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...(search && { search }),
        ...(categoryFilter && { category: categoryFilter }),
        ...(reviewStatusFilter && { reviewStatus: reviewStatusFilter }),
      });
      const data: PaginatedResponse = await apiRequest(`/admin/square-templates?${params}`);
      if (data.success) {
        setTemplateList(data.data);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (error) {
      console.error('加载模板列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, reviewStatusFilter, token, apiRequest]);

  useEffect(() => {
    loadTemplateList();
  }, [loadTemplateList]);

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

  /**
   * 上传封面图片
   * 支持 File 和 Blob 类型
   */
  const uploadCover = useCallback(async (file: File | Blob): Promise<string | null> => {
    try {
      const formData = new FormData();
      // Blob 需要转换为 File 格式才能上传
      if (file instanceof Blob && !(file instanceof File)) {
        const fileFromBlob = new File([file], `cover_${Date.now()}.jpg`, { type: 'image/jpeg' });
        formData.append('file', fileFromBlob);
      } else {
        formData.append('file', file);
      }
      const data = await apiRequest('/admin/square-templates/upload-cover', {
        method: 'POST',
        body: formData,
      }) as UploadCoverResponse;
      if (data.success) {
        return data.data.coverUrl;
      }
      return null;
    } catch (error) {
      console.error('上传封面失败:', error);
      return null;
    }
  }, [apiRequest]);

  /**
   * 上传视频
   */
  const uploadVideo = useCallback(async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await apiRequest('/admin/square-templates/upload-video', {
        method: 'POST',
        body: formData,
      }) as UploadVideoResponse;
      if (data.success) {
        return data.data.videoUrl;
      }
      return null;
    } catch (error) {
      console.error('上传视频失败:', error);
      return null;
    }
  }, [apiRequest]);

  /**
   * 打开编辑弹窗
   */
  const openEditModal = useCallback((template: SquareTemplate) => {
    setEditingTemplate({ ...template, coverFile: null, videoFile: null });
    setIsEditModalOpen(true);
  }, []);

  /**
   * 编辑保存
   */
  const handleEditSave = useCallback(async () => {
    if (!editingTemplate) return;

    try {
      let coverUrl = editingTemplate.coverUrl;
      let videoUrl = editingTemplate.videoUrl;

      // 如果有新上传的封面，先上传
      if (editingTemplate.coverFile) {
        const uploadedUrl = await uploadCover(editingTemplate.coverFile);
        if (uploadedUrl) {
          coverUrl = uploadedUrl;
        }
      }

      // 如果有新上传的视频，先上传
      if (editingTemplate.videoFile) {
        const uploadedUrl = await uploadVideo(editingTemplate.videoFile);
        if (uploadedUrl) {
          videoUrl = uploadedUrl;
        }
      }

      // 更新模板信息
      await apiRequest(`/admin/square-templates/${editingTemplate.id}`, {
        method: 'PUT',
        body: {
          title: editingTemplate.title,
          category: editingTemplate.category,
          author: editingTemplate.author,
          coverUrl,
          videoUrl,
          views: editingTemplate.views,
          likes: editingTemplate.likes,
          sortOrder: editingTemplate.sortOrder,
          isEnabled: editingTemplate.isEnabled,
        },
      });

      setIsEditModalOpen(false);
      setEditingTemplate(null);
      loadTemplateList();
    } catch (error) {
      console.error('更新模板失败:', error);
    }
  }, [editingTemplate, apiRequest, uploadCover, uploadVideo, loadTemplateList]);

  /**
   * 新增模板保存
   */
  const handleAddSave = useCallback(async () => {
    // 验证必填字段
    if (!newTemplate.title) {
      alert('请填写标题');
      return;
    }

    setIsSaving(true);
    try {
      let coverUrl = newTemplate.coverUrl;
      let videoUrl = newTemplate.videoUrl;

      // 如果有上传的封面，先上传
      if (newTemplate.coverFile) {
        const uploadedUrl = await uploadCover(newTemplate.coverFile);
        if (uploadedUrl) {
          coverUrl = uploadedUrl;
        }
      }

      // 如果有上传的视频，先上传
      if (newTemplate.videoFile) {
        const uploadedUrl = await uploadVideo(newTemplate.videoFile);
        if (uploadedUrl) {
          videoUrl = uploadedUrl;
        }
      }

      // 检查封面是否存在（截取或手动上传）
      if (!coverUrl) {
        alert('请上传视频以自动生成封面，或手动上传封面图片');
        return;
      }

      // 创建模板
      await apiRequest('/admin/square-templates', {
        method: 'POST',
        body: {
          title: newTemplate.title,
          category: newTemplate.category,
          author: newTemplate.author,
          coverUrl,
          videoUrl: videoUrl || null,
          views: newTemplate.views,
          likes: newTemplate.likes,
          sortOrder: newTemplate.sortOrder,
          isEnabled: newTemplate.isEnabled,
          reviewStatus: 'approved', // 管理员创建的模板直接审核通过
        },
      });

      setIsAddModalOpen(false);
      // 重置表单
      setNewTemplate({
        title: '',
        category: '女装',
        author: '',
        coverUrl: '',
        videoUrl: '',
        views: 0,
        likes: 0,
        sortOrder: 0,
        isEnabled: true,
        coverFile: null,
        videoFile: null,
      });
      setFirstFrameExtractFailed(false);
      loadTemplateList();
    } catch (error) {
      console.error('创建模板失败:', error);
    } finally {
      setIsSaving(false);
    }
  }, [newTemplate, apiRequest, uploadCover, uploadVideo, loadTemplateList]);

  /**
   * 删除模板
   */
  const handleDelete = useCallback(async (id: string) => {
    const confirmed = await confirm('删除后无法恢复，确定要删除此模板吗？', '确认删除？');
    if (!confirmed) return;
    try {
      await apiRequest(`/admin/square-templates/${id}`, {
        method: 'DELETE',
      });
      loadTemplateList();
    } catch (error) {
      console.error('删除模板失败:', error);
    }
  }, [apiRequest, loadTemplateList, confirm]);

  /**
   * 切换启用状态
   */
  const toggleEnabled = useCallback(async (template: SquareTemplate) => {
    const message = template.isEnabled ? '禁用后该模板将不在首页和创作广场展示。' : '启用后该模板将在首页和创作广场展示。';
    const confirmed = await confirm(message, template.isEnabled ? '确认禁用？' : '确认启用？');
    if (!confirmed) return;
    try {
      await apiRequest(`/admin/square-templates/${template.id}`, {
        method: 'PUT',
        body: {
          isEnabled: !template.isEnabled,
        },
      });
      loadTemplateList();
    } catch (error) {
      console.error('更新状态失败:', error);
    }
  }, [apiRequest, loadTemplateList, confirm]);

  /**
   * 打开审核弹窗
   */
  const openReviewModal = useCallback((template: SquareTemplate, action: 'approve' | 'reject') => {
    setReviewModal({ open: true, template, action, reason: '' });
  }, []);

  /**
   * 执行审核
   */
  const handleReview = useCallback(async () => {
    if (!reviewModal.template) return;
    if (reviewModal.action === 'reject' && !reviewModal.reason.trim()) {
      alert('拒绝时必须填写理由');
      return;
    }

    try {
      await apiRequest(`/admin/square-templates/${reviewModal.template.id}/review`, {
        method: 'POST',
        body: {
          action: reviewModal.action,
          reason: reviewModal.action === 'reject' ? reviewModal.reason.trim() : undefined,
        },
      });
      setReviewModal({ open: false, template: null, action: 'approve', reason: '' });
      loadTemplateList();
    } catch (error) {
      console.error('审核失败:', error);
      alert('审核失败，请重试');
    }
  }, [reviewModal, apiRequest, loadTemplateList]);

  /**
   * 执行批量审核
   */
  const handleBatchReview = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (batchReviewModal.action === 'reject' && !batchReviewModal.reason.trim()) {
      alert('拒绝时必须填写理由');
      return;
    }

    try {
      const result = await apiRequest<{ success: boolean; data: { succeeded: number; failed: number } }>('/admin/square-templates/batch-review', {
        method: 'POST',
        body: {
          ids: Array.from(selectedIds),
          action: batchReviewModal.action,
          reason: batchReviewModal.action === 'reject' ? batchReviewModal.reason.trim() : undefined,
        },
      });
      if (result.success) {
        alert(`批量审核完成：成功 ${result.data.succeeded} 个，失败 ${result.data.failed} 个`);
        setSelectedIds(new Set());
        setBatchReviewModal({ open: false, action: 'approve', reason: '' });
        loadTemplateList();
      }
    } catch (error) {
      console.error('批量审核失败:', error);
      alert('批量审核失败，请重试');
    }
  }, [selectedIds, batchReviewModal, apiRequest, loadTemplateList]);

  /**
   * 切换全选
   */
  const toggleSelectAll = useCallback(() => {
    // 只选择当前页的 pending 状态模板
    const pendingIds = templateList.filter(t => t.reviewStatus === 'pending').map(t => t.id);
    if (selectedIds.size === pendingIds.length && pendingIds.every(id => selectedIds.has(id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingIds));
    }
  }, [templateList, selectedIds]);

  /**
   * 切换单选
   */
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  /**
   * 处理新增封面文件选择
   */
  const handleAddCoverChange = useCallback((file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setNewTemplate(prev => {
      if (prev.coverUrl?.startsWith('blob:')) URL.revokeObjectURL(prev.coverUrl);
      return {
        ...prev,
        coverUrl: url,
        coverFile: file,
      };
    });
  }, []);

  /**
   * 处理新增视频文件选择
   * 上传视频后自动截取首帧作为封面预览
   */
  const handleAddVideoChange = useCallback(async (file: File | null) => {
    if (!file) return;

    // 显示视频预览
    const videoUrl = URL.createObjectURL(file);
    setNewTemplate(prev => {
      if (prev.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(prev.videoUrl);
      return {
        ...prev,
        videoUrl: videoUrl,
        videoFile: file,
      };
    });

    // 尝试截取首帧
    setFirstFrameExtractFailed(false);
    try {
      const result = await extractFirstFrame({ videoFile: file });
      // 截取成功，自动填充封面
      setNewTemplate(prev => ({
        ...prev,
        coverUrl: result.url,
        coverFile: result.blob as File, // 存储 Blob 用于后续上传
      }));
    } catch (error) {
      console.error('[handleAddVideoChange] 首帧截取失败:', error);
      setFirstFrameExtractFailed(true);
    }
  }, []);

  /**
   * 处理编辑封面文件选择
   */
  const handleEditCoverChange = useCallback((file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setEditingTemplate(prev => {
      if (!prev) return null;
      if (prev.coverUrl?.startsWith('blob:')) URL.revokeObjectURL(prev.coverUrl);
      return { ...prev, coverUrl: url, coverFile: file };
    });
  }, []);

  /**
   * 处理编辑视频文件选择
   */
  const handleEditVideoChange = useCallback((file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setEditingTemplate(prev => {
      if (!prev) return null;
      if (prev.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(prev.videoUrl);
      return { ...prev, videoUrl: url, videoFile: file };
    });
  }, []);


  /**
   * 格式化日期
   */
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden bg-[#FDFBF7]">
        {/* 头部 */}
        <header className="px-6 py-4 border-b border-gray-100 bg-white">
          <div className="flex items-center justify-between relative">
            <div>
              <h1 className="text-xl font-bold text-text-primary">创作广场管理</h1>
              <p className="text-sm text-text-secondary mt-1">
                {activeSubTab === 'templates' ? `共 ${total} 条记录` :
                 activeSubTab === 'creators' ? '达人管理与发现' :
                 '自动化配置与运行记录'}
              </p>
            </div>
            {/* 子 Tab 切换 — 绝对居中 */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              {SQUARE_SUB_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    activeSubTab === tab.id
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span className="material-icons-round text-base">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
            {activeSubTab === 'templates' && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
            >
              <span className="material-icons-round text-lg">add</span>
              新增模板
            </button>
            )}
          </div>
        </header>

        {/* 搜索和筛选 */}
        {activeSubTab === 'templates' && (<>
        <div className="px-6 py-4 bg-white border-b border-gray-100">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px] max-w-md relative">
              <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                search
              </span>
              <input
                type="text"
                placeholder="搜索标题或作者..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                onKeyDown={(e) => { if (e.key === 'Enter') loadTemplateList(); }}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <button
              onClick={() => loadTemplateList()}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-text-secondary hover:border-primary hover:text-primary transition-colors"
              title="刷新数据"
            >
              <span className="material-icons-round text-lg">refresh</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-secondary">分类:</span>
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="">全部</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-secondary">审核状态:</span>
              <select
                value={reviewStatusFilter}
                onChange={(e) => { setReviewStatusFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="">全部</option>
                <option value="pending">待审核</option>
                <option value="approved">已通过</option>
                <option value="rejected">已拒绝</option>
              </select>
            </div>
            {/* 批量审核按钮 */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-text-secondary">已选 {selectedIds.size} 条</span>
                <button
                  onClick={() => setBatchReviewModal({ open: true, action: 'approve', reason: '' })}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  <span className="material-icons-round text-base">check_circle</span>
                  批量通过
                </button>
                <button
                  onClick={() => setBatchReviewModal({ open: true, action: 'reject', reason: '' })}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  <span className="material-icons-round text-base">cancel</span>
                  批量拒绝
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-text-secondary hover:border-gray-300 transition-colors"
                >
                  取消选择
                </button>
              </div>
            )}
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
              <span className="material-icons-round text-6xl mb-4">grid_view</span>
              <p>暂无模板数据</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {/* 批量选择 checkbox */}
                    <th className="px-4 py-3 text-left w-12">
                      <input
                        type="checkbox"
                        checked={templateList.filter(t => t.reviewStatus === 'pending').length > 0 &&
                          templateList.filter(t => t.reviewStatus === 'pending').every(t => selectedIds.has(t.id))}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                        title="全选待审核项"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-16">
                      封面
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      标题
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-24">
                      分类
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-28">
                      作者
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-36">
                      审核状态
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-28">
                      状态
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider w-24">
                      创建时间
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider w-32">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {templateList.map((template) => (
                    <tr key={template.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(template.id) ? 'bg-primary-50' : ''}`}>
                      {/* 批量选择 checkbox */}
                      <td className="px-4 py-3">
                        {template.reviewStatus === 'pending' && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(template.id)}
                            onChange={() => toggleSelect(template.id)}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                          />
                        )}
                      </td>
                      {/* 封面（集成视频播放） */}
                      <td className="px-4 py-3">
                        {template.coverUrl ? (
                          <div
                            className="relative w-12 h-16 rounded-lg overflow-hidden cursor-pointer group"
                            onClick={() => setPreviewMedia({ type: 'image', url: template.coverUrl })}
                          >
                            <img
                              src={template.coverUrl}
                              alt={template.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <span className="material-icons-round text-white text-sm">zoom_in</span>
                            </div>
                            {template.videoUrl && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewMedia({ type: 'video', url: template.videoUrl! });
                                }}
                                className="absolute bottom-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 hover:bg-primary flex items-center justify-center transition-colors"
                                title="播放视频"
                              >
                                <span className="material-icons-round text-white text-xs" style={{ fontSize: '12px' }}>play_arrow</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="w-12 h-16 rounded-lg bg-gray-200 flex items-center justify-center">
                            <span className="material-icons-round text-gray-400 text-sm">image</span>
                          </div>
                        )}
                      </td>
                      {/* 标题 */}
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-text-primary line-clamp-2 max-w-xs" title={template.title}>
                          {template.title}
                        </p>
                      </td>
                      {/* 分类 */}
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-gray-100 text-text-secondary text-xs rounded-lg">
                          {template.category}
                        </span>
                      </td>
                      {/* 作者 */}
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {template.author}
                      </td>
                      {/* 审核状态 */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-lg font-medium ${
                            template.reviewStatus === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                            template.reviewStatus === 'rejected' ? 'bg-red-50 text-red-700' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                            <span className="material-icons-round text-xs">
                              {template.reviewStatus === 'approved' ? 'check_circle' :
                               template.reviewStatus === 'rejected' ? 'cancel' :
                               'schedule'}
                            </span>
                            {template.reviewStatus === 'approved' ? '已通过' :
                             template.reviewStatus === 'rejected' ? '已拒绝' : '待审核'}
                          </span>
                          {template.reviewStatus === 'rejected' && template.rejectReason && (
                            <span className="text-[10px] text-red-500 truncate" title={template.rejectReason}>
                              {template.rejectReason}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* 状态 */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => toggleEnabled(template)}
                          className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
                            template.isEnabled
                              ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                              : 'bg-red-50 text-red-500 hover:bg-red-100'
                          }`}
                          title={template.isEnabled ? '点击禁用该模板' : '点击启用该模板'}
                        >
                          <span className="material-icons-round text-xs">
                            {template.isEnabled ? 'toggle_on' : 'toggle_off'}
                          </span>
                          {template.isEnabled ? '已启用' : '已禁用'}
                        </button>
                      </td>
                      {/* 创建时间 */}
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {formatDate(template.createdAt)}
                      </td>
                      {/* 操作 - 折叠为 ... 弹出菜单 */}
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
                            {template.reviewStatus === 'pending' && (
                              <>
                                <button
                                  onClick={() => { setOpenMenuId(null); openReviewModal(template, 'approve'); }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-50 transition-colors"
                                >
                                  <span className="material-icons-round" style={{ fontSize: '16px' }}>check_circle</span>
                                  通过
                                </button>
                                <button
                                  onClick={() => { setOpenMenuId(null); openReviewModal(template, 'reject'); }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <span className="material-icons-round" style={{ fontSize: '16px' }}>cancel</span>
                                  拒绝
                                </button>
                                <div className="my-1 border-t border-gray-100" />
                              </>
                            )}
                            <button
                              onClick={() => { setOpenMenuId(null); openEditModal(template); }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-gray-50 transition-colors"
                            >
                              <span className="material-icons-round" style={{ fontSize: '16px' }}>edit</span>
                              编辑
                            </button>
                            <button
                              onClick={() => { setOpenMenuId(null); handleDelete(template.id); }}
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
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-50 hover:border-primary hover:text-primary transition-colors"
              >
                上一页
              </button>
              <span className="text-sm text-text-secondary">
                第 {page} / {totalPages} 页
              </span>
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
        </>) } {/* end templates tab */}

        {/* 达人管理 Tab */}
        {activeSubTab === 'creators' && (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" /></div>}>
            <SquareCreatorManagement />
          </Suspense>
        )}

        {/* 自动化 Tab */}
        {activeSubTab === 'automation' && (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" /></div>}>
            <SquareAutomationTab />
          </Suspense>
        )}

        {/* 媒体预览弹窗 - z-index 高于编辑弹窗 */}
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
                <img
                  src={previewMedia.url}
                  alt="预览"
                  className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
                />
              ) : (
                <video
                  src={previewMedia.url}
                  controls
                  autoPlay
                  className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
                />
              )}
            </div>
          </div>
        )}

        {/* 审核弹窗 */}
        {reviewModal.open && reviewModal.template && (
          <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-bold text-text-primary">
                  {reviewModal.action === 'approve' ? '审核通过' : '拒绝发布'}
                </h3>
                <button
                  onClick={() => setReviewModal({ open: false, template: null, action: 'approve', reason: '' })}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <span className="material-icons-round">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="text-sm text-text-secondary">
                  <p>模板：<span className="font-medium text-text-primary">{reviewModal.template.title}</span></p>
                  <p className="mt-1">分类：{reviewModal.template.category}</p>
                </div>
                {reviewModal.action === 'reject' && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      拒绝理由 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={reviewModal.reason}
                      onChange={(e) => setReviewModal(prev => ({ ...prev, reason: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
                      placeholder="请填写拒绝理由"
                      autoFocus
                    />
                  </div>
                )}
                {reviewModal.action === 'approve' && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg text-sm text-emerald-700">
                    <span className="material-icons-round">info</span>
                    审核通过后，该模板将在首页和创作广场展示。
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => setReviewModal({ open: false, template: null, action: 'approve', reason: '' })}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-primary hover:text-primary transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleReview}
                  className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${
                    reviewModal.action === 'approve'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {reviewModal.action === 'approve' ? '确认通过' : '确认拒绝'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 批量审核弹窗 */}
        {batchReviewModal.open && (
          <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-bold text-text-primary">
                  {batchReviewModal.action === 'approve' ? '批量审核通过' : '批量拒绝'}
                </h3>
                <button
                  onClick={() => setBatchReviewModal({ open: false, action: 'approve', reason: '' })}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <span className="material-icons-round">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="text-sm text-text-secondary">
                  <p>已选择 <span className="font-medium text-primary">{selectedIds.size}</span> 条待审核模板</p>
                </div>
                {batchReviewModal.action === 'reject' && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      拒绝理由 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={batchReviewModal.reason}
                      onChange={(e) => setBatchReviewModal(prev => ({ ...prev, reason: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
                      placeholder="请填写拒绝理由（将应用到所有选中模板）"
                      autoFocus
                    />
                  </div>
                )}
                {batchReviewModal.action === 'approve' && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg text-sm text-emerald-700">
                    <span className="material-icons-round">info</span>
                    审核通过后，这些模板将在首页和创作广场展示。
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => setBatchReviewModal({ open: false, action: 'approve', reason: '' })}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-primary hover:text-primary transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleBatchReview}
                  className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${
                    batchReviewModal.action === 'approve'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {batchReviewModal.action === 'approve' ? '确认通过' : '确认拒绝'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 新增模板弹窗 */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
                <h3 className="text-lg font-bold text-text-primary">新增模板</h3>
                <button
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setNewTemplate({
                      title: '',
                      category: '女装',
                      author: '',
                      coverUrl: '',
                      videoUrl: '',
                      views: 0,
                      likes: 0,
                      sortOrder: 0,
                      isEnabled: true,
                      coverFile: null,
                      videoFile: null,
                    });
                    setFirstFrameExtractFailed(false);
                  }}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <span className="material-icons-round">close</span>
                </button>
              </div>
              <div className="p-6 space-y-5">
                {/* 标题 */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">标题 *</label>
                  <input
                    type="text"
                    value={newTemplate.title}
                    onChange={(e) => setNewTemplate(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    placeholder="请输入模板标题"
                  />
                </div>
                {/* 分类和作者 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">分类</label>
                    <select
                      value={newTemplate.category}
                      onChange={(e) => setNewTemplate(prev => ({ ...prev, category: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    >
                      {CATEGORY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">作者</label>
                    <input
                      type="text"
                      value={newTemplate.author}
                      onChange={(e) => setNewTemplate(prev => ({ ...prev, author: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      placeholder="例如：@sarahk_style"
                    />
                  </div>
                </div>
                {/* 视频和封面 - 并排布局，先选视频 */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">视频与封面</label>
                  <p className="text-xs text-text-muted mb-3">上传视频后自动截取首帧作为封面，点击可预览或替换</p>
                  <div className="flex items-start gap-6">
                    {/* 视频 */}
                    <div className="flex flex-col items-center">
                      <input
                        ref={addVideoInputRef}
                        type="file"
                        accept="video/*"
                        onChange={(e) => handleAddVideoChange(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <div
                        className="relative cursor-pointer rounded-xl overflow-hidden transition-all duration-200 hover:shadow-lg group"
                        onClick={(e) => {
                          // 如果点击的是删除按钮，不触发上传/播放
                          if ((e.target as HTMLElement).closest('.delete-btn')) return;

                          if (newTemplate.videoUrl) {
                            const video = e.currentTarget.querySelector('video');
                            if (video) {
                              if (video.paused) {
                                video.play();
                              } else {
                                video.pause();
                              }
                            }
                          } else {
                            addVideoInputRef.current?.click();
                          }
                        }}
                      >
                        {newTemplate.videoUrl ? (
                          <>
                            <video
                              ref={addVideoRef}
                              src={newTemplate.videoUrl}
                              className="w-28 h-40 object-cover rounded-xl border border-gray-200 bg-black"
                              playsInline
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-xl transition-opacity">
                              <span className="material-icons-round text-white text-3xl">play_circle_outline</span>
                            </div>
                            {/* 删除按钮 */}
                            <button
                              type="button"
                              className="delete-btn absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-red-500 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                // 清空状态
                                setNewTemplate(prev => ({
                                  ...prev,
                                  videoUrl: '',
                                  videoFile: null,
                                  coverUrl: '',
                                  coverFile: null,
                                }));
                                setFirstFrameExtractFailed(false);
                                // 清空 input value，允许重新选择同一文件
                                if (addVideoInputRef.current) {
                                  addVideoInputRef.current.value = '';
                                }
                                if (addCoverInputRef.current) {
                                  addCoverInputRef.current.value = '';
                                }
                              }}
                            >
                              <span className="material-icons-round text-white text-sm">close</span>
                            </button>
                          </>
                        ) : (
                          <div className="w-28 h-40 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 hover:from-primary-50 hover:to-primary-100 hover:border-primary transition-all">
                            <span className="material-icons-round text-gray-400 text-3xl mb-2">videocam_add</span>
                            <span className="text-sm text-gray-500 font-medium">上传视频</span>
                            <span className="text-xs text-gray-400 mt-1">支持 MP4</span>
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-text-muted mt-2">视频</span>
                    </div>
                    {/* 封面 */}
                    <div className="flex flex-col items-center">
                      <input
                        ref={addCoverInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleAddCoverChange(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <div
                        className="relative cursor-pointer rounded-xl overflow-hidden transition-all duration-200 hover:shadow-lg group"
                        onClick={(e) => {
                          // 如果点击的是删除按钮，不触发预览/上传
                          if ((e.target as HTMLElement).closest('.delete-btn')) return;

                          if (newTemplate.coverUrl) {
                            setPreviewMedia({ type: 'image', url: newTemplate.coverUrl });
                          } else {
                            addCoverInputRef.current?.click();
                          }
                        }}
                      >
                        {newTemplate.coverUrl ? (
                          <>
                            <img
                              src={newTemplate.coverUrl}
                              alt="封面预览"
                              className="w-28 h-40 object-cover rounded-xl border border-gray-200"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-xl transition-opacity">
                              <span className="material-icons-round text-white text-3xl">zoom_in</span>
                            </div>
                            {/* 删除按钮 */}
                            <button
                              type="button"
                              className="delete-btn absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-red-500 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNewTemplate(prev => ({
                                  ...prev,
                                  coverUrl: '',
                                  coverFile: null,
                                }));
                                // 清空 input value，允许重新选择同一文件
                                if (addCoverInputRef.current) {
                                  addCoverInputRef.current.value = '';
                                }
                              }}
                            >
                              <span className="material-icons-round text-white text-sm">close</span>
                            </button>
                          </>
                        ) : (
                          <div className="w-28 h-40 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 hover:from-primary-50 hover:to-primary-100 hover:border-primary transition-all">
                            <span className="material-icons-round text-gray-400 text-3xl mb-2">add_photo_alternate</span>
                            <span className="text-sm text-gray-500 font-medium">上传封面</span>
                            <span className="text-xs text-gray-400 mt-1">可选</span>
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-text-muted mt-2">封面</span>
                    </div>
                  </div>
                  {/* 首帧截取失败提示 */}
                  {firstFrameExtractFailed && (
                    <p className="mt-3 text-sm text-orange-500 flex items-center gap-1">
                      <span className="material-icons-round text-base">warning</span>
                      自动截取首帧失败，请手动上传封面图片
                    </p>
                  )}
                </div>
                {/* 浏览量和点赞数 */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">浏览量</label>
                    <input
                      type="number"
                      value={newTemplate.views}
                      onChange={(e) => setNewTemplate(prev => ({ ...prev, views: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">点赞数</label>
                    <input
                      type="number"
                      value={newTemplate.likes}
                      onChange={(e) => setNewTemplate(prev => ({ ...prev, likes: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">排序</label>
                    <input
                      type="number"
                      value={newTemplate.sortOrder}
                      onChange={(e) => setNewTemplate(prev => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                </div>
                {/* 启用状态 */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="add-isEnabled"
                    checked={newTemplate.isEnabled}
                    onChange={(e) => setNewTemplate(prev => ({ ...prev, isEnabled: e.target.checked }))}
                    className="shrink-0"
                  />
                  <label htmlFor="add-isEnabled" className="text-sm text-text-secondary">启用</label>
                </div>
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
                <button
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setNewTemplate({
                      title: '',
                      category: '女装',
                      author: '',
                      coverUrl: '',
                      videoUrl: '',
                      views: 0,
                      likes: 0,
                      sortOrder: 0,
                      isEnabled: true,
                      coverFile: null,
                      videoFile: null,
                    });
                    setFirstFrameExtractFailed(false);
                  }}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-primary hover:text-primary transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleAddSave}
                  disabled={!newTemplate.title || !newTemplate.videoUrl || isSaving}
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

        {/* 编辑模板弹窗 */}
        {isEditModalOpen && editingTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
                <h3 className="text-lg font-bold text-text-primary">编辑模板</h3>
                <button
                  onClick={() => { setIsEditModalOpen(false); setEditingTemplate(null); }}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <span className="material-icons-round">close</span>
                </button>
              </div>
              <div className="p-6 space-y-5">
                {/* 标题 */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">标题</label>
                  <input
                    type="text"
                    value={editingTemplate.title || ''}
                    onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, title: e.target.value } : null)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                {/* 分类和作者 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">分类</label>
                    <select
                      value={editingTemplate.category || ''}
                      onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, category: e.target.value } : null)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    >
                      {CATEGORY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">作者</label>
                    <input
                      type="text"
                      value={editingTemplate.author || ''}
                      onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, author: e.target.value } : null)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                </div>
                {/* 封面 */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">封面</label>
                  <div className="flex items-start gap-4">
                    <label className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-gray-300 text-sm cursor-pointer transition-colors hover:border-primary hover:text-primary">
                      <input
                        ref={editCoverInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleEditCoverChange(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <span className="material-icons-round text-lg">upload_file</span>
                      更换封面
                    </label>
                    {editingTemplate.coverUrl && (
                      <div
                        className="relative cursor-pointer group"
                        onClick={() => setPreviewMedia({ type: 'image', url: editingTemplate.coverUrl! })}
                      >
                        <img
                          src={editingTemplate.coverUrl}
                          alt="封面预览"
                          className="w-24 h-32 object-cover rounded-lg border border-gray-200"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-lg transition-opacity">
                          <span className="material-icons-round text-white">zoom_in</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {/* 视频 */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">视频</label>
                  <div className="flex items-start gap-4">
                    <label className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-gray-300 text-sm cursor-pointer transition-colors hover:border-primary hover:text-primary">
                      <input
                        ref={editVideoInputRef}
                        type="file"
                        accept="video/*"
                        onChange={(e) => handleEditVideoChange(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <span className="material-icons-round text-lg">video_file</span>
                      更换视频
                    </label>
                    {editingTemplate.videoUrl && (
                      <div className="flex items-center gap-2">
                        <video
                          ref={editVideoRef}
                          src={editingTemplate.videoUrl}
                          className="w-24 h-32 object-cover rounded-lg border border-gray-200 bg-black"
                        />
                        <button
                          type="button"
                          onClick={() => setPreviewMedia({ type: 'video', url: editingTemplate.videoUrl! })}
                          className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                          title="全屏预览"
                        >
                          <span className="material-icons-round text-primary">fullscreen</span>
                        </button>
                      </div>
                    )}
                  </div>
                  {editingTemplate.videoFile && (
                    <p className="mt-2 text-sm text-text-muted">已选择: {editingTemplate.videoFile.name}</p>
                  )}
                </div>
                {/* 浏览量和点赞数 */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">浏览量</label>
                    <input
                      type="number"
                      value={editingTemplate.views || 0}
                      onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, views: parseInt(e.target.value) || 0 } : null)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">点赞数</label>
                    <input
                      type="number"
                      value={editingTemplate.likes || 0}
                      onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, likes: parseInt(e.target.value) || 0 } : null)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">排序</label>
                    <input
                      type="number"
                      value={editingTemplate.sortOrder || 0}
                      onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, sortOrder: parseInt(e.target.value) || 0 } : null)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                </div>
                {/* 启用状态 */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-isEnabled"
                    checked={editingTemplate.isEnabled ?? true}
                    onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, isEnabled: e.target.checked } : null)}
                    className="shrink-0"
                  />
                  <label htmlFor="edit-isEnabled" className="text-sm text-text-secondary">启用</label>
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
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default SquareTemplateManagement;