/**
 * 功能路由 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { FunctionalRoute, FunctionalRouteType } from "../../contracts/functional-route-contract.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

/** 功能路由仓库接口 */
export interface IFunctionalRouteRepository {
  findById(id: string): Promise<FunctionalRoute | null>;
  findByType(type: FunctionalRouteType): Promise<FunctionalRoute | null>;
  list(): Promise<FunctionalRoute[]>;
  upsert(route: FunctionalRoute): Promise<void>;
  delete(id: string): Promise<void>;
}

/** 功能路由 PG 仓库实现 */
export class PgFunctionalRouteRepository extends PgBaseRepository<FunctionalRoute> implements IFunctionalRouteRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("functional_routes"), client);
  }

  protected mapRow(row: Record<string, unknown>): FunctionalRoute {
    return {
      id: row.id as string,
      type: (row.type as FunctionalRoute["type"]) ?? "text",
      providerId: row.provider_id as string,
      fallbackProviderIds: PgBaseRepository.ensureStringArray(PgBaseRepository.fromJsonb<string[]>(row.fallback_provider_ids)),
      enabled: (row.enabled as boolean) ?? true,
      createdAt: row.created_at as number,
      updatedAt: (row.updated_at as number) ?? row.created_at as number,
    };
  }

  protected mapEntity(route: FunctionalRoute): Record<string, unknown> {
    return {
      id: route.id,
      type: route.type,
      provider_id: route.providerId,
      fallback_provider_ids: PgBaseRepository.toJsonb(route.fallbackProviderIds),
      enabled: route.enabled,
      created_at: route.createdAt,
      updated_at: route.updatedAt ?? Date.now(),
    };
  }

  async findByType(type: FunctionalRouteType): Promise<FunctionalRoute | null> {
    return this.findOneWhere({ type });
  }

  async list(): Promise<FunctionalRoute[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} ORDER BY type`,
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}
