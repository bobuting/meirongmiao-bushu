import type { ApiMethodName, BackendApi } from "./backendApi";

export type ProjectReverseApiMethodName =
  | "createProject"
  | "updateProject"
  | "saveProjectWorkflowState"
  | "projectResumeSnapshot"
  | "deleteProject"
  | "uploadAssets"
  | "recommendOutfits"
  | "optimizeOutfitAnalysis"
  | "selectOutfit"
  | "unselectOutfit"
  | "listPresets"
  | "latestProjectScript"
  | "generateStoryboard"
  | "selectStoryboardVariant"
  | "syncStoryboardLayout"
  | "generateStoryboardSceneReferences"
  | "persistStoryboardAssets"
  | "reverseParse"
  | "reverseParseV2"
  | "submitReview"
  | "myProjects"
  | "selectStep3FrameImage";

export interface RouteApiCallInvoker {
  <K extends ApiMethodName>(methodName: K, args: Parameters<BackendApi[K]>): Promise<Awaited<ReturnType<BackendApi[K]>>>;
}

export const PROJECT_REVERSE_API_METHODS: readonly ProjectReverseApiMethodName[] = [
  "createProject",
  "updateProject",
  "saveProjectWorkflowState",
  "projectResumeSnapshot",
  "deleteProject",
  "uploadAssets",
  "recommendOutfits",
  "optimizeOutfitAnalysis",
  "selectOutfit",
  "unselectOutfit",
  "listPresets",
  "latestProjectScript",
  "generateStoryboard",
  "selectStoryboardVariant",
  "syncStoryboardLayout",
  "generateStoryboardSceneReferences",
  "persistStoryboardAssets",
  "reverseParse",
  "reverseParseV2",
  "submitReview",
  "myProjects",
  "selectStep3FrameImage",
] as const;

export function createProjectReverseBackendApi(
  routeApiCall: RouteApiCallInvoker,
): Pick<BackendApi, ProjectReverseApiMethodName> {
  return {
    createProject: (...args) => routeApiCall("createProject", args),
    updateProject: (...args) => routeApiCall("updateProject", args),
    saveProjectWorkflowState: (...args) => routeApiCall("saveProjectWorkflowState", args),
    projectResumeSnapshot: (...args) => routeApiCall("projectResumeSnapshot", args),
    deleteProject: (...args) => routeApiCall("deleteProject", args),
    uploadAssets: (...args) => routeApiCall("uploadAssets", args),
    recommendOutfits: (...args) => routeApiCall("recommendOutfits", args),
    optimizeOutfitAnalysis: (...args) => routeApiCall("optimizeOutfitAnalysis", args),
    selectOutfit: (...args) => routeApiCall("selectOutfit", args),
    unselectOutfit: (...args) => routeApiCall("unselectOutfit", args),
    listPresets: (...args) => routeApiCall("listPresets", args),
    latestProjectScript: (...args) => routeApiCall("latestProjectScript", args),
    generateStoryboard: (...args) => routeApiCall("generateStoryboard", args),
    selectStoryboardVariant: (...args) => routeApiCall("selectStoryboardVariant", args),
    syncStoryboardLayout: (...args) => routeApiCall("syncStoryboardLayout", args),
    generateStoryboardSceneReferences: (...args) => routeApiCall("generateStoryboardSceneReferences", args),
    persistStoryboardAssets: (...args) => routeApiCall("persistStoryboardAssets", args),
    reverseParse: (...args) => routeApiCall("reverseParse", args),
    reverseParseV2: (...args) => routeApiCall("reverseParseV2", args),
    submitReview: (...args) => routeApiCall("submitReview", args),
    myProjects: (...args) => routeApiCall("myProjects", args),
    selectStep3FrameImage: (...args) => routeApiCall("selectStep3FrameImage", args),
  };
}
