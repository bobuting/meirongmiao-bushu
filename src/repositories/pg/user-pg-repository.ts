/**
 * 用户 + 会话 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { User, Session } from "../../contracts/types.js";
import type { IUserRepository, ISessionRepository } from "../../contracts/repository-ports/user-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import { PgSoftDeletableRepository } from "./soft-deletable-repository.js";

// ============================================================================
// 用户
// ============================================================================

export class PgUserRepository extends PgSoftDeletableRepository<User> implements IUserRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("users"), client);
  }

  protected mapRow(row: Record<string, unknown>): User {
    return {
      id: row.id as string,
      email: row.email as string,
      passwordHash: row.password_hash as string,
      role: row.role as User["role"],
      createdAt: row.created_at as number,
      failedAttempts: (row.failed_attempts as number) ?? 0,
      lockUntil: (row.lock_until as number) ?? null,
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
      companyName: row.company_name as string | undefined,
    };
  }

  protected mapEntity(u: User): Record<string, unknown> {
    return {
      id: u.id,
      email: u.email,
      password_hash: u.passwordHash,
      role: u.role,
      created_at: u.createdAt,
      failed_attempts: u.failedAttempts,
      lock_until: u.lockUntil,
      deleted_at: u.deletedAt ?? null,
      deleted_by: u.deletedBy ?? null,
      company_name: u.companyName ?? null,
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOneWhere({ email: email.toLowerCase() });
  }

  /** 获取所有不重复的公司名称（用于下拉筛选） */
  async getDistinctCompanies(): Promise<string[]> {
    const result = await this.queryClient.query<{ company_name: string }>(
      `SELECT DISTINCT company_name
       FROM ${this.tableName}
       WHERE company_name IS NOT NULL AND company_name != ''
       ORDER BY company_name`,
    );
    return result.rows.map((row) => row.company_name);
  }

  /** 按 ID 列查询用户邮箱 */
  async findEmailsByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const result = await this.queryClient.query<{ id: string; email: string }>(
      `SELECT id, email FROM ${this.tableName} WHERE id = ANY($1)`,
      [ids],
    );
    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(row.id, row.email);
    }
    return map;
  }
}

// ============================================================================
// 会话
// ============================================================================

export class PgSessionRepository implements ISessionRepository {
  private readonly table = nrm("sessions");

  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  private mapRow(row: Record<string, unknown>): Session {
    return {
      token: row.token as string,
      userId: row.user_id as string,
      createdAt: row.created_at as number,
      expiresAt: row.expires_at as number,
    };
  }

  async findByToken(token: string): Promise<Session | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE token = $1 LIMIT 1`,
      [token],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByUserId(userId: string): Promise<Session[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE user_id = $1`,
      [userId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async upsert(session: Session): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.table} (token, user_id, created_at, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         expires_at = EXCLUDED.expires_at`,
      [session.token, session.userId, session.createdAt, session.expiresAt],
    );
  }

  async delete(token: string): Promise<void> {
    await this.queryClient.query(`DELETE FROM ${this.table} WHERE token = $1`, [token]);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.queryClient.query(`DELETE FROM ${this.table} WHERE user_id = $1`, [userId]);
  }
}