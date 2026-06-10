export interface Step3WorkspaceRouteBoundaryProps {
  screenLabel: string;
  recoveryPath: string;
  previousPath: string;
}

export function buildStep3WorkspaceRouteBoundaryProps(): Step3WorkspaceRouteBoundaryProps {
  return {
    screenLabel: "Step 3 脚本与分镜",
    recoveryPath: "/projects",
    previousPath: "/create/step2",
  };
}
