import React, { useEffect, useMemo, useState } from "react";
import { getOssThumbnailUrl } from "../../../utils/ossImage";
import {
  STEP2_RUNTIME_PROGRESS_LOADING_POSTER_SRC,
  STEP2_RUNTIME_PROGRESS_LOADING_VIDEO_SRC,
} from "../../../../../src/contracts/step2-runtime-progress-contract";
import { CreditBadge } from "../../../components/ui/CreditBadge";

function trimText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface Step3PreviewCardViewModel {
  frameIndex: number;
  frameLabel: string;
  timeLabel: string;
  title: string;
  narration: string;
  mainVisualPrompt: string;
  frameParameterSummary: string;
  previewImageUrl: string | null;
  previewImageLabel: string;
  previewStatusText: string;
  selectedRoleReferenceLabel: string | null;
  selectedRoleReferenceImageUrl: string | null;
  sceneReferenceLabel: string;
}

export interface Step3PreviewCardInput {
  frameIndex: number;
  timeLabel: string;
  title: string;
  narration: string;
  mainVisualPrompt: string;
  frameParameterSummary: string;
  sceneImageUrl?: string | null;
  selectedRoleReference?: {
    label: string;
    imageUrl: string;
  } | null;
  sceneReference?: {
    title: string;
    selectedImageUrl?: string | null;
  } | null;
}

export function buildStep3PreviewCardViewModel(input: Step3PreviewCardInput): Step3PreviewCardViewModel {
  const segmentImageUrl = trimText(input.sceneImageUrl);
  const previewImageUrl = segmentImageUrl || null;
  const sceneReferenceLabel = trimText(input.sceneReference?.title) || `场景 ${input.frameIndex}`;
  return {
    frameIndex: input.frameIndex,
    frameLabel: `镜头 ${input.frameIndex}`,
    timeLabel: trimText(input.timeLabel) || `${Math.max(0, input.frameIndex - 1) * 3}-${input.frameIndex * 3}s`,
    title: trimText(input.title) || `镜头 ${input.frameIndex}`,
    narration: trimText(input.narration),
    mainVisualPrompt: trimText(input.mainVisualPrompt),
    frameParameterSummary: trimText(input.frameParameterSummary),
    previewImageUrl,
    previewImageLabel: previewImageUrl ? `${sceneReferenceLabel} 主预览` : `镜头 ${input.frameIndex} 暂无主预览`,
    previewStatusText: previewImageUrl ? "当前展示镜头主预览图" : "当前镜头还没有主预览图",
    selectedRoleReferenceLabel: trimText(input.selectedRoleReference?.label) || null,
    selectedRoleReferenceImageUrl: trimText(input.selectedRoleReference?.imageUrl) || null,
    sceneReferenceLabel,
  };
}

export const Step3ImagePreviewModal: React.FC<{
  preview: { imageUrl: string; label: string } | null;
  onClose: () => void;
}> = ({ preview, onClose }) => {
  if (!preview) {
    return null;
  }
  return (
    <div
      data-testid="step3-image-preview-modal"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white"
        >
          <span className="material-icons-round text-base">close</span>
        </button>
        <img src={preview.imageUrl} alt={preview.label} className="max-h-[90vh] max-w-[90vw] object-contain"  loading="lazy" />
        <div className="border-t border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700">{preview.label}</div>
      </div>
    </div>
  );
};

/**
 * Step3 preview card — simplified "dressing room" style.
 *
 * - No nested header/title bar (the frame label is already on the sidebar).
 * - Image fills the card area with 9:16 aspect ratio.
 * - Hover overlay shows "更换" and "局部重绘" buttons (referencing images 4-5).
 * - Top-right retry/generate button always visible.
 * - Bottom progress bar.
 * - No outer border/shadow wrapper — the parent handles spacing.
 */
export const Step3PreviewCardRuntime: React.FC<{
  viewModel: Step3PreviewCardViewModel | null;
  onOpenPreview: (imageUrl: string, label: string) => void;
  onGenerateOrRetry?: () => void;
  isGenerating?: boolean;
  generationStartedAt?: number | null;
  retryCreditCost?: number;
  onChangeImage?: () => void;
  onOpenMaskEditor?: () => void;
  hasMaskApplied?: boolean;
  showOverlayActions?: boolean;
  minHeightClassName?: string;
  /** 批量生图是否进行中 */
  isBatchBusy?: boolean;
  /** 是否正在确认锁定 */
  isConfirmingLock?: boolean;
  /** 帧预览错误信息（来自全局任务队列的失败帧） */
  errorMessage?: string | null;
  /** 阶段0（专业提示词生成）是否正在进行 */
  isPromptGenerating?: boolean;
  /** 图片显示模式：cover（裁剪填充）或 contain（缩放适配） */
  imageObjectFit?: "cover" | "contain";
}> = ({
  viewModel,
  onOpenPreview,
  onGenerateOrRetry,
  isGenerating = false,
  generationStartedAt = null,
  retryCreditCost = 0,
  onChangeImage,
  onOpenMaskEditor,
  hasMaskApplied = false,
  showOverlayActions = true,
  minHeightClassName = "min-h-[320px]",
  isBatchBusy = false,
  isConfirmingLock = false,
  errorMessage = null,
  isPromptGenerating = false,
  imageObjectFit = "cover",
}) => {
    const [runtimeNow, setRuntimeNow] = useState(() => Date.now());

    useEffect(() => {
      if (!isGenerating) {
        return;
      }
      const timerId = window.setInterval(() => {
        setRuntimeNow(Date.now());
      }, 400);
      return () => window.clearInterval(timerId);
    }, [isGenerating]);

    const progressPercent = useMemo(() => {
      if (!isGenerating) {
        return viewModel?.previewImageUrl ? 100 : 0;
      }
      const startedAt = typeof generationStartedAt === "number" && Number.isFinite(generationStartedAt)
        ? generationStartedAt
        : runtimeNow;
      const elapsedMs = Math.max(0, runtimeNow - startedAt);
      const estimated = Math.floor((elapsedMs / 28_000) * 95);
      return Math.max(1, Math.min(95, estimated));
    }, [generationStartedAt, isGenerating, runtimeNow, viewModel?.previewImageUrl]);

    if (!viewModel) {
      return (
        <div
          data-testid="step3-preview-card-empty-shell"
          className="flex aspect-[9/16] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60"
        >
          <div className="text-sm font-semibold text-slate-400">当前还没有可预览的镜头。</div>
        </div>
      );
    }
    const progressLabel = isGenerating ? `生成中 ${progressPercent}%` : viewModel.previewImageUrl ? "已生成" : "等待生成";
    const retryButtonLabel = viewModel.previewImageUrl ? "重试生成当前镜头" : "生成当前镜头";
    const retryCost = Math.max(0, Math.floor(retryCreditCost));

    // 合并全局禁用状态
    const globalBusy = isBatchBusy || isConfirmingLock;
    const buttonDisabled = !onGenerateOrRetry || isGenerating || globalBusy;

    // 禁用状态下的提示文字
    let retryButtonTitle: string;
    if (isConfirmingLock) {
      retryButtonTitle = "正在确认锁定脚本，请稍候...";
    } else if (isBatchBusy) {
      retryButtonTitle = "批量生图进行中，请等待完成或先停止队列";
    } else if (isGenerating) {
      retryButtonTitle = "当前镜头正在生成中...";
    } else {
      retryButtonTitle = retryCost > 0 ? `${retryButtonLabel}（${retryCost}积分）` : retryButtonLabel;
    }

    return (
      <div
        data-testid="step3-preview-card"
        className={`group/preview relative h-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${minHeightClassName}`}
      >
        {/* Image area */}
        {(!viewModel.previewImageUrl || isGenerating) && STEP2_RUNTIME_PROGRESS_LOADING_POSTER_SRC ? (
          <img
            src={STEP2_RUNTIME_PROGRESS_LOADING_POSTER_SRC}
            alt={`${viewModel.frameLabel} 占位背景`}
            className={`absolute inset-0 h-full w-full ${imageObjectFit === "contain" ? "object-contain" : "object-cover"}`}
          />
        ) : null}
        {viewModel.previewImageUrl ? (
          <img
            src={getOssThumbnailUrl(viewModel.previewImageUrl, 400)}
            alt={viewModel.previewImageLabel}
            className={`h-full w-full ${imageObjectFit === "contain" ? "object-contain" : "object-cover"} ${isGenerating ? "opacity-55 blur-[1px] saturate-[0.82]" : ""}`}
            onDoubleClick={() => onOpenPreview(viewModel.previewImageUrl!, viewModel.previewImageLabel)}
          />
        ) : errorMessage ? (
          <div
            data-testid="step3-preview-card-error"
            className="flex h-full flex-col items-center justify-center gap-3 bg-red-50/60 px-5 text-center"
          >
            <span className="material-icons-round text-4xl text-red-400">error_outline</span>
            <div className="text-[12px] font-semibold leading-snug text-red-600">
              生成失败
            </div>
            <div className="line-clamp-3 text-[11px] leading-[1.6] text-red-400/90">
              {errorMessage}
            </div>
            {onGenerateOrRetry && !globalBusy ? (
              <button
                type="button"
                data-testid="step3-preview-card-error-retry"
                onClick={onGenerateOrRetry}
                className="mt-1 flex items-center gap-1 rounded-full bg-red-500 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm transition hover:bg-red-600"
              >
                <span className="material-icons-round text-[13px]">refresh</span>
                重试生成
              </button>
            ) : null}
          </div>
        ) : isPromptGenerating ? (
          <div
            data-testid="step3-preview-card-prompt-generating"
            className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
          >
            <span className="material-icons-round text-4xl text-blue-400 animate-spin">sync</span>
            <div className="text-sm font-semibold text-blue-600">正在生成专业提示词...</div>
            <div className="text-xs leading-5 text-blue-400/80">预计需要 1-2 </div>
          </div>
        ) : (
          <div
            data-testid="step3-preview-card-empty"
            className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
          >
            <span className="material-icons-round text-4xl text-slate-300">
              {isGenerating ? "hourglass_top" : "image"}
            </span>
            <div className="text-sm font-semibold text-slate-500">
              {isGenerating ? "镜头主图生成中" : viewModel.previewStatusText}
            </div>
            <div className="text-xs leading-5 text-slate-400">
              {isGenerating ? "正在基于当前镜头配置生成候选图。" : "可双击预览，或拖入 / 上传替换图片。"}
            </div>
          </div>
        )}

        {isGenerating ? (
          <video
            key={`step3-preview-loading-video-${viewModel.frameIndex}`}
            className="absolute inset-0 h-full w-full object-cover"
            src={STEP2_RUNTIME_PROGRESS_LOADING_VIDEO_SRC}
            poster={STEP2_RUNTIME_PROGRESS_LOADING_POSTER_SRC}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onLoadedData={(event) => {
              const target = event.currentTarget;
              if (target.currentTime <= 0) {
                target.currentTime = 0.01;
              }
              void target.play().catch(() => undefined);
            }}
            onCanPlay={(event) => {
              void event.currentTarget.play().catch(() => undefined);
            }}
          />
        ) : null}
        {hasMaskApplied ? (
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-emerald-600/80 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <span className="material-icons-round text-[11px]">brush</span>
            已存蒙版
          </div>
        ) : null}

        {/* 右上角操作按钮组 */}
        <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover/preview:opacity-100">
          {viewModel.previewImageUrl ? (
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/55"
              onClick={() => onOpenPreview(viewModel.previewImageUrl!, viewModel.previewImageLabel)}
              title="放大预览"
            >
              <span className="material-icons-round text-[16px]">zoom_in</span>
            </button>
          ) : null}
          <div className="relative">
            <button
              type="button"
              data-testid="step3-preview-card-generate"
              aria-label={retryButtonLabel}
              title={retryButtonTitle}
              onClick={() => onGenerateOrRetry?.()}
              disabled={buttonDisabled}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className={`material-icons-round text-[16px] ${isGenerating ? "animate-spin" : ""}`}>
                {isGenerating || globalBusy ? "hourglass_top" : "refresh"}
              </span>
              <span className="sr-only">{retryButtonLabel}</span>
            </button>
            {retryCost > 0 && !isGenerating && !globalBusy ? (
              <CreditBadge amount={retryCost} variant="badge" />
            ) : null}
          </div>
        </div>

        {showOverlayActions && viewModel.previewImageUrl && !isGenerating ? (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10 opacity-0 transition-opacity group-hover/preview:opacity-100">
            {/* 底部操作区 */}
            <div className="pointer-events-none absolute inset-x-0 bottom-8 flex items-center justify-center gap-3">
              <button
                type="button"
                data-testid="step3-preview-card-change-image"
                onClick={() => onChangeImage?.()}
                className="pointer-events-auto flex h-9 items-center gap-1.5 rounded-full bg-white/20 px-4 text-[12px] font-medium text-white backdrop-blur-md transition hover:bg-white/30"
              >
                <span className="material-icons-round text-[15px]">swap_horiz</span>
                更换
              </button>
              <button
                type="button"
                data-testid="step3-preview-card-mask-repaint"
                onClick={() => onOpenMaskEditor?.()}
                className="pointer-events-auto flex h-9 items-center gap-1.5 rounded-full bg-white/20 px-4 text-[12px] font-medium text-white backdrop-blur-md transition hover:bg-white/30"
              >
                <span className="material-icons-round text-[15px]">brush</span>
                局部重绘
              </button>
            </div>
            {/* 双击提示 */}
            <div className="pointer-events-none absolute bottom-2 inset-x-0 text-center text-[10px] font-medium text-white/60">
              双击放大预览
            </div>
          </div>
        ) : null}

        {/* Bottom progress */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 backdrop-blur-sm">
          {isGenerating && (
            <span className="material-icons-round text-[12px] animate-spin text-sky-400">hourglass_top</span>
          )}
          {progressPercent >= 100 && !isGenerating && (
            <span className="material-icons-round text-[12px] text-emerald-400">check_circle</span>
          )}
          <span className="text-[10px] font-medium text-white">
            {isGenerating ? `${progressPercent}%` : progressLabel}
          </span>
        </div>
        <div className="absolute inset-x-2 bottom-1 h-[3px] rounded-full bg-black/10">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-out ${
              isGenerating
                ? "bg-gradient-to-r from-sky-400 via-sky-500 to-cyan-400"
                : progressPercent >= 100
                  ? "bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400"
                  : "bg-slate-400/60"
            }`}
            style={{
              width: `${progressPercent}%`,
              boxShadow: isGenerating
                ? "0 0 6px 1px rgba(56, 189, 248, 0.5)"
                : progressPercent >= 100
                  ? "0 0 6px 1px rgba(52, 211, 153, 0.5)"
                  : "none",
            }}
          />
        </div>
      </div>
    );
  };
