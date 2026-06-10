import { backendApi } from "../../services/backendApi";
import { useAppStore, emptyProjectData } from "../../store/useAppStore";
import type { ProjectFlowKind } from "./projectFlowKind";

interface PersistCreatedProjectFlowKindInput {
  token: string;
  projectId: string;
  projectName: string;
  projectStatus: string | null | undefined;
  projectFlowKind: ProjectFlowKind;
}

export async function persistCreatedProjectFlowKind(
  input: PersistCreatedProjectFlowKindInput,
): Promise<void> {
  await backendApi.saveProjectWorkflowState(input.token, input.projectId, {
    step: 1,
    workflow: {
      projectId: input.projectId,
    },
    projectData: {
      projectId: input.projectId,
      projectName: input.projectName,
      projectStatus: input.projectStatus ?? "DRAFT",
      selectedOutfitPlanId: null,
      selectedPreviewId: null,
      activeScriptId: null,
      reverseScriptId: null,
      exportUrl: null,
      projectKind: input.projectFlowKind,
    },
  });
}

/** 创建项目并写入 store（按 projectId 隔离） */
export async function bootstrapProject(params: {
  token: string;
  projectName: string;
  projectFlowKind: ProjectFlowKind;
  reverseScriptId?: string | null;
  projectDataPatch?: Record<string, unknown>;
}): Promise<{ id: string; name: string; status: string }> {
  const { token, projectName, projectFlowKind, reverseScriptId, projectDataPatch } = params;

  useAppStore.getState().setGlobalTimerStart();

  const isReverse = projectFlowKind === "reverse" || Boolean(reverseScriptId);
  const created = await backendApi.createProject(token, projectName, {
    projectKind: isReverse ? "reverse" : projectFlowKind === "image" ? "image" : projectFlowKind === "outfit_change" ? "outfit_change" : "video",
    reverseScriptId: reverseScriptId ?? null,
  });

  // 初始化项目隔离状态
  const store = useAppStore.getState();
  // projectData = 数据库对齐字段
  store.updateProjectDataForProject(created.id, {
    projectId: created.id,
    projectName: created.name,
    projectStatus: created.status,
    projectKind: projectFlowKind,
    reverseScriptId: reverseScriptId ?? null,
    ...(projectDataPatch ?? {}),
  });
  store.setActiveProject(created.id);

  await persistCreatedProjectFlowKind({
    token,
    projectId: created.id,
    projectName: created.name,
    projectStatus: created.status,
    projectFlowKind,
  });

  return created;
}

/** 项目路由前缀 */
export function getProjectStep1Path(projectId: string, kind: ProjectFlowKind): string {
  if (kind === "image") {
    return `/image-create/${projectId}/step1`;
  }
  if (kind === "outfit_change") {
    return `/outfit-create/${projectId}/step1`;
  }
  return `/create/${projectId}/step1`;
}
