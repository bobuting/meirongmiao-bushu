import React, { Component, Suspense, lazy, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from './store/useAppStore';
import { useSSE } from './hooks/useSSE';

// Loading fallback component
const PageLoading: React.FC = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
    <div className="flex flex-col items-center gap-4">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-primary" />
      <p className="text-sm text-gray-500">加载项目中...</p>
    </div>
  </div>
);

// 根级错误边界：捕获整页渲染错误，避免白屏
class RootErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[RootErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <h2>页面出现错误</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>刷新页面</button>
          <button onClick={() => { this.setState({ hasError: false, error: null }); }}>重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Step7 → step5 重定向组件（在 /create/:projectId/step7 下使用） */
const Step7Redirect: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  return <Navigate to={`/create/${projectId}/step5`} replace />;
};

// Pages - Lazy loaded for code splitting (路由级分包)
const Login = lazy(() => import('./pages/auth/Login').then(m => ({ default: m.Login })));
const Square = lazy(() => import('./pages/square/Square').then(m => ({ default: m.Square })));
const ReverseScript = lazy(() => import('./pages/reverse-script/ReverseScript').then(m => ({ default: m.ReverseScript })));
const MusicLibrary = lazy(() => import('./pages/music/MusicLibrary').then(m => ({ default: m.MusicLibrary })));
const CharacterManagement = lazy(() => import('./pages/characters/CharacterManagement').then(m => ({ default: m.CharacterManagement })));
const Profile = lazy(() => import('./pages/profile/Profile').then(m => ({ default: m.Profile })));
const MyProjects = lazy(() => import('./pages/projects/MyProjects').then(m => ({ default: m.MyProjects })));
const AssetLibrary = lazy(() => import('./pages/assets/AssetLibrary').then(m => ({ default: m.AssetLibrary })));
const CreditBadgePreview = lazy(() => import('./pages/CreditBadgePreview').then(m => ({ default: m.CreditBadgePreview })));
const AdminPortal = lazy(() => import('./pages/admin-portal/AdminPortal').then(m => ({ default: m.AdminPortal })));
const Step6FissionScreen = lazy(() => import('./pages/project-flow/step6-fission/Step6FissionScreen').then(m => ({ default: m.Step6FissionScreen })));
const ProjectShare = lazy(() => import('./pages/share/ProjectShare').then(m => ({ default: m.ProjectShare })));

// Project Flow Pages - Core pages (keep eager for smooth flow)
const ProjectLayout = lazy(() => import('./pages/project-flow/ProjectLayout').then(m => ({ default: m.ProjectLayout })));
const Assets = lazy(() => import('./pages/project-flow/Assets').then(m => ({ default: m.Assets })));
const CharacterSelection = lazy(() => import('./pages/project-flow/CharacterSelection').then(m => ({ default: m.CharacterSelection })));
const ProjectFlowRouteBoundary = lazy(() => import('./pages/project-flow/ProjectFlowRouteBoundary').then(m => ({ default: m.ProjectFlowRouteBoundary })));
const ProjectFlowKindRouteGuard = lazy(() => import('./pages/project-flow/ProjectFlowKindRouteGuard').then(m => ({ default: m.ProjectFlowKindRouteGuard })));
const Step3WorkspaceRoute = lazy(() => import('./pages/project-flow/step3-workspace/Step3WorkspaceRoute').then(m => ({ default: m.Step3WorkspaceRoute })));
const Step4VideoWorkspaceRoute = lazy(() => import('./pages/project-flow/step4-video-workspace/Step4VideoWorkspaceRoute').then(m => ({ default: m.Step4VideoWorkspaceRoute })));
const Step5DeliveryShellRoute = lazy(() => import('./pages/project-flow/step5-delivery-shell/Step5DeliveryShellRoute').then(m => ({ default: m.Step5DeliveryShellRoute })));
const Step6FissionRoute = lazy(() => import('./pages/project-flow/step6-fission/Step6FissionRoute').then(m => ({ default: m.Step6FissionRoute })));

// Outfit Change Project Pages
const OutfitChangeLayout = lazy(() => import('./pages/outfit-change/OutfitChangeLayout').then(m => ({ default: m.OutfitChangeLayout })));
const OutfitChangeStep1 = lazy(() => import('./pages/outfit-change/OutfitChangeStep1').then(m => ({ default: m.OutfitChangeStep1 })));
const OutfitChangeStep2 = lazy(() => import('./pages/outfit-change/OutfitChangeStep2').then(m => ({ default: m.OutfitChangeStep2 })));
const OutfitChangeStep3 = lazy(() => import('./pages/outfit-change/OutfitChangeStep3').then(m => ({ default: m.OutfitChangeStep3 })));
const OutfitChangeStep4 = lazy(() => import('./pages/outfit-change/OutfitChangeStep4').then(m => ({ default: m.OutfitChangeStep4 })));

// Image Project Pages
const ImageProjectLayout = lazy(() => import('./pages/image-project/ImageProjectLayout').then(m => ({ default: m.ImageProjectLayout })));
const ImageAssets = lazy(() => import('./pages/image-project/ImageAssets').then(m => ({ default: m.ImageAssets })));
const ImageCharacterSelection = lazy(() => import('./pages/image-project/ImageCharacterSelection').then(m => ({ default: m.ImageCharacterSelection })));
const ImageModelPhotos = lazy(() => import('./pages/image-project/ImageModelPhotos').then(m => ({ default: m.ImageModelPhotos })));
const ImageEcommerceEditor = lazy(() => import('./pages/image-project/ImageEcommerceEditor').then(m => ({ default: m.ImageEcommerceEditorRoute })));
const ImageProductSharePreview = lazy(() => import('./pages/image-project/ImageProductSharePreview').then(m => ({ default: m.ImageProductSharePreview })));

// Tools - 独立工具页面（无需登录）
const ImageViewerPage = lazy(() => import('./pages/tools/image-viewer/ImageViewer').then(m => ({ default: m.ImageViewer })));
const JsonFormatterPage = lazy(() => import('./pages/tools/json-formatter/JsonFormatter').then(m => ({ default: m.JsonFormatter })));

// Layout - Keep eager (used immediately)
import { Layout } from './components/Layout';
import { ConfirmDialogProvider } from './components/ui/ConfirmDialog';
import { ToastProvider } from './components/ui/Toast';

// Create a client - 禁用自动重试，避免失败时多次请求
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const token = useAppStore((state) => state.token);
  const currentUser = useAppStore((state) => state.currentUser);
  const authModalVisible = useAppStore((state) => state.authModalVisible);
  // 401 重登录弹窗打开时，保留当前页面不跳转（用户正在重新登录）
  if ((!token || !currentUser) && !authModalVisible) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const HomeRoute: React.FC = () => {
  const token = useAppStore((state) => state.token);
  const currentUser = useAppStore((state) => state.currentUser);
  // 已登录跳转到 dashboard，未登录跳转到登录页
  if (token && currentUser) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/login" replace />;
};

// Suspense wrapper for lazy loaded pages
const LazyPage: React.FC<{ children: React.ReactElement }> = ({ children }) => (
  <Suspense fallback={<PageLoading />}>{children}</Suspense>
);

const App: React.FC = () => {
  // ============================================================================
  // SSE 实时任务更新：替代轮询，服务端主动推送
  // ============================================================================
  const token = useAppStore((state) => state.token);

  // 启用 SSE 连接（登录后自动连接，登出后自动断开）
  useSSE({ enabled: !!token });

  // App 挂载后移除加载遮罩
  useEffect(() => {
    const removeOverlay = () => {
      const overlay = document.getElementById('loading-overlay');
      if (overlay) {
        overlay.classList.add('hidden');
        setTimeout(() => overlay.remove(), 300);
      }
    };

    // 检查 Tailwind 样式是否已加载
    const checkStylesLoaded = () => {
      // 开发模式：Vite 会注入 style 元素带 data-vite-dev-id
      const styleElements = document.querySelectorAll('style[data-vite-dev-id]');
      const hasTailwind = Array.from(styleElements).some(el =>
        el.textContent?.includes('tailwind') ||
        el.textContent?.includes('flex') ||
        el.textContent?.length > 10000
      );
      if (hasTailwind || styleElements.length >= 3) return true;

      // 生产模式：CSS 通过 <link> 标签加载，检查 link stylesheet
      const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
      if (linkElements.length > 0) return true;

      return false;
    };

    const tryRemove = () => {
      if (!checkStylesLoaded()) {
        setTimeout(tryRemove, 100);
        return;
      }
      setTimeout(removeOverlay, 200);
    };

    // 等待字体和样式加载，加 3s 超时兜底防止无限轮询
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      removeOverlay();
    }, 3000);

    if (document.fonts && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(() => {
        if (!timedOut) tryRemove();
      });
    } else {
      tryRemove();
    }

    return () => clearTimeout(timeout);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmDialogProvider>
        <ToastProvider>
          <RootErrorBoundary>
            <Router>
        <Routes>
          {/* Home always redirects to login page */}
          <Route path="/" element={<HomeRoute />} />
          <Route path="/login" element={<LazyPage><Login /></LazyPage>} />

          {/* 公开分享页面（无需登录） */}
          <Route path="/share/:projectId" element={<LazyPage><ProjectShare /></LazyPage>} />
          {/* 图片项目分享页面（无需登录） */}
          <Route path="/share-image/:projectId" element={<LazyPage><ImageProductSharePreview /></LazyPage>} />

          {/* Main App Routes - All wrapped in their specific page components which use Layout */}
          <Route path="/dashboard" element={<RequireAuth><LazyPage><Square /></LazyPage></RequireAuth>} />
          <Route path="/reverse" element={<RequireAuth><LazyPage><ReverseScript /></LazyPage></RequireAuth>} />
          <Route path="/music" element={<RequireAuth><LazyPage><MusicLibrary /></LazyPage></RequireAuth>} />
          <Route path="/characters" element={<RequireAuth><LazyPage><CharacterManagement /></LazyPage></RequireAuth>} />

          {/* Project Creation Flow - 新建项目（无 projectId） */}
          <Route
            path="/create/new"
            element={
              <RequireAuth>
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="项目流程容器" recoveryPath="/projects">
                    <ProjectLayout />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              </RequireAuth>
            }
          >
             <Route index element={<Navigate to="step1" replace />} />
             <Route path="step1" element={<LazyPage><ProjectFlowRouteBoundary screenLabel="Step 1 上传与搭配" recoveryPath="/projects"><Assets /></ProjectFlowRouteBoundary></LazyPage>} />
          </Route>

          {/* Project Creation Flow - 已有项目（带 projectId） */}
          <Route
            path="/create/:projectId"
            element={
              <RequireAuth>
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="项目流程容器" recoveryPath="/projects">
                    <ProjectLayout />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              </RequireAuth>
            }
          >
             <Route index element={<Navigate to="step1" replace />} />
             <Route path="step1" element={<LazyPage><ProjectFlowRouteBoundary screenLabel="Step 1 上传与搭配" recoveryPath="/projects"><Assets /></ProjectFlowRouteBoundary></LazyPage>} />
             <Route path="step2" element={<LazyPage><ProjectFlowRouteBoundary screenLabel="Step 2 角色定妆" recoveryPath="/projects" previousPath="/create/:projectId/step1"><CharacterSelection /></ProjectFlowRouteBoundary></LazyPage>} />
             <Route path="step3" element={<LazyPage><ProjectFlowKindRouteGuard step={3}><Step3WorkspaceRoute /></ProjectFlowKindRouteGuard></LazyPage>} />
             <Route path="step4" element={<LazyPage><ProjectFlowKindRouteGuard step={4}><Step4VideoWorkspaceRoute /></ProjectFlowKindRouteGuard></LazyPage>} />
             <Route path="step5" element={<LazyPage><ProjectFlowKindRouteGuard step={5}><Step5DeliveryShellRoute /></ProjectFlowKindRouteGuard></LazyPage>} />
             <Route path="step6" element={<LazyPage><ProjectFlowKindRouteGuard step={6}><Step6FissionRoute /></ProjectFlowKindRouteGuard></LazyPage>} />
             <Route path="step7" element={<Step7Redirect />} />
          </Route>

          {/* 旧路由兼容重定向 */}
          <Route path="/create/step1" element={<Navigate to="/create/new/step1" replace />} />
          <Route path="/create/step2" element={<Navigate to="/create/new/step2" replace />} />
          <Route path="/create/step3" element={<Navigate to="/create/new/step3" replace />} />
          <Route path="/create/step4" element={<Navigate to="/create/new/step4" replace />} />
          <Route path="/create/step5" element={<Navigate to="/create/new/step5" replace />} />

          {/* Image Project Creation Flow - 新建项目 */}
          <Route
            path="/image-create/new"
            element={
              <RequireAuth>
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="图片项目流程" recoveryPath="/projects">
                    <ImageProjectLayout />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="step1" replace />} />
            <Route
              path="step1"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="图片 Step 1 服装搭配" recoveryPath="/projects">
                    <ImageAssets />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
            <Route
              path="step2"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="图片 Step 2 角色定妆" recoveryPath="/projects" previousPath="/image-create/new/step1">
                    <ImageCharacterSelection />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
            <Route
              path="step3"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="图片 Step 3 模特图生成" recoveryPath="/projects" previousPath="/image-create/new/step2">
                    <ImageModelPhotos />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
            <Route
              path="step4"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="图片 Step 4 电商详情页" recoveryPath="/projects" previousPath="/image-create/new/step3">
                    <ImageEcommerceEditor />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
          </Route>

          {/* Image Project Creation Flow - 已有项目 */}
          <Route
            path="/image-create/:projectId"
            element={
              <RequireAuth>
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="图片项目流程" recoveryPath="/projects">
                    <ImageProjectLayout />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="step1" replace />} />
            <Route
              path="step1"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="图片 Step 1 服装搭配" recoveryPath="/projects">
                    <ImageAssets />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
            <Route
              path="step2"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="图片 Step 2 角色定妆" recoveryPath="/projects" previousPath="/image-create/:projectId/step1">
                    <ImageCharacterSelection />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
            <Route
              path="step3"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="图片 Step 3 模特图生成" recoveryPath="/projects" previousPath="/image-create/:projectId/step2">
                    <ImageModelPhotos />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
            <Route
              path="step4"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="图片 Step 4 电商详情页" recoveryPath="/projects" previousPath="/image-create/:projectId/step3">
                    <ImageEcommerceEditor />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
          </Route>

          {/* 图片预览工具 - 独立路由页面 */}
          <Route
            path="/image-viewer"
            element={
              <LazyPage><ImageViewerPage /></LazyPage>
            }
          />

          {/* JSON 格式化工具 - 独立路由页面 */}
          <Route
            path="/json"
            element={
              <LazyPage><JsonFormatterPage /></LazyPage>
            }
          />

          {/* 旧图片项目路由兼容重定向 */}
          <Route path="/image-create/step1" element={<Navigate to="/image-create/new/step1" replace />} />
          <Route path="/image-create/step2" element={<Navigate to="/image-create/new/step2" replace />} />
          <Route path="/image-create/step3" element={<Navigate to="/image-create/new/step3" replace />} />
          <Route path="/image-create/step4" element={<Navigate to="/image-create/new/step4" replace />} />

          {/* Outfit Change Project Creation Flow - 新建项目 */}
          <Route
            path="/outfit-create/new"
            element={
              <RequireAuth>
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="换装项目流程" recoveryPath="/projects">
                    <OutfitChangeLayout />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="step1" replace />} />
            <Route
              path="step1"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="换装 Step 1 选择视频" recoveryPath="/projects">
                    <OutfitChangeStep1 />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
            <Route
              path="step2"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="换装 Step 2 选择服装" recoveryPath="/projects" previousPath="/outfit-create/new/step1">
                    <OutfitChangeStep2 />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
            <Route
              path="step3"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="换装 Step 3 选择角色" recoveryPath="/projects" previousPath="/outfit-create/new/step2">
                    <OutfitChangeStep3 />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
            <Route
              path="step4"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="换装 Step 4 一键换装" recoveryPath="/projects" previousPath="/outfit-create/new/step3">
                    <OutfitChangeStep4 />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
          </Route>

          {/* Outfit Change Project Creation Flow - 已有项目 */}
          <Route
            path="/outfit-create/:projectId"
            element={
              <RequireAuth>
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="换装项目流程" recoveryPath="/projects">
                    <OutfitChangeLayout />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="step1" replace />} />
            <Route
              path="step1"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="换装 Step 1 选择视频" recoveryPath="/projects">
                    <OutfitChangeStep1 />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
            <Route
              path="step2"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="换装 Step 2 选择服装" recoveryPath="/projects" previousPath="/outfit-create/:projectId/step1">
                    <OutfitChangeStep2 />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
            <Route
              path="step3"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="换装 Step 3 选择角色" recoveryPath="/projects" previousPath="/outfit-create/:projectId/step2">
                    <OutfitChangeStep3 />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
            <Route
              path="step4"
              element={
                <LazyPage>
                  <ProjectFlowRouteBoundary screenLabel="换装 Step 4 一键换装" recoveryPath="/projects" previousPath="/outfit-create/:projectId/step3">
                    <OutfitChangeStep4 />
                  </ProjectFlowRouteBoundary>
                </LazyPage>
              }
            />
          </Route>

          <Route path="/projects" element={<RequireAuth><LazyPage><MyProjects /></LazyPage></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><LazyPage><Profile /></LazyPage></RequireAuth>} />
          <Route path="/credit-badge-preview" element={<RequireAuth><LazyPage><CreditBadgePreview /></LazyPage></RequireAuth>} />

          {/* 独立管理后台入口（新标签页打开，不使用 Layout） */}
          <Route path="/admin-portal" element={<LazyPage><AdminPortal /></LazyPage>} />

          <Route path="/fission/:projectId" element={<RequireAuth><Layout hideSidebar projectFullscreen><LazyPage><Step6FissionScreen/></LazyPage></Layout></RequireAuth>} />
          <Route path="/asset-library" element={<RequireAuth><LazyPage><AssetLibrary /></LazyPage></RequireAuth>} />

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
          </RootErrorBoundary>
        </ToastProvider>
      </ConfirmDialogProvider>
    </QueryClientProvider>
  );
};

export default App;