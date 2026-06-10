import React from "react";
import { useParams } from 'react-router';
import { ProjectFlowRouteBoundary } from "../ProjectFlowRouteBoundary";
import { Step3WorkspaceShell } from "./Step3WorkspaceShell";
import { buildStep3WorkspaceRouteBoundaryProps } from "./step3WorkspaceNavigationBridge";
import { buildFlow41CanonicalRoute } from "../flow41RouteNormalization";

export const Step3WorkspaceRoute: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const boundaryProps = buildStep3WorkspaceRouteBoundaryProps();

  return (
    <ProjectFlowRouteBoundary
      screenLabel="Step 3 脚本与分镜"
      recoveryPath={boundaryProps.recoveryPath}
      previousPath={buildFlow41CanonicalRoute(2, projectId)}
    >
      <Step3WorkspaceShell />
    </ProjectFlowRouteBoundary>
  );
};
