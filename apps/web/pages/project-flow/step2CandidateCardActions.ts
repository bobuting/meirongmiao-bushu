import type { Step2FiveViewCandidateCard } from "../../../../src/contracts/step2-five-view-candidate-board-contract";
import { createStep2RegenerateRequest } from "../../../../src/contracts/step2-regenerate-confirm-contract";

export interface Step2CandidateRetryButtonState {
  ariaLabel: string;
  title: string;
  creditLabel: string | null;
  iconName: string;
  iconClassName: string;
  disabled: boolean;
}

export function createStep2CandidateRetryRequest(candidateId: string, promptOverride?: string | null) {
  const normalizedPromptOverride = promptOverride?.trim() ?? "";
  return createStep2RegenerateRequest({
    candidateId,
    promptOverride: normalizedPromptOverride,
    mode: normalizedPromptOverride.length > 0 ? "img2img" : "rerender",
  });
}

export function buildStep2CandidateRetryButtonState(input: {
  candidate: Step2FiveViewCandidateCard;
  pendingCandidateId: string | null;
  batchGenerating: boolean;
  unitCreditCost: number;
  estimatedDurationSeconds?: number;
  /** 该卡片是否有正在运行的任务 */
  hasRunningTask?: boolean;
}): Step2CandidateRetryButtonState {
  const generatedOnce = Boolean(input.candidate.closeupPreviewUrl || input.candidate.fiveViewAssetUrl);
  // candidateId 格式：generated-{libraryCharacterId} 或 library-{item.id}
  const cardKey = input.candidate.candidateId ?? "";
  const isPending = input.pendingCandidateId === cardKey;
  const creditCost = Math.max(0, Math.floor(input.unitCreditCost));
  const estimatedSeconds = Math.max(
    1,
    Math.floor(Number.isFinite(input.estimatedDurationSeconds) ? Number(input.estimatedDurationSeconds) : 28),
  );
  const actionLabel = generatedOnce ? "重试生成该候选角色" : "生成该候选角色";
  const tooltipParts = [
    creditCost > 0 ? `${creditCost}积分` : null,
    `预计约${estimatedSeconds}秒`,
  ].filter((item): item is string => Boolean(item));
  return {
    ariaLabel: actionLabel,
    title: tooltipParts.length > 0 ? `${actionLabel}（${tooltipParts.join("，")}）` : actionLabel,
    creditLabel: creditCost > 0 ? `${creditCost}积分` : null,
    iconName: "refresh",
    iconClassName: isPending || input.hasRunningTask ? "animate-spin" : "",
    disabled: input.batchGenerating || input.hasRunningTask === true,
  };
}
