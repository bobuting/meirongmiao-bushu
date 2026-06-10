import { createStep2ConfirmResult } from "../../../../src/contracts/step2-regenerate-confirm-contract";

export interface Step2RoleConfirmDirectEnterResult {
  confirmedCandidateId: string;
  feedbackMessage: string;
  /** @deprecated 使用 buildFlow41CanonicalRoute(3, projectId) 代替 */
  nextRoute: string;
}

export function resolveStep2RoleConfirmDirectEnter(candidateId: string): Step2RoleConfirmDirectEnterResult {
  const result = createStep2ConfirmResult(candidateId);
  return {
    confirmedCandidateId: result.candidateId,
    feedbackMessage: "已确认角色，正在进入 Step3 脚本生成。",
    nextRoute: "/create/step3",
  };
}
