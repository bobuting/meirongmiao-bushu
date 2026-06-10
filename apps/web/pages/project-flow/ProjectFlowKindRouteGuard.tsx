import React, { useEffect, useRef, useState } from "react";
import { Navigate, useParams, useNavigate } from 'react-router';
import { useAppStore } from "../../store/useAppStore";
import { useProjectState } from "../../hooks/useProjectState";
import { isProjectFlowStepAllowed } from "./projectFlowKind";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { isVideoStatusAtOrBeyond } from "../../../../src/contracts/types";
import type { VideoProjectStatus } from "../../../../src/contracts/types";

/** Step 最低准入状态阈值（Step6 裂变特殊：只需分镜和成片，不做状态判断） */
const STEP_MIN_STATUS: Record<number, VideoProjectStatus> = {
  // 3: "CHARACTER_CONFIRMED",   // Step3: 角色确认后可进入（开始生成脚本）
  4: "STORYBOARD_PREVIEW_COMPLETED", // Step4: 分镜预览完成可进入
  5: "CLIPS_READY",           // Step5: 视频片段已就绪可进入
  // Step6 裂变：只要有分镜和成片即可，无需 PUBLISHED 状态
};

/** 状态不满足时的提示信息 */
const STEP_STATUS_ERROR_MESSAGE: Record<number, string> = {
  // 3: "项目尚未完成角色确认，请先完成 Step2",
  4: "项目尚未完成分镜预览，请先完成 Step3",
  5: "项目尚未完成视频合成，请先完成 Step4",
  // Step6 裂变：不做状态准入检查
};

/** 加载中占位组件 */
const LoadingPlaceholder: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-screen bg-[#fdfbf7]">
    <div className="text-gray-500">加载中...</div>
  </div>
);

export const ProjectFlowKindRouteGuard: React.FC<{
  step: number;
  children: React.ReactElement;
}> = ({ step, children }) => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const hasHandledErrorRef = useRef(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  // 自定义错误处理：状态缺失时弹窗并跳转
  const handleError = async (error: { code: string; message: string; projectName?: string | null }) => {
    if (hasHandledErrorRef.current) return; // 防止重复处理
    hasHandledErrorRef.current = true;

    const projectLabel = error.projectName ? `「${error.projectName}」` : "该项目";
    const message = error.code === 'PROJECT_STATUS_MISSING'
      ? `${projectLabel} 状态缺失，请联系管理员处理`
      : error.message;

    await confirm(message, "无法进入该步骤");
    navigate("/projects", { replace: true });
  };

  const { projectData, isInitialLoading } = useProjectState(projectId, {
    loadCategories: ["project"],
    onError: handleError,
  });
  const projectFlowKind = projectData.projectKind ?? "video";
  const projectStatus = projectData.projectStatus as VideoProjectStatus | null;

  // 重置处理标记（projectId 变化时）
  useEffect(() => {
    hasHandledErrorRef.current = false;
    setIsCheckingStatus(true);
  }, [projectId]);

  // 状态检查逻辑：加载完成后执行
  useEffect(() => {
    // 等待加载完成
    if (isInitialLoading) return;
    // 已处理过错误，不再检查
    if (hasHandledErrorRef.current) return;
    // 状态未加载（空对象），等待
    if (!projectData.projectId) return;

    // 执行状态检查
    const checkAndHandle = async () => {
      // 1. 项目类型检查
      if (!isProjectFlowStepAllowed(projectFlowKind, step)) {
        hasHandledErrorRef.current = true;
        const pid = projectId ?? projectData.projectId ?? "new";
        navigate(`/create/${pid}/step2`, { replace: true });
        return;
      }

      // 2. 状态准入检查（Step3-6 需要检查状态阈值）
      const minStatus = STEP_MIN_STATUS[step];
      if (minStatus && projectStatus) {
        const isAllowed = isVideoStatusAtOrBeyond(projectStatus, minStatus);
        if (!isAllowed) {
          hasHandledErrorRef.current = true;
          const projectLabel = projectData.projectName ? `「${projectData.projectName}」` : "该项目";
          const message = `${projectLabel} ${STEP_STATUS_ERROR_MESSAGE[step]}`;
          await confirm(message, "无法进入该步骤");
          navigate("/projects", { replace: true });
          return;
        }
      }

      // 3. 检查通过，允许渲染
      setIsCheckingStatus(false);
    };

    void checkAndHandle();
  }, [isInitialLoading, projectData.projectId, projectFlowKind, projectStatus, step, projectId, projectData.projectName, confirm, navigate]);

  // 加载中或检查中，显示占位
  if (isInitialLoading || isCheckingStatus) {
    return <LoadingPlaceholder />;
  }

  // 已处理错误，返回 null（等待 navigate 完成）
  if (hasHandledErrorRef.current) {
    return null;
  }

  return children;
};
