export type ReverseStoryboardSuccessInputMode = "douyin_url" | "video_url" | "upload_file";

export interface ReverseStoryboardSuccessPlan {
  readonly reverseStoryboardLibraryId: string | null;
  readonly shouldRefetchStoryboardLibrary: boolean;
}

export function buildReverseStoryboardSuccessPlan(
  inputMode: ReverseStoryboardSuccessInputMode,
  reverseStoryboardLibraryId: string | null | undefined,
): ReverseStoryboardSuccessPlan {
  const storyboardLibraryId =
    typeof reverseStoryboardLibraryId === "string" && reverseStoryboardLibraryId.trim().length > 0
      ? reverseStoryboardLibraryId.trim()
      : null;
  const storyboardMode = inputMode === "video_url" || inputMode === "upload_file";
  return {
    reverseStoryboardLibraryId: storyboardLibraryId,
    shouldRefetchStoryboardLibrary: storyboardMode && storyboardLibraryId !== null,
  };
}
