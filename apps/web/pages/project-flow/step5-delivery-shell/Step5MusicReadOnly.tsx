/**
 * Step 5 音乐只读展示组件
 * 仅展示 Step4 选择的背景音乐，支持试听，无其他操作功能
 */

import React from "react";
import type { VideoMusicDto } from "../../../services/backendApi.videoMusic";

// 音乐 payload 类型（简化版，不再依赖 step4MusicController）
interface Step4MusicPayload {
  musics: VideoMusicDto[];
  selectedMusicId: string | null;
}

interface Step5MusicReadOnlyProps {
  className?: string;
  selectedMusic: VideoMusicDto | null;
}

/**
 * 从 step4MusicPayload 构建音乐对象
 * Step4 存储结构: { musics: VideoMusicDto[], selectedMusicId: string | null }
 * 从 musics 数组中查找选中音乐的完整信息
 */
export function buildMusicFromStep4MusicPayload(payload: Step4MusicPayload | null): VideoMusicDto | null {
  // 没有选中音乐
  if (!payload?.selectedMusicId) {
    return null;
  }

  // 没有音乐列表
  if (!payload?.musics?.length) {
    return null;
  }

  // 从 musics 数组中查找选中的音乐
  const selectedMusic = payload.musics.find((m) => m.id === payload.selectedMusicId);
  if (!selectedMusic) {
    return null;
  }

  return selectedMusic;
}

/**
 * 只读音乐展示组件
 */
export const Step5MusicReadOnly: React.FC<Step5MusicReadOnlyProps> = ({
  className = "",
  selectedMusic,
}) => {
  // 未选择音乐时显示提示
  if (!selectedMusic) {
    return (
      <div className={className}>
        <label className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-4">
          <span className="material-icons-round text-primary text-base">music_note</span>背景音乐
          <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">可选</span>
        </label>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-500">可在 Step4 选择背景音乐</p>
        </div>
      </div>
    );
  }

  // 已选择音乐：展示标题、歌手、氛围、试听
  const metaText = [selectedMusic.artist, selectedMusic.album]
    .filter(Boolean)
    .join(" · ") || "内容喵AI · 系统音乐库";

  return (
    <div className={className}>
      <label className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-4">
        <span className="material-icons-round text-primary text-base">music_note</span>背景音乐
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">已选择</span>
      </label>
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-left">
          <p className="text-sm font-bold text-gray-900">{selectedMusic.title}</p>
          <p className="mt-1 text-xs text-gray-500">{metaText}</p>

          {/* 氛围标签 */}
          {(selectedMusic.atmospheres ?? []).length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {(selectedMusic.atmospheres ?? []).map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                >
                  #{item}
                </span>
              ))}
            </div>
          ) : null}

          {/* 试听播放器 */}
          {selectedMusic.musicUrl?.trim() ? (
            <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="mb-2 text-[11px] font-semibold text-gray-600">试听</div>
              <audio controls preload="none" className="h-10 w-full">
                <source src={selectedMusic.musicUrl} />
              </audio>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};