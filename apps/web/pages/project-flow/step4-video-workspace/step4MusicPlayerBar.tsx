/**
 * Step4 音乐播放进度条
 * 自定义实现，支持播放/暂停、进度跳转、重置
 */

import React, { useRef, useState, useEffect, useCallback } from "react";

interface Step4MusicPlayerBarProps {
  /** 音乐 URL */
  musicUrl: string;
  /** 音乐 ID，用于区分不同实例 */
  musicId: string;
  /** 当前播放的音乐 ID（全局唯一） */
  playingMusicId: string | null;
  /** 播放状态变化回调 */
  onPlayingChange: (musicId: string | null) => void;
}

/**
 * 格式化时间为 mm:ss
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export const Step4MusicPlayerBar: React.FC<Step4MusicPlayerBarProps> = ({
  musicUrl,
  musicId,
  playingMusicId,
  onPlayingChange,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const isCurrentPlaying = playingMusicId === musicId;

  // 播放/暂停切换
  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isCurrentPlaying && isPlaying) {
      audio.pause();
      setIsPlaying(false);
      onPlayingChange(null);
    } else {
      // 暂停其他音频
      if (playingMusicId !== musicId && playingMusicId !== null) {
        onPlayingChange(null);
      }
      audio.play().catch((error) => {
        console.error("[Step4MusicPlayerBar] 播放失败:", error);
        setIsPlaying(false);
      });
      setIsPlaying(true);
      onPlayingChange(musicId);
    }
  }, [isCurrentPlaying, isPlaying, musicId, onPlayingChange, playingMusicId]);

  // 重置播放
  const handleReset = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      onPlayingChange(null);
    }
  }, [isPlaying, onPlayingChange]);

  // 点击进度条跳转
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const progress = progressRef.current;
    if (!audio || !progress || duration === 0) return;

    const rect = progress.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = percent * duration;
    setCurrentTime(audio.currentTime);
  }, [duration]);

  // 音频事件监听
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      onPlayingChange(null);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, [onPlayingChange]);

  // 外部控制：如果另一个音乐开始播放，暂停当前
  useEffect(() => {
    if (!isCurrentPlaying && isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [isCurrentPlaying, isPlaying]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2">
      {/* 隐藏的 audio 元素 */}
      <audio ref={audioRef} preload="metadata">
        <source src={musicUrl} />
      </audio>

      {/* 播放/暂停按钮 */}
      <button
        type="button"
        onClick={handleTogglePlay}
        className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition"
        aria-label={isCurrentPlaying && isPlaying ? "暂停" : "播放"}
      >
        <span className="material-icons-round text-sm">
          {isCurrentPlaying && isPlaying ? "pause" : "play_arrow"}
        </span>
      </button>

      {/* 进度条 */}
      <div
        ref={progressRef}
        onClick={handleProgressClick}
        className="relative flex-1 h-1.5 bg-gray-200 rounded-full cursor-pointer group"
      >
        <div
          className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all"
          style={{ width: `${progressPercent}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition"
          style={{ left: `calc(${progressPercent}% - 6px)` }}
        />
      </div>

      {/* 时间显示 */}
      <span className="shrink-0 text-[10px] text-gray-500 font-mono min-w-[60px] text-right">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {/* 重置按钮 */}
      <button
        type="button"
        onClick={handleReset}
        className="shrink-0 flex h-5 w-5 items-center justify-center text-gray-400 hover:text-gray-600 transition"
        aria-label="重置"
      >
        <span className="material-icons-round text-sm">replay</span>
      </button>
    </div>
  );
};

Step4MusicPlayerBar.displayName = "Step4MusicPlayerBar";