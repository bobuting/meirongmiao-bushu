/**
 * 脚本质量评分 PG 仓库
 * 处理 nrm_script_quality_scores 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 脚本质量评分记录 */
export interface ScriptQualityScoreRecord {
  id: string;
  scriptDataId: string;
  strategy: string;
  score: number;
  viewerScore: number | null;
  directorScore: number | null;
  strategistScore: number | null;
  ruleBasedScore: number | null;
  scoringMethod: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  scoreSpread: number | null;
  createdAt: number;
}

export class PgScriptQualityScoreRepository extends PgBaseRepository<ScriptQualityScoreRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("script_quality_scores"), client);
  }

  protected mapRow(row: Record<string, unknown>): ScriptQualityScoreRecord {
    return {
      id: row.id as string,
      scriptDataId: row.script_data_id as string,
      strategy: row.strategy as string,
      score: Number(row.score),
      viewerScore: row.viewer_score !== null ? Number(row.viewer_score) : null,
      directorScore: row.director_score !== null ? Number(row.director_score) : null,
      strategistScore: row.strategist_score !== null ? Number(row.strategist_score) : null,
      ruleBasedScore: row.rule_based_score !== null ? Number(row.rule_based_score) : null,
      scoringMethod: row.scoring_method as string,
      strengths: PgBaseRepository.fromJsonb<string[]>(row.strengths) ?? [],
      weaknesses: PgBaseRepository.fromJsonb<string[]>(row.weaknesses) ?? [],
      suggestions: PgBaseRepository.fromJsonb<string[]>(row.suggestions) ?? [],
      scoreSpread: row.score_spread !== null ? Number(row.score_spread) : null,
      createdAt: Number(row.created_at),
    };
  }

  protected mapEntity(entity: ScriptQualityScoreRecord): Record<string, unknown> {
    return {
      id: entity.id,
      script_data_id: entity.scriptDataId,
      strategy: entity.strategy,
      score: entity.score,
      viewer_score: entity.viewerScore,
      director_score: entity.directorScore,
      strategist_score: entity.strategistScore,
      rule_based_score: entity.ruleBasedScore,
      scoring_method: entity.scoringMethod,
      strengths: PgBaseRepository.toJsonb(entity.strengths),
      weaknesses: PgBaseRepository.toJsonb(entity.weaknesses),
      suggestions: PgBaseRepository.toJsonb(entity.suggestions),
      score_spread: entity.scoreSpread,
      created_at: entity.createdAt,
    };
  }

  /** 插入完整评分记录（包含 prompt/项目等额外字段） */
  async insertFullScore(record: {
    id: string; scriptDataId: string; strategy: string; score: number;
    viewerScore: number | null; directorScore: number | null; strategistScore: number | null; ruleBasedScore: number | null;
    scoringMethod: string; strengths: string[]; weaknesses: string[]; suggestions: string[]; scoreSpread: number | null;
    promptCode: string | null; promptVersion: string | null; projectId: string | null; userId: string | null;
    llmModel: string | null; durationMs: number | null; createdAt: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, script_data_id, strategy, score,
        viewer_score, director_score, strategist_score, rule_based_score,
        scoring_method, strengths, weaknesses, suggestions, score_spread,
        prompt_code, prompt_version, project_id, user_id,
        llm_model, duration_ms, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        record.id, record.scriptDataId, record.strategy, record.score,
        record.viewerScore, record.directorScore, record.strategistScore, record.ruleBasedScore,
        record.scoringMethod, JSON.stringify(record.strengths), JSON.stringify(record.weaknesses),
        JSON.stringify(record.suggestions), record.scoreSpread,
        record.promptCode, record.promptVersion, record.projectId, record.userId,
        record.llmModel, record.durationMs, record.createdAt,
      ],
    );
  }

  /** 按脚本 ID 列表批量查询评分 */
  async findByScriptDataIds(scriptDataIds: string[]): Promise<ScriptQualityScoreRecord[]> {
    if (scriptDataIds.length === 0) return [];
    const result = await this.queryClient.query(
      `SELECT id, script_data_id, strategy, score, viewer_score, director_score, strategist_score,
              rule_based_score, scoring_method, strengths, weaknesses, suggestions, score_spread, created_at
       FROM ${this.tableName}
       WHERE script_data_id = ANY($1)`,
      [scriptDataIds],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 按脚本 ID 查询单条评分 */
  async findByScriptDataId(scriptDataId: string): Promise<ScriptQualityScoreRecord | null> {
    const result = await this.queryClient.query(
      `SELECT id, script_data_id, strategy, score, viewer_score, director_score, strategist_score,
              rule_based_score, scoring_method, strengths, weaknesses, suggestions, score_spread, created_at
       FROM ${this.tableName}
       WHERE script_data_id = $1
       LIMIT 1`,
      [scriptDataId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 按策略统计平均分 */
  async statsByStrategy(): Promise<{ strategy: string; avgScore: number; count: number }[]> {
    const result = await this.queryClient.query(
      `SELECT strategy, ROUND(AVG(score)::numeric, 2) as avg_score, COUNT(*) as count
       FROM ${this.tableName}
       GROUP BY strategy
       ORDER BY avg_score DESC`,
    );
    return result.rows.map((row) => ({
      strategy: row.strategy as string,
      avgScore: Number(row.avg_score),
      count: Number(row.count),
    }));
  }

  /** 总体统计 */
  async overallStats(): Promise<{ totalScripts: number; passedScripts: number; avgScore: number }> {
    const result = await this.queryClient.query(
      `SELECT
         COUNT(*) as total_scripts,
         COUNT(*) FILTER (WHERE score >= 70) as passed_scripts,
         ROUND(AVG(score)::numeric, 2) as avg_score
       FROM ${this.tableName}`,
    );
    const row = result.rows[0];
    return {
      totalScripts: Number(row?.total_scripts ?? 0),
      passedScripts: Number(row?.passed_scripts ?? 0),
      avgScore: Number(row?.avg_score ?? 0),
    };
  }

  /** 按策略统计平均分（带时间范围过滤） */
  async statsByStrategySince(sinceMs: number): Promise<{ strategy: string; avgScore: number; count: number }[]> {
    const result = await this.queryClient.query(
      `SELECT strategy, ROUND(AVG(score)::numeric, 2) as avg_score, COUNT(*) as count
       FROM ${this.tableName}
       WHERE created_at >= $1
       GROUP BY strategy
       ORDER BY avg_score DESC`,
      [sinceMs],
    );
    return result.rows.map((row) => ({
      strategy: row.strategy as string,
      avgScore: Number(row.avg_score),
      count: Number(row.count),
    }));
  }

  /** 按 prompt_code + prompt_version 聚合评分统计 */
  async aggregateByPromptVersion(
    promptCode: string,
    promptVersion: string,
    passThreshold: number,
  ): Promise<{
    sampleCount: number;
    avgScore: number;
    minScore: number;
    maxScore: number;
    avgViewerScore: number | null;
    avgDirectorScore: number | null;
    avgStrategistScore: number | null;
    passRate: number;
  } | null> {
    const result = await this.queryClient.query(
      `SELECT
         COUNT(*) as sample_count,
         COALESCE(ROUND(AVG(score)::numeric, 2), 0) as avg_score,
         COALESCE(MIN(score), 0) as min_score,
         COALESCE(MAX(score), 0) as max_score,
         ROUND(AVG(viewer_score)::numeric, 2) as avg_viewer_score,
         ROUND(AVG(director_score)::numeric, 2) as avg_director_score,
         ROUND(AVG(strategist_score)::numeric, 2) as avg_strategist_score,
         ROUND(AVG(CASE WHEN score >= $3 THEN 1 ELSE 0 END)::numeric, 4) as pass_rate
       FROM ${this.tableName}
       WHERE prompt_code = $1 AND prompt_version = $2`,
      [promptCode, promptVersion, passThreshold],
    );
    const row = result.rows[0];
    if (!row) return null;
    const sampleCount = Number(row.sample_count);
    if (sampleCount === 0) return null;
    return {
      sampleCount,
      avgScore: Number(row.avg_score),
      minScore: Number(row.min_score),
      maxScore: Number(row.max_score),
      avgViewerScore: row.avg_viewer_score !== null ? Number(row.avg_viewer_score) : null,
      avgDirectorScore: row.avg_director_score !== null ? Number(row.avg_director_score) : null,
      avgStrategistScore: row.avg_strategist_score !== null ? Number(row.avg_strategist_score) : null,
      passRate: Number(row.pass_rate),
    };
  }

  /** 从 JSONB 数组列中提取 Top N 高频项 */
  async extractTopItems(
    promptCode: string,
    promptVersion: string,
    column: "weaknesses" | "suggestions",
    topN: number,
  ): Promise<string[]> {
    const result = await this.queryClient.query(
      `SELECT elem, COUNT(*) as freq
       FROM ${this.tableName}, jsonb_array_elements_text(${column}) as elem
       WHERE prompt_code = $1 AND prompt_version = $2 AND ${column} IS NOT NULL
       GROUP BY elem
       ORDER BY freq DESC
       LIMIT $3`,
      [promptCode, promptVersion, topN],
    );
    return result.rows.map((r) => r.elem as string);
  }

  /** 获取所有有评分的 distinct prompt_code + prompt_version 组合 */
  async getDistinctPromptVersions(): Promise<{ promptCode: string; promptVersion: string }[]> {
    const result = await this.queryClient.query(
      `SELECT DISTINCT prompt_code, prompt_version
       FROM ${this.tableName}
       WHERE prompt_code IS NOT NULL AND prompt_version IS NOT NULL`,
    );
    return result.rows.map((row) => ({
      promptCode: row.prompt_code as string,
      promptVersion: row.prompt_version as string,
    }));
  }

  /** 查询脚本 ID 列表的最新评分（按 created_at DESC） */
  async findLatestByScriptIds(scriptIds: string[]): Promise<Map<string, ScriptQualityScoreRecord>> {
    if (scriptIds.length === 0) return new Map();
    const result = await this.queryClient.query(
      `SELECT id, script_data_id, strategy, score, viewer_score, director_score, strategist_score,
              rule_based_score, scoring_method, strengths, weaknesses, suggestions, score_spread, created_at
       FROM ${this.tableName}
       WHERE script_data_id = ANY($1)
       ORDER BY created_at DESC`,
      [scriptIds],
    );
    const scoreMap = new Map<string, ScriptQualityScoreRecord>();
    for (const row of result.rows) {
      const record = this.mapRow(row);
      // 只保留每个 script 的第一条（最新的评分）
      if (!scoreMap.has(record.scriptDataId)) {
        scoreMap.set(record.scriptDataId, record);
      }
    }
    return scoreMap;
  }

  /** 按策略聚合高频弱项（从最近 100 条评分中提取） */
  async aggregateWeaknessesByStrategy(strategy: string, limit: number = 100): Promise<string[]> {
    const result = await this.queryClient.query(
      `SELECT jsonb_array_elements_text(weaknesses) AS weakness
       FROM ${this.tableName}
       WHERE strategy = $1 AND weaknesses IS NOT NULL
       ORDER BY created_at DESC
       LIMIT $2`,
      [strategy, limit],
    );
    // 去重并取前 5 个
    const unique = [...new Set(result.rows.map((r) => r.weakness as string))];
    return unique.slice(0, 5);
  }

  /** 按策略聚合高频建议（从最近 100 条评分中提取） */
  async aggregateSuggestionsByStrategy(strategy: string, limit: number = 100): Promise<string[]> {
    const result = await this.queryClient.query(
      `SELECT jsonb_array_elements_text(suggestions) AS suggestion
       FROM ${this.tableName}
       WHERE strategy = $1 AND suggestions IS NOT NULL
       ORDER BY created_at DESC
       LIMIT $2`,
      [strategy, limit],
    );
    // 去重并取前 5 个
    const unique = [...new Set(result.rows.map((r) => r.suggestion as string))];
    return unique.slice(0, 5);
  }

  /** 查询已评分的脚本 ID 集合（用于排重） */
  async findScoredScriptIds(scriptDataIds: string[]): Promise<Set<string>> {
    if (scriptDataIds.length === 0) return new Set();
    const result = await this.queryClient.query<{ script_data_id: string }>(
      `SELECT script_data_id FROM ${this.tableName} WHERE script_data_id = ANY($1)`,
      [scriptDataIds],
    );
    return new Set(result.rows.map((r) => r.script_data_id));
  }

  /** 检测评分下降趋势（比较最近窗口 vs 前一个窗口的平均分） */
  async findDecliningTrend(
    promptCode: string,
    promptVersion: string,
    recentSinceMs: number,
    previousSinceMs: number,
  ): Promise<{ recentAvg: number; previousAvg: number } | null> {
    const result = await this.queryClient.query<{
      recent_avg: string | null;
      previous_avg: string | null;
    }>(
      `SELECT
         AVG(CASE WHEN created_at >= $3 THEN score ELSE NULL END) as recent_avg,
         AVG(CASE WHEN created_at < $3 AND created_at >= $4 THEN score ELSE NULL END) as previous_avg
       FROM ${this.tableName}
       WHERE prompt_code = $1 AND prompt_version = $2`,
      [promptCode, promptVersion, recentSinceMs, previousSinceMs],
    );

    const row = result.rows[0];
    if (!row) return null;
    if (row.recent_avg === null || row.previous_avg === null) return null;

    const recentAvg = Number(row.recent_avg);
    const previousAvg = Number(row.previous_avg);
    if (previousAvg === 0) return null;

    return { recentAvg, previousAvg };
  }

  /** 查询最高频弱项及其频率 */
  async findTopWeaknessFrequency(
    promptCode: string,
    promptVersion: string,
  ): Promise<{ weakness: string; frequency: number; occurrenceCount: number; totalScripts: number } | null> {
    const result = await this.queryClient.query<{
      elem: string;
      freq: string;
      total: string;
    }>(
      `SELECT
         elem,
         COUNT(*) as freq,
         (SELECT COUNT(*) FROM ${this.tableName}
          WHERE prompt_code = $1 AND prompt_version = $2 AND weaknesses IS NOT NULL) as total
       FROM ${this.tableName}, jsonb_array_elements_text(weaknesses) as elem
       WHERE prompt_code = $1 AND prompt_version = $2 AND weaknesses IS NOT NULL
       GROUP BY elem
       ORDER BY freq DESC
       LIMIT 1`,
      [promptCode, promptVersion],
    );

    if (result.rows.length === 0) return null;
    const r = result.rows[0]!;
    const total = Number(r.total);
    const freq = Number(r.freq);
    if (total === 0) return null;

    return {
      weakness: r.elem,
      frequency: freq / total,
      occurrenceCount: freq,
      totalScripts: total,
    };
  }

  /** 按 prompt 版本查询平均分和数量 */
  async statsByPromptVersion(
    promptCode: string,
    promptVersion: string,
  ): Promise<{ avgScore: number; count: number }[]> {
    const result = await this.queryClient.query(
      `SELECT ROUND(AVG(score)::numeric, 2) as avg_score, COUNT(*) as count
       FROM ${this.tableName} WHERE prompt_code = $1 AND prompt_version = $2`,
      [promptCode, promptVersion],
    );
    return result.rows.map((r: Record<string, unknown>) => ({
      avgScore: Number(r.avg_score),
      count: Number(r.count),
    }));
  }
}
