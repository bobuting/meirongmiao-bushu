/**
 * 换装项目路由规范化
 * 从 URL 路径解析当前步骤
 */

/**
 * 从 URL 路径解析换装项目当前步骤
 * @param pathname URL 路径
 * @returns 步骤号 1-4，无法解析时返回 null
 */
export function resolveOutfitChangeCanonicalStepFromPath(pathname: string): number | null {
  // 匹配 /outfit-create/:projectId/step1-4
  const match = pathname.match(/\/outfit-create\/[^/]+\/step(\d)/);
  if (match) {
    const step = parseInt(match[1], 10);
    if (step >= 1 && step <= 4) return step;
  }
  return null;
}

/**
 * 构建换装项目步骤路由
 * @param stepId 步骤号 1-4
 * @param projectId 项目 ID
 * @returns 完整路由路径
 */
export function buildOutfitChangeCanonicalRoute(stepId: number, projectId: string): string {
  const validStep = Math.max(1, Math.min(4, stepId));
  return `/outfit-create/${projectId}/step${validStep}`;
}
