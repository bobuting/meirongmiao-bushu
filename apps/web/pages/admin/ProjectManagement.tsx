/**
 * 项目管理模块
 *
 * 功能：
 * 1. 项目列表展示（支持筛选、排序、分页）
 * 2. 异常项目快速定位
 * 3. 项目详情查看
 * 4. 项目干预操作（重置、解锁、删除等）
 */

import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '../../components/ui/Toast';
import { backendApi } from '../../services/backendApi';
import { getOssThumbnailUrl } from '../../utils/ossImage';
import { VideoPreviewModal } from '../../components/shared/VideoPreviewModal';
import { ImageLightbox } from '../../components/shared/ImageLightbox';
import { ProjectDetailModal } from './project-detail/index';
import { MigrateProjectModal } from './MigrateProjectModal';
import { GARMENT_CATEGORY_LABELS, PROJECT_STATUS_LABELS, IMAGE_PROJECT_STATUS_LABELS } from '../../../../src/contant-config/shared_dict';
import type { GarmentCategory } from '../../../../src/contant-config/shared_dict';

/** 筛选条件类型 */
interface ProjectFilters {
  projectKind: '' | 'video' | 'image' | 'reverse' | 'outfit_change';
  status: string;
  companyName: string;
  userId: string;
  anomalyType: '' | 'stuck' | 'failed_task' | 'slow_step';
  garmentCategory: '' | GarmentCategory;
  timeRange: 'today' | '7days' | '30days';
  search: string;
}

/**
 * 项目管理主组件
 */
export const ProjectManagement: React.FC = () => {
  const { token } = useAppStore(useShallow((state) => ({ token: state.token })));
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ProjectFilters>({
    projectKind: '',
    status: '',
    companyName: '',
    userId: '',
    anomalyType: '',
    garmentCategory: '',
    timeRange: '30days',
    search: '',
  });
  const [page, setPage] = useState(1);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const pageSize = 20;

  // 时间格式化（不含秒）
  const formatTimeShort = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  // 视频预览状态
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const openVideoPreview = (url: string) => setPreviewVideoUrl(url);
  const closeVideoPreview = () => setPreviewVideoUrl(null);

  // 图片预览状态
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const openImagePreview = (url: string) => setPreviewImageUrl(url);
  const closeImagePreview = () => setPreviewImageUrl(null);

  // 项目详情弹窗状态
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const openDetailModal = (projectId: string) => setDetailProjectId(projectId);
  const closeDetailModal = () => setDetailProjectId(null);

  // 迁移弹窗状态
  const [migrateProject, setMigrateProject] = useState<{
    id: string;
    name: string;
    kind: string;
  } | null>(null);
  const openMigrateModal = (id: string, name: string, kind: string) => {
    setMigrateProject({ id, name, kind });
  };
  const closeMigrateModal = () => setMigrateProject(null);

  // 干预操作弹窗状态
  const [operationType, setOperationType] = useState<string | null>(null);
  const [operationReason, setOperationReason] = useState('');
  const [isOperating, setIsOperating] = useState(false);

  const handleOperationClick = (type: string) => {
    setOperationType(type);
    setOperationReason('');
  };

  const handleOperationConfirm = async () => {
    if (!detailProjectId || !operationType || !operationReason.trim()) return;
    setIsOperating(true);
    try {
      await backendApi.performAdminOperation(token!, detailProjectId, {
        operationType: operationType as any,
        reason: operationReason,
      });
      setOperationType(null);
      setOperationReason('');
      // 刷新详情
      queryClient.invalidateQueries({ queryKey: ['admin', 'project', detailProjectId] });
    } catch (err) {
      console.error('Operation failed:', err);
    } finally {
      setIsOperating(false);
    }
  };

  // 复制到剪贴板
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`复制成功: ${text.slice(0, 8)}...`);
    } catch {
      // fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast.success(`复制成功: ${text.slice(0, 8)}...`);
    }
  }, [toast]);

  // 获取项目列表
  const { data: projectsData, isLoading: projectsLoading, error: projectsError, refetch } = useQuery({
    queryKey: ['admin', 'projects', page, filters],
    queryFn: () => backendApi.listAdminProjects(token!, {
      page,
      pageSize,
      ...(filters.projectKind && { projectKind: filters.projectKind }),
      ...(filters.status && { status: filters.status }),
      ...(filters.companyName && { companyName: filters.companyName }),
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.anomalyType && { anomalyType: filters.anomalyType }),
      ...(filters.garmentCategory && { garmentCategory: filters.garmentCategory }),
      ...(filters.timeRange && { timeRange: filters.timeRange }),
      ...(filters.search && { search: filters.search }),
    }),
    enabled: !!token,
  });

  // 获取公司列表
  const { data: companiesData } = useQuery({
    queryKey: ['admin', 'companies'],
    queryFn: () => backendApi.listAdminCompanies(token!),
    enabled: !!token,
  });

  // 获取用户列表（复用已有的 adminUsers 接口）
  const { data: usersData } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => backendApi.adminUsers(token!),
    enabled: !!token,
  });

  // 获取异常统计
  const { data: anomalyData, isLoading: anomalyLoading } = useQuery({
    queryKey: ['admin', 'anomalies'],
    queryFn: () => backendApi.getAdminAnomalies(token!),
    enabled: !!token,
  });

  // 重置筛选
  const handleReset = () => {
    setFilters({
      projectKind: '',
      status: '',
      companyName: '',
      userId: '',
      anomalyType: '',
      garmentCategory: '',
      timeRange: '30days',
      search: '',
    });
    setPage(1);
  };

  // 快速筛选异常项目
  const handleAnomalyClick = (type: 'stuck' | 'failed_task' | 'slow_step') => {
    setFilters({
      ...filters,
      anomalyType: type,
    });
    setPage(1);
  };

  return (
    <div className="h-full flex flex-col" style={{ background: 'linear-gradient(135deg, #f5f7fa 0%, #e8ecf3 100%)' }}>
      {/* 页面标题 */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50 px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">项目管理</h1>
          <span className="text-xs text-gray-400">监控项目状态、定位异常项目、执行干预操作</span>
          <div className="flex-1" />
          <button
            onClick={() => {
              backendApi.exportAdminProjects(token!, {
                ...(filters.projectKind && { projectKind: filters.projectKind }),
                ...(filters.status && { status: filters.status }),
                ...(filters.companyName && { companyName: filters.companyName }),
                ...(filters.userId && { userId: filters.userId }),
                ...(filters.anomalyType && { anomalyType: filters.anomalyType }),
                ...(filters.garmentCategory && { garmentCategory: filters.garmentCategory }),
                ...(filters.timeRange && { timeRange: filters.timeRange }),
                ...(filters.search && { search: filters.search }),
              }).catch(err => {
                console.error('Export failed:', err);
                toast.error("导出失败，请重试");
              });
            }}
            className="px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:shadow-md hover:shadow-primary/20 transition-all flex items-center gap-1.5 font-medium"
          >
            <span className="material-icons-round text-sm">download</span>
            导出
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-3">
          {/* 异常快速入口 */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 font-medium">异常</span>
            <button
              onClick={() => handleAnomalyClick('stuck')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filters.anomalyType === 'stuck'
                  ? 'bg-red-100 text-red-700 ring-1 ring-red-300'
                  : 'bg-gray-50 text-gray-600 hover:bg-red-50 hover:text-red-600'
              }`}
            >
              <span className="material-icons-round text-sm text-red-500">error_outline</span>
              <span className={filters.anomalyType === 'stuck' ? 'text-red-700' : 'text-gray-600'}>卡住</span>
              <span className={`font-bold ${filters.anomalyType === 'stuck' ? 'text-red-700' : 'text-red-500'}`}>{anomalyLoading ? '-' : (anomalyData?.stuck ?? 0)}</span>
            </button>
            <button
              onClick={() => handleAnomalyClick('failed_task')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filters.anomalyType === 'failed_task'
                  ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-300'
                  : 'bg-gray-50 text-gray-600 hover:bg-orange-50 hover:text-orange-600'
              }`}
            >
              <span className="material-icons-round text-sm text-orange-500">report_problem</span>
              <span className={filters.anomalyType === 'failed_task' ? 'text-orange-700' : 'text-gray-600'}>失败</span>
              <span className={`font-bold ${filters.anomalyType === 'failed_task' ? 'text-orange-700' : 'text-orange-500'}`}>{anomalyLoading ? '-' : (anomalyData?.failed ?? 0)}</span>
            </button>
            <button
              onClick={() => handleAnomalyClick('slow_step')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filters.anomalyType === 'slow_step'
                  ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                  : 'bg-gray-50 text-gray-600 hover:bg-amber-50 hover:text-amber-600'
              }`}
            >
              <span className="material-icons-round text-sm text-amber-500">schedule</span>
              <span className={filters.anomalyType === 'slow_step' ? 'text-amber-700' : 'text-gray-600'}>高耗时</span>
              <span className={`font-bold ${filters.anomalyType === 'slow_step' ? 'text-amber-700' : 'text-amber-500'}`}>{anomalyLoading ? '-' : (anomalyData?.slowStep ?? 0)}</span>
            </button>
            {filters.anomalyType && (
              <button
                onClick={() => { setFilters({ ...filters, anomalyType: '' }); setPage(1); }}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
              >
                <span className="material-icons-round text-sm">close</span>
                清除筛选
              </button>
            )}

            {/* 分隔符 */}
            <div className="w-px h-6 bg-gray-200 mx-2" />

            {/* 项目类型 */}
            <span className="text-xs text-gray-400 font-medium">类型</span>
            {[
              { value: '', label: '全部', icon: 'apps' },
              { value: 'video', label: '视频', icon: 'videocam' },
              { value: 'image', label: '图片', icon: 'image' },
              { value: 'reverse', label: '反推', icon: 'history' },
              { value: 'outfit_change', label: '换装', icon: 'checkroom' },
            ].map(type => (
              <button
                key={type.value}
                onClick={() => { setFilters({ ...filters, projectKind: type.value as ProjectFilters['projectKind'] }); setPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filters.projectKind === type.value
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-gray-50 text-gray-600 hover:bg-white hover:text-primary border border-gray-200'
                }`}
              >
                <span className="material-icons-round text-sm">{type.icon}</span>
                {type.label}
              </button>
            ))}
          </div>

          {/* 筛选栏 */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-gray-200/50 shadow-lg shadow-gray-200/30">
            {/* 搜索行：用户 + 状态 + 搜索 + 按钮 */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
              <select
                value={filters.userId}
                onChange={(e) => { setFilters({ ...filters, userId: e.target.value }); setPage(1); }}
                className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white/80 hover:bg-white transition-colors text-sm min-w-[160px]"
              >
                <option value="">全部用户</option>
                {usersData?.users.map((user) => (
                  <option key={user.id} value={user.id}>{user.email}</option>
                ))}
              </select>
              <select
                value={filters.status}
                onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}
                className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white/80 hover:bg-white transition-colors text-sm min-w-[140px]"
              >
                <option value="">全部状态</option>
                <option value="DRAFT">草稿</option>
                <option value="IMAGE_DRAFT">图片草稿</option>
                <option value="GARMENT_UPLOADED">已上传</option>
                <option value="IMAGE_GARMENT_UPLOADED">图片已上传</option>
                <option value="STORYBOARDING">分镜中</option>
                <option value="FILMING">视频生成中</option>
                <option value="IMAGE_MODEL_PHOTOS_READY">模特图已生成</option>
                <option value="READY_TO_PUBLISH">待发布</option>
                <option value="IMAGE_READY_TO_PUBLISH">图片待发布</option>
                <option value="PUBLISHED">已发布</option>
                <option value="IMAGE_PUBLISHED">图片已发布</option>
              </select>
              <input
                type="text"
                placeholder="搜索项目标题/ID"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white/80 hover:bg-white transition-colors text-sm"
              />
              <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all" title="刷新">
                <span className="material-icons-round text-lg text-gray-500">refresh</span>
              </button>
              <button onClick={handleReset} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all" title="重置筛选">
                <span className="material-icons-round text-lg text-gray-500">filter_list_off</span>
              </button>
              <button onClick={() => setFiltersExpanded(!filtersExpanded)} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all" title={filtersExpanded ? '收起筛选' : '展开筛选'}>
                <span className={`material-icons-round text-lg text-gray-500 transition-transform ${filtersExpanded ? 'rotate-180' : ''}`}>expand_more</span>
              </button>
            </div>

            {/* 可折叠筛选区：公司 + 服饰类型 + 时间范围 + 异常类型 */}
            {filtersExpanded && (
              <div className="grid grid-cols-4 gap-4 px-5 py-4">
                <select
                  value={filters.companyName}
                  onChange={(e) => { setFilters({ ...filters, companyName: e.target.value }); setPage(1); }}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white/80 hover:bg-white transition-colors text-sm"
                >
                  <option value="">全部公司</option>
                  {companiesData?.companies.map((company) => (
                    <option key={company} value={company}>{company}</option>
                  ))}
                </select>
                <select
                  value={filters.garmentCategory}
                  onChange={(e) => { setFilters({ ...filters, garmentCategory: e.target.value as ProjectFilters['garmentCategory'] }); setPage(1); }}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white/80 hover:bg-white transition-colors text-sm"
                >
                  <option value="">全部服饰</option>
                  {(Object.keys(GARMENT_CATEGORY_LABELS) as GarmentCategory[]).map(category => (
                    <option key={category} value={category}>{GARMENT_CATEGORY_LABELS[category]}</option>
                  ))}
                </select>
                <select
                  value={filters.timeRange}
                  onChange={(e) => { setFilters({ ...filters, timeRange: e.target.value as ProjectFilters['timeRange'] }); setPage(1); }}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white/80 hover:bg-white transition-colors text-sm"
                >
                  <option value="today">今日</option>
                  <option value="7days">近 7 天</option>
                  <option value="30days">近 30 天</option>
                </select>
              </div>
            )}
          </div>

          {/* 项目列表 */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-gray-200/50 overflow-hidden shadow-lg shadow-gray-200/30">
            {/* 表头 */}
            <div className="grid grid-cols-12 gap-2 px-5 py-4 bg-gradient-to-r from-gray-50 to-gray-100/50 border-b border-gray-200/50 text-sm font-semibold text-gray-700">
              <div className="col-span-3">项目</div>
              <div className="col-span-1">公司</div>
              <div className="col-span-1">用户</div>
              <div className="col-span-2">新建</div>
              <div className="col-span-2">更新</div>
              <div className="col-span-1">观看</div>
              <div className="col-span-1">Step</div>
              <div className="col-span-1">操作</div>
            </div>

            {/* 加载状态 */}
            {projectsLoading && (
              <div className="p-16 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
                  <span className="material-icons-round text-3xl animate-spin text-primary">refresh</span>
                </div>
                <p className="text-gray-500 font-medium">加载中...</p>
              </div>
            )}

            {/* 错误状态 */}
            {projectsError && (
              <div className="p-16 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 mb-4">
                  <span className="material-icons-round text-3xl text-red-500">error</span>
                </div>
                <p className="text-red-600 font-medium">加载失败：{(projectsError as Error).message}</p>
              </div>
            )}

            {/* 项目列表 */}
            {!projectsLoading && !projectsError && projectsData?.projects.map((project, idx) => (
              <div
                key={project.id}
                className="grid grid-cols-12 gap-2 px-5 py-4 border-b border-gray-100/50 hover:bg-gradient-to-r hover:from-gray-50/50 hover:to-white items-center transition-all duration-200"
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                {/* 项目：缩略图+标题+类型状态合并 */}
                <div className="col-span-3 flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <img
                      src={getOssThumbnailUrl(project.thumbnail || '/placeholder.png', 100)}
                      alt={project.title}
                      className="w-12 h-12 rounded-lg object-cover bg-gray-200 cursor-pointer hover:ring-2 hover:ring-primary/30 hover:shadow-lg transition-all duration-200"
                      onClick={() => {
                        if (project.projectKind !== 'image' && project.exportUrl) {
                          openVideoPreview(project.exportUrl);
                        } else if (project.thumbnail) {
                          openImagePreview(project.thumbnail);
                        }
                      }}
                    />
                    {project.projectKind !== 'image' && project.exportUrl && (
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-md border border-gray-200">
                        <span className="material-icons-round text-primary text-xs">play_arrow</span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900 truncate" title={project.publishTitle || project.title}>
                      {project.publishTitle || project.title || '-'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {/* 类型标签 */}
                      <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                        project.projectKind === 'video' ? 'bg-blue-100 text-blue-700' :
                        project.projectKind === 'image' ? 'bg-purple-100 text-purple-700' :
                        project.projectKind === 'reverse' ? 'bg-green-100 text-green-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {project.projectKind === 'video' ? '视频' : project.projectKind === 'image' ? '图片' : project.projectKind === 'reverse' ? '反推' : '换装'}
                      </span>
                      {/* 状态标签 */}
                      <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                        project.status === 'PUBLISHED' || project.status === 'IMAGE_PUBLISHED' ? 'bg-emerald-100 text-emerald-700' :
                        project.status === 'READY_TO_PUBLISH' || project.status === 'IMAGE_READY_TO_PUBLISH' ? 'bg-sky-100 text-sky-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {getStatusLabel(project.status, project.projectKind)}
                      </span>
                      {/* 复制ID按钮 */}
                      <button
                        onClick={() => copyToClipboard(project.id)}
                        className="p-0.5 text-gray-400 hover:text-primary rounded transition-colors"
                        title={`复制项目ID: ${project.id}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                <div className="col-span-1 text-sm text-gray-600 truncate" title={project.companyName}>
                  {project.companyName || '-'}
                </div>
                <div className="col-span-1 text-sm text-gray-600 truncate" title={project.userEmail}>
                  {project.userEmail || '-'}
                </div>
                {/* 新建时间 */}
                <div className="col-span-2 text-sm text-gray-600 whitespace-nowrap">
                  {project.createdAt ? formatTimeShort(project.createdAt) : '-'}
                </div>
                {/* 更新时间 */}
                <div className="col-span-2 text-sm text-gray-600 whitespace-nowrap">
                  {project.updatedAt ? formatTimeShort(project.updatedAt) : '-'}
                </div>
                {/* 观看数 */}
                <div className="col-span-1 text-sm text-gray-600">
                  {project.views ?? 0}
                </div>
                {/* Step 进度 */}
                <div className="col-span-1">
                  <StepProgress
                    current={project.currentStep}
                    total={project.projectKind === 'outfit_change' ? 4 : project.totalSteps}
                  />
                </div>
                {/* 操作 */}
                <div className="col-span-1 flex items-center gap-1">
                  <button
                    onClick={() => openDetailModal(project.id)}
                    className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
                    title="查看详情"
                  >
                    <span className="material-icons-round text-gray-500 hover:text-primary">more_vert</span>
                  </button>
                  <button
                    onClick={() => openMigrateModal(project.id, project.publishTitle || project.title, project.projectKind)}
                    className="p-2 rounded-xl hover:bg-blue-50 transition-colors"
                    title="迁移到正式库"
                  >
                    <span className="material-icons-round text-gray-400 hover:text-blue-500">sync_alt</span>
                  </button>
                </div>
              </div>
            ))}

            {/* 空状态 */}
            {!projectsLoading && !projectsError && projectsData?.projects.length === 0 && (
              <div className="px-4 py-16 text-center text-gray-500">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 mb-4">
                  <span className="material-icons-round text-3xl text-gray-400">folder_open</span>
                </div>
                <p className="font-medium">暂无项目</p>
              </div>
            )}

            {/* 分页 */}
            {projectsData?.pagination && projectsData.pagination.totalPages > 1 && (
              <div className="px-5 py-4 bg-gradient-to-r from-gray-50 to-gray-100/50 border-t border-gray-200/50 flex items-center justify-between">
                <div className="text-sm text-gray-600 font-medium">
                  显示 {(projectsData.pagination.page - 1) * projectsData.pagination.pageSize + 1}-{Math.min(projectsData.pagination.page * projectsData.pagination.pageSize, projectsData.pagination.total)} / 共 {projectsData.pagination.total} 条
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    className="px-4 py-2 border border-gray-200 rounded-xl hover:bg-white hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium text-sm"
                    disabled={page <= 1}
                  >
                    上一页
                  </button>
                  <button className="px-4 py-2 bg-gradient-to-r from-primary to-primary/90 text-white rounded-xl font-medium shadow-lg shadow-primary/20">{page}</button>
                  <button
                    onClick={() => setPage(page + 1)}
                    className="px-4 py-2 border border-gray-200 rounded-xl hover:bg-white hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium text-sm"
                    disabled={page >= projectsData.pagination.totalPages}
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 视频预览弹窗 */}
      {previewVideoUrl && (
        <VideoPreviewModal
          isOpen={true}
          videos={[{ url: previewVideoUrl, title: '视频预览' }]}
          currentIndex={0}
          onIndexChange={() => {}}
          onClose={closeVideoPreview}
        />
      )}

      {/* 图片预览弹窗 */}
      {previewImageUrl && (
        <ImageLightbox
          url={previewImageUrl}
          open={true}
          onClose={closeImagePreview}
        />
      )}

      {/* 项目详情弹窗 */}
      {detailProjectId && (
        <ProjectDetailModal
          isOpen={true}
          projectId={detailProjectId}
          onClose={closeDetailModal}
          onOperationClick={handleOperationClick}
        />
      )}

      {/* 迁移弹窗 */}
      {migrateProject && (
        <MigrateProjectModal
          isOpen={true}
          projectId={migrateProject.id}
          projectName={migrateProject.name}
          projectKind={migrateProject.kind}
          onClose={closeMigrateModal}
        />
      )}

      {/* 干预操作确认弹窗 */}
      {operationType && detailProjectId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-200/50">
            <h3 className="text-xl font-bold text-gray-900 mb-5">
              确认{getOperationLabel(operationType)}
            </h3>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  操作原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={operationReason}
                  onChange={(e) => setOperationReason(e.target.value)}
                  placeholder="请输入操作原因（至少5个字符）"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none transition-all"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setOperationType(null); setOperationReason(''); }}
                  className="px-5 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all font-medium"
                  disabled={isOperating}
                >
                  取消
                </button>
                <button
                  onClick={handleOperationConfirm}
                  className="px-5 py-2.5 bg-gradient-to-r from-primary to-primary/90 text-white rounded-xl hover:shadow-lg hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                  disabled={isOperating || operationReason.trim().length < 5}
                >
                  {isOperating ? '执行中...' : '确认执行'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** 获取项目状态中文标签 */
function getStatusLabel(status: string, projectKind: string): string {
  if (projectKind === 'image') {
    return (IMAGE_PROJECT_STATUS_LABELS as Record<string, string>)[status] || status;
  }
  return (PROJECT_STATUS_LABELS as Record<string, string>)[status] || status;
}

/** 获取操作类型标签 */
function getOperationLabel(type: string): string {
  const labels: Record<string, string> = {
    unlock_script: '解锁脚本选择',
    unlock_character: '解锁角色选择',
    unlock_outfit: '解锁服装搭配',
  };
  return labels[type] || type;
}

/**
 * Step 进度组件
 */
const StepProgress: React.FC<{ current: number; total: number }> = ({ current, total }) => {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => i + 1).map((step) => (
        <div
          key={step}
          className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold transition-all ${
            step < current
              ? 'bg-green-500 text-white'
              : step === current
              ? 'bg-primary text-white ring-1 ring-primary/30'
              : 'bg-gray-100 text-gray-400'
          }`}
          title={`Step ${step}`}
        >
          {step}
        </div>
      ))}
    </div>
  );
};

export default ProjectManagement;
