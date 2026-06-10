import {
  buildStep3BatchGenerationTasks,
  type Step3BatchGenerationSegmentSource,
  type Step3BatchGenerationTask,
} from "../script/step3BatchGenerationRuntime";
import type { Step3BatchGenerationViewState } from "./step3BatchGenerationController";

export interface Step3BatchGenerationControlsModel {
  targets: Step3BatchGenerationTask[];
  pendingCount: number;
  creditCost: number;
  hoverTitle: string;
  batchGenerateDisabled: boolean;
  nextDisabled: boolean;
  nextHoverTitle: string;
}

function collectPositiveFrameIndexes(source: Record<string, boolean>): number[] {
  return Object.entries(source)
    .filter(([, loading]) => Boolean(loading))
    .map(([frameIndex]) => Number(frameIndex))
    .filter((frameIndex) => Number.isInteger(frameIndex) && frameIndex > 0);
}

export function collectStep3BatchLockedFrameIndexes(input: {
  sceneReinforceLoading: Record<string | number, boolean>;
  previewGenerationLoading: Record<string | number, boolean>;
}): number[] {
  return [
    ...collectPositiveFrameIndexes(input.sceneReinforceLoading as Record<string, boolean>),
    ...collectPositiveFrameIndexes(input.previewGenerationLoading as Record<string, boolean>),
  ];
}

export function buildStep3BatchGenerationControlsModel(input: {
  segments: Step3BatchGenerationSegmentSource[];
  batchState: Step3BatchGenerationViewState;
  lockedFrameIndexes?: number[];
  unitCreditCost: number;
  nextLabel: string;
  nextCreditCost: number;
  /** 是否正在确认锁定（弹窗确认期间） */
  isConfirmingLock?: boolean;
}): Step3BatchGenerationControlsModel {
  const targets = buildStep3BatchGenerationTasks(input.segments, {
    lockedFrameIndexes: input.lockedFrameIndexes,
  });
  const pendingCount = targets.length;
  const normalizedUnitCreditCost = Math.max(0, Math.floor(input.unitCreditCost));
  const creditCost = Math.max(0, pendingCount * normalizedUnitCreditCost);
  const normalizedNextCreditCost = Math.max(0, Math.floor(input.nextCreditCost));
  const batchBusy =
    input.batchState.running || input.batchState.queued > 0 || input.batchState.active > 0;

  const isConfirmingLock = input.isConfirmingLock ?? false;

  const batchGenerateDisabled = (!batchBusy && pendingCount < 1) || isConfirmingLock;
  const nextDisabled = input.segments.length < 1 || batchBusy || pendingCount > 0 || isConfirmingLock;

  const hoverTitle = isConfirmingLock
    ? "正在确认锁定脚本，请稍候..."
    : pendingCount > 0
      ? `批量生图（${pendingCount}个镜头 × ${normalizedUnitCreditCost}积分 = ${creditCost}积分）`
      : "批量生图（已全部生成完成）";

  const nextHoverTitle = isConfirmingLock
    ? "正在确认锁定脚本，请稍候..."
    : batchBusy
      ? "批量生图进行中，请等待当前队列完成或先停止队列。"
      : pendingCount > 0
        ? `请先生成剩余 ${pendingCount} 张主预览图。`
        : normalizedNextCreditCost > 0
          ? `${input.nextLabel}（${normalizedNextCreditCost}积分）`
          : input.nextLabel;

  return {
    targets,
    pendingCount,
    creditCost,
    hoverTitle,
    batchGenerateDisabled,
    nextDisabled,
    nextHoverTitle,
  };
}
