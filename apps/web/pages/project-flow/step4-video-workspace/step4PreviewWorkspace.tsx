import React from "react";
import {
  buildStep4VideoClipCardRuntimeUi,
  type Step4VideoClipCardRuntimeUiModel,
} from "./step4VideoClipCardRuntimeUi";
import { isStep4VideoAsset, type Step4VideoClipStatus } from "./step4VideoJobOrchestrator";

export const STEP4_PREVIEW_WORKSPACE_TITLE = "Step 4. 视频工作台";

export interface Step4PreviewWorkspaceHeaderProps {
  title?: string;
  subtitle: string;
  segmentCount: number;
  statusLabel: string;
  controls?: React.ReactNode;
  badges?: React.ReactNode;
}

export interface Step4PreviewCardModel {
  runtimeUi: Step4VideoClipCardRuntimeUiModel;
  previewAssetKind: "video" | "image" | "placeholder";
  sourceModeLabel: "图生视频" | "文生视频兜底";
  sourceBadgeClassName: string;
  sourceDetail: string;
  placeholderTitle: string;
  placeholderBody: string;
  usesTextToVideoFallback: boolean;
  /** 失败时的错误信息 */
  errorMessage?: string;
}

export function buildStep4PreviewCardModel(input: {
  status: Step4VideoClipStatus;
  previewUrl?: string | null;
  sourceImageUrl?: string | null;
}): Step4PreviewCardModel {
  const previewUrl = typeof input.previewUrl === "string" ? input.previewUrl.trim() : "";
  const sourceImageUrl = typeof input.sourceImageUrl === "string" ? input.sourceImageUrl.trim() : "";
  const usesTextToVideoFallback = sourceImageUrl.length < 1;

  const previewAssetKind =
    previewUrl.length < 1 ? "placeholder" : isStep4VideoAsset(previewUrl) ? "video" : "image";

  return {
    runtimeUi: buildStep4VideoClipCardRuntimeUi(input.status),
    previewAssetKind,
    sourceModeLabel: usesTextToVideoFallback ? "文生视频兜底" : "图生视频",
    sourceBadgeClassName: usesTextToVideoFallback
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-cyan-200 bg-cyan-50 text-cyan-700",
    sourceDetail: usesTextToVideoFallback
      ? "当前镜头暂缺 Step3 分镜图，生成时会直接使用提示词走文生视频。"
      : "已承接 Step3 当前分镜图作为视频参考输入。",
    placeholderTitle: usesTextToVideoFallback ? "暂无分镜图，先走文生视频" : "等待视频首轮生成",
    placeholderBody: usesTextToVideoFallback
      ? "保持统一占位态，等任务完成后自动回填真实视频预览。"
      : "分镜图参考已就绪，后端任务完成后会自动覆盖当前占位卡。",
    usesTextToVideoFallback,
    errorMessage: input.status.errorMessage,
  };
}

export const Step4PreviewWorkspaceHeader: React.FC<Step4PreviewWorkspaceHeaderProps> = ({
  title = STEP4_PREVIEW_WORKSPACE_TITLE,
  subtitle,
  segmentCount,
  statusLabel,
  controls,
  badges,
}) => {
  return (
    <div className="px-4 py-4 md:px-8 md:py-6 bg-white border-b border-gray-200 flex flex-row justify-between items-center shrink-0 gap-2">
      <div className="flex items-center gap-3">
        <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-orange-500 text-white shadow-sm shadow-primary/20 shrink-0">
          <span className="material-icons-round text-base">videocam</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 font-display">{title}</h2>
            {badges}
          </div>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {controls}
        <div className="flex gap-2 text-[10px] md:text-sm text-gray-600 bg-gray-50 px-2 py-1.5 md:px-3 md:py-2 rounded-lg border border-gray-100 shrink-0">
          <span className="flex items-center gap-1">
            <span className="material-icons-round text-sm md:text-base">video_library</span>
            {segmentCount}
          </span>
          <span className="w-px h-3 md:h-4 bg-gray-300 self-center" />
          <span className="flex items-center gap-1">
            <span className="material-icons-round text-sm md:text-base">movie</span>
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
};
