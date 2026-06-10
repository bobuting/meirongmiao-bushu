/**
 * Prompt 版本指标 PG 仓库
 * 处理 nrm_prompt_version_metrics 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** Prompt 版本指标记录 */
export interface PromptVersionMetricsRecord {
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

export class PgPromptVersionMetricsRepository extends PgBaseRepository<PromptVersionMetricsRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("prompt_version_metrics"), client);
  }

  protected mapRow(row: Record<string, unknown>): PromptVersionMetricsRecord {
    return {
      id: row.id as string,
      promptCode: row.prompt_code as string,
      promptVersion: row.prompt_version as string,
      sampleCount: Number(row.sample_count),
      avgScore: Number(row.avg_score),
      minScore: Number(row.min_score),
      maxScore: Number(row.max_score),
      avgViewerScore: row.avg_viewer_score !== null ? Number(row.avg_viewer_score) : null,
      avgDirectorScore: row.avg_director_score !== null ? Number(row.avg_director_score) : null,
      avgStrategistScore: row.avg_strategist_score !== null ? Number(row.avg_strategist_score) : null,
      passRate: Number(row.pass_rate),
      commonWeaknesses: PgBaseRepository.fromJsonb<string[]>(row.common_weaknesses) ?? [],
      commonSuggestions: PgBaseRepository.fromJsonb<string[]>(row.common_suggestions) ?? [],
      computedAt: Number(row.computed_at),
    };
  }

  protected mapEntity(entity: PromptVersionMetricsRecord): Record<string, unknown> {
    return {
      id: entity.id,
      prompt_code: entity.promptCode,
      prompt_version: entity.promptVersion,
      sample_count: entity.sampleCount,
      avg_score: entity.avgScore,
      min_score: entity.minScore,
      max_score: entity.maxScore,
      avg_viewer_score: entity.avgViewerScore,
      avg_director_score: entity.avgDirectorScore,
      avg_strategist_score: entity.avgStrategistScore,
      pass_rate: entity.passRate,
      common_weaknesses: PgBaseRepository.toJsonb(entity.commonWeaknesses),
      common_suggestions: PgBaseRepository.toJsonb(entity.commonSuggestions),
      computed_at: entity.computedAt,
    };
  }

  /** UPSERT 指标记录（按 prompt_code + prompt_version 唯一约束） */
  async upsertMetrics(metrics: PromptVersionMetricsRecord): Promise<void> {
    const data = this.mapEntity(metrics);
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (
        id, prompt_code, prompt_version, sample_count, avg_score, min_score, max_score,
        avg_viewer_score, avg_director_score, avg_strategist_score, pass_rate,
        common_weaknesses, common_suggestions, computed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (prompt_code, prompt_version) DO UPDATE SET
        id = EXCLUDED.id,
        sample_count = EXCLUDED.sample_count,
        avg_score = EXCLUDED.avg_score,
        min_score = EXCLUDED.min_score,
        max_score = EXCLUDED.max_score,
        avg_viewer_score = EXCLUDED.avg_viewer_score,
        avg_director_score = EXCLUDED.avg_director_score,
        avg_strategist_score = EXCLUDED.avg_strategist_score,
        pass_rate = EXCLUDED.pass_rate,
        common_weaknesses = EXCLUDED.common_weaknesses,
        common_suggestions = EXCLUDED.common_suggestions,
        computed_at = EXCLUDED.computed_at`,
      [
        metrics.id, metrics.promptCode, metrics.promptVersion,
        metrics.sampleCount, metrics.avgScore, metrics.minScore, metrics.maxScore,
        metrics.avgViewerScore, metrics.avgDirectorScore, metrics.avgStrategistScore,
        metrics.passRate,
        JSON.stringify(metrics.commonWeaknesses),
        JSON.stringify(metrics.commonSuggestions),
        metrics.computedAt,
      ],
    );
  }

  /** 按 prompt_code 查询所有版本指标 */
  async findByPromptCode(promptCode: string): Promise<PromptVersionMetricsRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE prompt_code = $1
       ORDER BY computed_at DESC`,
      [promptCode],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 按 prompt_code + prompt_version 查询指标 */
  async findByPromptVersion(promptCode: string, promptVersion: string): Promise<PromptVersionMetricsRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE prompt_code = $1 AND prompt_version = $2`,
      [promptCode, promptVersion],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 查询最新的一条指标（按 prompt_code） */
  async findLatestByPromptCode(promptCode: string): Promise<PromptVersionMetricsRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE prompt_code = $1
       ORDER BY computed_at DESC
       LIMIT 1`,
      [promptCode],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 查询样本量足够（>= minSampleSize）的所有版本指标 */
  async findWithEnoughSamples(minSampleSize: number): Promise<PromptVersionMetricsRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName}
       WHERE sample_count >= $1`,
      [minSampleSize],
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}