/**
 * 业务模块配置 Repository
 * 按模块存储 JSONB 配置，支持独立读写
 */

import type { Pool, PoolClient } from "pg";
import type { IBusinessConfigRepository } from "../../contracts/repository-ports/system-repository.js";

export interface BusinessConfigRow {
  module: string;
  config_json: Record<string, unknown>;
  description: string | null;
  created_at: number;
  updated_at: number;
  updated_by: string | null;
}

export class PgBusinessConfigRepository implements IBusinessConfigRepository {
  private readonly table = "nrm_business_configs";

  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  async get(module: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT config_json FROM ${this.table} WHERE module = $1 LIMIT 1`,
      [module],
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].config_json as Record<string, unknown>;
  }

  async upsert(module: string, config: Record<string, unknown>, description?: string, updatedBy?: string): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `INSERT INTO ${this.table} (module, config_json, description, created_at, updated_at, updated_by)
       VALUES ($1, $2::jsonb, $3, $4, $4, $5)
       ON CONFLICT (module) DO UPDATE SET
         config_json = EXCLUDED.config_json,
         description = EXCLUDED.description,
         updated_at = EXCLUDED.updated_at,
         updated_by = EXCLUDED.updated_by`,
      [module, JSON.stringify(config), description || null, now, updatedBy || null],
    );
  }

  async listAll(): Promise<{ module: string; config: Record<string, unknown>; description: string | null }[]> {
    const result = await this.queryClient.query(
      `SELECT module, config_json, description FROM ${this.table} ORDER BY module`,
    );
    return result.rows.map((row) => ({
      module: row.module as string,
      config: row.config_json as Record<string, unknown>,
      description: row.description as string | null,
    }));
  }

  async delete(module: string): Promise<boolean> {
    const result = await this.queryClient.query(
      `DELETE FROM ${this.table} WHERE module = $1`,
      [module],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
