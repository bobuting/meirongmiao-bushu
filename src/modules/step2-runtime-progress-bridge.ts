import type { Step2FiveViewCandidateCard } from "../contracts/step2-five-view-candidate-board-contract";
import {
  resolveStep2RuntimeProgressContractState,
  type Step2RuntimeProgressContractState,
} from "../contracts/step2-runtime-progress-contract";

export interface Step2RuntimeProgressMeta {
  startedAtMs?: number | null;
  backendProgressPercent?: number | null;
}

export function buildStep2RuntimeProgressBridge(input: {
  cards: readonly Step2FiveViewCandidateCard[];
  dependencyReady: boolean;
  runtimeMetaById: Record<string, Step2RuntimeProgressMeta | undefined>;
  activeCandidateId?: string | null;
}): Record<string, Step2RuntimeProgressContractState> {
  const activeCandidateId =
    typeof input.activeCandidateId === "string" && input.activeCandidateId.trim().length > 0
      ? input.activeCandidateId.trim()
      : null;
  const entries = input.cards.map((card) => {
    // 使用 candidateId（角色ID）作为 key
    const cardKey = card.candidateId!;
    const runtimeMeta = input.runtimeMetaById[cardKey];
    const normalizedBackendProgressPercent =
      typeof runtimeMeta?.backendProgressPercent === "number" &&
      Number.isFinite(runtimeMeta.backendProgressPercent) &&
      runtimeMeta.backendProgressPercent > 1 &&
      runtimeMeta.backendProgressPercent < 100
        ? Math.floor(runtimeMeta.backendProgressPercent)
        : null;
    const hasStartedTask =
      typeof runtimeMeta?.startedAtMs === "number" &&
      Number.isFinite(runtimeMeta.startedAtMs) &&
      runtimeMeta.startedAtMs > 0;
    const hasBackendProgressSignal = normalizedBackendProgressPercent !== null;
    const matchesActiveCandidate = activeCandidateId === null || activeCandidateId === cardKey;
    // hasActiveTask：前端有 startedAtMs 即视为活跃
    // 关键：当 generationStatus 为 ready/failed 时，强制 hasActiveTask = false
    // 否则 contract state 函数会先检查 hasActiveTask 返回 "generating"，覆盖掉 failed/ready 状态
    const hasActiveTask =
      matchesActiveCandidate &&
      card.generationStatus === "pending" &&
      (hasStartedTask || hasBackendProgressSignal);

    return [
      cardKey,
      resolveStep2RuntimeProgressContractState({
        dependencyReady: input.dependencyReady,
        generationStatus: card.generationStatus,
        hasActiveTask,
        backendProgressPercent: normalizedBackendProgressPercent,
      }),
    ] as const;
  });

  return Object.fromEntries(entries);
}
