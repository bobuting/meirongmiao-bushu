import type { Step2FiveViewCandidateCard } from "../../../../src/contracts/step2-five-view-candidate-board-contract";
import type { ProjectCharacterItem } from "../../hooks/useProjectState";

interface Step2GeneratedFiveViewCandidateInput {
  projectId: string | null | undefined;
  dependencyReady: boolean;
  /** 项目角色列表，与数据库格式一致 */
  generatedCharacters?: ProjectCharacterItem[];
}

export function buildStep2GeneratedFiveViewCandidates(
  input: Step2GeneratedFiveViewCandidateInput,
): Step2FiveViewCandidateCard[] {
  // 构建 slot -> 角色信息映射
  const charBySlot: Record<number, ProjectCharacterItem> = {};
  for (const char of input.generatedCharacters ?? []) {
    if (typeof char.generationSlot === "number" && char.generationSlot >= 1 && char.generationSlot <= 3) {
      charBySlot[char.generationSlot] = char;
    }
  }

  console.log("[buildStep2GeneratedFiveViewCandidates] 输入:", {
    generatedCharactersCount: input.generatedCharacters?.length ?? 0,
    charBySlot: Object.fromEntries(
      Object.entries(charBySlot).map(([slot, char]) => [
        slot,
        {
          libraryCharacterId: char.libraryCharacterId,
          fiveViewOssImageUrl: char.character?.fiveViewOssImageUrl?.substring(0, 80) + '...' || '无图片',
          activeFiveViewStatus: char.character?.activeFiveViewStatus,
          characterStatus: char.character?.status,
        },
      ])
    ),
  });

  const result = [1, 2, 3]
    .filter((slot) => {
      const char = charBySlot[slot];
      // 只有当角色存在且有角色ID时才返回卡片
      return char?.libraryCharacterId;
    })
    .map((slot) => {
      const char = charBySlot[slot];
      const previewUrl = char?.character?.fiveViewOssImageUrl?.trim() || null;
      const libraryCharacterId = char?.libraryCharacterId;
      // 状态优先级：激活五视图状态 > 角色状态（根据 docs/step2-state-flow-spec.md）
      const status = char?.character?.activeFiveViewStatus ?? char?.character?.status ?? "pending";
      // status 可能值：pending、processing、ready、failed
      // generationStatus: ready 表示已完成，pending 表示正在处理或等待，failed 表示失败
      const generationStatus: "ready" | "pending" | "failed" =
        status === "ready" ? "ready" : status === "failed" ? "failed" : "pending";
      // progressPercent: ready=100, processing=需要从 runtimeMeta 获取（默认 1）, pending/failed=0
      // 注意：这里只是基础值，实际进度会由 runtimeMeta 覆盖
      const progressPercent =
        status === "ready" ? 100 : status === "processing" ? 1 : 0;

      // 使用 sourceType-{libraryCharacterId} 作为 candidateId
      const card = {
        candidateId: `generated-${libraryCharacterId}`,
        sourceType: "generated",
        rowIndex: 1,
        displayOrder: slot,
        title: char?.character?.name || `角色 ${slot}`,
        closeupPreviewUrl: previewUrl,
        fiveViewAssetUrl: previewUrl,
        generationStatus,
        progressPercent,
      } satisfies Step2FiveViewCandidateCard;

      console.log(`[buildStep2GeneratedFiveViewCandidates] slot=${slot}:`, {
        candidateId: card.candidateId,
        libraryCharacterId,
        previewUrl: previewUrl?.substring(0, 50) + '...' || '无',
        generationStatus: card.generationStatus,
      });

      return card;
    });

  console.log("[buildStep2GeneratedFiveViewCandidates] 输出:", {
    cardsCount: result.length,
    cards: result.map(c => ({
      candidateId: c.candidateId,
      displayOrder: c.displayOrder,
      hasPreviewUrl: !!c.closeupPreviewUrl,
      previewUrlPrefix: c.closeupPreviewUrl?.substring(0, 50),
      generationStatus: c.generationStatus,
    })),
  });

  return result;
}
