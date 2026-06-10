import React, { useState } from "react";
import { getOssVideoSnapshotUrl } from "../../utils/ossImage";

/** 成片项 */
export interface FinalVideoItem {
  /** 记录ID */
  id: string;
  /** 视频类型 */
  videoType: "step4" | "fission";
  /** 视频URL */
  videoUrl: string;
  /** 时长（秒） */
  durationSec: number | null;
  /** 创建时间戳 */
  createdAt: number;
}

/** 预览用的成片项 */
export interface FinalVideoItemForPreview {
  index: number;
  title: string;
  videoUrl: string;
}

export interface HistoryFinalVideosPanelProps {
  /** 成片列表 */
  videos: FinalVideoItem[];
  /** 当前项目导出视频URL（用于判断是否需要展示历史） */
  currentExportUrl: string | null;
  /** 视频预览回调 */
  onVideoPreview?: (videos: FinalVideoItemForPreview[], currentIndex: number) => void;
}

const VIDEO_TYPE_LABELS: Record<string, string> = {
  step4: "Step4",
  fission: "裂变",
};

/**
 * 成片历史面板 - 展示 Step4 和裂变成片列表
 */
export const HistoryFinalVideosPanel: React.FC<HistoryFinalVideosPanelProps> = ({
  videos,
  currentExportUrl,
  onVideoPreview,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // 过滤掉与当前 exportUrl 相同的唯一成片
  const displayVideos = videos.filter((v) => v.videoUrl !== currentExportUrl || videos.length > 1);

  // 不显示条件：只有1个成片且与当前 exportUrl 相同
  if (displayVideos.length === 0 || (displayVideos.length === 1 && displayVideos[0].videoUrl === currentExportUrl)) {
    return null;
  }

  // 默认显示前6个，展开显示全部
  const visibleVideos = isExpanded ? displayVideos : displayVideos.slice(0, 6);
  const hasMore = displayVideos.length > 6;

  // 格式化时间
  const formatTime = (timestamp: number | string) => {
    const date = new Date(typeof timestamp === "string" ? Number(timestamp) : timestamp);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours().toString().padStart(2, "0");
    const minute = date.getMinutes().toString().padStart(2, "0");
    return `${month}/${day} ${hour}:${minute}`;
  };

  // 转换为预览格式
  const handleVideoClick = (index: number) => {
    const previewVideos: FinalVideoItemForPreview[] = displayVideos.map((v, i) => ({
      index: i,
      title: `${VIDEO_TYPE_LABELS[v.videoType] || "成片"} ${i + 1}`,
      videoUrl: v.videoUrl,
    }));
    onVideoPreview?.(previewVideos, index);
  };

  return (
    <div className="px-6 py-4 border-t border-gray-100">
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold text-gray-600">
          历史成片
          <span className="font-normal text-gray-400 ml-1">(共 {displayVideos.length} 个)</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {visibleVideos.map((video, idx) => (
            <div
              key={`final-video-${video.id}`}
              className="relative aspect-video overflow-hidden rounded-lg border border-gray-200 bg-gray-900 cursor-pointer group"
              onClick={() => handleVideoClick(idx)}
            >
              {/* 视频缩略图：使用 OSS 视频截图 */}
              <img
                src={getOssVideoSnapshotUrl(video.videoUrl, 0, 300)}
                alt={`成片 ${idx + 1}`}
                className="h-full w-full object-cover"
              />

              {/* 播放图标 */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <span className="material-icons-round text-white opacity-0 group-hover:opacity-100 transition-opacity text-lg drop-shadow-lg">
                  play_circle
                </span>
              </div>

              {/* 类型标签 */}
              <div className="absolute top-1 left-1">
                <span className="inline-flex items-center rounded bg-black/50 px-1 py-0.5 text-[9px] text-white font-medium">
                  {VIDEO_TYPE_LABELS[video.videoType] || "成片"}
                </span>
              </div>

              {/* 创建时间 */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1">
                <span className="text-[9px] text-white font-medium">{formatTime(video.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 展开/收起按钮 */}
        {hasMore && (
          <button
            className="w-full mt-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors flex items-center justify-center gap-1"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <span className="material-icons-round text-sm">
              {isExpanded ? "expand_less" : "expand_more"}
            </span>
            {isExpanded ? "收起" : `查看更多 (${displayVideos.length - 6} 个)`}
          </button>
        )}
      </div>
    </div>
  );
};
