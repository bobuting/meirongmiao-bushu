import React from "react";
import { getOssThumbnailUrl } from "../../utils/ossImage";

/** 脚本信息 */
export interface ScriptInfo {
  /** 脚本标题 */
  title: string;
  /** 副标题 */
  subtitle?: string;
  /** 时长（秒） */
  durationSec?: number;
  /** 适用度 */
  suitability?: "high" | "medium" | "low" | null;
  /** 镜头数量 */
  shotCount?: number;
  /** 标签 */
  tags?: string[];
  /** 预览摘要 */
  preview?: string;
}

/** 分镜图片项（原始数据，imageUrl 可为空） */
export interface StoryboardFrame {
  /** 帧索引 */
  index: number;
  /** 标题 */
  title: string;
  /** 图片URL */
  imageUrl: string | null;
}

/** 预览用的分镜图片项（imageUrl 必须存在） */
export interface StoryboardFrameForPreview {
  /** 帧索引 */
  index: number;
  /** 标题 */
  title: string;
  /** 图片URL（非空） */
  imageUrl: string;
}

export interface HistoryStep3PanelProps {
  /** 脚本信息 */
  scriptInfo?: ScriptInfo | null;
  /** 分镜图片列表 */
  frames: StoryboardFrame[];
  /** 图片预览回调（传递有效的 frames 和当前索引，imageUrl 必须存在） */
  onImagePreview?: (frames: StoryboardFrameForPreview[], currentIndex: number) => void;
}

const suitabilityLabels: Record<string, { label: string; className: string }> = {
  high: { label: "高", className: "bg-emerald-100 text-emerald-700" },
  medium: { label: "中", className: "bg-yellow-100 text-yellow-700" },
  low: { label: "低", className: "bg-red-100 text-red-700" },
};

/**
 * Step 3 历史面板 - 分镜脚本（仅 Step4 使用）
 */
export const HistoryStep3Panel: React.FC<HistoryStep3PanelProps> = ({
  scriptInfo,
  frames,
  onImagePreview,
}) => {
  // 格式化时长
  const formatDuration = (sec?: number) => {
    if (!sec) return null;
    const min = Math.floor(sec / 60);
    const remainSec = sec % 60;
    if (min > 0 && remainSec > 0) {
      return `${min}分${remainSec}秒`;
    }
    if (min > 0) {
      return `${min}分钟`;
    }
    return `${sec}秒`;
  };

  return (
    <div className="px-6 py-4">
      {/* 分镜图列表 */}
      {frames.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 mb-3">
          <div className="mb-2 text-xs font-semibold text-gray-600">分镜图</div>
          <div className="grid grid-cols-3 gap-2">
            {frames.map((frame) => (
              <div
                key={`history-step3-frame-${frame.index}`}
                className="relative aspect-video overflow-hidden rounded-lg border border-gray-200 bg-gray-50 cursor-pointer group"
                onClick={() => {
                  if (frame.imageUrl) {
                    onImagePreview?.(
                      frames.filter((f) => f.imageUrl).map((f) => ({ ...f, imageUrl: f.imageUrl! })),
                      frames.findIndex((f) => f.index === frame.index),
                    );
                  }
                }}
              >
                {frame.imageUrl ? (
                  <img src={getOssThumbnailUrl(frame.imageUrl, 300)} alt={frame.title} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <span className="material-icons-round text-gray-300 text-2xl">image_not_supported</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <span className="material-icons-round text-white opacity-0 group-hover:opacity-100 transition-opacity text-lg drop-shadow-lg">zoom_in</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1">
                  <span className="text-[9px] text-white font-medium">镜{frame.index + 1}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 脚本信息 */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="px-3 py-2.5">
          <span className="text-xs font-semibold text-gray-600">
            脚本详情
            {scriptInfo && (
              <span className="font-normal text-gray-400 ml-1">{scriptInfo.title}</span>
            )}
          </span>
        </div>
        {scriptInfo ? (
          <div className="px-3 pb-3">
            {/* 标题行 */}
            <div className="font-semibold text-gray-900 text-sm truncate">{scriptInfo.title}</div>
            {scriptInfo.subtitle && (
              <div className="text-[11px] text-gray-500 truncate mt-0.5">{scriptInfo.subtitle}</div>
            )}

            {/* 元信息行 */}
            <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-500 flex-wrap">
              {scriptInfo.durationSec && (
                <span className="inline-flex items-center gap-0.5">
                  <span className="material-icons-round text-[12px]">schedule</span>
                  {formatDuration(scriptInfo.durationSec)}
                </span>
              )}
              {scriptInfo.suitability && suitabilityLabels[scriptInfo.suitability] && (
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-semibold ${suitabilityLabels[scriptInfo.suitability].className}`}>
                  适用度: {suitabilityLabels[scriptInfo.suitability].label}
                </span>
              )}
              {scriptInfo.shotCount && (
                <span className="inline-flex items-center gap-0.5">
                  <span className="material-icons-round text-[12px]">movie</span>
                  {scriptInfo.shotCount} 镜头
                </span>
              )}
            </div>

            {/* 标签 */}
            {scriptInfo.tags && scriptInfo.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {scriptInfo.tags.slice(0, 4).map((tag, idx) => (
                  <span
                    key={`history-step3-tag-${idx}`}
                    className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600"
                  >
                    {tag}
                  </span>
                ))}
                {scriptInfo.tags.length > 4 && (
                  <span className="text-[10px] text-gray-400">+{scriptInfo.tags.length - 4}</span>
                )}
              </div>
            )}

            {/* 摘要 */}
            {scriptInfo.preview && (
              <div className="mt-2 text-[11px] text-gray-600 leading-5 whitespace-pre-line">
                {scriptInfo.preview}
              </div>
            )}
          </div>
        ) : (
          <div className="px-3 pb-3 text-xs text-gray-400">暂无脚本信息</div>
        )}
      </div>
    </div>
  );
};
