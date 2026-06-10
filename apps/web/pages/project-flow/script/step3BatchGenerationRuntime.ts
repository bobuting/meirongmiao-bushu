import { buildStep3BatchGenerationTargets } from "../step3-workspace/step3BatchGenerationController";

export interface Step3BatchGenerationSegmentSource {
  title?: string;
  content?: string;
  visualPrompt?: string;
  visualCue?: string;
  sceneImageUrl?: string | null;
}

export interface Step3BatchGenerationTask {
  id: string;
  frameIndex: number;
  title: string;
  prompt: string;
  hasImage: boolean;
  locked: boolean;
  completed: boolean;
}

function trimText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildStep3BatchGenerationTasks(
  segments: Step3BatchGenerationSegmentSource[],
  options?: {
    lockedFrameIndexes?: number[];
  },
): Step3BatchGenerationTask[] {
  const lockedFrameIndexes = new Set(options?.lockedFrameIndexes ?? []);
  const tasks: Array<Step3BatchGenerationTask | null> = segments.map((segment, index) => {
    const frameIndex = index + 1;
    const mainPrompt = trimText(segment.visualPrompt) || trimText(segment.visualCue);
    if (mainPrompt.length < 1) {
      return null;
    }
    const hasImage = trimText(segment.sceneImageUrl).length > 0;
    return {
      id: `step3-frame-${frameIndex}`,
      frameIndex,
      title: trimText(segment.title) || `镜头 ${frameIndex}`,
      prompt: mainPrompt,
      hasImage,
      locked: lockedFrameIndexes.has(frameIndex),
      completed: hasImage,
    };
  });

  return buildStep3BatchGenerationTargets(tasks.filter((item): item is Step3BatchGenerationTask => item !== null));
}
