/**
 * Prompt 进化提案 PG 仓库
 * 处理 nrm_prompt_evolution_proposals 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 提案状态 */
export type ProposalStatus = "draft" | "ab_testing" | "published" | "rejected";

/** 提案记录 */
export interface PromptEvolutionProposalRecord {
  id: string;
  promptCode: string;
  sourceVersion: string;
  proposedContent: string;
  rationale: string;
  signalType: string;
  signalDetails: Record<string, unknown> | null;
  status: ProposalStatus;
  reviewedBy: string | null;
  reviewNotes: string | null;
  abTestVersion: string | null;
  reviewedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export class PgPromptEvolutionProposalRepository extends PgBaseRepository<PromptEvolutionProposalRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("prompt_evolution_proposals"), client);
  }

  protected mapRow(row: Record<string, unknown>): PromptEvolutionProposalRecord {
    return {
      id: row.id as string,
      promptCode: row.prompt_code as string,
      sourceVersion: row.source_version as string,
      proposedContent: row.proposed_content as string,
      rationale: row.rationale as string,
      signalType: row.signal_type as string,
      signalDetails: PgBaseRepository.fromJsonb<Record<string, unknown>>(row.signal_details),
      status: row.status as ProposalStatus,
      reviewedBy: row.reviewed_by as string | null,
      reviewNotes: row.review_notes as string | null,
      abTestVersion: row.ab_test_version as string | null,
      reviewedAt: row.reviewed_at as number | null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(entity: PromptEvolutionProposalRecord): Record<string, unknown> {
    return {
      id: entity.id,
      prompt_code: entity.promptCode,
      source_version: entity.sourceVersion,
      proposed_content: entity.proposedContent,
      rationale: entity.rationale,
      signal_type: entity.signalType,
      signal_details: PgBaseRepository.toJsonb(entity.signalDetails),
      status: entity.status,
      reviewed_by: entity.reviewedBy,
      review_notes: entity.reviewNotes,
      ab_test_version: entity.abTestVersion,
      reviewed_at: entity.reviewedAt,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  /** 查询指定 prompt_codes 中已存在 draft/ab_testing 提案的 */
  async findExistingByPromptCodes(
    promptCodes: string[],
  ): Promise<Array<{ promptCode: string; sourceVersion: string; signalType: string }>> {
    if (promptCodes.length === 0) return [];

    const result = await this.queryClient.query<{
      prompt_code: string;
      source_version: string;
      signal_type: string;
    }>(
      `SELECT DISTINCT prompt_code, source_version, signal_type
       FROM ${this.tableName}
       WHERE prompt_code = ANY($1) AND status IN ('draft', 'ab_testing')`,
      [promptCodes],
    );

    return result.rows.map((row) => ({
      promptCode: row.prompt_code,
      sourceVersion: row.source_version,
      signalType: row.signal_type,
    }));
  }

  /** 插入提案 */
  async insertProposal(params: {
    id: string;
    promptCode: string;
    sourceVersion: string;
    proposedContent: string;
    rationale: string;
    signalType: string;
    signalDetails: Record<string, unknown>;
    createdAt: number;
  }): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName}
       (id, prompt_code, source_version, proposed_content, rationale,
        signal_type, signal_details, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$8)`,
      [
        params.id,
        params.promptCode,
        params.sourceVersion,
        params.proposedContent,
        params.rationale,
        params.signalType,
        JSON.stringify(params.signalDetails),
        params.createdAt,
      ],
    );
  }

  /** 查询提案列表 */
  async listProposals(
    status?: ProposalStatus,
    limit = 50,
  ): Promise<PromptEvolutionProposalRecord[]> {
    if (status) {
      const result = await this.queryClient.query(
        `SELECT * FROM ${this.tableName} WHERE status = $1 ORDER BY created_at DESC LIMIT $2`,
        [status, limit],
      );
      return result.rows.map((row) => this.mapRow(row));
    }

    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 更新提案状态 */
  async updateProposalStatus(
    id: string,
    status: ProposalStatus,
    updates: {
      reviewedBy?: string;
      reviewNotes?: string;
      abTestVersion?: string;
    } = {},
    now?: number,
  ): Promise<boolean> {
    const timestamp = now ?? Date.now();
    const fields: string[] = ["status = $2", "updated_at = $3"];
    const values: unknown[] = [id, status, timestamp];
    let paramIdx = 4;

    if (updates.reviewedBy !== undefined) {
      fields.push(`reviewed_by = $${paramIdx}`);
      values.push(updates.reviewedBy);
      paramIdx++;
    }
    if (updates.reviewNotes !== undefined) {
      fields.push(`review_notes = $${paramIdx}`);
      values.push(updates.reviewNotes);
      paramIdx++;
    }
    if (updates.abTestVersion !== undefined) {
      fields.push(`ab_test_version = $${paramIdx}`);
      values.push(updates.abTestVersion);
      paramIdx++;
    }
    if (status === "published" || status === "rejected") {
      fields.push(`reviewed_at = $${paramIdx}`);
      values.push(timestamp);
      paramIdx++;
    }

    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${fields.join(", ")} WHERE id = $1`,
      values,
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 按 ID 查询单条提案（原始行） */
  async findRawById(id: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? result.rows[0]! : null;
  }
}