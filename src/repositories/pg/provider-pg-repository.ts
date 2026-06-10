/**
 * Provider PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { Provider, ProviderSecret, ProviderRoutingPolicy } from "../../contracts/types.js";
import type { IProviderRepository, IProviderSecretRepository, IProviderPolicyRepository } from "../../contracts/repository-ports/provider-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import { PgSoftDeletableRepository } from "./soft-deletable-repository.js";

// ============================================================================
// Provider
// ============================================================================

export class PgProviderRepository extends PgSoftDeletableRepository<Provider> implements IProviderRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("providers"), client);
  }

  protected mapRow(row: Record<string, unknown>): Provider {
    return {
      id: row.id as string,
      name: (row.name as string) ?? "",
      type: (row.type as Provider["type"]) ?? "llm",
      vendor: row.vendor as Provider["vendor"],
      baseUrl: row.base_url as string,
      model: row.model as string,
      callMode: ((row.call_mode as string) ?? "openai") as Provider["callMode"],
      options: PgBaseRepository.fromJsonb<Provider["options"]>(row.options) ?? undefined,
      accessKey: (row.access_key as string) ?? undefined,
      remark: (row.remark as string) ?? undefined,
      enabled: (row.enabled as boolean) ?? true,
      createdAt: row.created_at as number,
      updatedAt: (row.updated_at as number) ?? row.created_at as number,
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected mapEntity(p: Provider): Record<string, unknown> {
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      vendor: p.vendor,
      base_url: p.baseUrl,
      model: p.model,
      call_mode: p.callMode,
      options: PgBaseRepository.toJsonb(p.options),
      access_key: p.accessKey ?? null,
      remark: p.remark ?? null,
      enabled: p.enabled,
      created_at: p.createdAt,
      updated_at: p.updatedAt ?? Date.now(),
      deleted_at: p.deletedAt ?? null,
      deleted_by: p.deletedBy ?? null,
    };
  }

  async findByVendor(vendor: string): Promise<Provider[]> {
    return this.findWhere({ vendor });
  }

  async list(): Promise<Provider[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} ORDER BY name`,
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}

// ============================================================================
// Provider Secret（适配现有表结构：provider_id 为主键）
// ============================================================================

export class PgProviderSecretRepository implements IProviderSecretRepository {
  private readonly table = nrm("provider_secrets");

  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  /** 伪删除：设置 deleted_at 和 deleted_by */
  async softDelete(providerId: string, deletedBy: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.table} SET deleted_at = $2, deleted_by = $3 WHERE provider_id = $1`,
      [providerId, Date.now(), deletedBy],
    );
  }

  /** 恢复：清除 deleted_at 和 deleted_by */
  async restore(providerId: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.table} SET deleted_at = NULL, deleted_by = NULL WHERE provider_id = $1`,
      [providerId],
    );
  }

  /** 物理删除：真正删除数据 */
  async hardDelete(providerId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.table} WHERE provider_id = $1`,
      [providerId],
    );
  }

  private mapRow(row: Record<string, unknown>): ProviderSecret {
    return {
      id: row.provider_id as string, // 使用 provider_id 作为 id
      providerId: row.provider_id as string,
      keyHint: null, // 表中没有此字段
      cipherText: row.cipher_text as string,
      regionPrefix: null, // 表中没有此字段
      createdAt: Number(row.updated_at) ?? Date.now(), // 使用 updated_at 作为 createdAt
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  async findById(id: string): Promise<ProviderSecret | null> {
    // findById 实际按 provider_id 查询
    return this.findByProviderId(id);
  }

  async findByProviderId(providerId: string): Promise<ProviderSecret | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE provider_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [providerId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async upsert(secret: ProviderSecret): Promise<void> {
    // 使用 provider_id 作为主键进行 upsert
    await this.queryClient.query(
      `INSERT INTO ${this.table} (provider_id, cipher_text, updated_at, deleted_at, deleted_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider_id) DO UPDATE SET
         cipher_text = EXCLUDED.cipher_text,
         updated_at = EXCLUDED.updated_at,
         deleted_at = EXCLUDED.deleted_at,
         deleted_by = EXCLUDED.deleted_by`,
      [secret.providerId, secret.cipherText, Date.now(), secret.deletedAt ?? null, secret.deletedBy ?? null],
    );
  }

  async delete(providerId: string): Promise<void> {
    await this.queryClient.query(`DELETE FROM ${this.table} WHERE provider_id = $1`, [providerId]);
  }
}

// ============================================================================
// Provider Policy
// ============================================================================

export class PgProviderPolicyRepository extends PgSoftDeletableRepository<ProviderRoutingPolicy> implements IProviderPolicyRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("provider_policies"), client);
  }

  protected mapRow(row: Record<string, unknown>): ProviderRoutingPolicy {
    return {
      id: row.id as string,
      routeKey: row.route_key as ProviderRoutingPolicy["routeKey"],
      type: (row.type as ProviderRoutingPolicy["type"]) ?? "text",
      primaryProviderId: row.primary_provider_id as string,
      fallbackProviderIds: PgBaseRepository.ensureStringArray(PgBaseRepository.fromJsonb<string[]>(row.fallback_provider_ids)),
      timeoutMs: (row.timeout_ms as number) ?? 30000,
      retryCount: (row.retry_count as number) ?? 3,
      enabled: (row.enabled as boolean) ?? true,
      description: (row.description as string) ?? "",
      sortOrder: (row.sort_order as number) ?? 0,
      updatedAt: (row.updated_at as number) ?? row.created_at as number,
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected mapEntity(p: ProviderRoutingPolicy): Record<string, unknown> {
    return {
      id: p.id,
      route_key: p.routeKey,
      type: p.type,
      primary_provider_id: p.primaryProviderId,
      fallback_provider_ids: PgBaseRepository.toJsonb(p.fallbackProviderIds),
      timeout_ms: p.timeoutMs,
      retry_count: p.retryCount,
      enabled: p.enabled,
      description: p.description,
      sort_order: p.sortOrder,
      updated_at: p.updatedAt ?? Date.now(),
      deleted_at: p.deletedAt ?? null,
      deleted_by: p.deletedBy ?? null,
    };
  }

  async findByRouteKey(routeKey: string): Promise<ProviderRoutingPolicy[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE route_key = $1 AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [routeKey],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async list(): Promise<ProviderRoutingPolicy[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE deleted_at IS NULL ORDER BY sort_order ASC, route_key ASC`,
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}