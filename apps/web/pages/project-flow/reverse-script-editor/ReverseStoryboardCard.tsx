/**
 * 反推脚本分镜卡片（上下布局，4列适配）
 * 上方：预览图（竖屏 9:16，固定高度避免卡片过大）
 * 下方：分镜信息 + 旁白
 * 集成 Step3PreviewCardRuntime 提供重试、放大、进度等功能
 */

import React, { useState, useMemo } from "react";
import type { ScriptSegment } from "../script-editor/types";
import {
  Step3PreviewCardRuntime,
  type Step3PreviewCardViewModel,
  Step3ImagePreviewModal,
} from "../step3-workspace/step3PreviewCardRuntime";
import { buildStep3PreviewCardViewModel } from "../step3-workspace/step3PreviewCardRuntime";
import { getOssThumbnailUrl } from "../../../utils/ossImage";

interface ReverseStoryboardCardProps {
  segment: ScriptSegment;
  index: number;
  /** 分镜预览图 URL（来自 nrm_step3_frame_images） */
  imageUrl?: string;
  /** 是否正在生成分镜预览 */
  isGenerating?: boolean;
  /** 生成开始时间（用于进度条计算） */
  generationStartedAt?: number | null;
  /** 重试/生成单个分镜预览 */
  onGenerateOrRetry?: () => void;
  /** 重试积分消耗 */
  retryCreditCost?: number;
  /** 批量生图是否进行中 */
  isBatchBusy?: boolean;
  /** 历史候选图 URL 列表 */
  candidateImageUrls?: string[];
  /** 选择候选图替换当前预览图 */
  onSelectCandidateImage?: (imageUrl: string) => void;
  /** 帧预览错误信息（来自全局任务队列的失败帧） */
  errorMessage?: string | null;
}

/**
 * 反推项目的分镜卡片（上下布局，适配 4 列网格）
 * 预览图区域只在以下情况显示：
 * 1. 正在生成中（批量或单帧）
 * 2. 已经有预览图
 * 3. 生成失败（有错误信息）
 */
export const ReverseStoryboardCard: React.FC<ReverseStoryboardCardProps> = ({
  segment,
  index,
  imageUrl,
  isGenerating = false,
  generationStartedAt = null,
  onGenerateOrRetry,
  retryCreditCost = 0,
  isBatchBusy = false,
  candidateImageUrls = [],
  onSelectCandidateImage,
  errorMessage = null,
}) => {
  const title = segment.title || `镜头 ${index + 1}`;
  const content = segment.content || "";
  const visualCue = segment.visualCue || segment.visualPrompt || "";
  const durationSec = segment.durationSec ?? 3;

  // 放大预览状态
  const [preview, setPreview] = useState<{ imageUrl: string; label: string } | null>(null);

  // 是否应该显示预览图区域（生成中、已有图、生成失败）
  const hasImage = Boolean(imageUrl || segment.sceneImageUrl);
  const shouldShowPreviewArea = isGenerating || hasImage || Boolean(errorMessage);

  // 构建 Step3PreviewCardViewModel（memo 避免每次渲染重算）
  const previewViewModel: Step3PreviewCardViewModel = useMemo(
    () =>
      buildStep3PreviewCardViewModel({
        frameIndex: index + 1,
        timeLabel: `${durationSec}秒`,
        title,
        narration: content,
        mainVisualPrompt: visualCue,
        frameParameterSummary: "",
        sceneImageUrl: imageUrl || segment.sceneImageUrl,
      }),
    [index, durationSec, title, content, visualCue, imageUrl, segment.sceneImageUrl]
  );

  return (
    <>
      <article className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_1px_6px_rgba(0,0,0,0.03)] transition-all duration-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
        {/* 预览图区域（只在生成中、已有图、生成失败时显示） */}
        {shouldShowPreviewArea && (
          <div className="relative aspect-[9/16] max-h-[280px] w-full overflow-hidden bg-gray-50">
            <Step3PreviewCardRuntime
              viewModel={previewViewModel}
              onOpenPreview={(url, label) => setPreview({ imageUrl: url, label })}
              onGenerateOrRetry={onGenerateOrRetry}
              isGenerating={isGenerating}
              generationStartedAt={generationStartedAt}
              retryCreditCost={retryCreditCost}
              showOverlayActions={false}
              minHeightClassName=""
              isBatchBusy={isBatchBusy}
              errorMessage={errorMessage}
              imageObjectFit="contain"
            />
          </div>
        )}

        {/* 内容区域（下方） */}
        <div className="space-y-1.5 p-2.5">
          {/* 头部信息 */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="material-icons-round text-sm text-orange-400/80">videocam</span>
              <span className="text-[11px] font-semibold text-gray-800 truncate">
                第 {index + 1} 镜
              </span>
              <span className="text-[10px] text-gray-400">{durationSec}秒</span>
            </div>
            <span className="text-[10px] font-medium text-gray-500 truncate max-w-[100px]">
              {title}
            </span>
          </div>

          {/* 画面描述 */}
          {visualCue && (
            <p className="text-[10px] leading-[1.5] text-gray-400 line-clamp-2">{visualCue}</p>
          )}

          {/* 旁白 */}
          {content && (
            <p className="text-[10px] leading-[1.5] text-gray-400 line-clamp-2">{content}</p>
          )}

          {/* 候选图缩略图（只在有预览图区域时显示） */}
          {shouldShowPreviewArea && candidateImageUrls.length > 0 && (
            <div className="flex gap-1 overflow-x-auto pt-0.5">
              {candidateImageUrls.map((url, ci) => {
                const isSelected = url === previewViewModel?.previewImageUrl;
                // 单帧生成中时禁用候选图切换（防止竞态：切换会触发 frameImageUrls 变化，导致清理 useEffect 误判为生成完成）
                const disabled = isGenerating;
                const buttonTitle = disabled
                  ? "正在生成中，请等待完成后再切换候选图"
                  : isSelected
                    ? `当前选中（点击可放大查看）`
                    : `切换为候选图 ${ci + 1}`;
                return (
                  <button
                    key={`candidate-${ci}`}
                    type="button"
                    disabled={disabled}
                    title={buttonTitle}
                    className={`shrink-0 overflow-hidden rounded border transition-all ${
                      disabled
                        ? "border-gray-100 opacity-40 cursor-not-allowed"
                        : isSelected
                          ? "border-orange-400 ring-1 ring-orange-400/40"
                          : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => {
                      if (disabled) return;
                      if (isSelected) {
                        setPreview({
                          imageUrl: url,
                          label: `第 ${index + 1} 镜 候选 ${ci + 1}`,
                        });
                      } else {
                        onSelectCandidateImage?.(url);
                      }
                    }}
                  >
                    <img
                      src={getOssThumbnailUrl(url, 80)}
                      alt={`候选 ${ci + 1}`}
                      className="h-6 w-6 object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </article>

      {/* 放大预览弹窗 */}
      <Step3ImagePreviewModal preview={preview} onClose={() => setPreview(null)} />
    </>
  );
};
