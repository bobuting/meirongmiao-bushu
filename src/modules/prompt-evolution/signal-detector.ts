/**
 * Prompt 进化信号检测器
 *
 * 从 nrm_prompt_version_metrics 和 nrm_script_quality_scores 中
 * 检测质量下降信号，触发 Prompt 改进提案。
 */

import type { PgRepositoryCollection } from "../../repositories/pg/index.js";

/** 检测到的进化信号 */
export interface EvolutionSignal {
  promptCode: string;
  promptVersion: string;
  signalType: EvolutionSignalType;
  signalDetails: Record<string, unknown>;
  currentAvgScore: number;
  sampleCount: number;
}

/** 信号类型 */
export type EvolutionSignalType =
  | "low_avg_score"
  | "declining_trend"
  | "high_weakness_frequency";

/** 信号检测配置 */
export interface SignalDetectorConfig {
  minSampleSize: number;
  lowScoreThreshold: number;
  declineThresholdPercent: number;
  weaknessFrequencyThreshold: number;
  declineWindowDays: number;
}

export const DEFAULT_SIGNAL_DETECTOR_CONFIG: SignalDetectorConfig = {
  minSampleSize: 20,
  lowScoreThreshold: 60,
  declineThresholdPercent: 15,
  weaknessFrequencyThreshold: 0.4,
  declineWindowDays: 7,
};

/**
 * 检测所有 prompt 版本的进化信号
 */
export async function detectEvolutionSignals(
  repos: PgRepositoryCollection,
  config: SignalDetectorConfig = DEFAULT_SIGNAL_DETECTOR_CONFIG,
): Promise<EvolutionSignal[]> {
  const signals: EvolutionSignal[] = [];

  // 获取所有有足够样本的 prompt 版本指标
  const metrics = await repos.promptVersionMetrics.findWithEnoughSamples(config.minSampleSize);

  for (const m of metrics) {
    // 1. 低分信号
    if (m.avgScore < config.lowScoreThreshold) {
      signals.push({
        promptCode: m.promptCode,
        promptVersion: m.promptVersion,
        signalType: "low_avg_score",
        signalDetails: {
          avgScore: m.avgScore,
          threshold: config.lowScoreThreshold,
          passRate: m.passRate,
          sampleCount: m.sampleCount,
        },
        currentAvgScore: m.avgScore,
        sampleCount: m.sampleCount,
      });
      continue;
    }

    // 2. 下降趋势信号
    const decline = await detectDecliningTrend(
      repos, m.promptCode, m.promptVersion, config,
    );
    if (decline) {
      signals.push(decline);
      continue;
    }

    // 3. 高频弱项信号
    const weakness = await detectHighFrequencyWeakness(
      repos, m.promptCode, m.promptVersion, config,
    );
    if (weakness) {
      signals.push(weakness);
    }
  }

  return signals;
}

/** 检测评分下降趋势 */
async function detectDecliningTrend(
  repos: PgRepositoryCollection,
  promptCode: string,
  promptVersion: string,
  config: SignalDetectorConfig,
): Promise<EvolutionSignal | null> {
  const windowMs = config.declineWindowDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const trend = await repos.scriptQualityScores.findDecliningTrend(
    promptCode, promptVersion, now - windowMs, now - 2 * windowMs,
  );

  if (!trend) return null;

  const declinePercent = ((trend.previousAvg - trend.recentAvg) / trend.previousAvg) * 100;
  if (declinePercent >= config.declineThresholdPercent) {
    return {
      promptCode,
      promptVersion,
      signalType: "declining_trend",
      signalDetails: {
        recentAvg: trend.recentAvg,
        previousAvg: trend.previousAvg,
        declinePercent: Math.round(declinePercent * 100) / 100,
        windowDays: config.declineWindowDays,
      },
      currentAvgScore: trend.recentAvg,
      sampleCount: 0,
    };
  }

  return null;
}

/** 检测高频弱项 */
async function detectHighFrequencyWeakness(
  repos: PgRepositoryCollection,
  promptCode: string,
  promptVersion: string,
  config: SignalDetectorConfig,
): Promise<EvolutionSignal | null> {
  const result = await repos.scriptQualityScores.findTopWeaknessFrequency(
    promptCode, promptVersion,
  );

  if (!result) return null;

  if (result.frequency >= config.weaknessFrequencyThreshold) {
    return {
      promptCode,
      promptVersion,
      signalType: "high_weakness_frequency",
      signalDetails: {
        topWeakness: result.weakness,
        frequency: Math.round(result.frequency * 100) / 100,
        occurrenceCount: result.occurrenceCount,
        totalScripts: result.totalScripts,
        threshold: config.weaknessFrequencyThreshold,
      },
      currentAvgScore: 0,
      sampleCount: result.totalScripts,
    };
  }

  return null;
}
