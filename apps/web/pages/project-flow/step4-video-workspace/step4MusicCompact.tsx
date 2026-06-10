/**
 * Step4 左下角紧凑音乐选择器
 * 突出设计：作为侧栏唯一可操作模块，视觉层级最高
 */

import React, { useRef, useCallback, memo, useState } from "react";
import { createPortal } from "react-dom";
import type { VideoMusicDto, VideoMusicMatchResultDto } from "../../../services/backendApi.videoMusic";
import { Step4MusicLibraryModal } from "./step4MusicLibraryModal";
import { Step4BeatSyncControls, BeatEnergyCurve } from "./step4BeatSyncControls";
import type { BeatDetectResult } from "../../../libs/beat-detect";
import type { BeatSyncIntensity } from "../../../libs/beat-detect";

export interface Step4MusicCompactProps {
  enabled: boolean | null;
  isLoading: boolean;
  recommendation: VideoMusicMatchResultDto | null;
  selectedMusicId: string | null;
  hasMergedOutput: boolean;
  token: string | null;
  /** 选择推荐音乐（从当前推荐列表中选择） */
  onSelectMusic: (musicId: string) => void;
  /** 从音乐库选择新音乐（需要保存到数据库） */
  onSelectFromLibrary: (music: VideoMusicDto) => void;
  /** 清空选择（本次不选） */
  onClearSelection: () => void;
  /** 卡点模式：是否启用 */
  beatSyncEnabled?: boolean;
  /** 卡点模式：强度 */
  beatSyncIntensity?: BeatSyncIntensity;
  /** 卡点模式：开关回调 */
  onBeatSyncToggle?: (enabled: boolean) => void;
  /** 卡点模式：强度变化 */
  onBeatSyncIntensityChange?: (intensity: BeatSyncIntensity) => void;
  /** 卡点模式：节拍检测结果（用于可视化） */
  beatDetectResult?: BeatDetectResult | null;
  /** 卡点模式：节拍检测完成回调（从 Step4BeatSyncControls 透传） */
  onBeatDetected?: (result: BeatDetectResult | null) => void;
}

function resolveSelectedMusic(
  selectedMusicId: string | null,
  recommendation: VideoMusicMatchResultDto | null,
): VideoMusicDto | null {
  if (!selectedMusicId || !recommendation) return null;
  if (recommendation.music?.id === selectedMusicId) return recommendation.music;
  const candidate = recommendation.candidates?.find((item) => item.id === selectedMusicId);
  if (candidate) return candidate;
  return recommendation.music ?? null;
}

const MusicSwitchConfirmDialog: React.FC<{
  currentMusic: VideoMusicDto | null;
  targetMusic: VideoMusicDto;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ currentMusic, targetMusic, onConfirm, onCancel }) => {
  const dialog = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="text-base font-bold text-gray-900 mb-3">确认切换背景音乐？</h3>
        <div className="space-y-2.5 text-sm text-gray-600 mb-5">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">当前：</span>
            <span className="font-medium text-gray-800 truncate">{currentMusic?.title ?? "无"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">切换为：</span>
            <span className="font-medium text-primary truncate">{targetMusic.title}</span>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-gradient-to-r from-primary to-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:shadow-lg transition"
          >
            确认切换
          </button>
        </div>
      </div>
    </div>
  );
  return createPortal(dialog, document.body);
};

export const Step4MusicCompact: React.FC<Step4MusicCompactProps> = memo(({
  enabled,
  isLoading,
  recommendation,
  selectedMusicId,
  hasMergedOutput,
  token,
  onSelectMusic,
  onSelectFromLibrary,
  onClearSelection,
  beatSyncEnabled = false,
  beatSyncIntensity = "standard",
  onBeatSyncToggle,
  onBeatSyncIntensityChange,
  beatDetectResult,
  onBeatDetected,
}) => {
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [pendingSwitchMusic, setPendingSwitchMusic] = useState<VideoMusicDto | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const handleAudioPlay = useCallback((event: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = event.currentTarget;
    if (activeAudioRef.current && activeAudioRef.current !== audio) {
      activeAudioRef.current.pause();
    }
    activeAudioRef.current = audio;
  }, []);

  const handleRadioSelect = useCallback((music: VideoMusicDto) => {
    if (music.id === selectedMusicId) return;
    setPendingSwitchMusic(music);
  }, [selectedMusicId]);

  const handleConfirmSwitch = useCallback(() => {
    if (pendingSwitchMusic) {
      onSelectMusic(pendingSwitchMusic.id);
      setPendingSwitchMusic(null);
      setIsExpanded(false);
    }
  }, [pendingSwitchMusic, onSelectMusic]);

  const handleCancelSwitch = useCallback(() => {
    setPendingSwitchMusic(null);
  }, []);

  if (enabled === false) return null;

  if (isLoading) {
    return (
      <div className="p-5">
        <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/80 to-amber-50/40 p-4">
          <div className="flex items-center gap-2.5 text-sm text-gray-600">
            <span className="material-icons-round text-primary animate-spin text-lg">sync</span>
            <span className="font-medium">正在匹配音乐...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!recommendation?.music) {
    return (
      <div className="p-5">
        <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/80 to-amber-50/40 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-amber-400 shadow-sm">
                <span className="material-icons-round text-white text-sm">music_note</span>
              </span>
              <span className="text-sm font-bold text-gray-800">背景音乐</span>
            </div>
            <button onClick={onClearSelection} className="text-xs text-gray-400 hover:text-gray-600 transition">
              跳过
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">暂无背景音乐推荐</p>
        </div>
      </div>
    );
  }

  const allCandidates: VideoMusicDto[] = [
    recommendation.music,
    ...(recommendation.candidates ?? []).slice(0, 2),
  ];
  const selectedMusic = resolveSelectedMusic(selectedMusicId, recommendation);

  return (
    <>
      {typeof token === "string" && (
        <Step4MusicLibraryModal
          isOpen={isLibraryOpen}
          onClose={() => setIsLibraryOpen(false)}
          onConfirm={(music) => {
            onSelectFromLibrary(music);
            setIsLibraryOpen(false);
          }}
          currentSelectedMusicId={selectedMusicId}
          token={token}
        />
      )}

      {pendingSwitchMusic ? (
        <MusicSwitchConfirmDialog
          currentMusic={selectedMusic}
          targetMusic={pendingSwitchMusic}
          onConfirm={handleConfirmSwitch}
          onCancel={handleCancelSwitch}
        />
      ) : null}

      <div className="p-5">
        <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/80 to-amber-50/40 overflow-hidden shadow-sm">
          {/* 头部：图标 + 标题 + 音乐库 + 下拉箭头 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-orange-100/60">
            <div
              className="flex items-center gap-2.5 cursor-pointer select-none flex-1 min-w-0"
              onClick={() => setIsExpanded((v) => !v)}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-amber-400 shadow-md">
                <span className="material-icons-round text-white text-base">music_note</span>
              </span>
              <div className="min-w-0">
                <span className="text-sm font-bold text-gray-900">背景音乐</span>
                {selectedMusic && !isExpanded && (
                  <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[160px]">{selectedMusic.title}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsLibraryOpen(true)}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-gray-500 hover:bg-white/60 hover:text-primary transition"
                title="浏览音乐库"
              >
                <span className="material-icons-round text-sm">library_music</span>
                <span>音乐库</span>
              </button>
              <button
                onClick={() => setIsExpanded((v) => !v)}
                className="flex items-center gap-1 rounded-xl bg-white/60 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 hover:bg-white hover:text-primary transition-all"
                title={isExpanded ? "收起" : "切换音乐"}
              >
                <span>{isExpanded ? "收起" : "切换"}</span>
                <span
                  className="material-icons-round text-sm transition-transform duration-200"
                  style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                >
                  expand_more
                </span>
              </button>
            </div>
          </div>

          {/* 折叠态：当前选中项 */}
          {!isExpanded && selectedMusic && (
            <div>
              <div className="px-4 py-3">
                <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-sm">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                      <span className="material-icons-round text-primary text-xs">headphones</span>
                    </div>
                    <span className="text-sm font-medium text-gray-800 truncate flex-1">{selectedMusic.title}</span>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      已选
                    </span>
                  </div>
                  {selectedMusic.musicUrl ? (
                    <audio controls preload="none" onPlay={handleAudioPlay} onClick={(e) => e.stopPropagation()} className="h-7 w-full" style={{ borderRadius: 6 }}>
                      <source src={selectedMusic.musicUrl} />
                    </audio>
                  ) : null}
                  {selectedMusic.atmospheres && selectedMusic.atmospheres.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {selectedMusic.atmospheres.slice(0, 3).map((atm) => (
                        <span key={atm} className="rounded-full bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary/70">
                          #{atm}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 节拍可视化 + 卡点开关（折叠态底部） */}
              {selectedMusic.musicUrl && onBeatSyncToggle && (
                <div className="px-4 pb-3">
                  {beatDetectResult && beatDetectResult.duration > 0 ? (
                    <div className="rounded-lg overflow-hidden bg-white/40 px-3 py-2">
                      <BeatEnergyCurve
                        beatResult={beatDetectResult}
                        duration={beatDetectResult.duration}
                        height={32}
                      />
                    </div>
                  ) : null}
                  <Step4BeatSyncControls
                    musicSource={selectedMusic.musicUrl}
                    enabled={beatSyncEnabled}
                    intensity={beatSyncIntensity}
                    onToggle={onBeatSyncToggle}
                    onIntensityChange={onBeatSyncIntensityChange ?? (() => {})}
                    onBeatDetected={onBeatDetected}
                  />
                </div>
              )}
            </div>
          )}

          {/* 展开态：完整列表 */}
          {isExpanded && (
            <div className="px-4 py-3 space-y-2">
              {allCandidates.map((music, index) => {
                const isSelected = music.id === selectedMusicId;
                return (
                  <div
                    key={music.id}
                    onClick={() => handleRadioSelect(music)}
                    className={`rounded-xl border-2 p-3 transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary/50 bg-white shadow-[0_2px_12px_rgba(249,115,22,0.12)]"
                        : "border-white/60 bg-white/50 hover:border-orange-200 hover:bg-white/80"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5">
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
                          isSelected ? "border-primary bg-primary shadow-sm" : "border-gray-300 bg-white"
                        }`}>
                          {isSelected && <span className="material-icons-round text-white text-[10px]">check</span>}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold ${
                            index === 0
                              ? "bg-gradient-to-br from-orange-400 to-amber-400 text-white"
                              : "bg-gray-100 text-gray-500"
                          }`}>
                            {index === 0 ? "★" : index + 1}
                          </span>
                          <p className={`text-sm font-medium truncate ${isSelected ? "text-gray-900" : "text-gray-700"}`}>
                            {music.title}
                          </p>
                        </div>
                        {index === 0 && (
                          <span className="mt-1 inline-block rounded-full bg-gradient-to-r from-orange-100 to-amber-100 px-2 py-0.5 text-[10px] font-bold text-orange-600">
                            AI 推荐
                          </span>
                        )}
                        {music.atmospheres && music.atmospheres.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {music.atmospheres.slice(0, 3).map((atm) => (
                              <span key={atm} className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                                isSelected ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-500"
                              }`}>
                                #{atm}
                              </span>
                            ))}
                          </div>
                        )}
                        {music.musicUrl ? (
                          <audio controls preload="none" onPlay={handleAudioPlay} className="h-7 w-full mt-2" style={{ borderRadius: 6 }}>
                            <source src={music.musicUrl} />
                          </audio>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* 底部操作 */}
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => { onClearSelection(); setIsExpanded(false); }}
                  className="text-[11px] font-medium text-gray-400 hover:text-gray-600 transition"
                >
                  本次不选
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsLibraryOpen(true)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-hover transition"
                  >
                    <span className="material-icons-round text-sm">library_music</span>
                    更多音乐
                  </button>
                  <span className="text-[10px] text-gray-300">共 {allCandidates.length} 首</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
});

Step4MusicCompact.displayName = "Step4MusicCompact";
