/**
 * Step5 成片历史缩略图条
 *
 * 功能：
 * 1. 在主视频下方横向展示成片历史缩略图
 * 2. 点击切换主视频预览
 * 3. 主视频和历史成片用徽标区分
 *
 * 参考：step3CandidateStripRuntime.tsx
 */
import React from "react";
import { getOssVideoSnapshotUrl } from "../../../utils/ossImage";

/** 成片项 */
export interface Step5FinalVideoItem {
  id: string;
  videoType: "step4" | "fission";
  videoUrl: string;
  durationSec: number | null;
  createdAt: number | string;
}

export interface Step5FinalVideoStripProps {
  /** 成片列表 */
  videos: Step5FinalVideoItem[];
  /** 当前预览的视频 URL */
  currentVideoUrl: string | null;
  /** 选择成片回调 */
  onSelectVideo: (videoUrl: string) => void;
}

/** 格式化时长 */
function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
}

/** 成片类型标签 */
const VIDEO_TYPE_LABELS: Record<string, string> = {
  step4: "成片",
  fission: "裂变",
};

/**
 * Step5 成片历史缩略图条
 */
export const Step5FinalVideoStrip: React.FC<Step5FinalVideoStripProps> = ({
  videos,
  currentVideoUrl,
  onSelectVideo,
}) => {
  // 没有成片历史，不显示
  if (videos.length <= 1) return null;

  return (
    <div className="mt-3">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
          <span className="material-icons-round text-sm text-gray-400">history</span>
          历史成片
          <span className="text-[10px] font-normal text-gray-400">({videos.length - 1} 个)</span>
        </span>
        <span className="text-[10px] text-gray-400">点击切换预览</span>
      </div>

      {/* 缩略图条 */}
      <div className="overflow-x-auto scrollbar-hide">
        <div className="inline-flex min-w-full gap-2">
          {videos.map((video, index) => {
            const isSelected = video.videoUrl === currentVideoUrl;
            const isCurrent = index === 0; // 第一个视为当前成片

            return (
              <button
                key={video.id}
                type="button"
                onClick={() => onSelectVideo(video.videoUrl)}
                className={`relative h-14 w-[76px] shrink-0 overflow-hidden rounded-lg transition-all ${
                  isSelected
                    ? "ring-2 ring-primary ring-offset-2"
                    : "border border-gray-200 hover:border-gray-300"
                }`}
                title={isCurrent ? "当前成片" : "点击预览此成片"}
              >
                {/* 视频缩略图 */}
                <img
                  src={getOssVideoSnapshotUrl(video.videoUrl, 0, 150)}
                  alt={`成片 ${index + 1}`}
                  className="h-full w-full object-cover"
                />

                {/* 播放图标 */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                  <span className="material-icons-round text-white text-lg drop-shadow-md opacity-80">
                    play_circle_outline
                  </span>
                </div>

                {/* 徽标：区分当前/历史 */}
                <div className="absolute left-1 top-1">
                  {isCurrent ? (
                    <span className="inline-flex items-center rounded bg-primary/90 px-1 py-0.5 text-[8px] font-bold text-white shadow-sm">
                      当前
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded bg-black/60 px-1 py-0.5 text-[8px] font-semibold text-white">
                      {VIDEO_TYPE_LABELS[video.videoType] || "成片"}
                    </span>
                  )}
                </div>

                {/* 时长 */}
                {video.durationSec && (
                  <div className="absolute right-1 bottom-1 rounded bg-black/60 px-1 py-0.5 text-[8px] font-medium text-white">
                    {formatDuration(video.durationSec)}
                  </div>
                )}

                {/* 选中指示器 */}
                {isSelected && (
                  <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white shadow-md">
                    <span className="material-icons-round text-[10px]">check</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
