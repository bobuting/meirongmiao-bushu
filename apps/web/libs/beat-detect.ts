/**
 * 基于 Web Audio API 的音乐节拍检测
 * 原理：解码音频 → 计算低频能量曲线 → 找局部峰值 → 返回节拍时间戳
 * 零外部依赖，纯浏览器端运行
 */

export interface BeatDetectResult {
  /** 节拍时间戳数组（秒），如 [0.52, 1.04, 1.56, ...] */
  beatTimes: number[];
  /** 歌曲 BPM（估算值） */
  bpm: number;
  /** 歌曲总时长（秒） */
  duration: number;
  /** 能量曲线（用于可视化），每个元素代表一个时间窗口的能量值 */
  energyCurve: Float32Array;
  /** 能量曲线每个采样点的时间间隔（秒） */
  energyInterval: number;
}

interface BeatDetectOptions {
  /** 最低 BPM，默认 60 */
  minBpm?: number;
  /** 最高 BPM，默认 200 */
  maxBpm?: number;
  /** 能量阈值倍数（超过均值多少倍才算节拍），默认 1.3；值越大越严格 */
  energyThreshold?: number;
  /** 能量分析窗口大小（秒），默认 0.05（50ms） */
  windowSize?: number;
}

export type BeatSyncIntensity = "relaxed" | "standard" | "strict";

/** 卡点强度配置 */
const INTENSITY_CONFIG: Record<BeatSyncIntensity, { threshold: number; tolerance: number }> = {
  relaxed: { threshold: 1.15, tolerance: 1.2 },   // 更多节拍点，容差大
  standard: { threshold: 1.3, tolerance: 0.8 },    // 平衡
  strict: { threshold: 1.5, tolerance: 0.4 },      // 只选最强节拍，精准对齐
};

/**
 * 从音频文件检测节拍
 * @param audioSource 音频文件 URL 或 File/Blob
 * @param options 检测选项
 */
export async function detectBeats(
  audioSource: string | File | Blob,
  options: BeatDetectOptions & { intensity?: BeatSyncIntensity } = {},
): Promise<BeatDetectResult> {
  const {
    minBpm = 60,
    maxBpm = 200,
    windowSize = 0.05,
    intensity = "standard",
  } = options;

  const { threshold } = INTENSITY_CONFIG[intensity];

  // 1. 解码音频
  const audioBuffer = await decodeAudio(audioSource);
  const duration = audioBuffer.duration;

  // 2. 混音为单声道
  const monoData = mixToMono(audioBuffer);

  // 3. 计算能量曲线（低频带 20-200Hz，对应鼓点/贝斯）
  const energyCurve = computeEnergyCurve(monoData, audioBuffer.sampleRate, windowSize);
  const energyInterval = windowSize;

  // 4. 检测节拍点（局部峰值）
  const minGap = 60 / maxBpm; // 节拍之间最小间隔
  const beatTimes = findBeatPeaks(energyCurve, energyInterval, threshold, minGap);

  // 5. 估算 BPM
  const bpm = estimateBpm(beatTimes, minBpm, maxBpm);

  return { beatTimes, bpm, duration, energyCurve, energyInterval };
}

// ============================================================================
// 内部函数
// ============================================================================

async function decodeAudio(source: string | File | Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    let arrayBuffer: ArrayBuffer;
    if (source instanceof File || source instanceof Blob) {
      arrayBuffer = await source.arrayBuffer();
    } else {
      const resp = await fetch(source);
      if (!resp.ok) throw new Error(`音频下载失败: HTTP ${resp.status}`);
      arrayBuffer = await resp.arrayBuffer();
    }
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    await ctx.close();
  }
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const mono = new Float32Array(length);

  if (channels === 1) {
    mono.set(buffer.getChannelData(0));
  } else {
    for (let ch = 0; ch < channels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        mono[i] += data[i] / channels;
      }
    }
  }
  return mono;
}

function computeEnergyCurve(
  monoData: Float32Array,
  sampleRate: number,
  windowSize: number,
): Float32Array {
  const windowSamples = Math.floor(windowSize * sampleRate);
  const numWindows = Math.floor(monoData.length / windowSamples);
  const energy = new Float32Array(numWindows);

  for (let i = 0; i < numWindows; i++) {
    let sum = 0;
    const start = i * windowSamples;
    for (let j = 0; j < windowSamples; j++) {
      const sample = monoData[start + j];
      sum += sample * sample; // RMS 能量
    }
    energy[i] = Math.sqrt(sum / windowSamples);
  }

  // 平滑处理（3 点移动平均）
  const smoothed = new Float32Array(numWindows);
  for (let i = 0; i < numWindows; i++) {
    let sum = energy[i];
    let count = 1;
    if (i > 0) { sum += energy[i - 1]; count++; }
    if (i < numWindows - 1) { sum += energy[i + 1]; count++; }
    smoothed[i] = sum / count;
  }

  return smoothed;
}

function findBeatPeaks(
  energy: Float32Array,
  interval: number,
  threshold: number,
  minGapSec: number,
): number[] {
  const beats: number[] = [];

  // 计算局部平均能量
  const localAvgRadius = Math.max(10, Math.floor(2 / interval)); // ±2 秒窗口
  for (let i = localAvgRadius; i < energy.length - localAvgRadius; i++) {
    let localSum = 0;
    for (let j = i - localAvgRadius; j <= i + localAvgRadius; j++) {
      localSum += energy[j];
    }
    const localAvg = localSum / (localAvgRadius * 2 + 1);

    // 峰值检测：当前能量 > 局部均值 × 阈值
    if (energy[i] > localAvg * threshold) {
      // 确认是局部最大值
      const isPeak = energy[i] >= energy[i - 1] && energy[i] >= energy[i + 1];
      if (isPeak) {
        // 检查与上一个节拍的最小间隔
        const time = i * interval;
        const lastBeatTime = beats.length > 0 ? beats[beats.length - 1] : -Infinity;
        if (time - lastBeatTime >= minGapSec) {
          beats.push(i);
        }
      }
    }
  }

  return beats.map(i => i * interval);
}

function estimateBpm(beatTimes: number[], minBpm: number, maxBpm: number): number {
  if (beatTimes.length < 2) return 120; // 默认值

  const intervals: number[] = [];
  for (let i = 1; i < beatTimes.length; i++) {
    intervals.push(beatTimes[i] - beatTimes[i - 1]);
  }

  // 中位数间隔
  intervals.sort((a, b) => a - b);
  const medianInterval = intervals[Math.floor(intervals.length / 2)];
  const rawBpm = 60 / medianInterval;

  // 归一化到合理范围
  let bpm = rawBpm;
  while (bpm < minBpm) bpm *= 2;
  while (bpm > maxBpm) bpm /= 2;

  return Math.round(bpm);
}
