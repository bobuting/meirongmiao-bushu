import { buildFlow41CanonicalRoute } from "./flow41RouteNormalization";
import type { ProjectFlowKind } from "./projectFlowKind";
import { isImageProjectFlow } from "./projectFlowKind";

export function buildStep2ImageProjectCompletionPatch(input: {
  confirmedCandidateId: string | null;
}): Record<string, unknown> {
  return {
    step2V2ConfirmedCandidateId: input.confirmedCandidateId ?? null,
    step2PreviewGenerationStarted: true,
  };
}

export function resolveStep2FooterTargetRoute(kind: ProjectFlowKind, projectId?: string | null): string {
  if (isImageProjectFlow(kind)) {
    return projectId ? `/image-create/${projectId}/step3` : "/projects";
  }
  return buildFlow41CanonicalRoute(3, projectId);
}

export function resolveStep2FooterFeedback(kind: ProjectFlowKind): string {
  return isImageProjectFlow(kind)
    ? "角色已确认，进入下一步。"
    : "已确认当前角色，可继续生成脚本。";
}

export function resolveStep3FooterTargetRoute(kind: ProjectFlowKind, projectId?: string | null): string {
  if (isImageProjectFlow(kind)) {
    return projectId ? `/image-create/${projectId}/step4` : "/projects";
  }
  return buildFlow41CanonicalRoute(4, projectId);
}

export function resolveStep3FooterPreviousRoute(kind: ProjectFlowKind, projectId?: string | null): string {
  if (isImageProjectFlow(kind)) {
    return projectId ? `/image-create/${projectId}/step2` : "/projects";
  }
  return buildFlow41CanonicalRoute(2, projectId);
}

export function resolveStep3FooterFeedback(kind: ProjectFlowKind): string {
  return isImageProjectFlow(kind)
    ? "模特图已生成，进入电商详情页。"
    : "模特图已确认，可继续生成分镜。";
}

export function resolveStep4FooterTargetRoute(kind: ProjectFlowKind, projectId?: string | null): string {
  return projectId ? `/projects` : "/projects";
}

export function resolveStep4FooterPreviousRoute(kind: ProjectFlowKind, projectId?: string | null): string {
  if (isImageProjectFlow(kind)) {
    return projectId ? `/image-create/${projectId}/step3` : "/projects";
  }
  return buildFlow41CanonicalRoute(3, projectId);
}

export function resolveStep4FooterFeedback(kind: ProjectFlowKind): string {
  return isImageProjectFlow(kind)
    ? "电商详情页已完成。"
    : "分镜已完成，可继续生成视频。";
}
