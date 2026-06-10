/**
 * Prompt 版本效果聚合器
 *
 * 从 nrm_script_quality_scores 聚合统计指标，写入 nrm_prompt_version_metrics。
 * 支持：平均分、最高/最低分、各视角平均分、通过率、高频弱项/建议。
 */

import { randomUUID } from "node:crypto";
import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import type { PromptVersionMetricsRecord } from "../../repositories/pg/prompt-version-metrics-pg-repository.js";
import { getLogger } from "../../core/logger/index.js";

const log = getLogger("metrics-aggregator");

/** 聚合结果（对外接口，保持兼容） */
export interface PromptVersionMetrics {
  id: string;
  promptCode: string;
  promptVersion: string;
  sampleCount: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
  avgViewerScore: number | null;
  avgDirectorScore: number | null;
  avgStrategistScore: number | null;
  passRate: number;
  commonWeaknesses: string[];
  commonSuggestions: string[];
  computedAt: number;
}

/** 质量通过阈值（score >= 70 算通过） */
const PASS_THRESHOLD = 70;

/**
 * 重新计算指定 prompt_code + prompt_version 的聚合指标
 */
export async function recomputeMetrics(
  repos: PgRepositoryCollection,
  promptCode: string,
  promptVersion: string,
): Promise<PromptVersionMetrics | null> {
  // 聚合评分统计
  const stats = await repos.scriptQualityScores.aggregateByPromptVersion(
    promptCode,
    promptVersion,
    PASS_THRESHOLD,
  );

  if (!stats) return null;

  // 提取高频弱项和建议
  const commonWeaknesses = await repos.scriptQualityScores.extractTopItems(
    promptCode,
    promptVersion,
    "weaknesses",
    5,
  );
  const commonSuggestions = await repos.scriptQualityScores.extractTopItems(
    promptCode,
    promptVersion,
    "suggestions",
    5,
  );

  const metrics: PromptVersionMetricsRecord = {
    id: randomUUID(),
    promptCode,
    promptVersion,
    sampleCount: stats.sampleCount,
    avgScore: stats.avgScore,
    minScore: stats.minScore,
    maxScore: stats.maxScore,
    avgViewerScore: stats.avgViewerScore,
    avgDirectorScore: stats.avgDirectorScore,
    avgStrategistScore: stats.avgStrategistScore,
    passRate: stats.passRate,
    commonWeaknesses,
    commonSuggestions,
    computedAt: Date.now(),
  };

  // UPSERT 到 metrics 表
  await repos.promptVersionMetrics.upsertMetrics(metrics);

  // 返回对外接口格式
  return metrics;
}

/**
 * 重新计算所有有评分数据的 prompt_code + prompt_version
 */
export async function recomputeAllMetrics(repos: PgRepositoryCollection): Promise<number> {
  // 查询所有有评分的 prompt_code + prompt_version 组合
  const versions = await repos.scriptQualityScores.getDistinctPromptVersions();

  let count = 0;
  for (const { promptCode, promptVersion } of versions) {
    try {
      await recomputeMetrics(repos, promptCode, promptVersion);
      count++;
    } catch (err) {
      log.error(
        { err, promptCode, promptVersion },
        `MetricsAggregator failed for ${promptCode}@${promptVersion}`,
      );
    }
  }
  return count;
}

/**
 * 查询指定 prompt code 的所有版本指标
 */
export async function getMetricsByPromptCode(
  repos: PgRepositoryCollection,
  promptCode: string,
): Promise<PromptVersionMetrics[]> {
  return repos.promptVersionMetrics.findByPromptCode(promptCode);
}

/**
 * 查询指定 prompt 版本的指标
 */
export async function getMetricsByVersion(
  repos: PgRepositoryCollection,
  promptCode: string,
  promptVersion: string,
): Promise<PromptVersionMetrics | null> {
  return repos.promptVersionMetrics.findByPromptVersion(promptCode, promptVersion);
}

/**
 * 各策略平均评分概览
 */
export async function getStrategyOverview(
  repos: PgRepositoryCollection,
  sinceMs?: number,
): Promise<Array<{ strategy: string; avgScore: number; count: number }>> {
  const since = sinceMs ?? 0;
  return repos.scriptQualityScores.statsByStrategySince(since);
}