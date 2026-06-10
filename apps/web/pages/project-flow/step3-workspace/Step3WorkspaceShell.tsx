import React, { useMemo } from "react";
import { useParams } from 'react-router';
import { useProjectState } from "../../../hooks/useProjectState";
import { FullScreenLoading } from "../../../components/shared/FullScreenLoading";
import { buildStep3WorkspacePreviewParameterSnapshot } from "./step3WorkspacePreviewParameterBridge";
import { buildStep3WorkspaceSeedSnapshot } from "./step3WorkspaceStoreBridge";
import {
  STEP3_WORKSPACE_SCRIPT_EDITOR_BRIDGE_MODE,
  Step3WorkspaceScriptEditorBridge,
} from "./step3WorkspaceScriptEditorBridge";

export const Step3WorkspaceShell: React.FC = () => {
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const { projectData, workflow, isInitialLoading } = useProjectState(urlProjectId);

  const workspaceSeedState = useMemo(
    () => buildStep3WorkspaceSeedSnapshot(projectData as unknown as Record<string, unknown>),
    [projectData],
  );
  const previewParameters = useMemo(
    () => buildStep3WorkspacePreviewParameterSnapshot(projectData as unknown as Record<string, unknown>),
    [projectData],
  );

  // 数据加载中，显示全屏 loading
  if (isInitialLoading) {
    return <FullScreenLoading />;
  }

  return (
    <div
      data-testid="step3-workspace-shell"
      data-script-editor-bridge-mode={STEP3_WORKSPACE_SCRIPT_EDITOR_BRIDGE_MODE}
      className="flex h-full min-h-0 w-full overflow-hidden"
    >
      <div
        hidden
        data-testid="step3-workspace-seed-owner"
        data-script-segment-count={String(workspaceSeedState.scriptSegmentCount)}
        data-has-pending-script-import={String(workspaceSeedState.hasPendingScriptImport)}
        data-has-pending-storyboard-import={String(workspaceSeedState.hasPendingStoryboardImport)}
      />
      <div
        hidden
        data-testid="step3-workspace-preview-parameters"
        data-step4-preview-ratio={previewParameters.ratio ?? ""}
        data-step4-preview-resolution={previewParameters.resolution ?? ""}
        data-step4-preview-sharpness={previewParameters.sharpness ?? ""}
      />
      <div
        hidden
        data-testid="step3-workspace-navigation-context"
        data-project-id={projectData.projectId ?? ""}
        data-project-status={projectData.projectStatus ?? ""}
        data-script-id={projectData.activeScriptId ?? ""}
      />
      <Step3WorkspaceScriptEditorBridge />
    </div>
  );
};
