/**
 * Step4 视频变体选择器
 *
 * 功能：
 * 1. 在视频卡片左上角显示徽章（当前索引/总数，如 "V2/3"）
 * 2. 点击徽章弹出变体选择器（Portal 渲染）
 * 3. 左侧固定展示分镜参考图，右侧展示已选视频预览
 * 4. 点击缩略图切换选中状态（绿色 ✓），确认后切换主预览视频
 * 5. 确认切换时弹出确认框
 * 6. 支持删除不需要的视频变体
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getOssThumbnailUrl, getOssVideoSnapshotUrl } from "../../../utils/ossImage";
import { ImageLightbox } from "../../../components/shared/ImageLightbox";

export interface Step4VideoVariantViewModel {
  /** 场景索引 */
  sceneIndex: number;
  /** 当前选中的变体索引 */
  selectedIndex: number;
  /** 所有视频变体 URL */
  variants: Array<{
    url: string;
    isVideo: boolean;
  }>;
  /** 分镜参考图 URL（Step3 生成的场景画面） */
  storyboardImageUrl?: string;
}

export interface Step4VideoVariantSelectorProps {
  viewModel: Step4VideoVariantViewModel | null;
  /** 主视频组件 */
  children: React.ReactNode;
  /** 切换变体回调 */
  onSelectVariant: (variantIndex: number) => void;
  /** 删除变体回调 */
  onDeleteVariant?: (variantIndex: number) => void | Promise<void>;
  /** 是否正在生成 */
  isGenerating?: boolean;
  /** 隐藏内置 badge 按钮（由外部渲染） */
  hideBadge?: boolean;
  /** 回调 ref，挂载时传入 toggleExpand 函数，卸载时传 null */
  onToggleExpandRef?: (fn: (() => void) | null) => void;
}

/**
 * 视频变体选择器
 */
export const Step4VideoVariantSelector: React.FC<Step4VideoVariantSelectorProps> = ({
  viewModel,
  children,
  onSelectVariant,
  onDeleteVariant,
  isGenerating = false,
  hideBadge = false,
  onToggleExpandRef,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  /** 分镜参考图放大 */
  const [isRefImageZoomed, setIsRefImageZoomed] = useState(false);
  /** 界面选中索引：点击缩略图切换，仅界面状态 */
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState<number>(0);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const variantCount = viewModel?.variants.length ?? 0;
  const currentIndex = (viewModel?.selectedIndex ?? 0) + 1;
  const hasStoryboard = Boolean(viewModel?.storyboardImageUrl);

  const toggleExpand = useCallback(() => {
    if (variantCount <= 1 || isGenerating) return;
    setIsExpanded((prev) => !prev);
    // 打开弹窗时，默认选中当前版本
    setSelectedPreviewIndex(viewModel?.selectedIndex ?? 0);
  }, [variantCount, isGenerating, viewModel?.selectedIndex]);

  // 暴露 toggleExpand 给外部
  React.useEffect(() => {
    if (onToggleExpandRef) {
      onToggleExpandRef(toggleExpand);
      return () => onToggleExpandRef(null);
    }
  }, [toggleExpand, onToggleExpandRef]);

  const closeExpanded = useCallback(() => {
    setIsExpanded(false);
    setSelectedPreviewIndex(0);
  }, []);

  // 点击缩略图：切换界面选中状态
  const handleSelectPreview = useCallback((variantIndex: number) => {
    setSelectedPreviewIndex(variantIndex);
  }, []);

  // 点击确认切换：直接执行
  const handleRequestConfirm = useCallback(() => {
    if (selectedPreviewIndex === viewModel?.selectedIndex) return;
    onSelectVariant(selectedPreviewIndex);
    setIsExpanded(false);
  }, [selectedPreviewIndex, viewModel?.selectedIndex, onSelectVariant]);


  // 预览视频自动播放
  useEffect(() => {
    if (previewVideoRef.current) {
      previewVideoRef.current.play?.().catch(() => {
        // 自动播放可能被浏览器阻止，忽略错误
      });
    }
  }, [selectedPreviewIndex, isExpanded]);

  // 不需要展开选择器
  if (!viewModel || variantCount <= 1) {
    return <>{children}</>;
  }

  // 当前界面选中的变体
  const selectedVariant = viewModel.variants[selectedPreviewIndex];

  return (
    <>
      <div ref={containerRef} className="relative">
        {/* 主视频区域 */}
        {children}

        {/* 徽章按钮 - 视频左上角 */}
        {!hideBadge && (
        <button
          type="button"
          data-testid="step4-video-variant-badge"
          onClick={toggleExpand}
          disabled={isGenerating || variantCount <= 1}
          className={`absolute left-2 top-2 z-20 flex items-center gap-1 rounded-full h-8 px-2.5 text-[10px] font-bold shadow-lg transition-all ${
            isGenerating
              ? "bg-gray-500/80 text-white cursor-not-allowed"
              : variantCount <= 1
                ? "bg-black/40 text-white/60 cursor-default"
                : isExpanded
                  ? "bg-primary text-white"
                  : "bg-black/70 text-white hover:bg-black/85 backdrop-blur-sm"
          }`}
          title={
            isGenerating
              ? "正在生成..."
              : variantCount <= 1
                ? "暂无其他版本"
                : isExpanded
                  ? "收起版本"
                  : "切换视频版本"
          }
        >
          <span>{isGenerating ? "生成中" : `V${currentIndex}/${variantCount}`}</span>
          {variantCount > 1 && !isGenerating && (
            <span className="material-icons-round text-sm">
              {isExpanded ? "expand_less" : "expand_more"}
            </span>
          )}
        </button>
        )}
      </div>

      {/* 展开的变体选择器 - 使用 Portal 渲染到屏幕中央 */}
      {isExpanded && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closeExpanded}
        >
          <div
            className="relative flex w-[92vw] max-w-[440px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-5 py-3.5">
              <h3 className="text-[15px] font-semibold text-gray-900">选择版本</h3>
              <button
                type="button"
                onClick={closeExpanded}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <span className="material-icons-round text-xl">close</span>
              </button>
            </div>

            {/* 视频预览区 */}
            <div className="relative flex items-center justify-center bg-gray-950 px-4 py-4">
              {/* 左箭头 */}
              {variantCount > 1 && selectedPreviewIndex > 0 && (
                <button
                  type="button"
                  onClick={() => handleSelectPreview(selectedPreviewIndex - 1)}
                  className="absolute left-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 transition hover:bg-black/70 hover:text-white"
                >
                  <span className="material-icons-round text-lg">chevron_left</span>
                </button>
              )}
              <div className="w-full max-w-[260px] overflow-hidden rounded-xl shadow-lg">
                {selectedVariant?.isVideo ? (
                  <video
                    ref={previewVideoRef}
                    src={selectedVariant.url}
                    className="aspect-[9/16] w-full object-cover"
                    muted
                    playsInline
                    loop
                    autoPlay
                    controls
                  />
                ) : (
                  <img
                    src={selectedVariant?.url}
                    alt={`版本 ${(selectedPreviewIndex ?? 0) + 1}`}
                    className="aspect-[9/16] w-full object-cover"
                  />
                )}
              </div>
              {/* 右箭头 */}
              {variantCount > 1 && selectedPreviewIndex < variantCount - 1 && (
                <button
                  type="button"
                  onClick={() => handleSelectPreview(selectedPreviewIndex + 1)}
                  className="absolute right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 transition hover:bg-black/70 hover:text-white"
                >
                  <span className="material-icons-round text-lg">chevron_right</span>
                </button>
              )}
              {/* 版本号浮层 */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                V{(selectedPreviewIndex ?? 0) + 1} / {variantCount}
              </div>
            </div>

            {/* 缩略图选择条 */}
            <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-thin">
              {/* 分镜参考图（如果有） */}
              {hasStoryboard && (
                <button
                  type="button"
                  className="shrink-0 cursor-zoom-in"
                  onClick={() => setIsRefImageZoomed(true)}
                >
                  <div className="mb-1 text-center text-[9px] font-medium text-gray-400">参考</div>
                  <div className="h-16 w-11 overflow-hidden rounded-md border border-gray-200 bg-gray-100">
                    <img
                      src={getOssThumbnailUrl(viewModel.storyboardImageUrl!, 80)}
                      alt="分镜参考"
                      className="h-full w-full object-cover"
                    />
                  </div>
                </button>
              )}
              {viewModel.variants.map((variant, index) => {
                const isOriginalSelected = index === viewModel.selectedIndex;
                const isCurrentPicked = index === selectedPreviewIndex;
                return (
                  <button
                    key={`${variant.url}-${index}`}
                    type="button"
                    onClick={() => handleSelectPreview(index)}
                    className={`shrink-0 cursor-pointer overflow-hidden rounded-md border-2 transition-all ${
                      isCurrentPicked
                        ? "border-primary ring-2 ring-primary/30"
                        : isOriginalSelected
                          ? "border-primary/40"
                          : "border-transparent hover:border-gray-300"
                    }`}
                  >
                    <div className="mb-1 text-center text-[9px] font-medium text-gray-400">
                      {isOriginalSelected ? "当前" : `V${index + 1}`}
                    </div>
                    <div className="h-16 w-11 overflow-hidden bg-gray-100">
                      {variant.isVideo ? (
                        <img
                          src={getOssVideoSnapshotUrl(variant.url, 0, 80)}
                          alt={`版本 ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <img
                          src={getOssThumbnailUrl(variant.url, 80)}
                          alt={`版本 ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-3 border-t border-gray-100 px-5 py-3.5">
              <button
                type="button"
                onClick={closeExpanded}
                className="flex-1 rounded-xl py-2.5 text-center text-[13px] font-medium text-gray-500 transition hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleRequestConfirm}
                disabled={selectedPreviewIndex === viewModel.selectedIndex}
                className={`flex-1 rounded-xl py-2.5 text-center text-[13px] font-semibold transition ${
                  selectedPreviewIndex === viewModel.selectedIndex
                    ? "bg-gray-100 text-gray-400"
                    : "bg-primary text-white hover:bg-primary/90"
                }`}
              >
                确认切换
              </button>
            </div>
          </div>

          {/* 分镜参考图放大 */}
          <ImageLightbox
            open={isRefImageZoomed}
            url={viewModel.storyboardImageUrl ?? ""}
            alt="分镜参考"
            label="分镜参考"
            onClose={() => setIsRefImageZoomed(false)}
          />

        </div>,
        document.body
      )}
    </>
  );
};
