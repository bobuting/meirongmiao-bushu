/**
 * 图片项目独立布局组件
 * 简化版 ProjectLayout，处理 Step 1 到 Step 4
 * 去除了 Step 3-5 的复杂工作流状态同步逻辑
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
import { resolveImageProjectCanonicalStepFromPath } from "./imageProjectRouteNormalization";
import {
  clearProjectFlowActiveSession,
  writeProjectFlowActiveSession,
} from "../project-flow/projectFlowActiveSession";


/**
 * 从 URL 路径解析当前步骤
 */
function parseStepFromPath(pathname: string): number | null {
  return resolveImageProjectCanonicalStepFromPath(pathname);
}

export const ImageProjectLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const token = useAppStore((state) => state.token);
  const { workflow, projectData, updateProjectData } = useProjectState(urlProjectId);
  const step1OutfitModules = (workflow.imageGarmentModules as Array<{ mainImage?: unknown }>) ?? [];
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed);
  const setGlobalTimerStart = useAppStore((state) => state.setGlobalTimerStart);
  const { confirm } = useConfirm();
  const isClosingProjectRef = useRef(false);

  // 项目不存在错误状态
  const [projectNotFoundError, setProjectNotFoundError] = useState(false);

  // 关闭项目时的清理逻辑：无实质内容的空项目自动删除
  const clearProjectState = useAppStore((state) => state.clearProjectState);
  const handleCloseProject = useCallback(async () => {
    console.log('[ImageProjectLayout] 开始执行关闭清理');
    const hasSubstantialContent =
      step1OutfitModules.some((m) => m.mainImage) ||
      Boolean(projectData.selectedOutfitPlanId) ||
      Boolean(projectData.selectedPreviewId) ||
      Boolean(projectData.activeScriptId);

    if (hasSubstantialContent) {
      const confirmed = await confirm(
        '项目进度会保留在"我的项目"中，可随时继续编辑。',
        '确认关闭当前项目编辑？'
      );
      if (!confirmed) {
        console.log('[ImageProjectLayout] 用户取消关闭');
        return;
      }
    }

    isClosingProjectRef.current = true;

    if (!hasSubstantialContent && projectData.projectId && token) {
      try {
        await backendApi.deleteProject(token, projectData.projectId!);
        console.log('[ImageProjectLayout] 空项目已删除');
      } catch (error) {
        console.error('[ImageProjectLayout] Failed to delete empty project:', error);
      }
    }

    clearProjectFlowActiveSession();
    // 清除项目状态（从 projectStateMap 移除并重置 activeProjectId）
    if (urlProjectId) {
      clearProjectQueries(urlProjectId);
      clearProjectState(urlProjectId);
    }
    setSidebarCollapsed(false);
    console.log('[ImageProjectLayout] 清理完成，准备跳转到 /projects');
    navigate('/projects');
  }, [step1OutfitModules, projectData.projectId, projectData.selectedOutfitPlanId, projectData.selectedPreviewId, projectData.activeScriptId, token, setSidebarCollapsed, navigate, clearProjectState, urlProjectId, confirm]);

  // 确保图片项目类型正确
  useEffect(() => {
    if (projectData.projectKind !== "image") {
      updateProjectData({ projectKind: "image" });
    }
  }, [projectData.projectKind, updateProjectData]);

  // 启动全局计时器
  useEffect(() => {
    if (projectData.projectId) {
      setGlobalTimerStart();
    }
  }, [projectData.projectId, setGlobalTimerStart]);

  // 【修复】移除 projectStatus 依赖，避免状态更新时触发 cleanup 重置
  // 只在组件真正卸载时重置状态（通过 projectId 变化判断）
  useEffect(() => {
    const currentProjectId = projectData.projectId;
    return () => {
      // 只有当 projectId 变化（切换项目）或组件卸载时才重置
      // 不在状态更新时重置
      if (!currentProjectId) return;
      const latestState = useAppStore.getState();
      const latestProject = latestState.projectStateMap[currentProjectId];
      const latestStatus = latestProject?.projectData?.projectStatus;
      // 只有未发布状态才重置为 IMAGE_DRAFT
      if (latestStatus === "IMAGE_READY_TO_PUBLISH" || latestStatus === "IMAGE_PUBLISHED") return;
      // 检查是否切换了项目（projectId 变化）
      const newProjectId = useAppStore.getState().activeProjectId;
      if (newProjectId && newProjectId !== currentProjectId) {
        // 切换项目，重置旧项目状态
        latestState.updateProjectDataForProject(currentProjectId, { projectStatus: "IMAGE_DRAFT" });
      }
    };
  }, [projectData.projectId]);

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

  // 页面刷新或直接访问时：Zustand 状态为空但 URL 有 projectId → 用 getProject 加载基础信息
  useEffect(() => {
    if (isClosingProjectRef.current) return;
    if (!urlProjectId || urlProjectId === "new" || !token) return;
    if (projectData.projectId) {
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
          projectKind: "image",
        });
        store.setActiveProject(urlProjectId);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 404) {
          setProjectNotFoundError(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [urlProjectId, token, projectData.projectId]);

  // 项目不存在时显示错误页面
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
