import type { ReverseStoryboardLibraryRecordDto } from "../../../../src/contracts/reverse-storyboard-library-api";
import type { SmartStoryboardLibraryRecordDto } from "../../../../src/contracts/smart-storyboard-library-api";
import {
  buildStep3ImportedStoryboardPayload,
  type Step3ImportedStoryboardPayload,
} from "../../../../src/contracts/reverse-storyboard-report";
import {
  resolveStep3ImportBoundary,
  type Step3ImportBoundaryResolution,
} from "../../../../src/contracts/step3-import-boundary";

export interface ReverseStoryboardImportPlan {
  readonly payload: Step3ImportedStoryboardPayload;
  readonly boundary: Step3ImportBoundaryResolution;
}

function buildImportPlanFromFrames(input: {
  sourceLibraryId: string;
  title: string;
  frames: ReadonlyArray<{
    index: number;
    time?: string | null;
    title: string;
    narration: string;
    visualCue: string;
    notes?: string | null;
  }>;
  hasProjectContext: boolean;
}): ReverseStoryboardImportPlan {
  const payload = buildStep3ImportedStoryboardPayload({
    sourceLibraryId: input.sourceLibraryId,
    title: input.title,
    frames: input.frames,
  });
  return {
    payload,
    boundary: resolveStep3ImportBoundary(payload.importMode, input.hasProjectContext),
  };
}

export function buildReverseStoryboardImportSelectionMessage(
  payload: Step3ImportedStoryboardPayload,
): string {
  const title = payload.title.trim() || "未命名分镜";
  return `请先选择现有项目或创建新项目，再将“${title}”的 ${payload.segments.length} 个分镜导入 Step3。`;
}

export function buildReverseStoryboardImportSuccessMessage(
  payload: Step3ImportedStoryboardPayload,
): string {
  return `已导入分镜到 Step3：${payload.title.trim() || "未命名分镜"}`;
}

export function buildReverseStoryboardImportPlan(
  item: ReverseStoryboardLibraryRecordDto,
  hasProjectContext: boolean,
): ReverseStoryboardImportPlan {
  return buildImportPlanFromFrames({
    sourceLibraryId: item.id,
    title: item.title,
    frames: item.report.frames,
    hasProjectContext,
  });
}

export function buildSmartStoryboardImportPlan(
  item: SmartStoryboardLibraryRecordDto,
  hasProjectContext: boolean,
): ReverseStoryboardImportPlan {
  return buildImportPlanFromFrames({
    sourceLibraryId: item.id,
    title: item.title,
    frames: item.report.frames,
    hasProjectContext,
  });
}
