import type { Step2FiveViewCandidateCard } from "../../../../src/contracts/step2-five-view-candidate-board-contract";

interface Step2LibraryCandidateSourceItem {
  id: string;
  name: string;
  tags?: string[];
  thumbnailUrl?: string | null;
  fiveViewOssImageUrl?: string | null;
}

interface Step2LibraryFiveViewMatchInput {
  roleDirectionPrompt: string | null | undefined;
  selectedCharacterName: string | null | undefined;
  libraryItems: Step2LibraryCandidateSourceItem[];
  /** 最多返回多少个候选，默认 4 */
  limit?: number;
  /** 已排除的角色 ID 列表（通常是已显示在生成角色的项目角色） */
  excludeIds?: string[];
}

function shouldExcludeLibraryItemFromStep2Recommendations(item: Step2LibraryCandidateSourceItem): boolean {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  return tags.some((tag) => tag.trim().toLowerCase() === "step2-v2-seed");
}

export function buildStep2LibraryFiveViewMatchCandidates(
  input: Step2LibraryFiveViewMatchInput,
): Step2FiveViewCandidateCard[] {
  // 后端已完成匹配，presets 就是匹配结果，直接展示即可
  // 不要求角色必须有 5 视图（base 角色可能只有 thumbnailUrl）
  const excludeSet = new Set(input.excludeIds ?? []);
  const eligible = input.libraryItems.filter(
    (item) => !shouldExcludeLibraryItemFromStep2Recommendations(item) && !excludeSet.has(item.id),
  );

  console.log('[buildStep2LibraryFiveViewMatchCandidates] total:', input.libraryItems.length, 'eligible:', eligible.length, 'excludeIds:', input.excludeIds);

  if (eligible.length === 0) {
    return Array.from({ length: 4 }, (_, i) => ({
      candidateId: `library-pending-${i + 1}`,
      sourceType: "library",
      rowIndex: 2,
      displayOrder: i + 1,
      title: `库角色候选 ${i + 1}`,
      closeupPreviewUrl: null,
      fiveViewAssetUrl: null,
      generationStatus: "pending",
      progressPercent: 0,
    }));
  }

  const count = input.limit ?? 4;
  const selected = eligible.slice(0, count);
  return selected.map((item, index) => {
    // 优先显示主图，fallback 到五视图
    const previewUrl = item.thumbnailUrl || item.fiveViewOssImageUrl || null;
    return {
      candidateId: `library-${item.id}`,
      sourceType: "library",
      rowIndex: 2,
      displayOrder: index + 1,
      title: item.name,
      closeupPreviewUrl: previewUrl,
      fiveViewAssetUrl: previewUrl,
      generationStatus: "ready",
      progressPercent: 100,
    } as Step2FiveViewCandidateCard;
  });
}
