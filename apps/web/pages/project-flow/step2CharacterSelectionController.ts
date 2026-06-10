import type {
  Step2CandidateSource,
  Step2FiveViewCandidateCard,
} from "../../../../src/contracts/step2-five-view-candidate-board-contract";
import { resolveStep2Step3GateState, type Step2Step3GateState } from "../../../../src/contracts/step2-regenerate-confirm-contract";

export interface Step2CharacterSelectionControllerInput {
  step2GeneratedCandidateCards: Step2FiveViewCandidateCard[];
  step2LibraryCandidateCards: Step2FiveViewCandidateCard[];
  step2V2ActivePreviewSource: Step2CandidateSource | null;
  step2V2ActiveGeneratedCandidateId: string | null;
  step2V2ActiveLibraryCandidateId: string | null;
  confirmedCandidateId: string | null;
  selectedCharacterId: string | null;
  hasStartedStyledGeneration: boolean;
  isGeneratingPreview: boolean;
}

export interface Step2CharacterSelectionControllerState {
  step2V2AllCandidates: Step2FiveViewCandidateCard[];
  step2V2ActiveCandidate: Step2FiveViewCandidateCard | null;
  step2Step3GateState: Step2Step3GateState;
  step2NextDisabled: boolean;
  step2StatusText: string;
}

export function resolveStep2CharacterSelectionControllerState(
  input: Step2CharacterSelectionControllerInput,
): Step2CharacterSelectionControllerState {
  const step2V2AllCandidates = [...input.step2GeneratedCandidateCards, ...input.step2LibraryCandidateCards];
  const activeCards =
    input.step2V2ActivePreviewSource === "library" ? input.step2LibraryCandidateCards : input.step2GeneratedCandidateCards;
  const activeCandidateId =
    input.step2V2ActivePreviewSource === "library"
      ? input.step2V2ActiveLibraryCandidateId
      : input.step2V2ActivePreviewSource === "generated"
        ? input.step2V2ActiveGeneratedCandidateId
        : null;

  // candidateId 格式：generated-{libraryCharacterId} 或 library-{item.id}
  const step2V2ActiveCandidate = input.step2V2ActivePreviewSource
    ? activeCards.find((card) => card.candidateId === activeCandidateId) ?? null
    : null;

  // 匹配选中状态：candidateId 可能是带前缀的格式，需要兼容匹配
  // selectedCharacterId 是真实 UUID，candidateId 是 generated-{uuid} 或 library-{uuid}
  const matchedConfirmedCandidateId = input.confirmedCandidateId
    ? step2V2AllCandidates.find((card) => {
        const rawId = card.candidateId ?? "";
        // 直接匹配
        if (rawId === input.confirmedCandidateId) return true;
        // 去掉前缀后匹配
        const strippedId = rawId.startsWith("generated-")
          ? rawId.slice(10)
          : rawId.startsWith("library-")
            ? rawId.slice(8)
            : rawId;
        return strippedId === input.confirmedCandidateId;
      })?.candidateId ?? input.confirmedCandidateId
    : null;

  const step2Step3GateState = resolveStep2Step3GateState(matchedConfirmedCandidateId);
  // 当有 selectedCharacterId 时，允许进入下一步
  const step2NextDisabled = step2Step3GateState.step3Locked && !input.selectedCharacterId;
  const step2StatusText = step2Step3GateState.step3Locked && !input.selectedCharacterId
    ? "待确认角色"
    : input.selectedCharacterId
      ? "角色已选择"
      : "请选择角色";

  return {
    step2V2AllCandidates,
    step2V2ActiveCandidate,
    step2Step3GateState,
    step2NextDisabled,
    step2StatusText,
  };
}
