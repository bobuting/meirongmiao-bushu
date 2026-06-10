import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router';
import { useAppStore } from '../store/useAppStore';
import { useProjectState, ProjectLoadCategory } from '../hooks/useProjectState';
import { backendApi } from '../services/backendApi';
import { TaskStatus } from './layout/taskQueueConfig';
import { LayoutWorkflowStepper } from './layout/LayoutWorkflowStepper';
import { NewProjectTypeDialog } from './layout/NewProjectTypeDialog';
import { useConfirm } from './ui/ConfirmDialog';
import { ThemeSelector } from './theme/ThemeSelector';
import { CreditBadge } from './ui/CreditBadge';
import {
  canNavigateToLayoutStep,
  isLayoutRouteActive,
  layoutWorkflowSteps,
  primarySidebarLinks,
  resolveLayoutCurrentStep,
  resolveLayoutTitle,
  resolveLayoutToastIcon,
  imageProjectWorkflowSteps,
  outfitChangeWorkflowSteps,
} from './layout/layoutNavigationController';
import { buildFlow41CanonicalRoute } from '../pages/project-flow/flow41RouteNormalization';
import { buildImageProjectCanonicalRoute } from '../pages/image-project/imageProjectRouteNormalization';
import { buildOutfitChangeCanonicalRoute } from '../pages/outfit-change/outfitChangeRouteNormalization';
import {
  filterWorkflowStepsByProjectKind,
  type ProjectFlowKind,
  clampProjectFlowStepForKind,
} from '../pages/project-flow/projectFlowKind';
import { clearProjectFlowActiveSession } from '../pages/project-flow/projectFlowActiveSession';
import { bootstrapProject, getProjectStep1Path } from '../pages/project-flow/projectCreationBootstrap';
import { useTheme } from '../hooks/useTheme';
import { LlmDebugBubble } from '../pages/project-flow/LlmDebugBubble';
import { realBackendApi } from '../services/realApi';
import type { Announcement } from '../../../src/contracts/announcement-contract';
import { AuthReLoginModal } from './AuthReLoginModal';
import { TaskQueuePanel } from './layout/TaskQueuePanel';

type SidebarLinkProps = {
  to: string;
  icon: string;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
};

const SidebarLink: React.FC<SidebarLinkProps> = ({ to, icon, label, active, collapsed, onClick }) => (
  <Link
    to={to}
    onClick={onClick}
    title={collapsed ? label : ''}
    data-testid={`layout-sidebar-link-${to.replace(/^\//, '').replace(/[^\w-]+/g, '-') || 'root'}`}
    className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors group relative ${
      active ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-background-warm hover:text-gray-900'
    } ${collapsed ? 'justify-center' : ''}`}
  >
    <span className={`material-icons-round text-xl ${active ? 'text-primary' : 'group-hover:text-primary'}`}>{icon}</span>
    {!collapsed && <span className="font-medium text-sm whitespace-nowrap overflow-hidden transition-all duration-300">{label}</span>}
    {collapsed && active && <div className="absolute right-0 top-2 bottom-2 w-1 bg-primary rounded-l-full"></div>}
  </Link>
);

const LayoutInner: React.FC<{
  children: React.ReactNode;
  hideSidebar?: boolean;
  projectFullscreen?: boolean;
  onExitProjectFlow?: () => Promise<void> | void;
}> = ({
  children,
  hideSidebar = false,
  projectFullscreen = false,
  onExitProjectFlow,
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  // 同步浏览器标签页标题：内容喵AI + [菜单/页面内容]
  useEffect(() => {
    const pageTitle = resolveLayoutTitle(location.pathname);
    let title = '';

    // 项目工作流页面：显示当前步骤标题
    if (location.pathname.startsWith('/create') || location.pathname.startsWith('/image-create')) {
      const isImage = location.pathname.startsWith('/image-create');
      const isOutfit = !!location.pathname.match(/\/create\/[^/]+\/outfit-change/);
      const steps = isImage ? imageProjectWorkflowSteps : isOutfit ? outfitChangeWorkflowSteps : layoutWorkflowSteps;
      const currentStep = resolveLayoutCurrentStep(location.pathname, steps);
      const step = steps.find(s => s.id === currentStep);
      title = step ? `内容喵AI - ${step.label}` : '内容喵AI - 项目';
    } else if (pageTitle) {
      // 普通页面：使用 resolveLayoutTitle 返回的页面标题
      title = `内容喵AI - ${pageTitle}`;
    } else {
      title = '内容喵AI';
    }
    document.title = title;
  }, [location.pathname]);

  const isProjectFlow = location.pathname.startsWith('/create') || location.pathname.startsWith('/image-create') || location.pathname.startsWith('/outfit-create');
  const isImageProjectFlow = location.pathname.startsWith('/image-create');
  const isOutfitChangeProjectFlow = location.pathname.startsWith('/outfit-create');

  // React 19: 拆分为单独的 selector，避免 useShallow 闭包导致 getSnapshot 不稳定
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed);
  const hasNotification = useAppStore((state) => state.hasNotification);
  const token = useAppStore((state) => state.token);
  const currentUser = useAppStore((state) => state.currentUser);
  const credits = useAppStore((state) => state.credits);
  const logout = useAppStore((state) => state.logout);
  const taskNotifications = useAppStore((state) => state.taskNotifications);
  const activeToastNotificationId = useAppStore((state) => state.activeToastNotificationId);
  const dismissTaskToast = useAppStore((state) => state.dismissTaskToast);
  const markTaskNotificationRead = useAppStore((state) => state.markTaskNotificationRead);
  const setCredits = useAppStore((state) => state.setCredits);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const theme = useAppStore((state) => state.theme);
  const globalTaskQueue = useAppStore((state) => state.globalTaskQueue);

  // 根据当前路由决定加载分类：Step2/3/4 需要 characters 分类
  const layoutLoadCategories = useMemo<ProjectLoadCategory[]>(() => {
    if (!isProjectFlow || !activeProjectId) return ['garments', 'project'];
    // Step2: 显示 Step1 面板（包含角色预设）
    if (location.pathname.match(/\/create\/[^/]+\/step2/)) {
      return ['garments', 'project', 'characters', 'step1State'];
    }
    // Step3: 显示 Step2 面板（包含五视图）
    if (location.pathname.match(/\/create\/[^/]+\/step3/)) {
      return ['project', 'characters', 'step1State'];
    }
    // Step4: 分镜中需要角色信息
    if (location.pathname.match(/\/create\/[^/]+\/step4/)) {
      return ['project', 'characters'];
    }
    // 其他步骤：只加载基础分类
    return ['garments', 'project'];
  }, [isProjectFlow, activeProjectId, location.pathname]);

  const { projectData, workflow, updateProjectData } = useProjectState(activeProjectId, {
    loadCategories: layoutLoadCategories,
  });
  // 计算 badge 计数：只统计子任务数量（排除父任务）
  const activeTaskCount = useMemo(() => {
    const taskIds = new Set(globalTaskQueue.map(t => t.id));
    // 收集在列表中有子任务的父任务 ID（这些父任务不参与计数）
    const parentIdsInList = new Set<string>();
    for (const task of globalTaskQueue) {
      if (task.parentJobId && taskIds.has(task.parentJobId)) {
        parentIdsInList.add(task.parentJobId);
      }
    }
    let count = 0;
    for (const task of globalTaskQueue) {
      if (task.status !== TaskStatus.RUNNING) continue;
      // 父任务：有子任务在列表中时跳过（不计数）
      if (parentIdsInList.has(task.id)) continue;
      // 子任务或独立任务：正常计数
      count++;
    }
    return count;
  }, [globalTaskQueue]);
  const avatarLabel = currentUser?.email?.[0]?.toUpperCase() ?? "U";
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [projectNameEditing, setProjectNameEditing] = useState(false);
  const [projectNameSaving, setProjectNameSaving] = useState(false);
  const [projectFlowSidebarHoverExpanded, setProjectFlowSidebarHoverExpanded] = useState(false);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [taskQueueOpen, setTaskQueueOpen] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [creditsDropdownLoading, setCreditsDropdownLoading] = useState(false);
  const avatarDropdownRef = useRef<HTMLDivElement | null>(null);
  const [showAnnouncementDropdown, setShowAnnouncementDropdown] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const announcementDropdownRef = useRef<HTMLDivElement | null>(null);
  const projectNameInputRef = useRef<HTMLInputElement | null>(null);
  const projectFlowSidebarHoverTimerRef = useRef<number | null>(null);
  const previousIsProjectFlowRef = useRef(isProjectFlow);
  const sidebarCollapsedEffective = sidebarCollapsed && !projectFlowSidebarHoverExpanded;
  const showProjectFlowFullscreenHeader = projectFullscreen && isProjectFlow;
  // Layout 组件导入 useTheme hook，但不需要手动初始化
  // useTheme hook 内部已有 useEffect 自动初始化（已修复依赖循环问题）
  const { error: themeError, clearErrorAndRetry, isLoading: themeLoading } = useTheme();

  // 使用全局确认对话框替代系统原生 window.confirm
  const { confirm } = useConfirm();

  // 从 workflow 中判断是否有上传图片
  const garmentModules = (workflow.videoGarmentModules as Array<{ mainImage?: { activeImageUrl?: string } }>) ?? [];
  const hasProjectFlowUploadedImage = garmentModules.some((m) => m.mainImage?.activeImageUrl);

  // Initialize sidebar state based on device width
  useEffect(() => {
    // 检查 HTML 中是否已有 mobile-init 标记（来自 index.html 的内联脚本）
    const hasMobileInit = document.documentElement.classList.contains('sidebar-mobile-init');
    if (hasMobileInit && !sidebarCollapsed) {
      setSidebarCollapsed(true);
    }
    // 移除标记，防止影响后续渲染
    document.documentElement.classList.remove('sidebar-mobile-init');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在首次挂载时执行

  useEffect(() => {
    const previousIsProjectFlow = previousIsProjectFlowRef.current;
    const isDesktop = window.innerWidth >= 768;
    if (isDesktop && !previousIsProjectFlow && isProjectFlow) {
      setSidebarCollapsed(true);
      setProjectFlowSidebarHoverExpanded(false);
    }
    if (isDesktop && !isProjectFlow) {
      setSidebarCollapsed(false);
      setProjectFlowSidebarHoverExpanded(false);
    }
    previousIsProjectFlowRef.current = isProjectFlow;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProjectFlow]); // setSidebarCollapsed 是稳定的 store 函数，无需加入依赖

  useEffect(() => {
    if (projectFlowSidebarHoverTimerRef.current !== null) {
      window.clearTimeout(projectFlowSidebarHoverTimerRef.current);
      projectFlowSidebarHoverTimerRef.current = null;
    }
    if (!isProjectFlow || !sidebarCollapsed || !projectFlowSidebarHoverExpanded) {
      return;
    }
    projectFlowSidebarHoverTimerRef.current = window.setTimeout(() => {
      setProjectFlowSidebarHoverExpanded(false);
      projectFlowSidebarHoverTimerRef.current = null;
    }, 2600);
  }, [isProjectFlow, projectFlowSidebarHoverExpanded, sidebarCollapsed]);

  useEffect(() => {
    return () => {
      if (projectFlowSidebarHoverTimerRef.current !== null) {
        window.clearTimeout(projectFlowSidebarHoverTimerRef.current);
        projectFlowSidebarHoverTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const source = (projectData.projectName ?? "").trim();
    if (!projectNameEditing) {
      setProjectNameDraft(source);
    }
  }, [projectData.projectName, projectNameEditing]);

  // Close user dropdown on outside click
  useEffect(() => {
    if (!showUserDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (avatarDropdownRef.current && !avatarDropdownRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showUserDropdown]);

  // Load credits when dropdown opens
  useEffect(() => {
    if (!showUserDropdown || !token || credits) return;
    let cancelled = false;
    void (async () => {
      try {
        setCreditsDropdownLoading(true);
        const creditResp = await backendApi.loadCredits(token);
        if (!cancelled) {
          setCredits({ balance: creditResp.balance, expiresAt: creditResp.expiresAt });
        }
      } catch {
        // 静默失败，积分显示占位即可
      } finally {
        if (!cancelled) {
          setCreditsDropdownLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUserDropdown, token, credits]); // setCredits 是稳定的 store 函数，无需加入依赖

  // Close announcement dropdown on outside click
  useEffect(() => {
    if (!showAnnouncementDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (announcementDropdownRef.current && !announcementDropdownRef.current.contains(e.target as Node)) {
        setShowAnnouncementDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAnnouncementDropdown]);

  // Load announcements when dropdown opens
  useEffect(() => {
    if (!showAnnouncementDropdown || !token) return;
    let cancelled = false;
    void (async () => {
      try {
        setAnnouncementsLoading(true);
        const resp = await realBackendApi.listAnnouncements(token);
        if (!cancelled) {
          setAnnouncements(resp.items);
        }
      } catch {
        if (!cancelled) {
          setAnnouncements([]);
        }
      } finally {
        if (!cancelled) {
          setAnnouncementsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAnnouncementDropdown, token]); // setAnnouncementsLoading/setAnnouncements/realBackendApi 是稳定引用

  useEffect(() => {
    if (!projectNameEditing) {
      return;
    }
    const timer = window.setTimeout(() => {
      projectNameInputRef.current?.focus();
      projectNameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [projectNameEditing]);

  const latestUnreadNotification = useMemo(
    () => taskNotifications.find((item) => !item.read) ?? null,
    [taskNotifications],
  );
  const activeToastNotification = useMemo(
    () =>
      taskNotifications.find((item) => item.id === activeToastNotificationId) ?? null,
    [activeToastNotificationId, taskNotifications],
  );
  const shouldShowTaskToast = Boolean(activeToastNotification);
  const toastAutoDismissMs = Math.max(1000, activeToastNotification?.toastDurationMs ?? 5000);

  useEffect(() => {
    if (!shouldShowTaskToast) {
      return;
    }
    const timer = window.setTimeout(() => {
      dismissTaskToast();
    }, toastAutoDismissMs);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShowTaskToast, toastAutoDismissMs]); // dismissTaskToast 是稳定的 store 函数，无需加入依赖

  const routeFromNotification = (notification: NonNullable<typeof latestUnreadNotification>): void => {
    markTaskNotificationRead(notification.id);
    dismissTaskToast();
    if (notification.projectId) {
      useAppStore.getState().updateProjectDataForProject(notification.projectId, {
        projectId: notification.projectId,
        projectName: notification.projectName,
        projectStatus: notification.projectStatus,
      });
    }
    if (notification.targetPath) {
      navigate(notification.targetPath, {
        state: notification.libraryScriptId ? { libraryScriptId: notification.libraryScriptId } : undefined,
      });
    }
  };

  const startNewProject = (projectFlowKind: ProjectFlowKind = "video") => {
    clearProjectFlowActiveSession();
    if (!token) return;

    void (async () => {
      try {
        const created = await bootstrapProject({
          token,
          projectName: `项目-${new Date().toLocaleString("zh-CN")}`,
          projectFlowKind,
        });
        const path = getProjectStep1Path(created.id, projectFlowKind);
        navigate(path);
      } catch (e) {
        console.error("[Layout] 创建项目失败:", e);
      }
    })();
  };

  useEffect(() => {
    if (!location.pathname.startsWith("/create") && !location.pathname.startsWith("/image-create") && !location.pathname.startsWith("/outfit-create")) {
      return;
    }
    if (projectData.projectId) {
      return;
    }
    setSidebarCollapsed(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, projectData.projectId]); // setSidebarCollapsed 是稳定的 store 函数，无需加入依赖

  const handleBellClick = () => {
    setShowAnnouncementDropdown((v) => !v);
  };

  const toastIconByCategory = resolveLayoutToastIcon(activeToastNotification?.category);
  const visibleWorkflowSteps = useMemo(() => {
    // 图片项目使用独立的步骤配置
    if (isImageProjectFlow) {
      return imageProjectWorkflowSteps;
    }
    // 换装项目使用独立的步骤配置
    if (isOutfitChangeProjectFlow || projectData.projectKind === "outfit_change") {
      return outfitChangeWorkflowSteps;
    }
    return filterWorkflowStepsByProjectKind(layoutWorkflowSteps, projectData.projectKind ?? "video");
  }, [isImageProjectFlow, isOutfitChangeProjectFlow, projectData.projectKind]);
  const rawCurrentStep = resolveLayoutCurrentStep(location.pathname, layoutWorkflowSteps);
  const currentStep = clampProjectFlowStepForKind(rawCurrentStep, projectData.projectKind ?? "video");
  const canWorkflowStepJump = currentUser?.role === "admin";

  const _handleStepClick = (stepId: number) => {
      if (!canWorkflowStepJump) {
          return;
      }
      if (canNavigateToLayoutStep(stepId, currentStep)) {
          const targetStep = visibleWorkflowSteps.find((step) => step.id === stepId);
          if (!targetStep) {
            return;
          }
          // 动态构建带 projectId 的路径
          const pid = projectData.projectId ?? 'new';
          let targetPath: string;
          if (isImageProjectFlow) {
            targetPath = buildImageProjectCanonicalRoute(stepId, pid);
          } else if (isOutfitChangeProjectFlow || projectData.projectKind === "outfit_change") {
            targetPath = buildOutfitChangeCanonicalRoute(stepId, pid);
          } else {
            targetPath = buildFlow41CanonicalRoute(stepId, pid);
          }
          navigate(targetPath);
      }
  };

  const openNewProjectDialog = () => {
    setNewProjectDialogOpen(true);
  };

  const closeNewProjectDialog = () => {
    setNewProjectDialogOpen(false);
  };

  /** 点击卡片直接创建项目并跳转 */
  const handleCreateProject = (kind: ProjectFlowKind) => {
    closeNewProjectDialog();
    startNewProject(kind);
  };

  const displayProjectName = (projectData.projectName ?? "").trim() || "未命名项目";

  const commitProjectName = async (): Promise<void> => {
    const normalized = projectNameDraft.trim();
    const fallbackName = normalized || "未命名项目";
    const currentName = (projectData.projectName ?? "").trim();
    setProjectNameEditing(false);
    setProjectNameDraft(fallbackName);
    if (fallbackName === currentName) {
      return;
    }
    updateProjectData({ projectName: fallbackName });
    if (!token || !projectData.projectId) {
      return;
    }
    setProjectNameSaving(true);
    try {
      const updated = await backendApi.updateProject(token, projectData.projectId, fallbackName);
      updateProjectData({ projectName: updated.name });
      setProjectNameDraft(updated.name);
    } catch {
      updateProjectData({ projectName: currentName || fallbackName });
      setProjectNameDraft((currentName || fallbackName).trim());
    } finally {
      setProjectNameSaving(false);
    }
  };

  const startEditProjectName = (): void => {
    if (!isProjectFlow) {
      return;
    }
    setProjectNameEditing(true);
    setProjectNameDraft((projectData.projectName ?? "").trim() || "未命名项目");
  };

  const exitProjectFlowToProjects = async () => {
    if (!showProjectFlowFullscreenHeader) {
      return;
    }
    // 如果提供了自定义关闭处理，优先使用
    if (onExitProjectFlow) {
      await onExitProjectFlow();
      return;
    }
    if (hasProjectFlowUploadedImage) {
      const confirmed = await confirm(
        '项目进度会保留在"我的项目"中，可随时继续编辑。',
        '确认关闭当前项目编辑？'
      );
      if (!confirmed) {
        return;
      }
    }
    // 用户确认离开项目，清除活跃会话
    clearProjectFlowActiveSession();
    setProjectFlowSidebarHoverExpanded(false);
    setSidebarCollapsed(false);
    navigate("/projects");
  };

  return (
    <div className="flex h-screen bg-background-warm text-secondary font-sans overflow-hidden">
      {/* Toast Notification */}
      {shouldShowTaskToast && activeToastNotification && (
          <div
            data-testid="global-task-toast"
            className="fixed top-20 right-6 z-[60] animate-slide-in-right cursor-pointer"
            onClick={() => routeFromNotification(activeToastNotification)}
          >
              <div className="bg-white border border-gray-100 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 min-w-[300px] max-w-[420px]">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 shrink-0">
                      <span className="material-icons-round">{toastIconByCategory}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{activeToastNotification.title}</p>
                      <p className="text-xs text-gray-500 line-clamp-2">{activeToastNotification.detail}</p>
                  </div>
                  <span className="material-icons-round text-gray-300 text-sm shrink-0">chevron_right</span>
              </div>
          </div>
      )}

      {/* Mobile Backdrop */}
      {!hideSidebar && !sidebarCollapsed && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm md:hidden transition-opacity duration-300"
          onClick={toggleSidebar}
        />
      )}

      {!hideSidebar && (
        <aside className={`
            fixed inset-y-0 left-0 z-50 h-full bg-surface-white border-r border-gray-100 flex flex-col transition-all duration-300 ease-in-out
            w-64 shrink-0
            ${sidebarCollapsed ? '-translate-x-full md:translate-x-0' : 'translate-x-0'}
            ${sidebarCollapsedEffective ? 'md:w-20' : 'md:w-64'}
            md:relative shadow-2xl md:shadow-none
        `}
          onMouseEnter={() => {
            if (!isProjectFlow || !sidebarCollapsed) {
              return;
            }
            if (projectFlowSidebarHoverTimerRef.current !== null) {
              window.clearTimeout(projectFlowSidebarHoverTimerRef.current);
              projectFlowSidebarHoverTimerRef.current = null;
            }
            setProjectFlowSidebarHoverExpanded(true);
          }}
          onMouseLeave={() => {
            if (!isProjectFlow || !sidebarCollapsed) {
              return;
            }
            if (projectFlowSidebarHoverTimerRef.current !== null) {
              window.clearTimeout(projectFlowSidebarHoverTimerRef.current);
            }
            projectFlowSidebarHoverTimerRef.current = window.setTimeout(() => {
              setProjectFlowSidebarHoverExpanded(false);
              projectFlowSidebarHoverTimerRef.current = null;
            }, 180);
          }}
        >
          <div className={`h-16 flex items-center border-b border-gray-100 ${sidebarCollapsedEffective ? 'justify-center px-0' : 'px-6'}`}>
            <div className="flex items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.02]" onClick={() => navigate('/dashboard')}>
              <img
                src={theme.currentTheme?.logoUrl || '/logo.png'}
                alt={theme.currentTheme?.systemName || '内容喵'}
                className="w-10 h-10 rounded-lg object-contain shrink-0"
                onError={(event) => {
                  const target = event.target as HTMLImageElement;
                  if (target.src !== '/logo.png') {
                    target.src = '/logo.png';
                  }
                }}
              />
              {!sidebarCollapsedEffective && (
                <span className="font-bold text-xl tracking-tight text-secondary whitespace-nowrap">
                  {theme.currentTheme?.systemName || '内容喵'}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex-1 py-6 flex flex-col gap-2 px-3 overflow-y-auto no-scrollbar overflow-x-hidden">
            {/* Create Project CTA */}
            <button
              onClick={openNewProjectDialog}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-white mb-4 transition-all duration-200 hover:shadow-button hover:-translate-y-0.5 shadow-lg shadow-primary/20 group ${sidebarCollapsedEffective ? 'justify-center' : ''}`}
              title="新建项目"
            >
              <span className="material-icons-round text-xl group-hover:scale-110 group-hover:rotate-90 transition-transform duration-300">add_circle</span>
              {!sidebarCollapsedEffective && <span className="font-bold text-sm whitespace-nowrap">新建项目</span>}
            </button>

            {primarySidebarLinks.map((item) => (
              <SidebarLink
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                active={isLayoutRouteActive(location.pathname, item.to)}
                collapsed={sidebarCollapsedEffective}
              />
            ))}
            {/* 管理后台入口 - 仅管理员可见 */}
            {currentUser?.role === 'admin' && (
              <div className="mt-auto pt-4 border-t border-gray-100">
                <button
                  onClick={() => {
                    const adminPortalUrl = `${window.location.origin}/admin-portal?token=${encodeURIComponent(token || '')}&user=${encodeURIComponent(JSON.stringify(currentUser))}`;
                    window.open(adminPortalUrl, '_blank', 'noopener,noreferrer');
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    sidebarCollapsedEffective ? 'justify-center' : ''
                  } text-primary hover:bg-primary/10`}
                  title="管理后台"
                >
                  <span className="material-icons-round text-xl">admin_panel_settings</span>
                  {!sidebarCollapsedEffective && <span className="text-sm font-medium">管理后台</span>}
                </button>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-100">
            <button
              onClick={async () => {
                const confirmed = await confirm('退出后需要重新登录才能继续使用。', '确认退出登录？');
                if (!confirmed) return;
                // 先通知后端销毁 session（失败不阻塞本地清理）
                try { await backendApi.logout(); } catch { /* session 可能已过期，继续清理本地状态 */ }
                logout();
                window.location.hash = '/';
                navigate('/');
              }}
              className={`flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors border border-red-200`}
              title="退出登录"
            >
              <span className="material-icons-round text-xl">logout</span>
              {!sidebarCollapsedEffective && <span className="font-semibold text-sm whitespace-nowrap">退出登录</span>}
            </button>
          </div>
        </aside>
      )}

      <div className="flex-1 flex min-h-0 flex-col min-w-0 transition-all duration-300 w-full">
        {(!hideSidebar || showProjectFlowFullscreenHeader) && (
          <header className="h-16 bg-surface-white/80 backdrop-blur-sm border-b border-gray-100 flex items-center justify-between px-3 md:px-6 z-40 shrink-0 sticky top-0">
            <div className="flex items-center gap-3 flex-1 min-w-0">
               <div className={`shrink-0 ${isProjectFlow ? "flex flex-col items-center justify-center" : "flex items-center"}`}>
                 {showProjectFlowFullscreenHeader ? (
                   <button
                      onClick={exitProjectFlowToProjects}
                      className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-gray-300 text-gray-500 hover:text-gray-700 transition-all duration-200 shadow-sm hover:shadow"
                      title="关闭并返回我的项目"
                    >
                      <span className="material-icons-round text-lg group-hover:-translate-x-0.5 transition-transform">
                        arrow_back
                      </span>
                      <span className="text-sm font-medium hidden sm:inline">返回</span>
                    </button>
                 ) : (
                   <button
                      onClick={toggleSidebar}
                      className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors"
                      title="切换侧边栏"
                    >
                      <span className="material-icons-round text-xl">
                        {sidebarCollapsed ? 'menu' : 'menu_open'}
                      </span>
                   </button>
                 )}
                 {isProjectFlow && (
                   <span
                     className="mt-0.5 max-w-[86px] truncate text-[10px] font-semibold text-gray-400 md:hidden"
                     title={displayProjectName}
                   >
                     {displayProjectName}
                   </span>
                 )}
               </div>

               {/* Conditional Breadcrumb / Title */}
               {!isProjectFlow && (
                 <h1 className="text-lg font-bold text-gray-800 capitalize truncate">
                   {resolveLayoutTitle(location.pathname)}
                 </h1>
               )}

               {isProjectFlow && (
                 <div className="hidden md:flex items-center gap-2 min-w-0 max-w-[360px] md:max-w-[520px]">
                   {projectNameEditing ? (
                     <input
                       ref={projectNameInputRef}
                       type="text"
                       value={projectNameDraft}
                       onChange={(event) => setProjectNameDraft(event.target.value)}
                       onBlur={() => {
                         void commitProjectName();
                       }}
                       onKeyDown={(event) => {
                         if (event.key === "Enter") {
                           event.preventDefault();
                           void commitProjectName();
                         }
                         if (event.key === "Escape") {
                           event.preventDefault();
                           setProjectNameEditing(false);
                           setProjectNameDraft((projectData.projectName ?? "").trim() || "未命名项目");
                         }
                       }}
                       className="h-9 w-full px-3 rounded-md border border-gray-200 bg-white text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
                       aria-label="项目名称"
                     />
                   ) : (
                     <div
                       className="h-9 flex-1 min-w-0 px-3 rounded-md border border-gray-200 bg-white text-sm font-semibold text-gray-800 flex items-center gap-2"
                       title={displayProjectName}
                     >
                       {/* 项目类型标签 */}
                       {projectData.projectKind === "image" && (
                         <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                           图片
                         </span>
                       )}
                       {projectData.projectKind === "reverse" && (
                         <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                           反推
                         </span>
                       )}
                       {projectData.projectKind === "outfit_change" && (
                         <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                           换装
                         </span>
                       )}
                       {(projectData.projectKind === "video" || !projectData.projectKind) && (
                         <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                           视频
                         </span>
                       )}
                       <span className="truncate">{displayProjectName}</span>
                     </div>
                   )}
                   <button
                     type="button"
                     onClick={startEditProjectName}
                     disabled={projectNameSaving}
                     className="h-9 w-9 shrink-0 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 disabled:opacity-50"
                     aria-label="编辑项目名称"
                     title="编辑项目名称"
                   >
                     <span className={`material-icons-round text-base ${projectNameSaving ? "animate-pulse" : ""}`}>edit</span>
                   </button>
                 </div>
               )}
            </div>

            {isProjectFlow && (
              <LayoutWorkflowStepper
                currentStep={currentStep}
                steps={visibleWorkflowSteps}
              />
            )}

            <div className="flex items-center gap-4 flex-1 justify-end">
              {/* 任务队列按钮 */}
              <button
                onClick={() => setTaskQueueOpen(prev => !prev)}
                className="relative inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-primary-light flex items-center justify-center text-gray-500 hover:text-primary transition-all duration-200"
                title="任务队列"
              >
                <span className="material-icons-round text-lg">task_alt</span>
                {activeTaskCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-[9px] font-bold leading-none">
                    {activeTaskCount > 9 ? '9+' : activeTaskCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setShowThemeSelector(true)}
                className="w-9 h-9 rounded-full hover:bg-primary-light flex items-center justify-center text-gray-500 hover:text-primary transition-all duration-200"
                title="主题设置"
              >
                <span className="material-icons-round">palette</span>
              </button>

              {/* Notification Bell */}
              <div ref={announcementDropdownRef} className="relative">
                <button
                    onClick={handleBellClick}
                    className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors relative"
                >
                  <span className="material-icons-round">notifications</span>
                  {hasNotification && (
                      <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                  )}
                </button>

                {showAnnouncementDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <h3 className="font-bold text-sm text-gray-900">公告</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {announcementsLoading ? (
                        <div className="flex items-center justify-center py-8 text-gray-400 text-sm">加载中...</div>
                      ) : announcements.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                          <span className="material-icons-round text-3xl mb-1">campaign</span>
                          <span className="text-sm">暂无公告</span>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {announcements.map((item) => (
                            <div key={item.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                  {item.status === 'published' ? '已发布' : item.status === 'draft' ? '草稿' : '已归档'}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {item.publishedAt
                                    ? new Date(item.publishedAt).toLocaleDateString('zh-CN')
                                    : new Date(item.createdAt).toLocaleDateString('zh-CN')}
                                </span>
                              </div>
                              <h4 className="text-sm font-semibold text-gray-900 mb-1">{item.title}</h4>
                              <p className="text-xs text-gray-500 whitespace-pre-wrap line-clamp-4">{item.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* User Avatar */}
              <div ref={avatarDropdownRef} className="relative">
                <div
                    className="w-9 h-9 rounded-full bg-gradient-to-tr from-gray-100 to-gray-200 p-[2px] cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                    onClick={() => setShowUserDropdown((v) => !v)}
                    title="个人中心"
                >
                  <div className="rounded-full w-full h-full border border-white bg-gray-900 text-white flex items-center justify-center text-xs font-bold">
                    {avatarLabel}
                  </div>
                </div>

                {showUserDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 animate-fade-in overflow-hidden">
                    {/* Profile Header */}
                    <div className="p-4 border-b border-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center text-lg font-bold shrink-0">
                          {avatarLabel}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-gray-900 truncate">
                            {currentUser?.email?.split('@')[0] ?? '用户'}
                          </div>
                          <div className="text-xs text-gray-400 truncate">
                            {currentUser?.email ?? ''}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className="text-gray-400">当前积分</span>
                        {creditsDropdownLoading ? (
                          <span className="text-primary text-sm">...</span>
                        ) : credits?.balance != null ? (
                          <CreditBadge amount={credits.balance} variant="inline" />
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="p-2">
                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          navigate('/profile');
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <span className="material-icons-round text-lg text-gray-400">person</span>
                        个人中心
                      </button>
                      {/* 管理后台入口 - 仅管理员可见 */}
                      {currentUser?.role === 'admin' && (
                        <button
                          onClick={() => {
                            setShowUserDropdown(false);
                            // 打开独立管理后台页面（新标签页）
                            const adminPortalUrl = `${window.location.origin}/admin-portal?token=${encodeURIComponent(token || '')}&user=${encodeURIComponent(JSON.stringify(currentUser))}`;
                            window.open(adminPortalUrl, '_blank', 'noopener,noreferrer');
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors"
                        >
                          <span className="material-icons-round text-lg">admin_panel_settings</span>
                          管理后台
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          setShowUserDropdown(false);
                          const confirmed = await confirm('退出后需要重新登录才能继续使用。', '确认退出登录？');
                          if (!confirmed) return;
                          try { await backendApi.logout(); } catch { /* session 可能已过期，继续清理本地状态 */ }
                          logout();
                          window.location.hash = '/';
                          navigate('/');
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <span className="material-icons-round text-lg">logout</span>
                        退出登录
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>
        )}
        <main className="relative flex flex-1 min-h-0 flex-col overflow-y-auto">
          {children}
        </main>
      </div>

      {/* 任务队列面板 */}
      <TaskQueuePanel
        isOpen={taskQueueOpen}
        onClose={() => setTaskQueueOpen(false)}
        activeTaskCount={activeTaskCount}
      />

      <ThemeSelector
        isOpen={showThemeSelector}
        onClose={() => setShowThemeSelector(false)}
      />
      <NewProjectTypeDialog
        open={newProjectDialogOpen}
        onClose={closeNewProjectDialog}
        onCreateProject={handleCreateProject}
      />
      {/* 管理员 LLM 调试气泡 — 全局显示 */}
      {currentUser?.role === "admin" && <LlmDebugBubble />}
      {/* 401 重登录弹窗 — 不刷新页面 */}
      <AuthReLoginModal />
      {/* 确认对话框由全局 ConfirmDialogProvider 渲染 */}
    </div>
  );
};

/** Layout 直接导出 LayoutInner（ConfirmDialogProvider 已提升到 App.tsx） */
export const Layout: React.FC<{
  children: React.ReactNode;
  hideSidebar?: boolean;
  projectFullscreen?: boolean;
  onExitProjectFlow?: () => Promise<void> | void;
}> = (props) => (
  <LayoutInner {...props} />
);
