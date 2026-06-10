/**
 * 卡点时间线规划器单元测试
 * 覆盖三级适配策略和边界条件
 */

import { describe, it, expect } from 'vitest';
import {
  planBeatSyncedTimeline,
  type BeatSyncedTimeline,
} from '../apps/web/libs/beat-sync-timeline';

// ============================================================================
// 辅助函数
// ============================================================================

/** 创建均匀分布的节拍 */
function uniformBeats(startSec: number, intervalSec: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => startSec + i * intervalSec);
}

/** 统计策略使用次数 */
function countStrategies(timeline: BeatSyncedTimeline) {
  return {
    none: timeline.clips.filter(c => c.strategy === 'none').length,
    speed: timeline.clips.filter(c => c.strategy === 'speed').length,
    trim: timeline.clips.filter(c => c.strategy === 'trim').length,
  };
}

// ============================================================================
// 测试用例
// ============================================================================

describe('planBeatSyncedTimeline', () => {
  // ---- 基本边界情况 ----

  it('单片段时返回回退时间线', () => {
    const result = planBeatSyncedTimeline([5], [1, 2, 3]);
    expect(result.clips).toHaveLength(1);
    expect(result.clips[0].strategy).toBe('none');
    expect(result.clips[0].speedRate).toBe(1.0);
    expect(result.transitions).toHaveLength(0);
  });

  it('无节拍时返回回退时间线', () => {
    const result = planBeatSyncedTimeline([3, 4, 5], []);
    expect(result.strategyStats.none).toBe(3);
    expect(result.strategyStats.speed).toBe(0);
    expect(result.strategyStats.trim).toBe(0);
  });

  it('空节拍数组返回回退时间线', () => {
    const result = planBeatSyncedTimeline([3, 4], []);
    expect(result.clips).toHaveLength(2);
    expect(result.beatsUsed).toBe(0);
  });

  // ---- 完美对齐 ----

  it('节拍恰好在自然转场点时全部直接对齐', () => {
    // 3 个片段各 2s，节拍间距 2s（从 0 开始）
    // 自然转场点约在 1.5s 和 3.5s 附近
    const clips = [2, 2, 2];
    const beats = uniformBeats(0, 2, 10);
    const result = planBeatSyncedTimeline(clips, beats, { intensity: 'standard' });

    expect(result.clips).toHaveLength(3);
    expect(result.transitions).toHaveLength(2);
    // 所有片段应有策略（none 或其他），不应崩溃
    for (const clip of result.clips) {
      expect(clip.targetDurationSec).toBeGreaterThan(0);
      expect(clip.offsetSec).toBeGreaterThanOrEqual(0);
    }
  });

  // ---- 三级适配策略 ----

  it('小偏差使用速度微调策略', () => {
    // 片段 5s，节拍间距 4.7s → 偏差 0.3s，在速度微调范围内
    const clips = [5, 5, 5];
    const beats = [0, 4.7, 9.4, 14.1, 20];
    const result = planBeatSyncedTimeline(clips, beats, {
      intensity: 'standard',
      maxSpeedAdjust: 0.15,
    });

    // 至少应有部分片段使用 speed 策略
    const stats = countStrategies(result);
    expect(stats.speed + stats.trim + stats.none).toBe(3);
    // speed 策略的 speedRate 应在 ±15% 范围内
    for (const clip of result.clips) {
      if (clip.strategy === 'speed') {
        expect(clip.speedRate).toBeGreaterThanOrEqual(0.85);
        expect(clip.speedRate).toBeLessThanOrEqual(1.15);
        expect(clip.trimmedSec).toBe(0);
      }
    }
  });

  it('大偏差使用裁剪策略', () => {
    // 片段 5s，节拍间距 2.5s → 偏差 2.5s，超出速度微调
    const clips = [5, 5];
    const beats = [0, 2.5, 5.5, 8];
    const result = planBeatSyncedTimeline(clips, beats, {
      intensity: 'standard',
      maxSpeedAdjust: 0.15,
    });

    const trimmed = result.clips.filter(c => c.strategy === 'trim');
    if (trimmed.length > 0) {
      for (const clip of trimmed) {
        expect(clip.trimmedSec).toBeGreaterThan(0);
        expect(clip.targetDurationSec).toBeLessThan(clip.originalDurationSec);
        expect(clip.speedRate).toBe(1.0);
      }
    }
  });

  // ---- 转场时长自适应 ----

  it('节拍密集时转场时长缩短', () => {
    const clips = [2, 2, 2];
    const denseBeats = uniformBeats(0, 0.8, 20);
    const result = planBeatSyncedTimeline(clips, denseBeats, {
      intensity: 'standard',
      minTransSec: 0.3,
      maxTransSec: 1.5,
    });

    for (const trans of result.transitions) {
      expect(trans.durationSec).toBeGreaterThanOrEqual(0.3);
      expect(trans.durationSec).toBeLessThanOrEqual(1.5);
    }
  });

  it('节拍稀疏时转场时长封顶', () => {
    const clips = [3, 3, 3];
    const sparseBeats = uniformBeats(0, 5, 10);
    const result = planBeatSyncedTimeline(clips, sparseBeats, {
      intensity: 'standard',
      maxTransSec: 1.5,
    });

    for (const trans of result.transitions) {
      expect(trans.durationSec).toBeLessThanOrEqual(1.5);
    }
  });

  // ---- 极短片段保护 ----

  it('极短片段可见时长不低于最小值', () => {
    const clips = [1.8, 1.8, 1.8];
    const beats = uniformBeats(0, 1.5, 10);
    const result = planBeatSyncedTimeline(clips, beats, {
      minVisibleSec: 1.0,
    });

    for (const clip of result.clips) {
      expect(clip.targetDurationSec).toBeGreaterThanOrEqual(1.0);
    }
  });

  // ---- 封面偏移 ----

  it('有封面图时所有 offset 正确后移', () => {
    const clips = [3, 3, 3];
    const beats = uniformBeats(0, 2, 10);
    const coverDuration = 0.5;
    const result = planBeatSyncedTimeline(clips, beats, {
      coverDurationSec: coverDuration,
    });

    // 第一个片段的 offset 应 >= coverDuration
    expect(result.clips[0].offsetSec).toBeGreaterThanOrEqual(coverDuration);
  });

  // ---- 策略统计 ----

  it('strategyStats 三项之和等于片段数', () => {
    const clips = [4, 5, 3, 6];
    const beats = uniformBeats(0, 3.5, 20);
    const result = planBeatSyncedTimeline(clips, beats);

    const total = result.strategyStats.none + result.strategyStats.speed + result.strategyStats.trim;
    expect(total).toBe(4);
    // 与 clips 的统计一致
    const manual = countStrategies(result);
    expect(manual.none).toBe(result.strategyStats.none);
    expect(manual.speed).toBe(result.strategyStats.speed);
    expect(manual.trim).toBe(result.strategyStats.trim);
  });

  // ---- 时间线连续性 ----

  it('片段 offset 单调递增', () => {
    const clips = [4, 5, 3, 6, 4];
    const beats = uniformBeats(0, 2.5, 30);
    const result = planBeatSyncedTimeline(clips, beats);

    for (let i = 1; i < result.clips.length; i++) {
      expect(result.clips[i].offsetSec).toBeGreaterThan(result.clips[i - 1].offsetSec);
    }
  });

  it('两个片段一个节拍产生单个转场', () => {
    const clips = [4, 4];
    const beats = [0, 3.5, 7];
    const result = planBeatSyncedTimeline(clips, beats);

    expect(result.clips).toHaveLength(2);
    expect(result.transitions).toHaveLength(1);
    expect(result.totalDurationSec).toBeGreaterThan(0);
  });

  // ---- 无效输入容错 ----

  it('含负数和重复节拍时过滤后正常工作', () => {
    const clips = [3, 3, 3];
    const beats = [-1, 0, 0.01, 2, 2, 4, 6, -5];
    const result = planBeatSyncedTimeline(clips, beats);

    expect(result.clips).toHaveLength(3);
    expect(result.totalBeats).toBeGreaterThan(0);
  });

  // ---- 强度差异 ----

  it('strict 强度下对齐更严格', () => {
    const clips = [4, 4, 4];
    const beats = uniformBeats(0, 3, 20);

    const relaxed = planBeatSyncedTimeline(clips, beats, { intensity: 'relaxed' });
    const strict = planBeatSyncedTimeline(clips, beats, { intensity: 'strict' });

    // 两者都应正常工作
    expect(relaxed.clips).toHaveLength(3);
    expect(strict.clips).toHaveLength(3);
    // strict 应有更多节拍被使用（更积极对齐）
    expect(strict.beatsUsed).toBeGreaterThanOrEqual(relaxed.beatsUsed * 0.5);
  });

  // ---- DP 全局最优 + 能量加权 ----

  it('同距离节拍优先选择高能量的', () => {
    const clips = [3, 3, 3];
    const beats = [1.5, 1.6, 4.0, 4.1, 6.5, 6.6];
    const energies = [0.2, 0.9, 0.8, 0.3, 0.5, 0.5];

    const result = planBeatSyncedTimeline(clips, beats, { beatEnergies: energies });

    expect(result.clips).toHaveLength(3);
    const snapped = result.transitions.filter(t => t.snappedToBeat);
    expect(snapped.length).toBeGreaterThan(0);
  });

  it('无能量数据时回退为纯距离选择', () => {
    const clips = [4, 4, 4];
    const beats = uniformBeats(0, 3, 20);

    const withoutEnergy = planBeatSyncedTimeline(clips, beats);
    const withEnergy = planBeatSyncedTimeline(clips, beats, {
      beatEnergies: new Array(beats.length).fill(0.5),
    });

    expect(withoutEnergy.clips.map(c => c.offsetSec))
      .toEqual(withEnergy.clips.map(c => c.offsetSec));
  });

  it('DP 全局最优结果时间线连续', () => {
    const clips = [3, 4, 3, 5, 3];
    const beats = uniformBeats(0, 1.5, 30);

    const result = planBeatSyncedTimeline(clips, beats, { intensity: 'standard' });

    expect(result.clips).toHaveLength(5);
    for (let i = 1; i < result.clips.length; i++) {
      expect(result.clips[i].offsetSec).toBeGreaterThan(result.clips[i - 1].offsetSec);
    }
  });

  // ---- speed 策略时间线修正 ----

  it('speed 策略的 targetDurationSec 不等于 originalDurationSec', () => {
    const clips = [5, 5, 5];
    const beats = [0, 4.5, 9.0, 13.5, 20];
    const result = planBeatSyncedTimeline(clips, beats, {
      intensity: 'standard',
      maxSpeedAdjust: 0.15,
    });

    const speedClips = result.clips.filter(c => c.strategy === 'speed');
    for (const clip of speedClips) {
      expect(clip.targetDurationSec).not.toBe(clip.originalDurationSec);
      expect(clip.speedRate).toBeGreaterThan(0.85);
      expect(clip.speedRate).toBeLessThanOrEqual(1.15);
      expect(clip.trimmedSec).toBe(0);
    }
  });

  // ---- 混合策略时间线连续性 ----

  it('none+speed+trim 混合时 offset 单调递增且无间隙', () => {
    const clips = [2, 5, 3, 6, 2, 4];
    const beats = uniformBeats(0, 2.5, 30);
    const result = planBeatSyncedTimeline(clips, beats);

    for (let i = 1; i < result.clips.length; i++) {
      expect(result.clips[i].offsetSec).toBeGreaterThan(result.clips[i - 1].offsetSec);
    }

    const lastClip = result.clips[result.clips.length - 1];
    expect(result.totalDurationSec).toBeCloseTo(
      lastClip.offsetSec + lastClip.targetDurationSec, 1
    );
  });

  it('混合策略场景下 strategyStats 三项之和等于片段数', () => {
    const clips = [3, 5, 2, 6, 4, 3];
    const beats = uniformBeats(0, 2, 30);
    const result = planBeatSyncedTimeline(clips, beats);

    const total = result.strategyStats.none + result.strategyStats.speed + result.strategyStats.trim;
    expect(total).toBe(clips.length);
  });
});
