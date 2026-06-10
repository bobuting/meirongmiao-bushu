import React from "react";
import { Button } from "../../../components/ui/Button";
import type { Step3BatchGenerationViewState } from "./step3BatchGenerationController";

export interface Step3GlobalControlBarProps {
  savedLabel: string;
  ratio?: string;
  resolution?: string;
  threadCount?: number;
  batchState: Step3BatchGenerationViewState;
  batchDisabled?: boolean;
  batchCreditCost: number;
  batchHoverTitle?: string;
  nextCreditCost: number;
  nextHoverTitle?: string;
  nextLabel?: string;
  nextDisabled: boolean;
  /** 待生成的镜头数量 */
  pendingCount?: number;
  /** 项目状态 */
  projectStatus?: string;
  /** 是否正在确认锁定（弹窗确认期间） */
  isConfirmingLock?: boolean;
  /** 脚本是否正在加载（首条脚本未出现前） */
  isScriptLoading?: boolean;
  /** 阶段0（专业提示词生成）是否正在进行 */
  isPromptGenerating?: boolean;
  /** 积分定价是否已加载完成 */
  creditPricingLoaded?: boolean;
  onBack: () => void;
  onRatioChange?: (value: string) => void;
  onResolutionChange?: (value: string) => void;
  onThreadCountChange?: (value: number) => void;
  onBatchAction: (action: "batch-generate" | "stop") => void;
  onNext: () => void | Promise<void>;
}

export const Step3GlobalControlBar: React.FC<Step3GlobalControlBarProps> = ({
  savedLabel,
  ratio: _ratio,
  resolution: _resolution,
  threadCount: _threadCount,
  batchState,
  batchDisabled = false,
  batchCreditCost,
  batchHoverTitle,
  nextCreditCost,
  nextHoverTitle,
  nextLabel = "视频生成",
  nextDisabled,
  pendingCount = 0,
  projectStatus,
  isConfirmingLock = false,
  isScriptLoading = false,
  isPromptGenerating = false,
  creditPricingLoaded = false,
  onBack,
  onRatioChange: _onRatioChange,
  onResolutionChange: _onResolutionChange,
  onThreadCountChange: _onThreadCountChange,
  onBatchAction,
  onNext,
}) => {
  const normalizedBatchCost = Math.max(0, Math.floor(batchCreditCost));
  const normalizedNextCost = Math.max(0, Math.floor(nextCreditCost));
  const resolvedNextHoverTitle =
    nextHoverTitle ??
    (normalizedNextCost > 0 ? `${nextLabel}（${normalizedNextCost}积分）` : nextLabel);

  // 智能合并按钮逻辑
  const batchBusy = batchState.running || batchState.queued > 0 || batchState.active > 0;

  // 根据项目状态判断按钮显示
  // 状态 >= FILMING → 锁定，显示"下一步"
  const isLocked = projectStatus === "FILMING"
    || projectStatus === "CLIPS_READY"
    || projectStatus === "FISSIONING"
    || projectStatus === "READY_TO_PUBLISH"
    || projectStatus === "PUBLISHED";

  // 状态 === STORYBOARD_PREVIEW_COMPLETED → 显示"生成视频"
  const isStoryboardPreviewCompleted = projectStatus === "STORYBOARD_PREVIEW_COMPLETED";

  // 是否有待生成的分镜（仅当状态 < STORYBOARD_PREVIEW_COMPLETED 时才检查）
  const hasPendingImages = !isStoryboardPreviewCompleted && pendingCount > 0;

  // 步骤锁定时，简化底部按钮为纯导航
  if (isLocked) {
    return (
      <div
        data-testid="step3-global-control-bar"
        className="fixed bottom-6 left-0 right-0 lg:left-[400px] z-40 flex justify-center pointer-events-none"
      >
        <div className="pointer-events-auto flex max-w-[94vw] items-center gap-2 rounded-full border border-gray-200 bg-white px-2.5 py-1.5 shadow-xl shadow-gray-200/50 transition-all hover:scale-[1.01] active:scale-[0.99] md:max-w-none">
          <Button
            variant="ghost"
            onClick={onBack}
            className="h-11 rounded-full px-4 text-gray-500 hover:text-gray-900 whitespace-nowrap"
          >
            <span className="material-icons-round text-lg mr-1">arrow_back</span>
            <span className="hidden md:inline">上一步</span>
          </Button>

          <div className="h-4 w-px bg-gray-200" />

          <div
            data-testid="step3-global-control-bar-status"
            className="text-[10px] text-gray-400 font-medium px-2 whitespace-nowrap"
          >
            {savedLabel}
          </div>

          <div className="h-4 w-px bg-gray-200" />

          <div className="pr-0.5">
            <Button
              data-testid="step3-global-next"
              onClick={onNext}
              disabled={nextDisabled}
              className="h-11 rounded-full px-6 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 whitespace-nowrap disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none transition-transform animate-pulse-scale"
            >
              <span className="hidden md:inline">下一步</span>
              <span className="md:hidden">下一步</span>
              <span className="material-icons-round text-lg ml-1">arrow_forward</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 根据状态决定按钮文案
  // STORYBOARD_PREVIEW_COMPLETED → "生成视频"，否则有待生成分镜时显示"生成分镜预览"
  const showPendingButton = hasPendingImages;
  const smartButtonLabel = isConfirmingLock
    ? "确认中..."
    : showPendingButton
      ? `生成分镜预览`
      : "生成视频";
  const smartButtonCost = showPendingButton ? normalizedBatchCost : normalizedNextCost;
  // 当分镜预览已完成时，按钮应该可点击（不受 nextDisabled 影响）
  const smartButtonDisabled = isConfirmingLock || (showPendingButton ? batchDisabled : (isStoryboardPreviewCompleted ? false : nextDisabled));
  const smartButtonHoverTitle = isConfirmingLock
    ? "正在确认锁定脚本，请稍候..."
    : showPendingButton
      ? (normalizedBatchCost > 0 ? `生成分镜预览（${normalizedBatchCost}积分）` : "生成分镜预览")
      : resolvedNextHoverTitle;
  const smartButtonAction = showPendingButton
    ? () => onBatchAction("batch-generate")
    : onNext;

  return (
    <div
      data-testid="step3-global-control-bar"
      className="fixed bottom-6 left-0 right-0 lg:left-[400px] z-40 flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto flex max-w-[94vw] items-center gap-2 rounded-full border border-gray-200 bg-white px-2.5 py-1.5 shadow-xl shadow-gray-200/50 transition-all hover:scale-[1.01] active:scale-[0.99] md:max-w-none">
        <Button
          variant="ghost"
          onClick={onBack}
          className="h-11 rounded-full px-4 text-gray-500 hover:text-gray-900 whitespace-nowrap"
        >
          <span className="material-icons-round text-lg mr-1">arrow_back</span>
          <span className="hidden md:inline">上一步</span>
        </Button>

        <div className="h-4 w-px bg-gray-200" />

        <div
          data-testid="step3-global-control-bar-status"
          className="text-[10px] text-gray-400 font-medium px-2 whitespace-nowrap"
        >
          {savedLabel}
        </div>

        <div className="h-4 w-px bg-gray-200" />

        {/* 脚本加载中（首条脚本未出现前） */}
        {isScriptLoading ? (
          <button
            type="button"
            disabled
            data-testid="step3-script-loading"
            title="正在生成脚本，请稍候..."
            aria-label="生成脚本中"
            className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-5 text-xs font-semibold text-blue-700 cursor-wait"
          >
            <span className="material-icons-round text-sm shrink-0 animate-spin">sync</span>
            <span>生成脚本中...</span>
          </button>
        ) : isConfirmingLock ? (
          <button
            type="button"
            disabled
            data-testid="step3-confirming-lock"
            title="正在确认锁定脚本，请稍候..."
            aria-label="确认中"
            className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-purple-200 bg-purple-50 px-5 text-xs font-semibold text-purple-700 cursor-wait"
          >
            <span className="material-icons-round text-sm shrink-0 animate-pulse">hourglass_top</span>
            <span>确认中...</span>
          </button>
        ) : isPromptGenerating ? (
          /* 阶段0：生成专业提示词中 */
          <button
            type="button"
            disabled
            data-testid="step3-prompt-generating"
            title="正在生成专业提示词，请稍候..."
            aria-label="生成图片提示词中"
            className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-5 text-xs font-semibold text-blue-700 cursor-wait"
          >
            <span className="material-icons-round text-sm shrink-0 animate-spin">sync</span>
            <span>生成图片提示词中...</span>
          </button>
        ) : batchBusy ? (
          /* 批量生图进行中显示停止按钮 */
          <button
            type="button"
            data-testid="step3-batch-stop"
            onClick={() => onBatchAction("stop")}
            title="停止批量生图队列"
            aria-label="停止批量生图队列"
            className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-orange-200 bg-orange-100 px-5 text-xs font-semibold text-orange-700 transition hover:bg-orange-200"
          >
            <span className="material-icons-round text-sm shrink-0 animate-pulse">stop_circle</span>
            <span>生成中 ({batchState.completedCount}/{batchState.targetCount})</span>
          </button>
        ) : (
          <>
            {/* 智能合并按钮：生成并继续 / 下一步 */}
            <div className="pr-0.5">
              <Button
                data-testid={hasPendingImages ? "step3-smart-generate" : "step3-global-next"}
                onClick={smartButtonAction}
                disabled={smartButtonDisabled}
                title={smartButtonHoverTitle}
                className="h-11 rounded-full px-6 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 whitespace-nowrap disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none transition-transform animate-pulse-scale"
              >
                {smartButtonCost > 0 && creditPricingLoaded ? (
                  <>
                    <span className="hidden md:inline">{smartButtonLabel}</span>
                    <span className="w-px h-4 bg-white/30 mx-1.5 hidden md:block" />
                    <span className="hidden md:inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0">
                        <circle cx="12" cy="12" r="10" fill="#fbbf24" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                        <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill="rgba(255,255,255,0.9)" fontFamily="system-ui">¥</text>
                      </svg>
                      <span>{smartButtonCost}积分</span>
                    </span>
                    <span className="md:hidden">{smartButtonLabel}</span>
                  </>
                ) : (
                  <span className="hidden md:inline">{smartButtonLabel}</span>
                )}
                <span className="md:hidden">{smartButtonLabel}</span>
                <span className="material-icons-round text-lg ml-1">
                  {hasPendingImages ? "play_circle" : isLocked ? "arrow_forward" : "videocam"}
                </span>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
