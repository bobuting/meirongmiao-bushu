/**
 * 图片项目路由规范化模块
 * 独立于视频项目的路由解析逻辑，处理 Step 1-4
 */
import { IMAGE_STATUS_TO_STEP } from "../project-flow/projectFlowKind";

/** 图片项目支持的步骤（Step 1-4） */
export const IMAGE_PROJECT_CANONICAL_STEPS = [1, 2, 3, 4] as const;

/**
 * 根据步骤编号和 projectId 构建规范化路由
 * @param step 步骤编号（1-4）
 * @param projectId 项目 ID，未传时使用 "new"
 * @returns 规范化路由路径，如 `/image-create/{projectId}/step1`
 */
export function buildImageProjectCanonicalRoute(step: number, projectId?: string | null): string {
  const pid = projectId === "new" || !projectId ? "new" : projectId;
  const clampedStep = Math.min(4, Math.max(1, step));
  return `/image-create/${pid}/step${clampedStep}`;
}

/**
 * 从 URL 路径解析当前步骤
 * @param pathname URL 路径
 * @returns 步骤编号（1-4），不匹配时返回 null
 */
export function resolveImageProjectCanonicalStepFromPath(pathname: string): number | null {
  const match = pathname.match(/\/image-create\/[^/]+\/step(\d+)$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (parsed >= 1 && parsed <= 4) return parsed;
  return null;
}

/**
 * 从 URL 路径获取规范化路由
 * @param pathname URL 路径
 * @returns 规范化路由路径，不匹配时返回 null
 */
export function resolveImageProjectCanonicalPathFromPath(pathname: string): string | null {
  const step = resolveImageProjectCanonicalStepFromPath(pathname);
  if (!step) return null;
  const pidMatch = pathname.match(/\/image-create\/([^/]+)\//);
  const projectId = pidMatch?.[1] ?? null;
  return buildImageProjectCanonicalRoute(step, projectId);
}

/**
 * 根据状态获取图片项目步骤编号
 * 优先使用 status 映射，找不到时回退到 lastVisitedStep
 */
function resolveImageProjectStepFromStatus(status?: string | null, fallbackStep?: number | null): number {
  if (status && status.trim().length > 0) {
    const mapped = IMAGE_STATUS_TO_STEP[status];
    if (mapped !== undefined) {
      // step5（发布/已发布）映射到 step4，因为图片项目无 step5 路由
      return Math.min(4, mapped);
    }
  }
  return Math.min(4, Math.max(1, fallbackStep ?? 1));
}

/**
 * 构建图片项目恢复路由（用于项目恢复场景）
 * 优先使用 status 映射步骤，忽略 lastVisitedStep
 */
export function resolveImageProjectResumeRoute(input: {
  lastVisitedStep?: number | null;
  status?: string | null;
  projectId?: string | null;
}): string {
  const step = resolveImageProjectStepFromStatus(input.status, input.lastVisitedStep);
  return buildImageProjectCanonicalRoute(step, input.projectId);
}