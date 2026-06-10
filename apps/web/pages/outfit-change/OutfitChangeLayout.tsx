/**
 * 换装项目独立布局组件
 * 简化版 ProjectLayout，处理 Step 1 到 Step 4
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { Layout } from "../../components/Layout";
import { useAppStore } from "../../store/useAppStore";
import { useProjectState, clearProjectQueries } from "../../hooks/useProjectState";
import { backendApi } from "../../services/backendApi";
import { SaveStatusIndicator } from "../../components/shared/SaveStatusIndicator";
import { GlobalTimer } from '../../components/shared/GlobalTimer';
import { useConfirm } from "../../components/ui/ConfirmDialog";
import {
  clearProjectFlowActiveSession,
  writeProjectFlowActiveSession,
} from "../project-flow/projectFlowActiveSession";

/**
 * 从 URL 路径解析当前步骤
 */
function parseStepFromPath(pathname: string): number | null {
  const match = pathname.match(/\/outfit-create\/[^/]+\/step(\d)/);
  if (match) {
    const step = parseInt(match[1], 10);
    if (step >= 1 && step <= 4) return step;
  }
  return null;
}

export const OutfitChangeLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const token = useAppStore((state) => state.token);
  const { workflow, projectData, updateProjectData, isInitialLoading: workflowLoading } = useProjectState(urlProjectId);
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed);
  const setGlobalTimerStart = useAppStore((state) => state.setGlobalTimerStart);
  const { confirm } = useConfirm();
  const isClosingProjectRef = useRef(false);

  // 项目不存在错误状态
  const [projectNotFoundError, setProjectNotFoundError] = useState(false);
  // 初始化加载状态
  const [initialLoading, setInitialLoading] = useState(true);

  // 关闭项目时的清理逻辑
  const clearProjectState = useAppStore((state) => state.clearProjectState);
  const handleCloseProject = useCallback(async () => {
    // 源视频为空就是空项目
    const hasSubstantialContent = !!workflow.outfitChangeSourceVideoUrl;

    if (hasSubstantialContent) {
      const confirmed = await confirm(
        '项目进度会保留在"我的项目"中，可随时继续编辑。',
        '确认关闭当前项目编辑？'
      );
      if (!confirmed) return;
    } else {
      // 空项目：静默删除
      if (projectData.projectId && token) {
        try {
          await backendApi.deleteProject(token, projectData.projectId);
        } catch { /* 删除失败不阻塞关闭 */ }
      }
    }

    isClosingProjectRef.current = true;
    clearProjectFlowActiveSession();
    if (urlProjectId) {
      clearProjectQueries(urlProjectId);
      clearProjectState(urlProjectId);
    }
    setSidebarCollapsed(false);
    navigate('/projects');
  }, [workflow.outfitChangeSourceVideoUrl, workflow.outfitChangeSelectedGarmentId, workflow.outfitChangeSelectedCharacterId, projectData.projectId, token, setSidebarCollapsed, navigate, clearProjectState, urlProjectId, confirm]);

  // 项目 ID 就绪后启动全局计时器
  useEffect(() => {
    if (projectData.projectId) {
      setGlobalTimerStart();
    }
  }, [projectData.projectId, setGlobalTimerStart]);

  // 确保换装项目类型正确
  useEffect(() => {
    if (projectData.projectKind !== "outfit_change") {
      updateProjectData({ projectKind: "outfit_change" });
    }
  }, [projectData.projectKind, updateProjectData]);

  // 写入活跃会话
  useEffect(() => {
    if (isClosingProjectRef.current) return;
    const step = parseStepFromPath(location.pathname);
    const effectiveProjectId = urlProjectId || projectData.projectId;
    if (!effectiveProjectId || !step) {
      return;
    }
    writeProjectFlowActiveSession({
      projectId: effectiveProjectId,
      step,
    });
  }, [location.pathname, urlProjectId, projectData.projectId]);

  // 页面刷新或直接访问时：加载项目基础信息
  useEffect(() => {
    if (isClosingProjectRef.current) return;
    if (!urlProjectId || urlProjectId === "new" || !token) {
      setInitialLoading(false);
      return;
    }
    if (projectData.projectId) {
      setInitialLoading(false);
      let cancelled = false;
      void (async () => {
        try {
          await backendApi.getProject(token, projectData.projectId!);
        } catch (error) {
          if (cancelled) return;
          if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 404) {
            setProjectNotFoundError(true);
          }
        }
      })();
      return () => { cancelled = true; };
    }
    let cancelled = false;
    void (async () => {
      try {
        const project = await backendApi.getProject(token, urlProjectId);
        if (cancelled) return;
        const store = useAppStore.getState();
        store.updateProjectDataForProject(urlProjectId, {
          projectId: project.id,
          projectName: project.name,
          projectStatus: project.status,
          projectKind: "outfit_change",
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

  // 项目不存在时显示错误页面（优先于 loading 判断，避免 workflowLoading 阻塞错误展示）
  if (projectNotFoundError) {
    return (
      <Layout hideSidebar projectFullscreen>
        <div className="flex h-full items-center justify-center p-6">
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900">项目不存在或已被删除</h2>
            <p className="mt-2 text-sm text-gray-600">请返回项目列表重新选择。</p>
          </div>
        </div>
      </Layout>
    );
  }

  // 初始化数据加载中：等待 projectData 和 workflow 数据就绪
  if (initialLoading || workflowLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-primary" />
          <p className="text-sm text-gray-500">加载项目中...</p>
        </div>
      </div>
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
