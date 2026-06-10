/**
 * Step3 预览图生成状态管理 Hook
 * 视频项目和反推项目共用
 */

import { useState, useCallback, useRef, useMemo } from "react";
import type { PreviewCandidatesByFrame, PreviewJobsByFrame, Step3PreviewJobRecord } from "./types";

export interface UseStep3PreviewGenerationOptions {
  /** 从 workflow 恢复的预览任务 */
  initialPreviewJobsByFrame?: PreviewJobsByFrame;
  /** 从 workflow 恢复的预览候选 */
  initialPreviewCandidatesByFrame?: PreviewCandidatesByFrame;
  /** 持久化预览任务回调 */
  onPersistPreviewJobsByFrame?: (jobs: PreviewJobsByFrame) => void;
  /** 持久化预览候选回调 */
  onPersistPreviewCandidatesByFrame?: (candidates: PreviewCandidatesByFrame) => void;
}

export interface UseStep3PreviewGenerationResult {
  /** 各帧预览任务 */
  previewJobsByFrame: PreviewJobsByFrame;
  /** 各帧预览候选图片 */
  previewCandidatesByFrame: PreviewCandidatesByFrame;
  /** 更新预览任务 */
  updatePreviewJobsByFrame: (updater: PreviewJobsByFrame | ((prev: PreviewJobsByFrame) => PreviewJobsByFrame)) => void;
  /** 更新预览候选 */
  updatePreviewCandidatesByFrame: (updater: PreviewCandidatesByFrame | ((prev: PreviewCandidatesByFrame) => PreviewCandidatesByFrame)) => void;
  /** 手动加载的帧集合 */
  manualLoadingFrames: Set<number>;
  /** 设置手动加载帧 */
  setManualLoadingFrames: React.Dispatch<React.SetStateAction<Set<number>>>;
  /** 当前激活的预览帧索引 */
  activePreviewFrameIndex: number;
  /** 设置激活帧索引 */
  setActivePreviewFrameIndex: React.Dispatch<React.SetStateAction<number>>;
  /** 图片预览状态 */
  imagePreview: { imageUrl: string; label: string } | null;
  /** 设置图片预览 */
  setImagePreview: React.Dispatch<React.SetStateAction<{ imageUrl: string; label: string } | null>>;
  /** 帧选中图片 URL 记录 */
  frameSelectedImageByUrl: Record<number, string>;
  /** 设置帧选中图片 */
  setFrameSelectedImageByUrl: React.Dispatch<React.SetStateAction<Record<number, string>>>;
}

/**
 * 管理预览图生成状态
 */
export function useStep3PreviewGeneration(
  options: UseStep3PreviewGenerationOptions = {}
): UseStep3PreviewGenerationResult {
  const {
    initialPreviewJobsByFrame = {},
    initialPreviewCandidatesByFrame = {},
    onPersistPreviewJobsByFrame,
    onPersistPreviewCandidatesByFrame,
  } = options;

  // 预览任务和候选（从 workflow 初始化）
  const previewJobsByFrame = useMemo(() => initialPreviewJobsByFrame, [initialPreviewJobsByFrame]);
  const previewCandidatesByFrame = useMemo(() => initialPreviewCandidatesByFrame, [initialPreviewCandidatesByFrame]);

  // 用 ref 存储最新值，供函数式更新使用
  const previewJobsByFrameRef = useRef(previewJobsByFrame);
  const previewCandidatesByFrameRef = useRef(previewCandidatesByFrame);
  previewJobsByFrameRef.current = previewJobsByFrame;
  previewCandidatesByFrameRef.current = previewCandidatesByFrame;

  // 手动触发的即时 loading 帧
  const [manualLoadingFrames, setManualLoadingFrames] = useState<Set<number>>(new Set());

  // 当前激活的预览帧索引
  const [activePreviewFrameIndex, setActivePreviewFrameIndex] = useState(0);

  // 图片预览状态
  const [imagePreview, setImagePreview] = useState<{ imageUrl: string; label: string } | null>(null);

  // 帧选中图片 URL 记录
  const [frameSelectedImageByUrl, setFrameSelectedImageByUrl] = useState<Record<number, string>>({});

  /**
   * 更新预览任务
   */
  const updatePreviewJobsByFrame = useCallback(
    (updater: PreviewJobsByFrame | ((prev: PreviewJobsByFrame) => PreviewJobsByFrame)) => {
      const nextValue = typeof updater === "function" ? updater(previewJobsByFrameRef.current) : updater;
      previewJobsByFrameRef.current = nextValue;
      onPersistPreviewJobsByFrame?.(nextValue);
    },
    [onPersistPreviewJobsByFrame]
  );

  /**
   * 更新预览候选
   */
  const updatePreviewCandidatesByFrame = useCallback(
    (updater: PreviewCandidatesByFrame | ((prev: PreviewCandidatesByFrame) => PreviewCandidatesByFrame)) => {
      const nextValue = typeof updater === "function" ? updater(previewCandidatesByFrameRef.current) : updater;
      previewCandidatesByFrameRef.current = nextValue;
      onPersistPreviewCandidatesByFrame?.(nextValue);
    },
    [onPersistPreviewCandidatesByFrame]
  );

  return {
    previewJobsByFrame,
    previewCandidatesByFrame,
    updatePreviewJobsByFrame,
    updatePreviewCandidatesByFrame,
    manualLoadingFrames,
    setManualLoadingFrames,
    activePreviewFrameIndex,
    setActivePreviewFrameIndex,
    imagePreview,
    setImagePreview,
    frameSelectedImageByUrl,
    setFrameSelectedImageByUrl,
  };
}