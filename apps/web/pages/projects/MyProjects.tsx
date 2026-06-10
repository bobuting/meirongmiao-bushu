import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { Layout } from '../../components/Layout';
import { backendApi } from '../../services/backendApi';
import { Button } from '../../components/ui/Button';
import { Pagination } from '../../components/ui/Pagination';
import { Project } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { clearProjectQueries } from '../../hooks/useProjectState';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import type { Step3ImportedStoryboardPayload } from '../../../../src/contracts/reverse-storyboard-report';
import { buildFlow41CanonicalRoute } from '../project-flow/flow41RouteNormalization';
import { buildReverseStoryboardImportSelectionMessage } from '../reverse-script/reverseStoryboardImportBridge';
import { BlurFillImage } from '../../components/shared/BlurFillImage';
import { VideoPreviewModal } from '../../components/shared/VideoPreviewModal';
import { getOssThumbnailUrl } from '../../utils/ossImage';
import { ImageLightbox } from '../../components/shared/ImageLightbox';
import {
  clampProjectFlowStepForKind,
  normalizeProjectResumeStep,
  resolveResumeProjectFlowKind,
  getStepFromStatus,
  type ProjectFlowKind,
} from '../project-flow/projectFlowKind';
import {
  PROJECT_STATUS_LABELS,
  IMAGE_PROJECT_STATUS_LABELS,
  GARMENT_CATEGORY_LABELS,
  GARMENT_CATEGORY_ICON,
} from '../../../../src/contant-config/shared_dict';
import type { GarmentCategory } from '../../../../src/contant-config/shared_dict';

const COMPLETED_BACKEND_STATUS = new Set(["READY_TO_PUBLISH", "PUBLISHED", "IMAGE_READY_TO_PUBLISH", "IMAGE_PUBLISHED"]);

export const MyProjects: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    token,
    projects,
    setProjects,
    deleteProject,
  } = useAppStore(useShallow((state) => ({ token: state.token, projects: state.projects, setProjects: state.setProjects, deleteProject: state.deleteProject })));
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const routeState = (location.state ?? null) as
    | {
        pendingStoryboardImport?: Step3ImportedStoryboardPayload;
        pendingStoryboardImportNotice?: string;
      }
    | null;
  const pendingStoryboardImport = routeState?.pendingStoryboardImport ?? null;
  const pendingStoryboardImportNotice =
    typeof routeState?.pendingStoryboardImportNotice === "string" &&
    routeState.pendingStoryboardImportNotice.trim().length > 0
      ? routeState.pendingStoryboardImportNotice.trim()
      : pendingStoryboardImport
        ? buildReverseStoryboardImportSelectionMessage(pendingStoryboardImport)
        : null;
  // 格式化时间为相对时间格式（按自然日计算）
const formatRelativeTime = (timestamp: number | string | null | undefined): string => {
  // 处理 null/undefined
  if (timestamp === null || timestamp === undefined) {
    return '刚刚';
  }
  // 转换为数字（PostgreSQL BIGINT 可能返回字符串）
  const numericTimestamp = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  // 检查是否为有效的时间戳
  if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) {
    return '刚刚';
  }
  const date = new Date(numericTimestamp);
  // 检查 Date 对象是否有效
  if (isNaN(date.getTime())) {
    return '刚刚';
  }

  const now = new Date();
  const timeStr = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

  // 按自然日计算差异
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((todayStart.getTime() - dateStart.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return `今天 ${timeStr}`;
  if (diffDays === 1) return `昨天 ${timeStr}`;
  if (diffDays < 7) return `${diffDays}天前 ${timeStr}`;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

  // 分页和过滤状态
  // 从 URL 参数恢复过滤状态（优先）或从 store 恢复（navigate("/projects") 返回时 URL 无参数）
  // URL 有任意参数 → 从 URL 读取；URL 完全无参数 → 从 store 恢复
  const hasUrlParams = !!(
    searchParams.get('page') || searchParams.get('garmentCategory') || searchParams.get('projectKind') ||
    searchParams.get('search')
  );
  const storeFilter = useAppStore.getState().projectListFilter;

  const [page, setPage] = useState(() => {
    const p = searchParams.get('page');
    if (p) return parseInt(p, 10) || 1;
    return hasUrlParams ? 1 : storeFilter.page;
  });
  const [garmentCategoryFilter, setGarmentCategoryFilter] = useState<GarmentCategory | null>(() => {
    const categoryFromUrl = searchParams.get('garmentCategory');
    if (categoryFromUrl && Object.keys(GARMENT_CATEGORY_LABELS).includes(categoryFromUrl)) {
      return categoryFromUrl as GarmentCategory;
    }
    return null;
  });
  const [projectKindFilter, setProjectKindFilter] = useState<ProjectFlowKind | null>(() => {
    const kindFromUrl = searchParams.get('projectKind');
    if (kindFromUrl) return kindFromUrl as ProjectFlowKind;
    return hasUrlParams ? null : (storeFilter.projectKindFilter as ProjectFlowKind | null);
  });
  const [searchTerm, setSearchTerm] = useState(() => {
    const searchFromUrl = searchParams.get('search');
    if (searchFromUrl !== null) return searchFromUrl;
    return hasUrlParams ? '' : storeFilter.searchTerm;
  });

  // UI 状态
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSavingProjectId, setRenameSavingProjectId] = useState<string | null>(null);
  const [resumingProjectId, setResumingProjectId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // 视频预览弹窗状态
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const openVideoPreview = (url: string) => setPreviewVideoUrl(url);
  const closeVideoPreview = () => setPreviewVideoUrl(null);

  // 图片预览弹窗状态
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const openImagePreview = (url: string) => setPreviewImageUrl(url);
  const closeImagePreview = () => setPreviewImageUrl(null);

  // 删除确认弹窗（全局 Provider）
  const { confirm } = useConfirm();

  // 防抖搜索（300ms）
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 过滤条件变化时重置页码
  useEffect(() => {
    setPage(1);
  }, [garmentCategoryFilter, projectKindFilter, debouncedSearch]);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['projects', page, garmentCategoryFilter, projectKindFilter, debouncedSearch, token],
    enabled: Boolean(token),
    queryFn: async () => {
      if (!token) return { projects: [], pagination: undefined };
      const response = await backendApi.myProjects(token, {
        page,
        pageSize: 15,
        garmentCategory: garmentCategoryFilter ?? undefined,
        projectKind: projectKindFilter ?? undefined,
        search: debouncedSearch || undefined,
      });
      return {
        projects: response.projects.map((project) => ({
          id: project.id,
          title: project.name,
          thumbnail: project.coverImageUrl || '',
          garmentImageUrl: project.garmentImageUrl || null,
          status: (COMPLETED_BACKEND_STATUS.has(project.status) ? 'completed' : 'draft') as Project['status'],
          projectKind: project.projectKind,
          resumeStatus: project.status,
          lastVisitedStep: project.lastVisitedStep,
          lastReverseTaskId: project.lastReverseTaskId ?? null,
          lastReverseScriptVersionId: project.lastReverseScriptVersionId ?? null,
          lastReverseLibraryScriptId: project.lastReverseLibraryScriptId ?? null,
          reverseScriptId: project.reverseScriptId ?? null,
          type: project.exportUrl
            ? (project.formatLabel || `${project.durationSec ?? 30}秒 • 9:16`)
            : '暂无视频',
          createdAt: formatRelativeTime(project.createdAt),
          updatedAt: formatRelativeTime(project.updatedAt),
          views: project.views ?? 0,
          exportUrl: project.exportUrl,
          // 换装项目：thumbnailUrl 存的是源视频 URL，合成前用于播放
          sourceVideoUrl: project.projectKind === 'outfit_change' ? (project.thumbnailUrl || null) : null,
        })),
        pagination: response.pagination,
      };
    },
  });

  const apiProjects = data?.projects ?? [];
  const pagination = data?.pagination;

  // 同步到全局 store（兼容现有功能）
  useEffect(() => {
    if (apiProjects && apiProjects.length > 0) {
        setProjects(apiProjects);
    }
  }, [apiProjects, setProjects]);

  // 过滤条件变化时同步到 URL（支持分享链接、bookmark）
  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set('page', String(page));
    if (garmentCategoryFilter) params.set('garmentCategory', garmentCategoryFilter);
    if (projectKindFilter) params.set('projectKind', projectKindFilter);
    if (searchTerm.trim()) params.set('search', searchTerm.trim());
    setSearchParams(params, { replace: true });
  }, [page, garmentCategoryFilter, projectKindFilter, searchTerm, setSearchParams]);

  // 过滤条件变化时同步到 Zustand store（navigate("/projects") 不带参数，靠 store 恢复）
  const setProjectListFilter = useAppStore((s) => s.setProjectListFilter);
  useEffect(() => {
    setProjectListFilter({
      filter: garmentCategoryFilter ?? '全部',
      projectKindFilter,
      searchTerm,
      page,
    });
  }, [page, garmentCategoryFilter, projectKindFilter, searchTerm, setProjectListFilter]);

  const handleRefresh = async () => {
      await refetch();
  };

  const handleResumeProject = async (project: any) => {
    if (!token) {
      navigate("/", { replace: true });
      return;
    }
    setResumingProjectId(project.id);
    const importedStoryboard = pendingStoryboardImport;
    const resumeStatus = String(project.resumeStatus || "DRAFT");
    const resumeStep = normalizeProjectResumeStep(project.lastVisitedStep, resumeStatus, project.projectKind);
    const targetStep = clampProjectFlowStepForKind(resumeStep, project.projectKind);
    const projectKind = resolveResumeProjectFlowKind(project.projectKind, resumeStatus, project.lastVisitedStep);

    const store = useAppStore.getState();
    // 如果切换到不同项目，清除旧项目状态
    if (activeProjectId && activeProjectId !== project.id) {
      clearProjectQueries(activeProjectId);
      store.clearProjectState(activeProjectId);
    }
    // 设置基础 projectData，workflow 由各 step 通过 TanStack Query 自动加载
    store.updateProjectDataForProject(project.id, {
      projectId: project.id,
      projectName: project.title,
      projectStatus: resumeStatus,
      activeScriptId: project.lastReverseScriptVersionId ?? null,
      reverseScriptId: project.reverseScriptId ?? null,
      projectKind,
    });
    store.setActiveProject(project.id);

    setResumingProjectId(null);
    if (importedStoryboard) {
      navigate(`/create/${project.id}/step3`, {
        state: {
          importedStoryboard,
        },
      });
      return;
    }
    navigate(buildFlow41CanonicalRoute(targetStep, project.id, project.projectKind));
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (!token) {
        navigate("/", { replace: true });
        return;
      }
      const confirmed = await confirm('确定要删除这个项目吗？此操作无法撤销。', '删除确认');
      if (confirmed) {
          try {
            await backendApi.deleteProject(token, id);
            deleteProject(id);
            await refetch();
          } catch (error) {
            setFeedback(error instanceof Error ? error.message : "删除失败，请稍后重试");
          }
      }
  };

  // 视频裂变处理
  const handleFission = (project: Project) => {
    // 没有导出视频时提示
    if (!project.exportUrl) {
      setFeedback('视频未完成生成，请先完成视频后再进行裂变');
      return;
    }

    // 跳转到项目工作流的 Step6 裂变页
    navigate(`/create/${project.id}/step6`);
  };

  const startRenameProject = (event: React.MouseEvent, project: Project) => {
    event.stopPropagation();
    setRenamingProjectId(project.id);
    setRenameDraft(project.title);
  };

  const cancelRenameProject = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    setRenamingProjectId(null);
    setRenameDraft("");
  };

  const commitRenameProject = async (project: Project): Promise<void> => {
    const normalizedName = renameDraft.trim() || "未命名项目";
    if (normalizedName === project.title.trim()) {
      cancelRenameProject();
      return;
    }
    if (!token) {
      navigate("/", { replace: true });
      return;
    }
    setRenameSavingProjectId(project.id);
    try {
      const updated = await backendApi.updateProject(token, project.id, normalizedName);
      const nextProjects = projects.map((item) =>
        item.id === project.id
          ? {
              ...item,
              title: updated.name,
            }
          : item,
      );
      setProjects(nextProjects);
      if (activeProjectId === project.id) {
        useAppStore.getState().updateProjectDataForProject(project.id, { projectName: updated.name });
      }
      setRenamingProjectId(null);
      setRenameDraft("");
      await refetch();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "修改项目名称失败，请稍后重试");
    } finally {
      setRenameSavingProjectId(null);
    }
  };

  const toggleProjectKindFilter = (nextKind: ProjectFlowKind) => {
      setProjectKindFilter((current) => (current === nextKind ? null : nextKind));
  };

  return (
    <Layout>
      <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-[#fdfbf7]">
         {/* 错误提示 */}
         {feedback && (
           <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg bg-red-500 text-white">
             {feedback}
             <button
               onClick={() => setFeedback(null)}
               className="ml-3 text-white/80 hover:text-white"
             >
               <span className="material-icons-round text-sm">close</span>
             </button>
           </div>
         )}
         {/* Page Header */}
         <div className="bg-white border-b border-gray-100 px-8 py-5">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
               <div className="flex items-baseline gap-3">
                  <h1 className="text-2xl font-bold text-gray-900 font-display">我的项目</h1>
                  <p className="text-gray-500 text-sm">管理您的所有创作项目。</p>
               </div>
               <div className="flex gap-3">
                    <button 
                        onClick={handleRefresh} 
                        className={`px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 transition-colors flex items-center justify-center ${isRefetching ? 'cursor-not-allowed opacity-70' : ''}`}
                        disabled={isRefetching}
                        title="刷新列表"
                    >
                        <span className={`material-icons-round text-sm ${isRefetching ? 'animate-spin text-primary' : ''}`}>refresh</span>
                    </button>
                    <Button
                        variant={projectKindFilter === 'image' ? 'primary' : 'secondary'}
                        onClick={() => toggleProjectKindFilter('image')}
                    >
                        <span className="material-icons-round text-sm mr-2">photo_library</span> 图片项目
                    </Button>
                    <Button
                        variant={projectKindFilter === 'video' ? 'primary' : 'secondary'}
                        onClick={() => toggleProjectKindFilter('video')}
                    >
                        <span className="material-icons-round text-sm mr-2">movie</span> 视频项目
                    </Button>
                    <Button
                        variant={projectKindFilter === 'outfit_change' ? 'primary' : 'secondary'}
                        onClick={() => toggleProjectKindFilter('outfit_change')}
                    >
                        <span className="material-icons-round text-sm mr-2">checkroom</span> 换装项目
                    </Button>
                    <Button
                        variant={projectKindFilter === 'reverse' ? 'primary' : 'secondary'}
                        onClick={() => toggleProjectKindFilter('reverse')}
                    >
                        <span className="material-icons-round text-sm mr-2">auto_fix_high</span> 反推项目
                    </Button>
               </div>
            </div>
            {pendingStoryboardImport ? (
              <div
                data-testid="pending-storyboard-import-banner"
                className="mx-auto mt-5 max-w-7xl rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm text-orange-900"
              >
                <div className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="material-icons-round text-base">movie_filter</span>
                  <span>待导入分镜：{pendingStoryboardImport.title || "未命名分镜"}</span>
                </div>
                <p className="mt-2 leading-6">{pendingStoryboardImportNotice}</p>
                <p className="mt-1 text-xs text-orange-700">
                  继续编辑现有项目会直接进入 Step3；如果新建项目，分镜会保留到该项目的 Step3 再落入编辑区。
                </p>
              </div>
            ) : null}
         </div>

         {/* Filters & Content */}
         <div className="flex-1 px-4 md:px-8 py-8">
            <div className="max-w-7xl mx-auto">
               <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                  {/* 服饰分类 Tabs */}
                  <div className="flex gap-2 w-full md:w-auto overflow-x-auto no-scrollbar pb-2 md:pb-0">
                     <button
                        onClick={() => setGarmentCategoryFilter(null)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                            garmentCategoryFilter === null
                            ? 'bg-primary text-white shadow-md shadow-primary/20'
                            : 'bg-white text-gray-600 hover:bg-gray-50 border border-transparent hover:border-gray-200'
                        }`}
                     >
                        全部
                     </button>
                     {(Object.keys(GARMENT_CATEGORY_LABELS) as GarmentCategory[]).map(category => (
                        <button
                            key={category}
                            onClick={() => setGarmentCategoryFilter(prev => prev === category ? null : category)}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                garmentCategoryFilter === category
                                ? 'bg-primary text-white shadow-md shadow-primary/20'
                                : 'bg-white text-gray-600 hover:bg-gray-50 border border-transparent hover:border-gray-200'
                            }`}
                        >
                           <span className="material-icons-round text-sm">{GARMENT_CATEGORY_ICON[category]}</span>
                           {GARMENT_CATEGORY_LABELS[category]}
                        </button>
                     ))}
                  </div>

                  {/* Search */}
                  <div className="relative w-full md:w-64">
                      <input 
                        type="text" 
                        placeholder="搜索项目名称..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                      <span className="material-icons-round absolute left-2.5 top-2.5 text-gray-400 text-lg">search</span>
                  </div>
               </div>

               {isLoading && apiProjects.length === 0 ? (
                  <div className="space-y-4">
                     {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse"></div>)}
                  </div>
               ) : (
                  <div className="space-y-4 pb-4">
                     {apiProjects.map(project => (
                        <div key={project.id} className={`bg-white border rounded-xl p-4 flex flex-col md:flex-row gap-4 hover:shadow-lg transition-all group items-center relative overflow-hidden ${
                          project.projectKind === 'outfit_change' ? 'border-l-4 border-l-rose-400 border-t-gray-100 border-r-gray-100 border-b-gray-100'
                          : project.projectKind === 'image' ? 'border-l-4 border-l-sky-400 border-t-gray-100 border-r-gray-100 border-b-gray-100'
                          : project.projectKind === 'reverse' ? 'border-l-4 border-l-amber-400 border-t-gray-100 border-r-gray-100 border-b-gray-100'
                          : 'border-l-4 border-l-violet-400 border-t-gray-100 border-r-gray-100 border-b-gray-100'
                        }`}>
                           <div
                              className="w-full md:w-48 rounded-lg overflow-hidden relative shrink-0 cursor-pointer"
                              onClick={() => {
                                // 换装项目：合成前播放源视频，合成后播放结果视频
                                if (project.projectKind === 'outfit_change') {
                                  if (project.exportUrl) {
                                    openVideoPreview(project.exportUrl);
                                  } else if (project.sourceVideoUrl) {
                                    openVideoPreview(project.sourceVideoUrl);
                                  } else if (project.thumbnail) {
                                    openImagePreview(project.thumbnail);
                                  }
                                  return;
                                }
                                // 视频/反推项目有导出URL时点击缩略图播放视频
                                if (project.projectKind !== 'image' && project.exportUrl) {
                                  openVideoPreview(project.exportUrl);
                                }
                                // 缩略图始终可点击预览
                                if (project.projectKind === 'image' || !project.exportUrl) {
                                  openImagePreview(project.thumbnail);
                                }
                              }}
                            >
                              <BlurFillImage
                                src={project.thumbnail}
                                alt={project.title}
                                aspectClass="aspect-video"
                                className="rounded-lg"
                              />
                              {/* 项目类型 + 状态角标 */}
                              {(() => {
                                const status = project.resumeStatus;
                                const kind = project.projectKind;
                                const isImage = kind === 'image';
                                const isOutfit = kind === 'outfit_change';
                                const label = isImage
                                  ? IMAGE_PROJECT_STATUS_LABELS[status as keyof typeof IMAGE_PROJECT_STATUS_LABELS]
                                  : PROJECT_STATUS_LABELS[status as keyof typeof PROJECT_STATUS_LABELS];
                                if (!label) return null;
                                // 按项目类型区分样式
                                const kindConfig: Record<string, { tag: string; color: string }> = {
                                  video:         { tag: '视频', color: 'bg-violet-600/90 text-white' },
                                  image:         { tag: '图片', color: 'bg-sky-600/90 text-white' },
                                  outfit_change: { tag: '换装', color: 'bg-rose-600/90 text-white' },
                                  reverse:       { tag: '反推', color: 'bg-amber-600/90 text-white' },
                                };
                                const cfg = kindConfig[kind] ?? kindConfig.video;
                                return (
                                  <div className="absolute top-2 left-2 z-20 flex items-center gap-1">
                                    <span className={`inline-flex items-center rounded-l-md px-1.5 py-0.5 text-[10px] font-bold ${cfg.color}`}>
                                      {cfg.tag}
                                    </span>
                                    <span className="inline-flex items-center rounded-r-md px-1.5 py-0.5 text-[11px] font-medium backdrop-blur-sm bg-black/40 text-white">
                                      {label}
                                    </span>
                                  </div>
                                );
                              })()}
                              {/* 播放角标：有视频可播放时显示 */}
                              {(() => {
                                // 换装项目：合成前有源视频也显示播放按钮
                                const isOutfit = project.projectKind === 'outfit_change';
                                const hasOutfitVideo = isOutfit && !project.garmentImageUrl && (project.exportUrl || project.sourceVideoUrl);
                                // 视频/反推项目：有导出URL时显示
                                const hasOtherVideo = !isOutfit && project.projectKind !== 'image' && project.exportUrl && !project.garmentImageUrl;
                                return (hasOutfitVideo || hasOtherVideo) ? (
                                  <div className="absolute bottom-2 right-2 z-20 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow-md">
                                    <span className="material-icons-round text-primary text-base">play_arrow</span>
                                  </div>
                                ) : null;
                              })()}
                              {/* 服饰主图角标 */}
                              {project.garmentImageUrl && (
                                <div className="absolute bottom-2 right-2 z-20 w-10 h-10 rounded-lg overflow-hidden border-2 border-white/90 shadow-md bg-gray-100">
                                  <img
                                    src={getOssThumbnailUrl(project.garmentImageUrl, 80)}
                                    alt="服饰"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                           </div>
                           
                           <div className="flex-1 min-w-0 w-full text-center md:text-left">
                              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-1">
                                 {renamingProjectId === project.id ? (
                                   <input
                                     type="text"
                                     value={renameDraft}
                                     autoFocus
                                     onClick={(event) => event.stopPropagation()}
                                     onChange={(event) => setRenameDraft(event.target.value)}
                                     onKeyDown={(event) => {
                                       if (event.key === "Enter") {
                                         event.preventDefault();
                                         void commitRenameProject(project);
                                       }
                                       if (event.key === "Escape") {
                                         event.preventDefault();
                                         cancelRenameProject();
                                       }
                                     }}
                                     className="h-8 w-[30ch] rounded-md border border-gray-200 bg-white px-2.5 text-sm font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-primary/20"
                                     aria-label="项目名称"
                                   />
                                 ) : (
                                   <h3 className="font-bold text-gray-900 truncate max-w-[30ch] text-lg">{project.title}</h3>
                                 )}
                                 <span
                                   className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                     project.projectKind === "image"
                                       ? "border-orange-200 bg-orange-50 text-orange-700"
                                       : project.projectKind === "outfit_change"
                                         ? "border-pink-200 bg-pink-50 text-pink-700"
                                         : project.projectKind === "reverse"
                                           ? "border-purple-200 bg-purple-50 text-purple-700"
                                           : "border-blue-200 bg-blue-50 text-blue-700"
                                   }`}
                                 >
                                   {project.projectKind === "image" ? "图片项目" : project.projectKind === "outfit_change" ? "换装项目" : project.projectKind === "reverse" ? "反推项目" : "视频项目"}
                                 </span>
                                 {renamingProjectId === project.id ? (
                                   <>
                                     <button
                                       type="button"
                                       onClick={(event) => {
                                         event.stopPropagation();
                                         void commitRenameProject(project);
                                       }}
                                       disabled={renameSavingProjectId === project.id}
                                       className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-primary disabled:opacity-50"
                                       title="保存名称"
                                     >
                                       <span className="material-icons-round text-base">check</span>
                                     </button>
                                     <button
                                       type="button"
                                       onClick={(event) => cancelRenameProject(event)}
                                       disabled={renameSavingProjectId === project.id}
                                       className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                       title="取消修改"
                                     >
                                       <span className="material-icons-round text-base">close</span>
                                     </button>
                                   </>
                                 ) : (
                                   <button
                                     type="button"
                                     onClick={(event) => startRenameProject(event, project)}
                                     className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-primary"
                                     title="修改项目名称"
                                   >
                                     <span className="material-icons-round text-base">edit</span>
                                   </button>
                                 )}
                              </div>
                              {/* 第二行：类型信息 */}
                              <div className="flex items-center justify-center md:justify-start gap-4 text-sm text-gray-500 mb-1">
                                  <span className="flex items-center gap-1">
                                      <span className="material-icons-round text-xs">aspect_ratio</span> {project.type}
                                  </span>
                              </div>
                              {/* 最后一行：创建时间 · 修改时间 */}
                              <div className="flex items-center justify-center md:justify-start gap-2 text-sm text-gray-500">
                                  <span className="flex items-center gap-1">
                                      <span className="material-icons-round text-xs">schedule</span> {project.createdAt}
                                  </span>
                                  <span className="text-gray-300">·</span>
                                  <span className="flex items-center gap-1">
                                      <span className="material-icons-round text-xs">update</span> {project.updatedAt}
                                  </span>
                              </div>
                           </div>

                           <div className="flex items-center gap-3 w-full md:w-auto justify-center md:justify-end border-t md:border-t-0 border-gray-100 pt-4 md:pt-0">
                              {/* 视频裂变按钮 - 视频项目和反推项目可操作时显示 */}
                              {(project.projectKind === 'video' || project.projectKind === 'reverse') && (project.resumeStatus === "FISSIONING" || project.exportUrl) && (
                                <button
                                  className={`inline-flex items-center px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                                    project.resumeStatus === "FISSIONING"
                                      ? "border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100"
                                      : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-primary"
                                  }`}
                                  title={
                                    project.resumeStatus === "FISSIONING"
                                      ? "查看裂变进度"
                                      : "视频裂变"
                                  }
                                  onClick={() => handleFission(project)}
                                >
                                  <span className="material-icons-round text-sm mr-0.5">
                                    {project.resumeStatus === "FISSIONING" ? "hourglass_top" : "auto_awesome"}
                                  </span>
                                  {project.resumeStatus === "FISSIONING" ? "裂变中" : "裂变"}
                                </button>
                              )}
                              <Button
                                variant="primary"
                                disabled={resumingProjectId === project.id}
                                onClick={() => void handleResumeProject(project)}
                              >
                                {resumingProjectId === project.id ? (
                                  <span className="flex items-center gap-1.5">
                                    <span className="material-icons-round text-sm animate-spin">refresh</span>
                                    加载中...
                                  </span>
                                ) : (
                                  project.status === 'completed' ? '查看详情' : '继续编辑'
                                )}
                              </Button>
                              <button
                                onClick={(e) => void handleDelete(e, project.id)}
                                className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50 transition-colors"
                                title="删除项目"
                              >
                                 <span className="material-icons-round text-lg">delete</span>
                              </button>
                           </div>
                        </div>
                     ))}
                     {apiProjects.length === 0 && !isLoading && (
                         <div className="text-center py-20 bg-white rounded-xl border border-gray-100 border-dashed">
                             <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                                <span className="material-icons-round text-3xl">folder_off</span>
                             </div>
                             <h3 className="text-lg font-bold text-gray-900 mb-1">暂无项目</h3>
                             <p className="text-gray-500 text-sm mb-4">没有找到符合条件的项目</p>
                             <div className="text-sm text-gray-500">
                                请从左侧"新建项目"选择图片或视频项目开始创作。
                             </div>
                         </div>
                     )}
                  </div>
               )}

               {/* 分页组件 */}
               {pagination && pagination.totalPages > 1 && (
                 <Pagination
                   currentPage={page}
                   totalPages={pagination.totalPages}
                   totalItems={pagination.total}
                   onPageChange={setPage}
                 />
               )}
            </div>
         </div>
      </div>

      {/* 视频预览弹窗 */}
      <VideoPreviewModal
        isOpen={!!previewVideoUrl}
        videos={[{ url: previewVideoUrl ?? '', title: '项目视频' }]}
        currentIndex={0}
        onIndexChange={() => {}}
        onClose={closeVideoPreview}
      />

      {/* 图片预览弹窗 */}
      <ImageLightbox
        url={previewImageUrl ?? ""}
        open={!!previewImageUrl}
        onClose={closeImagePreview}
        alt="项目图片预览"
      />
    </Layout>
  );
};
