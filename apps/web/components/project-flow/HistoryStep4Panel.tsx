import React from "react";
import { getOssThumbnailUrl, getOssVideoSnapshotUrl } from "../../utils/ossImage";

/** 背景音乐简化类型（用于历史面板快照） */
export interface HistoryMusicDto {
  id: string;
  title: string;
  artist?: string | null;
  album?: string | null;
  musicUrl?: string;
  atmospheres?: string[];
}

/** 视频片段项 */
export interface VideoClipItem {
  /** 片段索引 */
  index: number;
  /** 标题 */
  title: string;
  /** 视频封面/缩略图URL */
  thumbnailUrl: string | null;
}

export interface HistoryStep4PanelProps {
  /** 视频片段列表 */
  clips: VideoClipItem[];
  /** 背景音乐（可选） */
  music?: HistoryMusicDto | null;
  /** 图片预览回调（仅用于图片类型） */
  onImagePreview?: (clips: VideoClipItem[], currentIndex: number) => void;
  /** 视频预览回调（点击视频时打开弹窗播放） */
  onVideoPreview?: (clips: VideoClipItem[], currentIndex: number) => void;
}

/**
 * Step 4 历史面板 - 视频工作台（Step5/Step6 使用）
 */
export const HistoryStep4Panel: React.FC<HistoryStep4PanelProps> = ({
  clips,
  music,
  onImagePreview,
  onVideoPreview,
}) => {
  const validClips = clips.filter((c) => c.thumbnailUrl);

  // 音乐元信息
  const musicMetaText = music
    ? [music.artist, music.album].filter(Boolean).join(" · ") || "内容喵AI · 系统音乐库"
    : null;

  return (
    <>
      {/* 视频片段 */}
      <div className="px-6 py-4 border-t border-gray-100">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-gray-600">
            视频片段
            {validClips.length > 0 && (
              <span className="font-normal text-gray-400 ml-1">(共 {validClips.length} 个)</span>
            )}
          </div>
          {validClips.length > 0 ? (
            <div className="grid grid-cols-4 gap-1.5">
              {validClips.map((clip, idx) => {
                // 判断是视频还是图片
                const isVideo = clip.thumbnailUrl?.match(/\.(mp4|mov|webm|m4v)(\?|$)/i);

                return (
                  <div
                    key={`history-step4-clip-${clip.index}`}
                    className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-900 cursor-pointer group"
                    onClick={() => {
                      if (!clip.thumbnailUrl) return;
                      if (isVideo) {
                        onVideoPreview?.(validClips, idx);
                      } else {
                        onImagePreview?.(validClips, idx);
                      }
                    }}
                    title={clip.title}
                  >
                    {isVideo ? (
                      // 视频缩略图：使用 OSS 视频截图（首帧）
                      <img
                        src={getOssVideoSnapshotUrl(clip.thumbnailUrl!, 0, 300)}
                        alt={clip.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      // 图片缩略图
                      <img
                        src={getOssThumbnailUrl(clip.thumbnailUrl!, 300)}
                        alt={clip.title}
                        className="h-full w-full object-cover"
                      />
                    )}
                    {/* 悬浮图标 */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <span className="material-icons-round text-white opacity-0 group-hover:opacity-100 transition-opacity text-lg drop-shadow-lg">
                        {isVideo ? "play_circle" : "zoom_in"}
                      </span>
                    </div>
                    {/* 序号标签 */}
                    <div className="absolute top-1 left-1 inline-flex items-center rounded-full bg-black/60 px-1 py-0.5">
                      <span className="text-[9px] text-white font-bold">#{clip.index + 1}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-400 text-center">
              暂无视频片段
            </div>
          )}
        </div>
      </div>

      {/* 背景音乐 */}
      <div className="px-6 py-4 border-t border-gray-100">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-gray-600">
            背景音乐
            {music && (
              <span className="font-normal text-emerald-600 ml-1">已选择</span>
            )}
          </div>
          {music ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-left">
              <p className="text-sm font-bold text-gray-900">{music.title}</p>
              {musicMetaText && (
                <p className="mt-1 text-xs text-gray-500">{musicMetaText}</p>
              )}
              {/* 氛围标签 */}
              {(music.atmospheres ?? []).length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(music.atmospheres ?? []).slice(0, 3).map((item) => (
                    <span
                      key={item}
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                    >
                      #{item}
                    </span>
                  ))}
                </div>
              ) : null}
              {/* 试听播放器 */}
              {music.musicUrl?.trim() ? (
                <div className="mt-2">
                  <audio controls preload="none" className="h-8 w-full">
                    <source src={music.musicUrl} />
                  </audio>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded border border-dashed border-gray-300 px-3 py-3 text-xs text-gray-400 text-center">
              未选择背景音乐
            </div>
          )}
        </div>
      </div>
    </>
  );
};
