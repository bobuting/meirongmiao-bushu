/**
 * Step4 音乐库弹窗
 * 浏览全部音乐、搜索、氛围筛选、试听、选择确认
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { backendApi } from "../../../services/backendApi";
import type { VideoMusicDto } from "../../../services/backendApi.videoMusic";
import { Step4MusicPlayerBar } from "./step4MusicPlayerBar";

interface Step4MusicLibraryModalProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 确认选择回调 */
  onConfirm: (music: VideoMusicDto) => void;
  /** 当前选中的音乐 ID */
  currentSelectedMusicId: string | null;
  /** 认证 token */
  token: string;
}

// 预设氛围标签
const ATMOSPHERE_TAGS = [
  "全部",
  "轻松",
  "激昂",
  "温馨",
  "忧伤",
  "电子",
  "古典",
  "流行",
  "摇滚",
  "民谣",
  "爵士",
];

/**
 * 格式化时长
 */
function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export const Step4MusicLibraryModal: React.FC<Step4MusicLibraryModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentSelectedMusicId,
  token,
}) => {
  // 状态
  const [isLoading, setIsLoading] = useState(false);
  const [musics, setMusics] = useState<VideoMusicDto[]>([]);
  const [selectedMusicId, setSelectedMusicId] = useState<string | null>(currentSelectedMusicId);
  const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAtmosphere, setSelectedAtmosphere] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 加载音乐列表
  useEffect(() => {
    if (!isOpen || !token) return;

    const loadMusics = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await backendApi.listVideoMusic(token, {
          search: searchQuery.trim() || null,
          atmosphere: selectedAtmosphere || null,
        });
        setMusics(result.items);
      } catch (err) {
        setError("加载音乐库失败，请稍后重试");
        setMusics([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadMusics();
  }, [isOpen, token, searchQuery, selectedAtmosphere]);

  // 重置选中状态（打开时同步外部状态）
  useEffect(() => {
    if (isOpen) {
      setSelectedMusicId(currentSelectedMusicId);
      setPlayingMusicId(null);
    }
  }, [isOpen, currentSelectedMusicId]);

  // 关闭时清理
  useEffect(() => {
    if (!isOpen) {
      setPlayingMusicId(null);
    }
  }, [isOpen]);

  // 选中的音乐信息
  const selectedMusic = useMemo(
    () => musics.find((m) => m.id === selectedMusicId) ?? null,
    [musics, selectedMusicId]
  );

  // 确认选择
  const handleConfirm = useCallback(() => {
    if (selectedMusic) {
      onConfirm(selectedMusic);
      onClose();
    }
  }, [selectedMusic, onConfirm, onClose]);

  // 氛围筛选
  const handleAtmosphereClick = useCallback((atm: string) => {
    if (atm === "全部") {
      setSelectedAtmosphere(null);
    } else {
      setSelectedAtmosphere(atm);
    }
  }, []);

  if (!isOpen) return null;

  const modal = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="shrink-0 flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">🎵 背景音乐库</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
            aria-label="关闭"
          >
            <span className="material-icons-round text-xl">close</span>
          </button>
        </div>

        {/* 搜索和筛选 */}
        <div className="shrink-0 border-b border-gray-100 px-6 py-3 space-y-3">
          {/* 搜索框 */}
          <div className="relative">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索标题、艺术家、专辑..."
              className="w-full h-10 pl-10 pr-4 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:border-primary focus:bg-white transition"
            />
          </div>

          {/* 氛围标签 */}
          <div className="flex flex-wrap gap-2">
            {ATMOSPHERE_TAGS.map((atm) => (
              <button
                key={atm}
                type="button"
                onClick={() => handleAtmosphereClick(atm)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  (atm === "全部" && !selectedAtmosphere) || atm === selectedAtmosphere
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {atm}
              </button>
            ))}
          </div>
        </div>

        {/* 音乐列表 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-icons-round text-2xl text-gray-400 animate-spin">sync</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-sm text-red-500">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedAtmosphere(null);
                }}
                className="mt-2 text-xs text-primary hover:underline"
              >
                重置筛选
              </button>
            </div>
          ) : musics.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">
                {searchQuery || selectedAtmosphere ? "未找到匹配的音乐" : "音乐库暂无音乐"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {musics.map((music) => {
                const isSelected = music.id === selectedMusicId;
                return (
                  <div
                    key={music.id}
                    onClick={() => setSelectedMusicId(music.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    {/* 头部：选中指示 + 标题 */}
                    <div className="flex items-start gap-3">
                      {/* Radio 按钮 */}
                      <span
                        className={`shrink-0 mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                          isSelected
                            ? "border-primary bg-primary"
                            : "border-gray-300 bg-white"
                        }`}
                      >
                        {isSelected && (
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        )}
                      </span>

                      <div className="flex-1 min-w-0">
                        {/* 标题 */}
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm font-semibold truncate ${isSelected ? "text-primary" : "text-gray-900"}`}>
                            {music.title}
                          </p>
                          {isSelected && (
                            <span className="shrink-0 text-[10px] font-bold text-primary">✓ 已选</span>
                          )}
                        </div>

                        {/* 艺术家、专辑、时长 */}
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                          {music.artist && (
                            <span>艺术家: {music.artist}</span>
                          )}
                          {music.album && (
                            <span>专辑: {music.album}</span>
                          )}
                          <span>时长: {formatDuration(music.durationSec)}</span>
                        </div>

                        {/* 氛围标签 */}
                        {music.atmospheres && music.atmospheres.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {music.atmospheres.slice(0, 4).map((atm) => (
                              <span
                                key={atm}
                                className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                                  isSelected
                                    ? "bg-primary/10 text-primary"
                                    : "bg-gray-100 text-gray-500"
                                }`}
                              >
                                #{atm}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* 播放进度条 */}
                        {music.musicUrl && (
                          <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
                            <Step4MusicPlayerBar
                              musicUrl={music.musicUrl}
                              musicId={music.id}
                              playingMusicId={playingMusicId}
                              onPlayingChange={setPlayingMusicId}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="shrink-0 flex items-center justify-between border-t border-gray-100 px-6 py-4 bg-gray-50">
          <p className="text-xs text-gray-500">
            {selectedMusic ? (
              <>已选择: <span className="font-medium text-gray-700">{selectedMusic.title}</span></>
            ) : (
              "请选择一首音乐"
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedMusic}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                selectedMusic
                  ? "bg-primary text-white hover:bg-primary-hover"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              确认选择
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

Step4MusicLibraryModal.displayName = "Step4MusicLibraryModal";