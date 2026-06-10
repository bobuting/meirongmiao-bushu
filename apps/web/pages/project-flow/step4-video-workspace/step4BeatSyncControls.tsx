/**
 * 卡点剪辑控制面板
 * 包含：卡点开关、强度选择器、BPM 显示、节拍可视化
 * 嵌入在音乐选择器区域或合成按钮附近
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { detectBeats, type BeatDetectResult, type BeatSyncIntensity } from '../../../libs/beat-detect';

// ============================================================================
// 类型定义
// ============================================================================

export interface Step4BeatSyncControlsProps {
  /** BGM 的 URL 或 File，用于检测节拍 */
  musicSource: string | null;
  /** 是否启用卡点 */
  enabled: boolean;
  /** 卡点强度 */
  intensity: BeatSyncIntensity;
  /** 回调：开关状态变化 */
  onToggle: (enabled: boolean) => void;
  /** 回调：强度变化 */
  onIntensityChange: (intensity: BeatSyncIntensity) => void;
  /** 回调：节拍检测结果 */
  onBeatDetected?: (result: BeatDetectResult | null) => void;
}

// ============================================================================
// 卡点控制面板
// ============================================================================

export const Step4BeatSyncControls: React.FC<Step4BeatSyncControlsProps> = ({
  musicSource,
  enabled,
  intensity,
  onToggle,
  onIntensityChange,
  onBeatDetected,
}) => {
  const [beatResult, setBeatResult] = useState<BeatDetectResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detectingRef = useRef(false);

  // 音乐切换时重置内部状态
  useEffect(() => {
    setBeatResult(null);
    setIsDetecting(false);
    setError(null);
    detectingRef.current = false;
  }, [musicSource]);

  const handleToggle = useCallback(async () => {
    const nextEnabled = !enabled;
    onToggle(nextEnabled);

    if (nextEnabled && musicSource && !beatResult && !detectingRef.current) {
      // 首次启用时检测节拍
      detectingRef.current = true;
      setIsDetecting(true);
      setError(null);

      try {
        const result = await detectBeats(musicSource, { intensity });
        setBeatResult(result);
        onBeatDetected?.(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : '节拍检测失败');
        onToggle(false); // 检测失败时关闭
      } finally {
        setIsDetecting(false);
        detectingRef.current = false;
      }
    }
  }, [enabled, musicSource, beatResult, intensity, onToggle, onBeatDetected]);

  // 强度变化时重新检测（仅在已有结果时）
  useEffect(() => {
    if (enabled && musicSource && beatResult && !detectingRef.current) {
      detectingRef.current = true;
      setIsDetecting(true);
      setError(null);
      detectBeats(musicSource, { intensity })
        .then(result => {
          setBeatResult(result);
          onBeatDetected?.(result);
        })
        .catch(err => {
          setError(err instanceof Error ? err.message : '节拍检测失败');
          onToggle(false);
        })
        .finally(() => {
          setIsDetecting(false);
          detectingRef.current = false;
        });
    }
  }, [intensity]);

  const INTENSITY_LABELS: Record<BeatSyncIntensity, string> = {
    relaxed: '宽松',
    standard: '标准',
    strict: '严格',
  };

  const INTENSITY_ICONS: Record<BeatSyncIntensity, string> = {
    relaxed: 'music_off',
    standard: 'music_note',
    strict: 'music_video',
  };

  return (
    <div className="px-4 py-3 border-t border-orange-100/60">
      {/* 卡点开关行 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="material-icons-round text-sm text-purple-500">auto_fix_high</span>
          <span className="text-xs font-bold text-gray-700">智能卡点剪辑</span>
          {isDetecting && (
            <span className="material-icons-round text-sm text-primary animate-spin ml-1">sync</span>
          )}
          {beatResult && (
            <span className="text-[10px] text-gray-400 ml-1">
              BPM {beatResult.bpm} · {beatResult.beatTimes.length} 个节拍
            </span>
          )}
        </div>
        <button
          onClick={handleToggle}
          disabled={isDetecting || !musicSource}
          className={`relative w-9 h-5 rounded-full transition-colors ${
            enabled ? 'bg-primary' : 'bg-gray-300'
          } ${isDetecting || !musicSource ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          title={musicSource ? '卡点模式：转场对齐音乐节拍' : '请先选择背景音乐'}
        >
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? 'left-4' : 'left-0.5'
          }`} />
        </button>
      </div>

      {/* 强度选择器（仅在启用时显示） */}
      {enabled && (
        <div className="flex items-center gap-1.5 ml-6">
          {(['relaxed', 'standard', 'strict'] as BeatSyncIntensity[]).map((level) => (
            <button
              key={level}
              onClick={() => onIntensityChange(level)}
              disabled={isDetecting}
              className={`flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${
                intensity === level
                  ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-200'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
            >
              <span className="material-icons-round text-[8px]">{INTENSITY_ICONS[level]}</span>
              {INTENSITY_LABELS[level]}
            </button>
          ))}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="ml-6 mt-1 flex items-center gap-1">
          <span className="material-icons-round text-[10px] text-red-400">error_outline</span>
          <span className="text-[10px] text-red-400">{error}</span>
        </div>
      )}

      {/* 提示文案 */}
      {!enabled && !error && (
        <p className="text-[10px] text-gray-300 ml-6 mt-0.5">开启后，视频切换将对准音乐节拍</p>
      )}
    </div>
  );
};

// ============================================================================
// 节拍能量曲线可视化（可选，用于音乐库弹窗）
// ============================================================================

export interface BeatEnergyCurveProps {
  /** 节拍检测结果 */
  beatResult: BeatDetectResult | null;
  /** 音频总时长（秒） */
  duration: number;
  /** 当前播放位置（秒），用于进度指示 */
  currentTime?: number;
  /** 高度（像素） */
  height?: number;
}

export const BeatEnergyCurve: React.FC<BeatEnergyCurveProps> = ({
  beatResult,
  duration,
  currentTime = -1,
  height = 40,
}) => {
  if (!beatResult || beatResult.energyCurve.length === 0) {
    return (
      <div className="flex items-center justify-center text-[10px] text-gray-300" style={{ height }}>
        正在分析音乐节拍...
      </div>
    );
  }

  const { energyCurve, beatTimes, duration: beatDuration } = beatResult;
  const totalDuration = duration > 0 ? duration : beatDuration;
  const width = 200;
  const maxEnergy = Math.max(...Array.from(energyCurve) as number[]);

  // 降采样到显示宽度
  const step = Math.max(1, Math.floor(energyCurve.length / width));
  const points: string[] = [];

  for (let x = 0; x < width; x++) {
    const idx = x * step;
    if (idx >= energyCurve.length) break;
    const value = energyCurve[idx] / maxEnergy;
    const y = height - value * (height - 4); // 留 2px 边距
    points.push(`${x},${y.toFixed(1)}`);
  }

  const pathD = points.length > 0
    ? `M${points[0]} ${points.slice(1).map(p => `L${p}`).join(' ')}`
    : '';

  // 节拍标记
  const beatMarkers = beatTimes.map(t => {
    const x = (t / totalDuration) * width;
    return `M${x.toFixed(1)},0 L${x.toFixed(1)},${height}`;
  }).join(' ');

  // 播放进度
  const playheadX = currentTime >= 0 ? (currentTime / totalDuration) * width : -1;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="opacity-80"
    >
      {/* 能量曲线渐变填充 */}
      <defs>
        <linearGradient id="energyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(147, 51, 234)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="rgb(147, 51, 234)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* 填充区域 */}
      {pathD && (
        <path
          d={`${pathD} L${points.length - 1},${height} L0,${height} Z`}
          fill="url(#energyGrad)"
        />
      )}

      {/* 能量曲线 */}
      {pathD && (
        <path
          d={pathD}
          fill="none"
          stroke="rgb(147, 51, 234)"
          strokeWidth="1"
          strokeLinecap="round"
        />
      )}

      {/* 节拍标记 */}
      {beatMarkers && (
        <path
          d={beatMarkers}
          stroke="rgb(249, 115, 22)"
          strokeWidth="0.5"
          strokeDasharray="1,2"
          opacity="0.5"
        />
      )}

      {/* 播放进度线 */}
      {playheadX >= 0 && (
        <line
          x1={playheadX}
          y1={0}
          x2={playheadX}
          y2={height}
          stroke="white"
          strokeWidth="1"
          opacity="0.8"
        />
      )}
    </svg>
  );
};
