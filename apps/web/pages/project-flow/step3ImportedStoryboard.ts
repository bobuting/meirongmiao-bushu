import type { Step3ImportedStoryboardPayload } from "../../../../src/contracts/reverse-storyboard-report";

export interface ImportedShotBreakdownViewModel {
  readonly time: string;
  readonly title: string;
  readonly content: string;
  readonly visualCue: string;
  readonly videoCue: string;
  readonly videoCueTouched: boolean;
  readonly videoCueInitialized: boolean;
  readonly sceneImageUrl: string | null;
  readonly selectedSceneReferenceId: string | null;
  readonly selectedCharacterReferenceId: string | null;
}

export function hydrateImportedStoryboardSegments(
  payload: Step3ImportedStoryboardPayload,
): ImportedShotBreakdownViewModel[] {
  return payload.segments.map((segment) => {
    const content = segment.content.trim();
    const visualCue = segment.visualCue.trim();
    const normalizedContent = content.length > 0 ? content : (visualCue.length > 0 ? `画面：${visualCue}` : "");
    return {
      time: segment.time.trim(),
      title: segment.title.trim(),
      content: normalizedContent,
      visualCue,
      videoCue: visualCue.length > 0 ? visualCue : normalizedContent,
      videoCueTouched: false,
      videoCueInitialized: true,
      sceneImageUrl: segment.sceneImageUrl ?? null,
      selectedSceneReferenceId: null,
      selectedCharacterReferenceId: null,
    };
  });
}
