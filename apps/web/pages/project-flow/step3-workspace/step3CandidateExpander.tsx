import React, { useCallback, useRef, useState } from "react";
import { getOssThumbnailUrl } from "../../../utils/ossImage";
import { createPortal } from "react-dom";

export interface Step3CandidateExpanderViewModel {
  /** 场景参考ID */
  sceneReferenceId: string;
  /** 镜头索引 */
  frameIndex: number;
  /** 当前选中的图片URL */
  selectedImageUrl: string | null;
  /** 所有候选图片 */
  candidates: Array<{
    imageUrl: string;
    label: string;
  }>;
}

export interface Step3CandidateExpanderProps {
  viewModel: Step3CandidateExpanderViewModel | null;
  /** 主图组件 */
  children: React.ReactNode;
  /** 选择候选图回调 */
  onSelectCandidate: (imageUrl: string) => void;
  /** 预览图片回调 */
  onPreviewImage: (imageUrl: string, label: string) => void;
  /** 是否正在生成 */
  isGenerating?: boolean;
}

/**
 * 候选图展开选择器
 *
 * 功能：
 * 1. 在主图上显示徽章（当前索引/总数）
 * 2. 点击徽章展开候选图网格（使用 Portal 渲染到屏幕中央）
 * 3. 点击遮罩/关闭按钮/选择图片后收起
 * 4. 点击候选图更新主图
 */
export const Step3CandidateExpander: React.FC<Step3CandidateExpanderProps> = ({
  viewModel,
  children,
  onSelectCandidate,
  onPreviewImage,
  isGenerating = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRectRef = useRef<DOMRect | null>(null);

  // 候选图数量
  const candidateCount = viewModel?.candidates.length ?? 0;

  // 当前选中图片的索引（1-based）
  const selectedIndex = viewModel?.candidates.findIndex(
    (c) => c.imageUrl === viewModel.selectedImageUrl
  ) ?? -1;
  const currentIndex = selectedIndex >= 0 ? selectedIndex + 1 : 1;

  // 切换展开状态
  const toggleExpand = useCallback(() => {
    if (candidateCount <= 1 || isGenerating) return;

    // 记录触发元素的位置
    if (containerRef.current) {
      triggerRectRef.current = containerRef.current.getBoundingClientRect();
    }

    setIsExpanded((prev) => !prev);
  }, [candidateCount, isGenerating]);

  // 关闭展开
  const closeExpanded = useCallback(() => {
    setIsExpanded(false);
  }, []);

  // 选择候选图（切换主图，不关闭面板）
  const handleSelectCandidate = useCallback((imageUrl: string) => {
    onSelectCandidate(imageUrl);
  }, [onSelectCandidate]);

  // 不需要展开选择器
  if (!viewModel || candidateCount <= 1) {
    return <>{children}</>;
  }

  return (
    <>
      <div ref={containerRef} className="relative">
        {/* 主图区域 */}
        {children}

        {/* 徽章按钮 - 左上角，始终显示 */}
        <button
          type="button"
          data-testid="step3-candidate-expander-badge"
          onClick={toggleExpand}
          disabled={isGenerating || candidateCount <= 1}
          className={`absolute left-3 top-3 z-20 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold shadow-lg transition-all ${
            isGenerating
              ? "bg-gray-500/80 text-white cursor-not-allowed"
              : candidateCount <= 1
                ? "bg-black/40 text-white/60 cursor-default"
                : isExpanded
                  ? "bg-primary text-white"
                  : "bg-black/60 text-white hover:bg-black/75"
          }`}
          title={
            isGenerating
              ? "正在生成..."
              : candidateCount <= 1
                ? "暂无其他候选图"
                : isExpanded
                  ? "收起候选图"
                  : "展开候选图选择"
          }
        >
          <span>{isGenerating ? "生成中" : `${currentIndex}/${candidateCount}`}</span>
          {candidateCount > 1 && !isGenerating && (
            <span className="material-icons-round text-sm">
              {isExpanded ? "expand_less" : "expand_more"}
            </span>
          )}
        </button>
      </div>

      {/* 展开的候选图网格 - 使用 Portal 渲染到屏幕中央 */}
      {isExpanded && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={closeExpanded}
        >
          <div
            className="relative max-h-[90vh] w-[90vw] max-w-[600px] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl scrollbar-hide"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">
                选择主预览图 ({candidateCount} 张候选)
              </h3>
              <button
                type="button"
                onClick={closeExpanded}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"
              >
                <span className="material-icons-round text-lg">close</span>
              </button>
            </div>

            {/* 候选图网格 */}
            <div className="grid grid-cols-3 gap-3">
              {viewModel.candidates.map((candidate, index) => {
                const isSelected = candidate.imageUrl === viewModel.selectedImageUrl;
                return (
                  <div
                    key={`${candidate.imageUrl}-${index}`}
                    className={`relative cursor-pointer overflow-hidden group rounded-xl border-2 transition-all ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => handleSelectCandidate(candidate.imageUrl)}
                  >
                    <div className="flex min-h-[120px] items-center justify-center bg-slate-100">
                      <img
                        src={getOssThumbnailUrl(candidate.imageUrl, 300)}
                        alt={candidate.label}
                        className="w-full object-contain"
                      />
                    </div>
                    {/* 选中标记 */}
                    {isSelected && (
                      <div className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow-md">
                        <span className="material-icons-round text-sm">check</span>
                      </div>
                    )}
                    {/* 索引标记 */}
                    <div className="absolute right-2 bottom-2 rounded bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {index + 1}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 提示 */}
            <div className="mt-3 text-center text-xs text-gray-400">
              点击切换主图
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
