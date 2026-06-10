/**
 * 卡点时间线规划器
 * 根据音乐节拍时间戳和视频片段时长，计算最优的转场时机
 * 三级适配策略：直接对齐 / 速度微调(±15%) / 尾部裁剪
 */

import type { BeatSyncIntensity } from './beat-detect';

// ============================================================================
// 类型定义
// ============================================================================

export interface BeatSyncConfig {
  /** 卡点强度 */
  intensity: BeatSyncIntensity;
  /** 片段最小可见时长（秒） */
  minVisibleSec: number;
  /** 转场最小时长（秒） */
  minTransSec: number;
  /** 转场最大时长（秒） */
  maxTransSec: number;
  /** 速度微调上限（0.15 = ±15%） */
  maxSpeedAdjust: number;
  /** 封面图时长（秒），用于偏移补偿 */
  coverDurationSec: number;
  /** 各节拍的能量值（可选），用于优先选择强拍（鼓点/低频） */
  beatEnergies?: number[];
}

/** 适配策略 */
export type AdjustStrategy = 'none' | 'speed' | 'trim';

/** 单个片段的时间安排 */
export interface ClipTiming {
  /** 在时间线上的起始偏移（秒） */
  offsetSec: number;
  /** 目标播放时长（秒），可能经过速度调整或裁剪 */
  targetDurationSec: number;
  /** 原始片段时长（秒） */
  originalDurationSec: number;
  /** 速度倍率（1.0 = 原速，>1 加速，<1 减速） */
  speedRate: number;
  /** 适配策略 */
  strategy: AdjustStrategy;
  /** 裁剪量（秒），仅 strategy='trim' */
  trimmedSec: number;
}

/** 单个转场的时间安排 */
export interface TransitionTiming {
  /** 转场在时间线上的偏移（秒） */
  offsetSec: number;
  /** 转场时长（秒） */
  durationSec: number;
  /** 是否吸附到节拍 */
  snappedToBeat: boolean;
}

/** 完整的卡点时间线 */
export interface BeatSyncedTimeline {
  clips: ClipTiming[];
  transitions: TransitionTiming[];
  /** 时间线总时长（秒） */
  totalDurationSec: number;
  /** 已使用的节拍数 */
  beatsUsed: number;
  /** 总节拍数 */
  totalBeats: number;
  /** 各策略使用次数 */
  strategyStats: { none: number; speed: number; trim: number };
}

// ============================================================================
// 常量
// ============================================================================

/** 直接对齐的偏差阈值（秒） */
const DIRECT_ALIGN_THRESHOLD = 0.2;

// ============================================================================
// 默认配置
// ============================================================================

export const DEFAULT_BEAT_SYNC_CONFIG: BeatSyncConfig = {
  intensity: 'standard',
  minVisibleSec: 1.5,
  minTransSec: 0.3,
  maxTransSec: 1.5,
  maxSpeedAdjust: 0.15,
  coverDurationSec: 0,
};

// ============================================================================
// 核心函数
// ============================================================================

/**
 * 规划卡点对齐的时间线
 *
 * @param clipDurationsSec 各片段原始时长（秒）
 * @param beatTimestampsSec 节拍时间戳（秒）
 * @param config 配置参数
 * @returns 卡点时间线
 */
export function planBeatSyncedTimeline(
  clipDurationsSec: number[],
  beatTimestampsSec: number[],
  config: Partial<BeatSyncConfig> = {},
): BeatSyncedTimeline {
  const cfg = { ...DEFAULT_BEAT_SYNC_CONFIG, ...config };
  const numClips = clipDurationsSec.length;

  // 边界情况：单片段或无节拍
  if (numClips <= 1 || beatTimestampsSec.length === 0) {
    return buildFallbackTimeline(clipDurationsSec, cfg.coverDurationSec);
  }

  // 过滤有效节拍（正数且递增），同步过滤能量值
  const { beats, filteredEnergies } = filterValidBeats(beatTimestampsSec, cfg.beatEnergies);
  if (beats.length === 0) {
    return buildFallbackTimeline(clipDurationsSec, cfg.coverDurationSec);
  }

  // Step 1: 计算自然时间线（无节拍对齐的基准）
  const naturalTimeline = computeNaturalTimeline(clipDurationsSec, cfg);

  // Step 2: DP 全局最优选取节拍作为转场目标点
  const targetBeatPoints = selectTargetBeatsGlobal(
    naturalTimeline.transitionPoints,
    beats,
    cfg.intensity,
    filteredEnergies,
  );

  // Step 3: 自适应计算每个转场时长
  const transitionTimings = computeTransitionTimings(
    targetBeatPoints,
    beats,
    cfg,
  );

  // Step 4: 三级适配 + 正向构建时间线
  const { clips, transitions, beatsUsed } = buildAlignedTimeline(
    clipDurationsSec,
    transitionTimings,
    targetBeatPoints,
    cfg,
  );

  // Step 5: 统计策略使用情况
  const strategyStats = { none: 0, speed: 0, trim: 0 };
  for (const clip of clips) {
    strategyStats[clip.strategy]++;
  }

  const totalDuration = clips.length > 0
    ? clips[clips.length - 1].offsetSec + clips[clips.length - 1].targetDurationSec
    : 0;

  return {
    clips,
    transitions,
    totalDurationSec: totalDuration,
    beatsUsed,
    totalBeats: beats.length,
    strategyStats,
  };
}

// ============================================================================
// 内部函数
// ============================================================================

/** 过滤有效节拍（正数、递增、去重），同步过滤能量值 */
function filterValidBeats(timestamps: number[], energies?: number[]): { beats: number[]; filteredEnergies?: number[] } {
  // 按 timestamp 排序，同时保持 timestamp 和 energy 的对应关系
  const indexed = timestamps.map((t, i) => ({ t, e: energies?.[i] }));
  indexed.sort((a, b) => a.t - b.t);

  const beats: number[] = [];
  const filteredEnergies: number[] = [];
  const hasEnergies = energies != null;

  for (const { t, e } of indexed) {
    if (t > 0 && (beats.length === 0 || t - beats[beats.length - 1] > 0.01)) {
      beats.push(t);
      if (hasEnergies) filteredEnergies.push(e ?? 0.5);
    }
  }

  return { beats, filteredEnergies: hasEnergies ? filteredEnergies : undefined };
}

/** 构建回退时间线（无节拍对齐） */
function buildFallbackTimeline(
  clipDurationsSec: number[],
  coverDurationSec: number,
): BeatSyncedTimeline {
  let offset = coverDurationSec;
  const clips: ClipTiming[] = [];
  const transitions: TransitionTiming[] = [];
  const defaultTrans = 0.5;

  for (let i = 0; i < clipDurationsSec.length; i++) {
    clips.push({
      offsetSec: offset,
      targetDurationSec: clipDurationsSec[i],
      originalDurationSec: clipDurationsSec[i],
      speedRate: 1.0,
      strategy: 'none',
      trimmedSec: 0,
    });

    if (i > 0) {
      transitions.push({
        offsetSec: offset - defaultTrans,
        durationSec: defaultTrans,
        snappedToBeat: false,
      });
    }

    offset += clipDurationsSec[i] - (i < clipDurationsSec.length - 1 ? defaultTrans : 0);
  }

  return {
    clips,
    transitions,
    totalDurationSec: offset,
    beatsUsed: 0,
    totalBeats: 0,
    strategyStats: { none: clipDurationsSec.length, speed: 0, trim: 0 },
  };
}

/** 自然时间线（不带节拍对齐） */
interface NaturalTimeline {
  /** 每个片段的起始偏移 */
  offsets: number[];
  /** 每两个片段间的自然转场点（秒） */
  transitionPoints: number[];
  /** 默认转场时长 */
  defaultTransDuration: number;
}

/** 计算自然时间线 */
function computeNaturalTimeline(
  clipDurationsSec: number[],
  cfg: BeatSyncConfig,
): NaturalTimeline {
  const n = clipDurationsSec.length;
  const defaultTrans = Math.min(0.5, ...clipDurationsSec.map(d => d * 0.15));
  const offsets: number[] = [];
  const transitionPoints: number[] = [];
  let t = cfg.coverDurationSec;

  for (let i = 0; i < n; i++) {
    offsets.push(t);
    if (i > 0) {
      // 转场点 = 前一片段结束 - 转场时长/2
      transitionPoints.push(t - defaultTrans / 2);
    }
    t += clipDurationsSec[i] - (i < n - 1 ? defaultTrans : 0);
  }

  return { offsets, transitionPoints, defaultTransDuration: defaultTrans };
}

/**
 * DP 全局最优节拍选取
 * 替代贪心策略，使用动态规划最小化总代价
 * 代价 = dist² + energyPenalty * (1 - normalizedEnergy)
 */
function selectTargetBeatsGlobal(
  naturalTransitionPoints: number[],
  beats: number[],
  intensity: BeatSyncIntensity,
  beatEnergies?: number[],
): (number | null)[] {
  const n = naturalTransitionPoints.length;
  const m = beats.length;

  if (n === 0 || m === 0) return naturalTransitionPoints.map(() => null);

  // 归一化能量到 [0, 1]
  const normalizedEnergy = normalizeEnergies(beatEnergies, m);

  // DP: dp[i][j] = 前 i 个转场点使用 beats[0..j-1] 中 i 个的最小总代价
  const INF = Infinity;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  const parent: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(-1));

  // 基础：0 个转场点代价为 0
  for (let j = 0; j <= m; j++) {
    dp[0][j] = 0;
  }

  const energyWeight = 0.3;

  for (let i = 1; i <= n; i++) {
    for (let j = i; j <= m; j++) {
      const target = naturalTransitionPoints[i - 1];
      const dist = Math.abs(beats[j - 1] - target);
      const energy = normalizedEnergy[j - 1];
      const cost = dist * dist + energyWeight * (1 - energy);

      // 找 min(dp[i-1][k] + cost) for k < j
      for (let k = i - 1; k < j; k++) {
        const totalCost = dp[i - 1][k] + cost;
        if (totalCost < dp[i][j]) {
          dp[i][j] = totalCost;
          parent[i][j] = k;
        }
      }
    }
  }

  // 找最小总代价的终点
  let minCost = INF;
  let endJ = -1;
  for (let j = n; j <= m; j++) {
    if (dp[n][j] < minCost) {
      minCost = dp[n][j];
      endJ = j;
    }
  }

  // 无可行分配（转场数 > 节拍数），全部返回 null
  if (endJ < 0) {
    return naturalTransitionPoints.map(() => null);
  }

  // 回溯得到分配
  const assignment: number[] = new Array(n).fill(-1);
  let curJ = endJ;
  for (let i = n; i >= 1; i--) {
    assignment[i - 1] = curJ - 1; // beat index
    curJ = parent[i][curJ];
  }

  // 容差过滤：距离过远的节拍标记为 null
  const maxDist = getMaxAllowedDistance(intensity);
  return assignment.map((beatIdx, transIdx) => {
    if (beatIdx < 0) return null;
    const dist = Math.abs(beats[beatIdx] - naturalTransitionPoints[transIdx]);
    if (dist > maxDist) return null;
    return beats[beatIdx];
  });
}

/** 归一化能量值到 [0, 1] */
function normalizeEnergies(energies: number[] | undefined, beatCount: number): number[] {
  if (!energies || energies.length === 0) {
    return new Array(beatCount).fill(0.5);
  }
  const safe = energies.slice(0, beatCount);
  // 不足部分补 0.5
  while (safe.length < beatCount) safe.push(0.5);
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = max - min;
  if (range < 1e-6) return safe.map(() => 0.5);
  return safe.map(e => (e - min) / range);
}

/** 根据强度计算最大允许距离（秒） */
function getMaxAllowedDistance(intensity: BeatSyncIntensity): number {
  const limits: Record<BeatSyncIntensity, number> = {
    relaxed: 3.0,
    standard: 2.0,
    strict: 1.5,
  };
  return limits[intensity];
}

/** 转场时机计算结果 */
interface TransitionCalc {
  /** 转场偏移（秒） */
  offsetSec: number;
  /** 转场时长（秒） */
  durationSec: number;
  /** 是否吸附到节拍 */
  snappedToBeat: boolean;
}

/** 计算每个转场的时长和偏移 */
function computeTransitionTimings(
  targetBeatPoints: (number | null)[],
  beats: number[],
  cfg: BeatSyncConfig,
): TransitionCalc[] {
  return targetBeatPoints.map((targetBeat, i) => {
    if (targetBeat == null) {
      // 无目标节拍，使用默认转场
      return {
        offsetSec: 0, // 后续在 buildAlignedTimeline 中确定
        durationSec: Math.min(0.5, cfg.maxTransSec),
        snappedToBeat: false,
      };
    }

    // 计算节拍间距，自适应转场时长
    let beatInterval = 1.0; // 默认间距
    const beatIdx = beats.indexOf(targetBeat);
    if (beatIdx > 0) {
      beatInterval = targetBeat - beats[beatIdx - 1];
    } else if (beatIdx === 0 && beats.length > 1) {
      beatInterval = beats[1] - beats[0];
    }

    const durationSec = clamp(
      Math.min(beatInterval * 0.35, cfg.maxTransSec),
      cfg.minTransSec,
      cfg.maxTransSec,
    );

    return {
      offsetSec: targetBeat - durationSec / 2,
      durationSec,
      snappedToBeat: true,
    };
  });
}

/** 三级适配 + 正向构建 */
function buildAlignedTimeline(
  clipDurationsSec: number[],
  transitionCalcs: TransitionCalc[],
  targetBeatPoints: (number | null)[],
  cfg: BeatSyncConfig,
): { clips: ClipTiming[]; transitions: TransitionTiming[]; beatsUsed: number } {
  const n = clipDurationsSec.length;
  const clips: ClipTiming[] = [];
  const transitions: TransitionTiming[] = [];
  let currentTime = cfg.coverDurationSec;
  let beatsUsed = 0;

  for (let i = 0; i < n; i++) {
    const originalDuration = clipDurationsSec[i];
    const transIn = i > 0 ? transitionCalcs[i - 1] : null;
    const transOut = i < n - 1 ? transitionCalcs[i] : null;

    // 计算目标可见时长
    let overlapIn = transIn ? transIn.durationSec : 0;
    let overlapOut = transOut ? transOut.durationSec : 0;

    // 有目标节拍时，计算节拍间距决定的目标时长
    let targetVisibleDuration = originalDuration - overlapIn / 2 - overlapOut / 2;
    let targetBeatPoint: number | null = null;

    if (transOut?.snappedToBeat && targetBeatPoints[i] != null) {
      targetBeatPoint = targetBeatPoints[i]!;
      // 目标：从当前时间到目标节拍点（减去转场时长的一半）
      targetVisibleDuration = targetBeatPoint - currentTime - overlapOut / 2;
    }

    // 确保目标时长合理
    targetVisibleDuration = Math.max(cfg.minVisibleSec, targetVisibleDuration);

    // 三级适配
    const deviation = Math.abs(targetVisibleDuration - originalDuration);
    const maxSpeedDev = cfg.maxSpeedAdjust * originalDuration;

    let strategy: AdjustStrategy;
    let speedRate: number;
    let trimmedSec: number;
    let finalDuration: number;

    if (deviation <= DIRECT_ALIGN_THRESHOLD || targetBeatPoint == null) {
      // 直接对齐：偏差极小或无目标节拍
      strategy = 'none';
      speedRate = 1.0;
      trimmedSec = 0;
      finalDuration = originalDuration;
    } else if (deviation <= maxSpeedDev) {
      // 速度微调：±15% 以内
      strategy = 'speed';
      speedRate = originalDuration / targetVisibleDuration;
      speedRate = clamp(speedRate, 1 - cfg.maxSpeedAdjust, 1 + cfg.maxSpeedAdjust);
      // clamp 后需要反算 finalDuration，保证数学一致
      finalDuration = originalDuration / speedRate;
      trimmedSec = 0;
      beatsUsed++;
    } else {
      // 尾部裁剪：保留前面的视觉高潮
      strategy = 'trim';
      speedRate = 1.0;
      trimmedSec = Math.max(0, originalDuration - targetVisibleDuration);
      finalDuration = originalDuration - trimmedSec;
      beatsUsed++;
    }

    clips.push({
      offsetSec: currentTime,
      targetDurationSec: finalDuration,
      originalDurationSec: originalDuration,
      speedRate,
      strategy,
      trimmedSec,
    });

    // 记录转场
    if (transOut) {
      const transOffset = currentTime + finalDuration - overlapOut / 2;
      transitions.push({
        offsetSec: transOut.snappedToBeat
          ? Math.max(transOffset, currentTime + cfg.minVisibleSec)
          : transOffset,
        durationSec: transOut.durationSec,
        snappedToBeat: transOut.snappedToBeat,
      });

      // 前进到下一个片段的起始点
      currentTime = currentTime + finalDuration - overlapOut;
    } else {
      currentTime += finalDuration;
    }
  }

  return { clips, transitions, beatsUsed };
}

// ============================================================================
// 工具函数
// ============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
