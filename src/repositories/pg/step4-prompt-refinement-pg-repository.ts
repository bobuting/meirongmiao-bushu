/**
 * Step4 视频提示词优化记录 PG 仓库
 *
 * 表名: nrm_step4_prompt_refinements
 * 用途: 记录每次重试时的提示词优化过程，用于后续分析优化 shot_prompt_engineer
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

export interface Step4PromptRefinementRecord {
  id: string;
  projectId: string;
  sceneIndex: number;
  /** 对应 clip_generation，区分不同重试周期 */
  generation: number;
  originalPrompt: string;
  refinedPrompt: string;
  /** 上次失败原因（可能为空，用户主动重试时无 errorMessage） */
  errorMessage: string | null;
  /** LLM 对失败原因的分析 */
  analysis: string | null;
  /** 具体修改了哪些方面 */
  changesSummary: string | null;
  /** 使用的 RouteKey */
  routeKey: string | null;
  createdAt: number;
}

export interface CreatePromptRefinementInput {
  projectId: string;
  sceneIndex: number;
  generation: number;
  originalPrompt: string;
  refinedPrompt: string;
  errorMessage?: string | null;
  analysis?: string | null;
  changesSummary?: string | null;
  routeKey?: string | null;
}

export class PgStep4PromptRefinementRepository {
  private readonly table = nrm("step4_prompt_refinements");

  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  async create(input: CreatePromptRefinementInput): Promise<Step4PromptRefinementRecord> {
    const now = Date.now();
    const result = await this.queryClient.query(
      `INSERT INTO ${this.table} (
        project_id, scene_index, generation,
        original_prompt, refined_prompt,
        error_message, analysis, changes_summary,
        route_key, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        input.projectId,
        input.sceneIndex,
        input.generation,
        input.originalPrompt,
        input.refinedPrompt,
        input.errorMessage ?? null,
        input.analysis ?? null,
        input.changesSummary ?? null,
        input.routeKey ?? null,
        now,
      ],
    );
    return this.mapRow(result.rows[0]!);
  }

  /** 查询某个分镜的优化记录（按时间倒序） */
  async findByProjectAndScene(
    projectId: string,
    sceneIndex: number,
    limit = 10,
  ): Promise<Step4PromptRefinementRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table}
       WHERE project_id = $1 AND scene_index = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [projectId, sceneIndex, limit],
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapRow(row));
  }

  private mapRow(row: Record<string, unknown>): Step4PromptRefinementRecord {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      sceneIndex: row.scene_index as number,
      generation: row.generation as number,
      originalPrompt: row.original_prompt as string,
      refinedPrompt: row.refined_prompt as string,
      errorMessage: (row.error_message as string) ?? null,
      analysis: (row.analysis as string) ?? null,
      changesSummary: (row.changes_summary as string) ?? null,
      routeKey: (row.route_key as string) ?? null,
      createdAt: row.created_at as number,
    };
  }
}
