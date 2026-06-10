/**
 * 独立管理后台入口
 *
 * 特点：
 * 1. 独立页面布局，不与用户页面混在一起
 * 2. 通过 URL params 接收 token（从用户页面跳转时携带）
 * 3. 所有管理模块通过 Tab 导航
 */

import React, { useEffect, useState, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate, Navigate } from 'react-router';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { ScriptManagementPanel } from './ScriptManagementPanel';
import { LlmDebugBubble } from '../project-flow/LlmDebugBubble';
import { AuthReLoginModal } from '../../components/AuthReLoginModal';
import { backendApi } from '../../services/backendApi';

// ========== 管理模块组件（懒加载）==========
const ReviewDashboard = lazy(() => import('../review-admin/ReviewDashboard').then(m => ({ default: m.ReviewDashboard })));
const SkillsManagementPanel = lazy(() => import('../admin/SkillsManagementPanel').then(m => ({ default: m.SkillsManagementPanel })));
const AnnouncementManagement = lazy(() => import('../admin/AnnouncementManagement').then(m => ({ default: m.AnnouncementManagement })));
const SquareTemplateManagement = lazy(() => import('../admin/SquareTemplateManagement').then(m => ({ default: m.SquareTemplateManagement })));
const ModelManagementPage = lazy(() => import('../admin-model-management/ModelManagementPage').then(m => ({ default: m.ModelManagementPage })));
const DeletedDataManagement = lazy(() => import('../admin/deleted-data').then(m => ({ default: m.DeletedDataManagement })));
const LogsManagement = lazy(() => import('../admin/LogsManagement'));
const FileRegistryManagement = lazy(() => import('../admin/FileRegistryManagement').then(m => ({ default: m.FileRegistryManagement })));
const HotTrendAssetManagement = lazy(() => import('../admin/HotTrendAssetManagement').then(m => ({ default: m.HotTrendAssetManagement })));
const ApiConfigManagement = lazy(() => import('../admin/ApiConfigManagement').then(m => ({ default: m.ApiConfigManagement })));
const CreditManagement = lazy(() => import('../admin/CreditManagement').then(m => ({ default: m.CreditManagement })));
const UserManagement = lazy(() => import('../admin/UserManagement').then(m => ({ default: m.UserManagement })));
const BusinessConfigManagement = lazy(() => import('../admin/BusinessConfigManagement').then(m => ({ default: m.BusinessConfigManagement })));
const AestheticLibraryManagement = lazy(() => import('../admin/AestheticLibraryManagement').then(m => ({ default: m.AestheticLibraryManagement })));
const SceneLibraryManagement = lazy(() => import('../admin/SceneLibraryManagement').then(m => ({ default: m.SceneLibraryManagement })));
const EmotionArchetypeLibraryManagement = lazy(() => import('../admin/EmotionArchetypeLibraryManagement').then(m => ({ default: m.EmotionArchetypeLibraryManagement })));
const CapabilityLab = lazy(() => import('../admin/CapabilityLab').then(m => ({ default: m.CapabilityLab })));
const VideoMusicManagement = lazy(() => import('../video-music/VideoMusicManagement').then(m => ({ default: m.VideoMusicManagement })));
const VideoMerge = lazy(() => import('../video-merge/VideoMerge').then(m => ({ default: m.VideoMerge })));
const TaskManagementPanel = lazy(() => import('../admin/TaskManagementPanel').then(m => ({ default: m.TaskManagementPanel })));
const ProjectManagement = lazy(() => import('../admin/ProjectManagement').then(m => ({ default: m.ProjectManagement })));
const FinalVideosManagement = lazy(() => import('../admin/FinalVideosManagement').then(m => ({ default: m.default })));
const ActionTemplateManagement = lazy(() => import('../admin/ActionTemplateManagement').then(m => ({ default: m.ActionTemplateManagement })));

// 懒加载包装组件
const LazyModule: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
    </div>
  }>
    {children}
  </Suspense>
);

// 管理模块 Tab 定义（分组）
interface AdminTabItem {
  id: string;
  label: string;
  icon: string;
  group?: string;
}

const ADMIN_TABS: AdminTabItem[] = [
  // 核心配置
  { id: 'review', label: '基础配置', icon: 'rate_review', group: '核心配置' },
  { id: 'api-config', label: 'API 配置', icon: 'api', group: '核心配置' },
  { id: 'business-config', label: '业务配置', icon: 'settings', group: '核心配置' },
  { id: 'credit', label: '积分管理', icon: 'payments', group: '核心配置' },
  { id: 'user-management', label: '用户管理', icon: 'people', group: '核心配置' },
  // 系统运维
  { id: 'projects', label: '项目管理', icon: 'folder_open', group: '系统运维' },
  { id: 'final-videos', label: '成片管理', icon: 'movie', group: '系统运维' },
  { id: 'models', label: '模型管理', icon: 'memory', group: '系统运维' },
  { id: 'tasks', label: '任务管理', icon: 'task_alt', group: '系统运维' },
  { id: 'files', label: '文件注册', icon: 'folder', group: '系统运维' },
  { id: 'logs', label: '日志查看', icon: 'article', group: '系统运维' },
  { id: 'deleted-data', label: '已删数据', icon: 'delete', group: '系统运维' },
  // 内容管理
  { id: 'scripts', label: '脚本管理', icon: 'description', group: '内容管理' },
  { id: 'skills', label: 'Skills 管理', icon: 'psychology', group: '内容管理' },
  { id: 'square-templates', label: '创作广场', icon: 'grid_view', group: '内容管理' },
  { id: 'action-templates', label: '动作模板', icon: 'directions_run', group: '内容管理' },
  { id: 'announcements', label: '公告管理', icon: 'campaign', group: '内容管理' },
  // 素材库
  { id: 'aesthetic-library', label: '审美库', icon: 'palette', group: '素材库' },
  { id: 'scene-library', label: '场景库', icon: 'landscape', group: '素材库' },
  { id: 'emotion-archetype', label: '情绪原型库', icon: 'mood', group: '素材库' },
  { id: 'video-music', label: '视频音乐', icon: 'music_note', group: '素材库' },
  { id: 'hot-trend', label: '热点资产', icon: 'local_fire_department', group: '素材库' },
  // 工具
  { id: 'video-merge', label: '视频合并', icon: 'merge', group: '工具' },
  { id: 'capability-lab', label: '能力实验室', icon: 'science', group: '工具' },
];

/**
 * 管理后台 Shell 组件
 */
const AdminPortalShell: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { token, currentUser, setSession, logout } = useAppStore(useShallow((state) => ({ token: state.token, currentUser: state.currentUser, setSession: state.setSession, logout: state.logout })));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 从 URL 读取当前 Tab，默认为 'review'
  const activeTab = searchParams.get('tab') || 'review';

  // 切换 Tab 时更新 URL
  const handleTabChange = (tabId: string) => {
    setSearchParams({ tab: tabId }, { replace: true });
  };

  // ========== Token 接收与清理 ==========
  useEffect(() => {
    const tokenFromUrl = searchParams.get('token');
    const userFromUrl = searchParams.get('user');

    if (tokenFromUrl && !token) {
      // 从 URL 接收 token 和 user，一次性存储
      let user = null;
      if (userFromUrl) {
        try {
          user = JSON.parse(decodeURIComponent(userFromUrl));
        } catch (e) {
          console.error('[AdminPortal] Failed to parse user from URL:', e);
        }
      }
      setSession(tokenFromUrl, user);

      // 清理 URL 中的 token（避免暴露），但保留 tab 参数
      const currentTab = searchParams.get('tab');
      navigate(currentTab ? `/admin-portal?tab=${currentTab}` : '/admin-portal', { replace: true });
    }
  }, [searchParams, token, setSession, navigate]);

  // ========== 权限检查 ==========
  if (!token || !currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <span className="material-icons-round text-6xl text-gray-300">lock</span>
          <h1 className="mt-4 text-xl font-semibold text-gray-700">无访问权限</h1>
          <p className="mt-2 text-gray-500">此页面仅限管理员访问</p>
          <button
            onClick={() => window.close()}
            className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            关闭页面
          </button>
        </div>
      </div>
    );
  }

  // ========== 渲染管理模块 ==========
  const renderTabContent = () => {
    switch (activeTab) {
      case 'review':
        return <LazyModule><ReviewDashboard /></LazyModule>;
      case 'api-config':
        return <LazyModule><ApiConfigManagement /></LazyModule>;
      case 'user-management':
        return <LazyModule><UserManagement /></LazyModule>;
      case 'credit':
        return <LazyModule><CreditManagement /></LazyModule>;
      case 'scripts':
        return <ScriptManagementPanel />;
      case 'tasks':
        return <LazyModule><TaskManagementPanel /></LazyModule>;
      case 'projects':
        return <LazyModule><ProjectManagement /></LazyModule>;
      case 'final-videos':
        return <LazyModule><FinalVideosManagement /></LazyModule>;
      case 'skills':
        return <LazyModule><SkillsManagementPanel /></LazyModule>;
      case 'models':
        return <LazyModule><ModelManagementPage /></LazyModule>;
      case 'announcements':
        return <LazyModule><AnnouncementManagement /></LazyModule>;
      case 'square-templates':
        return <LazyModule><SquareTemplateManagement /></LazyModule>;
      case 'action-templates':
        return <LazyModule><ActionTemplateManagement /></LazyModule>;
      case 'video-music':
        return <LazyModule><VideoMusicManagement /></LazyModule>;
      case 'video-merge':
        return <LazyModule><VideoMerge /></LazyModule>;
      case 'hot-trend':
        return <LazyModule><HotTrendAssetManagement /></LazyModule>;
      case 'aesthetic-library':
        return <LazyModule><AestheticLibraryManagement /></LazyModule>;
      case 'scene-library':
        return <LazyModule><SceneLibraryManagement /></LazyModule>;
      case 'emotion-archetype':
        return <LazyModule><EmotionArchetypeLibraryManagement /></LazyModule>;
      case 'capability-lab':
        return <LazyModule><CapabilityLab /></LazyModule>;
      case 'business-config':
        return <LazyModule><BusinessConfigManagement /></LazyModule>;
      case 'logs':
        return <LazyModule><LogsManagement /></LazyModule>;
      case 'files':
        return <LazyModule><FileRegistryManagement /></LazyModule>;
      case 'deleted-data':
        return <LazyModule><DeletedDataManagement /></LazyModule>;
      default:
        return <div className="p-6 text-gray-500">模块开发中...</div>;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 侧边栏 - 固定不动 */}
      <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64'} bg-white border-r border-gray-200 flex flex-col h-full`}>
        {/* 头部 */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Logo" className="h-8 w-8 rounded-lg" loading="eager" />
              {!sidebarCollapsed && (
                <h1 className="text-lg font-bold text-gray-900">管理后台</h1>
              )}
            </div>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              <span className="material-icons-round text-gray-600">
                {sidebarCollapsed ? 'chevron_right' : 'chevron_left'}
              </span>
            </button>
          </div>
        </div>

        {/* Tab 导航 - 内部可滚动 */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {(() => {
            let lastGroup = '';
            return ADMIN_TABS.map((tab) => {
              const showGroup = !sidebarCollapsed && tab.group && tab.group !== lastGroup;
              if (tab.group) lastGroup = tab.group;
              return (
                <React.Fragment key={tab.id}>
                  {showGroup ? (
                    <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {tab.group}
                    </div>
                  ) : null}
                  <button
                    onClick={() => handleTabChange(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      activeTab === tab.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-gray-600 hover:bg-gray-100'
                    } ${sidebarCollapsed ? 'justify-center' : ''}`}
                    title={sidebarCollapsed ? tab.label : ''}
                  >
                    <span className="material-icons-round text-xl">{tab.icon}</span>
                    {!sidebarCollapsed && <span className="text-sm">{tab.label}</span>}
                  </button>
                </React.Fragment>
              );
            });
          })()}
        </nav>

        {/* 退出登录 */}
        <div className="p-2 border-t border-gray-200">
          <button
            onClick={async () => {
              const confirmed = window.confirm('退出后需要重新登录才能继续使用。确认退出登录？');
              if (!confirmed) return;
              try { await backendApi.logout(); } catch { /* session 可能已过期，继续清理本地状态 */ }
              logout();
              navigate('/login', { replace: true });
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors border border-red-200 ${sidebarCollapsed ? 'justify-center' : ''}`}
            title={sidebarCollapsed ? '退出登录' : ''}
          >
            <span className="material-icons-round text-xl">logout</span>
            {!sidebarCollapsed && <span className="font-semibold text-sm whitespace-nowrap">退出登录</span>}
          </button>
        </div>
      </aside>

      {/* 主内容区 - 独立滚动 */}
      <main className="flex-1 overflow-y-auto h-full">
        {renderTabContent()}
      </main>

      {/* 管理员 LLM 调试气泡 */}
      <LlmDebugBubble />

      {/* 401 重登录弹窗 */}
      <AuthReLoginModal />
    </div>
  );
};

/**
 * AdminPortal 入口组件
 */
export const AdminPortal: React.FC = () => {
  return <AdminPortalShell />;
};