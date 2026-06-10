/**
 * 脚本质量评分数据仓库
 */

import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import type { QualityScoreRecord, ScoringStrategy } from "./scoring-types.js";

/** 插入一条评分记录 */
export async function insertScore(repos: PgRepositoryCollection, record: QualityScoreRecord): Promise<void> {
  await repos.scriptQualityScores.insertFullScore(record);
}

/** 查询脚本是否已评分 */
export async function getScoreByScriptId(repos: PgRepositoryCollection, scriptDataId: string): Promise<QualityScoreRecord | null> {
  const record = await repos.scriptQualityScores.findByScriptDataId(scriptDataId);
  if (!record) return null;
  return mapRepoRecord(record);
}

/** 按策略查询平均分 */
export async function getAverageScoreByStrategy(
  repos: PgRepositoryCollection,
  sinceMs?: number,
): Promise<Array<{ strategy: ScoringStrategy; avgScore: number; count: number }>> {
  const rows = sinceMs
    ? await repos.scriptQualityScores.statsByStrategySince(sinceMs)
    : await repos.scriptQualityScores.statsByStrategy();
  return rows.map((r) => ({
    strategy: r.strategy as ScoringStrategy,
    avgScore: r.avgScore,
    count: r.count,
  }));
}

/** 按 prompt 版本查询平均分 */
export async function getScoresByPromptVersion(
  repos: PgRepositoryCollection,
  promptCode: string,
  promptVersion: string,
): Promise<Array<{ avgScore: number; count: number }>> {
  return repos.scriptQualityScores.statsByPromptVersion(promptCode, promptVersion);
}

/** 将 repo 层 ScriptQualityScoreRecord 映射为模块层 QualityScoreRecord */
function mapRepoRecord(record: import("../../repositories/pg/script-quality-score-pg-repository.js").ScriptQualityScoreRecord): QualityScoreRecord {
  return {
    id: record.id,
    scriptDataId: record.scriptDataId,
    strategy: record.strategy as ScoringStrategy,
    score: record.score,
    viewerScore: record.viewerScore,
    directorScore: record.directorScore,
    strategistScore: record.strategistScore,
    ruleBasedScore: record.ruleBasedScore,
    scoringMethod: record.scoringMethod as QualityScoreRecord["scoringMethod"],
    strengths: record.strengths,
    weaknesses: record.weaknesses,
    suggestions: record.suggestions,
    scoreSpread: record.scoreSpread,
    promptCode: null,
    promptVersion: null,
    projectId: null,
    userId: null,
    llmModel: null,
    durationMs: null,
    createdAt: record.createdAt,
  };
}
