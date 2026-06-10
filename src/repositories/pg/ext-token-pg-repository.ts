/**
 * 扩展认证 Token PG 仓库
 * 处理 nrm_ext_tokens 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 扩展 Token 记录 */
export interface ExtTokenRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: number;
  createdAt: number;
}

export class PgExtTokenRepository extends PgBaseRepository<ExtTokenRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("ext_tokens"), client);
  }

  protected mapRow(row: Record<string, unknown>): ExtTokenRecord {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      token: row.token as string,
      expiresAt: Number(row.expires_at),
      createdAt: Number(row.created_at),
    };
  }

  protected mapEntity(entity: ExtTokenRecord): Record<string, unknown> {
    return {
      id: entity.id,
      user_id: entity.userId,
      token: entity.token,
      expires_at: entity.expiresAt,
      created_at: entity.createdAt,
    };
  }

  /** 确保表结构存在 */
  async ensureSchema(): Promise<void> {
    await this.queryClient.query(
      `CREATE TABLE IF NOT EXISTS nrm_ext_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL
      )`,
    );
  }

  /** 清理用户已过期的 Token */
  async deleteExpiredByUser(userId: string, now: number): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE user_id = $1 AND expires_at < $2`,
      [userId, now],
    );
  }

  /** 通过 Token 查找未过期的用户 ID */
  async findValidUserIdByToken(token: string, now: number): Promise<string | null> {
    const { rows } = await this.queryClient.query(
      `SELECT user_id FROM ${this.tableName} WHERE token = $1 AND expires_at > $2`,
      [token, now],
    );
    return rows.length > 0 ? (rows[0].user_id as string) : null;
  }

  /** 插入新 Token */
  async insertToken(record: ExtTokenRecord): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (id, user_id, token, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [record.id, record.userId, record.token, record.expiresAt, record.createdAt],
    );
  }
}
