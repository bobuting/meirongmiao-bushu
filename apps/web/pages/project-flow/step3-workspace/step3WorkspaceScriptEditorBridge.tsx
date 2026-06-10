import React from "react";
import { ScriptEditor } from "../ScriptEditor";

export const STEP3_WORKSPACE_SCRIPT_EDITOR_BRIDGE_MODE = "script-editor-workspace-bridge";

export const Step3WorkspaceScriptEditorBridge: React.FC = () => {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden">
      <ScriptEditor />
    </div>
  );
};
