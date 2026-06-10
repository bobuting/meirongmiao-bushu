import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { Layout } from '../../components/Layout';
import { useAppStore } from '../../store/useAppStore';
import { useProjectState, clearProjectQueries } from '../../hooks/useProjectState';
import { backendApi } from '../../services/backendApi';
import { SaveStatusIndicator } from '../../components/shared/SaveStatusIndicator';
import { GlobalTimer } from '../../components/shared/GlobalTimer';
import { ProjectNotFoundError } from './ProjectNotFoundError';
import { useConfirm } from '../../components/ui/ConfirmDialog';

import { resolveFlow41CanonicalStepFromPath } from './flow41RouteNormalization';
import {
  clearProjectFlowActiveSession,
  writeProjectFlowActiveSession,
} from './projectFlowActiveSession';

function parseStepFromPath(pathname: string): number | null {
  return resolveFlow41CanonicalStepFromPath(pathname);
}

export const ProjectLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const token = useAppStore((state) => state.token);
  const { workflow, projectData, updateProjectData, isInitialLoading: workflowLoading } = useProjectState(urlProjectId);
  const step1OutfitModules = (workflow.videoGarmentModules as Array<{ mainImage?: unknown }>) ?? [];
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed);
  const setGlobalTimerStart = useAppStore((state) => state.setGlobalTimerStart);
  const { confirm } = useConfirm();
  const isClosingProjectRef = useRef(false);

  // 项目不存在错误状态
  const [projectNotFoundError, setProjectNotFoundError] = useState(false);
  // 初始化加载状态：snapshot 数据加载完成前显示全屏 loading
  const [initialLoading, setInitialLoading] = useState(true);

  // 关闭项目时的清理逻辑：无实质内容的空项目自动删除
  const clearProjectState = useAppStore((state) => state.clearProjectState);
  const handleCloseProject = useCallback(async () => {
    console.log('[handleCloseProject] 开始执行关闭清理');
    // 综合判断项目是否有实质内容（不只检查 Step1 主图）
    const hasSubstantialContent =
      step1OutfitModules.some((m) => m.mainImage) || // Step1 有主图
      Boolean(projectData.selectedOutfitPlanId) || // Step1 已选搭配方案
      Boolean(projectData.selectedPreviewId) || // Step2 已选预览角色
      Boolean(projectData.activeScriptId); // Step3+ 已有脚本

    // 有实质内容时需要确认
    if (hasSubstantialContent) {
      const confirmed = await confirm(
        '项目进度会保留在"我的项目"中，可随时继续编辑。',
        '确认关闭当前项目编辑？'
      );
      if (!confirmed) {
        console.log('[handleCloseProject] 用户取消关闭');
        return;
      }
    }

    // 标记正在关闭，防止验证 useEffect 干扰
    isClosingProjectRef.current = true;

    // 无实质内容且项目存在时，删除空项目
    if (!hasSubstantialContent && projectData.projectId && token) {
      try {
        await backendApi.deleteProject(token, projectData.projectId!);
        console.log('[handleCloseProject] 空项目已删除');
      } catch (error) {
        console.error('[handleCloseProject] Failed to delete empty project:', error);
      }
    }

    // 清除活跃会话
    clearProjectFlowActiveSession();
    // 清除项目状态（从 projectStateMap 移除并重置 activeProjectId）
    if (urlProjectId) {
      clearProjectQueries(urlProjectId);
      clearProjectState(urlProjectId);
    }
    // 重置侧边栏状态
    setSidebarCollapsed(false);
    console.log('[handleCloseProject] 清理完成，准备跳转到 /projects');
    // 返回项目列表
    navigate('/projects');
  }, [step1OutfitModules, projectData.projectId, projectData.selectedOutfitPlanId, projectData.selectedPreviewId, projectData.activeScriptId, token, setSidebarCollapsed, navigate, clearProjectState, urlProjectId, confirm]);

  useEffect(() => {
    if (projectData.projectId) {
      setGlobalTimerStart();
    }
  }, [projectData.projectId, setGlobalTimerStart]);

  useEffect(() => {
    // 正在关闭项目时跳过写入 session
    if (isClosingProjectRef.current) return;
    const step = parseStepFromPath(location.pathname);
    // 优先使用 URL 中的 projectId，兜底使用 store
    const effectiveProjectId = urlProjectId || projectData.projectId;
    console.log('[ProjectLayout] Write session check:', {
      hasProjectId: !!effectiveProjectId,
      projectId: effectiveProjectId,
      step,
      pathname: location.pathname,
    });
    if (!effectiveProjectId || !step) {
      return;
    }
    console.log('[ProjectLayout] Writing active session:', { projectId: effectiveProjectId, step });
    writeProjectFlowActiveSession({
      projectId: effectiveProjectId,
      step,
    });
  }, [location.pathname, urlProjectId, projectData.projectId]);

  // 页面刷新或直接访问时：Zustand 状态为空但 URL 有 projectId → 用 getProject 加载基础信息
  // 各 step 的专用接口负责加载详细数据，不再使用 resumeSnapshot
  useEffect(() => {
    if (isClosingProjectRef.current) return;
    // URL 没有 projectId 或是 "new"，跳过加载
    if (!urlProjectId || urlProjectId === "new" || !token) {
      setInitialLoading(false);
      return;
    }
    // Zustand 已有项目数据，无需重复加载
    if (projectData.projectId) {
      setInitialLoading(false);
      return;
    }
    // Zustand 为空 → 用 getProject 加载基础项目信息（刷新/直接访问场景）
    let cancelled = false;
    void (async () => {
      try {
        const project = await backendApi.getProject(token, urlProjectId);
        if (cancelled) return;
        console.log('[ProjectLayout] getProject 返回:', JSON.stringify({
          id: project.id,
          projectKind: project.projectKind,
          reverseScriptId: project.reverseScriptId,
        }));
        // 只设置基础 projectData，workflow 由各 step 专用接口恢复
        const store = useAppStore.getState();
        store.updateProjectDataForProject(urlProjectId, {
          projectId: project.id,
          projectName: project.name,
          projectStatus: project.status,
          projectKind: project.projectKind,
          lastVisitedStep: project.lastVisitedStep ?? undefined,
          reverseScriptId: project.reverseScriptId ?? null,
          coverImageUrl: project.coverImageUrl ?? null,
          videoCoverImageUrl: project.videoCoverImageUrl ?? null,
          exportUrl: project.exportUrl ?? null,
        });
        store.setActiveProject(urlProjectId);
        setInitialLoading(false);
      } catch (error) {
        if (cancelled) return;
        setInitialLoading(false);
        if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 404) {
          setProjectNotFoundError(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [urlProjectId, token, projectData.projectId]);

  // 项目不存在时显示错误页面
  if (projectNotFoundError) {
    return <ProjectNotFoundError />;
  }

  // 初始加载中：等待 projectData 和 workflow 数据就绪
  if (initialLoading || workflowLoading) {
    return (
      <Layout hideSidebar projectFullscreen onExitProjectFlow={handleCloseProject}>
        <div className="flex items-center justify-center flex-1 min-h-0">
          <div className="text-gray-500">加载中...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout hideSidebar projectFullscreen onExitProjectFlow={handleCloseProject}>
      <SaveStatusIndicator />
      <GlobalTimer />
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </Layout>
  );
};
