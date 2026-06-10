import React from "react";
import { useParams } from 'react-router';
import { ProjectFlowRouteBoundary } from "../ProjectFlowRouteBoundary";
import { Step4VideoWorkspaceScreen } from "./Step4VideoWorkspaceScreen";
import { buildFlow41CanonicalRoute } from "../flow41RouteNormalization";

export const Step4VideoWorkspaceRoute: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <ProjectFlowRouteBoundary
      screenLabel="Step 4 视频工作台"
      recoveryPath="/projects"
      previousPath={buildFlow41CanonicalRoute(3, projectId)}
    >
      <Step4VideoWorkspaceScreen />
    </ProjectFlowRouteBoundary>
  );
};
