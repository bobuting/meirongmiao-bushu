/**
 * 积分冻结记录 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { CreditFreeze } from "../../contracts/types.js";
import type { ICreditFreezeRepository } from "../../contracts/repository-ports/credit-repository.js";
import { nrm } from "./base-pg-repository.js";

export class PgCreditFreezeRepository implements ICreditFreezeRepository {
  private readonly table = nrm("credit_freezes");

  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  /** 事务时用 client，否则用 pool */
  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  async findById(id: string): Promise<CreditFreeze | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findByUserId(userId: string, status?: CreditFreeze["status"]): Promise<CreditFreeze[]> {
    const query = status
      ? `SELECT * FROM ${this.table} WHERE user_id = $1 AND status = $2 ORDER BY frozen_at DESC`
      : `SELECT * FROM ${this.table} WHERE user_id = $1 ORDER BY frozen_at DESC`;
    const params = status ? [userId, status] : [userId];
    const result = await this.queryClient.query(query, params);
    return result.rows.map(this.mapRow);
  }

  async findExpired(): Promise<CreditFreeze[]> {
    const now = Date.now();
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE status = 'frozen' AND expires_at < $1`,
      [now],
    );
    return result.rows.map(this.mapRow);
  }

  async insert(freeze: CreditFreeze): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.table} (id, user_id, amount, frozen_at, expires_at, status, route_key, operation, project_id, actual_cost, refunded_amount, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        freeze.id,
        freeze.userId,
        freeze.amount,
        freeze.frozenAt,
        freeze.expiresAt,
        freeze.status,
        freeze.routeKey ?? null,
        freeze.operation ?? null,
        freeze.projectId ?? null,
        freeze.actualCost ?? null,
        freeze.refundedAmount ?? null,
        freeze.metadata ?? null,
        freeze.createdAt,
        freeze.updatedAt,
      ],
    );
  }

  async update(id: string, updates: Partial<CreditFreeze>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.actualCost !== undefined) {
      fields.push(`actual_cost = $${paramIndex++}`);
      values.push(updates.actualCost);
    }
    if (updates.refundedAmount !== undefined) {
      fields.push(`refunded_amount = $${paramIndex++}`);
      values.push(updates.refundedAmount);
    }
    if (updates.updatedAt !== undefined) {
      fields.push(`updated_at = $${paramIndex++}`);
      values.push(updates.updatedAt);
    }

    if (fields.length === 0) return;

    values.push(id);
    await this.queryClient.query(
      `UPDATE ${this.table} SET ${fields.join(", ")} WHERE id = $${paramIndex}`,
      values,
    );
  }

  private mapRow(row: Record<string, unknown>): CreditFreeze {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      amount: row.amount as number,
      frozenAt: row.frozen_at as number,
      expiresAt: row.expires_at as number,
      status: row.status as CreditFreeze["status"],
      routeKey: row.route_key as string | undefined,
      operation: row.operation as string | undefined,
      projectId: row.project_id as string | undefined,
      actualCost: row.actual_cost as number | undefined,
      refundedAmount: row.refunded_amount as number | undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }
}