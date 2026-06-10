/**
 * 脚本版本 PG 仓库
 * 直接通过 nrm_script_data 查询（project_id 字段关联）
 * 统一脚本表架构
 */

import type { Pool, PoolClient } from "pg";
import type { ScriptVersion } from "../../contracts/types.js";
import type { IScriptVersionRepository } from "../../contracts/repository-ports/script-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

// ============================================================================
// 脚本版本（直接查询 nrm_script_data）
// ============================================================================

export class PgScriptVersionRepository
  implements IScriptVersionRepository
{
  private pool: Pool;
  private client?: PoolClient;

  constructor(pool: Pool, client?: PoolClient) {
    this.pool = pool;
    this.client = client;
  }

  private get queryClient() {
    return this.client ?? this.pool;
  }

  /** 从 nrm_script_data 行映射 ScriptVersion */
  private mapRow(row: Record<string, unknown>): ScriptVersion {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      userId: (row.user_id as string) ?? "",
      sourceType: (row.source_type ?? "original") as ScriptVersion["sourceType"],
      durationSec: (row.duration_seconds ?? row.duration_sec ?? 0) as number,
      version: 1, // 统一版本号，不再支持多版本
      payload: {
        basicInfo: (row.basic_info as string) ?? "",
        roleTable: (row.role_table as string) ?? "",
        outfitTable: (row.outfit_table as string) ?? "",
        storyboard: (row.storyboard as string) ?? "",
      },
      createdAt: row.created_at as number,
    };
  }

  async findById(id: string): Promise<ScriptVersion | null> {
    const result = await this.queryClient.query(
      `SELECT id, project_id, user_id, source_type, duration_seconds,
              basic_info, role_table, outfit_table, storyboard, created_at
       FROM ${nrm("script_data")}
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByProjectId(projectId: string): Promise<ScriptVersion[]> {
    const result = await this.queryClient.query(
      `SELECT id, project_id, user_id, source_type, duration_seconds,
              basic_info, role_table, outfit_table, storyboard, created_at
       FROM ${nrm("script_data")}
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [projectId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findLatestByProjectId(projectId: string): Promise<ScriptVersion | null> {
    const result = await this.queryClient.query(
      `SELECT id, project_id, user_id, source_type, duration_seconds,
              basic_info, role_table, outfit_table, storyboard, created_at
       FROM ${nrm("script_data")}
       WHERE project_id = $1 AND is_confirmed = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async list(): Promise<ScriptVersion[]> {
    const result = await this.queryClient.query(
      `SELECT id, project_id, user_id, source_type, duration_seconds,
              basic_info, role_table, outfit_table, storyboard, created_at
       FROM ${nrm("script_data")}
       WHERE project_id IS NOT NULL
       ORDER BY created_at DESC`,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async upsert(script: ScriptVersion): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `INSERT INTO ${nrm("script_data")} (id, type, source_type, user_id, project_id,
              duration_seconds, basic_info, role_table, outfit_table, storyboard, created_at, updated_at)
       VALUES ($1, 0, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       ON CONFLICT (id) DO UPDATE SET
         source_type = EXCLUDED.source_type,
         project_id = EXCLUDED.project_id,
         duration_seconds = EXCLUDED.duration_seconds,
         basic_info = EXCLUDED.basic_info,
         role_table = EXCLUDED.role_table,
         outfit_table = EXCLUDED.outfit_table,
         storyboard = EXCLUDED.storyboard,
         updated_at = EXCLUDED.updated_at`,
      [
        script.id,
        script.sourceType,
        script.userId,
        script.projectId,
        script.durationSec,
        script.payload.basicInfo,
        script.payload.roleTable,
        script.payload.outfitTable,
        script.payload.storyboard,
        now,
      ],
    );
  }

  async delete(id: string): Promise<void> {
    // 软删除：将 project_id 置空
    await this.queryClient.query(
      `UPDATE ${nrm("script_data")} SET project_id = NULL, updated_at = $1 WHERE id = $2`,
      [Date.now(), id],
    );
  }

  /** 查询用户脚本 ID 列表（按创建时间倒序，用于排除公共脚本） */
  async findIdsByUserId(userId: string): Promise<string[]> {
    const result = await this.queryClient.query<{ id: string }>(
      `SELECT id FROM ${nrm("script_data")} WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => row.id);
  }

  private hashPayload(payload: ScriptVersion["payload"]): string {
    const content = `${payload.basicInfo}|${payload.roleTable}|${payload.outfitTable}|${payload.storyboard}`;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}