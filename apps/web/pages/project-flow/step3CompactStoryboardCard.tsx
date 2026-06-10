import React from "react";
import type { Step3StoryboardCardViewModel } from "./step3StoryboardCardAdapter";
import {
  Step3PreviewCardRuntime,
  type Step3PreviewCardViewModel,
} from "./step3-workspace/step3PreviewCardRuntime";
import { getOssThumbnailUrl } from "../../utils/ossImage";

interface Step3CompactStoryboardCardProps {
  viewModel: Step3StoryboardCardViewModel;
  frameParameterSummary: string;
  previewViewModel: Step3PreviewCardViewModel;
  isPreviewGenerating: boolean;
  previewGenerationStartedAt?: number | null;
  previewRetryCreditCost?: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isActivePreviewFrame: boolean;
  /** 批量生图是否进行中 */
  isBatchBusy?: boolean;
  /** 是否正在确认锁定 */
  isConfirmingLock?: boolean;
  /** 脚本是否已锁定（锁定后才显示图片占位区域） */
  isLocked?: boolean;
  /** 帧预览错误信息（从全局任务队列失败帧提取） */
  previewErrorMessage?: string | null;
  /** 阶段0（专业提示词生成）是否正在进行 */
  isPromptGenerating?: boolean;
  /** 历史候选图 URL 列表（来自 nrm_step3_frame_images.batches） */
  candidateImageUrls?: string[];
  /** 选择候选图替换当前预览图 */
  onSelectCandidateImage?: (imageUrl: string) => void;
  onMainPromptChange: (value: string) => void;
  onGeneratePreviewImage: () => void;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
  onActivatePreviewFrame: () => void;
  onPreviewImage: (imageUrl: string, label: string) => void;
}

function trimText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export const Step3CompactStoryboardCard: React.FC<Step3CompactStoryboardCardProps> = ({
  viewModel,
  frameParameterSummary,
  previewViewModel,
  isPreviewGenerating,
  previewGenerationStartedAt = null,
  previewRetryCreditCost = 0,
  canMoveUp: _canMoveUp,
  canMoveDown: _canMoveDown,
  isActivePreviewFrame: _isActivePreviewFrame,
  isBatchBusy = false,
  isConfirmingLock = false,
  isLocked = false,
  previewErrorMessage = null,
  isPromptGenerating = false,
  candidateImageUrls = [],
  onSelectCandidateImage,
  onMainPromptChange: _onMainPromptChange,
  onGeneratePreviewImage,
  onMove: _onMove,
  onDelete: _onDelete,
  onActivatePreviewFrame: _onActivatePreviewFrame,
  onPreviewImage,
}) => {
  const compactPrompt = viewModel.mainVisualPrompt;

  // 锁定后有图片内容（已生成或正在生成）时才显示右侧预览区
  const hasImageContent = previewViewModel.previewImageUrl
    || isPreviewGenerating
    || isPromptGenerating
    || previewErrorMessage;
  const showPreviewArea = isLocked && hasImageContent;

  return (
    <article
      data-testid={`step3-frame-layout-${viewModel.frameIndex}`}
      className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_1px_6px_rgba(0,0,0,0.03)] transition-all duration-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
    >
      {/* 头部 */}
      <div className="flex items-center justify-between bg-gradient-to-r from-white to-gray-50/50 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="material-icons-round text-lg text-orange-400/80">videocam</span>
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-[13px] font-semibold text-gray-800 truncate">{viewModel.frameLabel}</span>
            {trimText(viewModel.timeLabel) && (
              <span className="text-[11px] text-gray-400">{viewModel.timeLabel}</span>
            )}
          </div>
        </div>
        {trimText(frameParameterSummary) && (
          <span className="text-[10px] font-medium text-gray-300 truncate ml-2">{frameParameterSummary}</span>
        )}
      </div>

      {/* 主体 */}
      <div className={`grid gap-4 p-3.5 ${showPreviewArea ? "xl:grid-cols-[minmax(0,1fr)_200px]" : ""}`}>
        {/* 左侧：分镜内容提示词 */}
        <div className="flex min-w-0 flex-col gap-3">
          {/* 画面提示词 */}
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="material-icons-round text-lg text-orange-500">auto_awesome</span>
              <span className="text-[13px] font-bold tracking-wide text-gray-700">分镜内容</span>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-2.5">
              <p className="text-[11.5px] leading-[1.65] text-gray-500">
                {compactPrompt || (
                  <span className="text-gray-300 italic">等待生成...</span>
                )}
                {viewModel.narration && (
                  <>
                    <br />
                    <br />
                    <span className="text-gray-400">{viewModel.narration}</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* 右侧：预览图（锁定且有图片内容时显示） */}
        {showPreviewArea && (
        <div className="flex w-[200px] shrink-0 flex-col gap-2" onClick={(event) => event.stopPropagation()}>
          {/* 预览图 */}
          <div className="aspect-[9/16] w-full overflow-hidden rounded-lg border border-gray-100 bg-gray-50 shadow-sm">
            <Step3PreviewCardRuntime
              viewModel={previewViewModel}
              onOpenPreview={onPreviewImage}
              onGenerateOrRetry={onGeneratePreviewImage}
              isGenerating={isPreviewGenerating}
              generationStartedAt={previewGenerationStartedAt}
              retryCreditCost={previewRetryCreditCost}
              errorMessage={previewErrorMessage}
              showOverlayActions={false}
              minHeightClassName=""
              isBatchBusy={isBatchBusy}
              isConfirmingLock={isConfirmingLock}
              isPromptGenerating={isPromptGenerating}
            />
          </div>
          {/* 历史候选图缩略图 */}
          {candidateImageUrls.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {candidateImageUrls.map((url, ci) => {
                const isSelected = url === previewViewModel?.previewImageUrl;
                return (
                  <button
                    key={`candidate-${ci}`}
                    type="button"
                    className={`shrink-0 overflow-hidden rounded border transition-all ${
                      isSelected
                        ? "border-orange-400 ring-1 ring-orange-400/40"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => {
                      if (isSelected) {
                        onPreviewImage(url, `镜头 ${previewViewModel?.frameIndex ?? ""} 候选 ${ci + 1}`);
                      } else {
                        onSelectCandidateImage?.(url);
                      }
                    }}
                  >
                    <img
                      src={getOssThumbnailUrl(url, 80)}
                      alt={`候选 ${ci + 1}`}
                      className="h-10 w-10 object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>
    </article>
  );
};