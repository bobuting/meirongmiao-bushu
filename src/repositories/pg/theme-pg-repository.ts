/**
 * 主题 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { Theme, UserThemePreference } from "../../contracts/types.js";
import type { IThemeRepository, IUserThemePreferenceRepository } from "../../contracts/repository-ports/theme-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

// ============================================================================
// 主题
// ============================================================================

export class PgThemeRepository extends PgBaseRepository<Theme> implements IThemeRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("themes"), client);
  }

  protected mapRow(row: Record<string, unknown>): Theme {
    return {
      id: row.id as string,
      name: row.name as string,
      displayName: row.display_name as string,
      category: row.category as Theme["category"],
      isSystem: (row.is_system as boolean) ?? false,
      isEnabled: (row.is_enabled as boolean) ?? true,
      config: PgBaseRepository.fromJsonb<Theme["config"]>(row.config) ?? {
        colors: {} as Theme["config"]["colors"],
        gradients: {} as Theme["config"]["gradients"],
        fonts: {} as Theme["config"]["fonts"],
        animations: {} as Theme["config"]["animations"],
      },
      logoUrl: (row.logo_url as string) ?? undefined,
      createdBy: (row.created_by as string) ?? undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(t: Theme): Record<string, unknown> {
    return {
      id: t.id,
      name: t.name,
      display_name: t.displayName,
      category: t.category,
      is_system: t.isSystem,
      is_enabled: t.isEnabled,
      config: PgBaseRepository.toJsonb(t.config),
      logo_url: t.logoUrl,
      created_by: t.createdBy,
      created_at: t.createdAt,
      updated_at: Date.now(),
    };
  }

  async listEnabled(): Promise<Theme[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE is_enabled = true ORDER BY name`,
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}

// ============================================================================
// 用户主题偏好
// ============================================================================

export class PgUserThemePreferenceRepository implements IUserThemePreferenceRepository {
  private readonly table = nrm("user_theme_preferences");

  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  private mapRow(row: Record<string, unknown>): UserThemePreference {
    return {
      userId: row.user_id as string,
      themeId: row.theme_id as string,
      systemName: row.system_name as string,
      customConfig: PgBaseRepository.fromJsonb<UserThemePreference["customConfig"]>(row.custom_config) ?? undefined,
      customLogoUrl: (row.custom_logo_url as string) ?? undefined,
      updatedAt: row.updated_at as number,
    };
  }

  async findByUserId(userId: string): Promise<UserThemePreference | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async upsert(p: UserThemePreference): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.table} (user_id, theme_id, system_name, custom_config, custom_logo_url, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         theme_id = EXCLUDED.theme_id,
         system_name = EXCLUDED.system_name,
         custom_config = EXCLUDED.custom_config,
         custom_logo_url = EXCLUDED.custom_logo_url,
         updated_at = EXCLUDED.updated_at`,
      [p.userId, p.themeId, p.systemName, PgBaseRepository.toJsonb(p.customConfig), p.customLogoUrl, Date.now()],
    );
  }

  async delete(userId: string): Promise<void> {
    await this.queryClient.query(`DELETE FROM ${this.table} WHERE user_id = $1`, [userId]);
  }
}