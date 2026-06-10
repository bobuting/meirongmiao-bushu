export interface Step1RoleConfirmDirectEnterResult {
  closeDrawer: true;
  feedbackMessage: string;
  /** @deprecated 使用 buildFlow41CanonicalRoute(2, projectId) 代替 */
  nextRoute: string;
}

export function resolveStep1RoleConfirmDirectEnter(): Step1RoleConfirmDirectEnterResult {
  return {
    closeDrawer: true,
    feedbackMessage: "推荐角色预设已确认，正在进入 Step2 定妆。",
    nextRoute: "/create/step2",
  };
}
