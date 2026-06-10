export const FLOW41_CANONICAL_STEPS = [1, 2, 3, 4, 5, 6] as const;

import { PROJECT_STATUS_TO_STEP } from "./projectFlowKind";

/**
 * 根据步骤编号和 projectId 构建规范化路由
 * @param step 步骤编号（1-6）
 * @param projectId 项目 ID，未传时使用 "new"（新建项目流程）
 * @param kind 项目类型，"image" 使用 /image-create/ 前缀，"outfit_change" 使用 /outfit-create/ 前缀
 * @returns 规范化路由路径
 */
export function buildFlow41CanonicalRoute(step: number, projectId?: string | null, kind?: string): string {
  const pid = projectId === "new" || !projectId ? "new" : projectId;
  if (kind === "image") {
    return `/image-create/${pid}/step${step}`;
  }
  if (kind === "outfit_change") {
    // 换装项目只有 4 步
    const outfitStep = Math.min(4, Math.max(1, step));
    return `/outfit-create/${pid}/step${outfitStep}`;
  }
  return `/create/${pid}/step${step}`;
}

export function resolveFlow41CanonicalStepFromStatus(status?: string | null): number {
  if (status == null || status.trim().length < 1) return 1;
  const step = PROJECT_STATUS_TO_STEP[status];
  if (step === undefined) {
    console.error(`[resolveFlow41CanonicalStepFromStatus] Unknown status: ${status}, please update PROJECT_STATUS_TO_STEP mapping`);
    return 1;
  }
  return step;
}

export function resolveFlow41CanonicalStepFromPath(pathname: string): number | null {
  const match = pathname.match(/\/create\/[^/]+\/step(\d+)$/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  if (parsed >= 1 && parsed <= 6) {
    return parsed;
  }
  if (parsed === 7) {
    return 5;
  }
  return null;
}

export function resolveFlow41CanonicalPathFromPath(pathname: string): string | null {
  const step = resolveFlow41CanonicalStepFromPath(pathname);
  if (!step) return null;
  // 从路径中提取 projectId（/create/{projectId}/stepN）
  const pidMatch = pathname.match(/\/create\/([^/]+)\//);
  const projectId = pidMatch?.[1] ?? null;
  return buildFlow41CanonicalRoute(step, projectId);
}

export function resolveFlow41ResumeRoute(input: {
  status?: string | null;
  projectId?: string | null;
}): string {
  // 直接使用 status 映射
  const targetStep = resolveFlow41CanonicalStepFromStatus(input.status);
  return buildFlow41CanonicalRoute(targetStep, input.projectId);
}
