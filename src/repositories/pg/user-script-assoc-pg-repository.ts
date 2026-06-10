/**
 * 用户脚本关联表 Repository
 *
 * 表名：nrm_user_script_assoc
 * 用途：存储用户与脚本的多对多关系，支持多用户共享脚本
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 来源类型 */
export type UserScriptSourceType = "reverse" | "manual" | "hot_trend" | "project_sync";

/** 用户脚本关联记录 */
export interface UserScriptAssoc {
  id: string;
  userId: string;
  scriptDataId: string;
  title: string | null;
  tags: string[];
  source: UserScriptSourceType;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

/** 创建关联参数 */
export interface CreateUserScriptAssocParams {
  id: string;
  userId: string;
  scriptDataId: string;
  title?: string;
  tags?: string[];
  source?: UserScriptSourceType;
  notes?: string;
}

/** 更新关联参数 */
export interface UpdateUserScriptAssocParams {
  title?: string;
  tags?: string[];
  notes?: string;
}

// ============================================================================
// Repository
// ============================================================================

export class PgUserScriptAssocRepository extends PgBaseRepository<UserScriptAssoc> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("user_script_assoc"), client);
  }

  protected mapRow(row: Record<string, unknown>): UserScriptAssoc {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      scriptDataId: row.script_data_id as string,
      title: row.title as string | null,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      source: row.source as UserScriptSourceType,
      notes: row.notes as string | null,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  protected mapEntity(entity: UserScriptAssoc): Record<string, unknown> {
    return {
      id: entity.id,
      user_id: entity.userId,
      script_data_id: entity.scriptDataId,
      title: entity.title,
      tags: entity.tags,
      source: entity.source,
      notes: entity.notes,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  /** 按用户ID查询关联列表 */
  async findByUserId(userId: string): Promise<UserScriptAssoc[]> {
    return this.findWhere({ user_id: userId });
  }

  /** 按脚本ID查询关联列表 */
  async findByScriptDataId(scriptDataId: string): Promise<UserScriptAssoc[]> {
    return this.findWhere({ script_data_id: scriptDataId });
  }

  /** 查询用户与脚本是否已关联 */
  async findByUserIdAndScriptId(userId: string, scriptDataId: string): Promise<UserScriptAssoc | null> {
    return this.findOneWhere({ user_id: userId, script_data_id: scriptDataId });
  }

  /** 创建关联 */
  async create(params: CreateUserScriptAssocParams): Promise<UserScriptAssoc> {
    const now = Date.now();
    const entity: UserScriptAssoc = {
      id: params.id,
      userId: params.userId,
      scriptDataId: params.scriptDataId,
      title: params.title ?? null,
      tags: params.tags ?? [],
      source: params.source ?? "manual",
      notes: params.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.upsert(entity);
    return entity;
  }

  /** 更新关联 */
  async update(id: string, params: UpdateUserScriptAssocParams): Promise<UserScriptAssoc | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }
    const now = Date.now();
    const updated: UserScriptAssoc = {
      ...existing,
      title: params.title ?? existing.title,
      tags: params.tags ?? existing.tags,
      notes: params.notes ?? existing.notes,
      updatedAt: now,
    };
    await this.upsert(updated);
    return updated;
  }

  /** 删除用户的所有脚本关联 */
  async deleteByUserId(userId: string): Promise<number> {
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE user_id = $1`,
      [userId],
    );
    return result.rowCount ?? 0;
  }

  /** 删除脚本的所有用户关联 */
  async deleteByScriptDataId(scriptDataId: string): Promise<number> {
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE script_data_id = $1`,
      [scriptDataId],
    );
    return result.rowCount ?? 0;
  }

  /** 联表查询：获取用户脚本关联及脚本详情 */
  async listWithScriptDataByUserId(userId: string): Promise<Array<UserScriptAssoc>> {
    const result = await this.queryClient.query(`
      SELECT
        usa.id, usa.user_id, usa.script_data_id, usa.title, usa.tags, usa.source, usa.notes,
        usa.created_at, usa.updated_at
      FROM ${this.tableName} usa
      WHERE usa.user_id = $1
      ORDER BY usa.updated_at DESC
    `, [userId]);

    return result.rows.map((row) => ({
      id: row.id as string,
      userId: row.user_id as string,
      scriptDataId: row.script_data_id as string,
      title: row.title as string | null,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      source: row.source as UserScriptSourceType,
      notes: row.notes as string | null,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }));
  }
}