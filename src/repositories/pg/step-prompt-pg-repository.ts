/**
 * 步骤提示词 PG 仓库
 * 处理 nrm_step_prompt 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import type { StepPromptType } from "../../contant-config/shared_dict.js";

/** 步骤提示词记录 */
export interface StepPromptRecord {
  /** 主键ID */
  id: string;
  /** 项目ID */
  projectId: string;
  /** 类型：热点提取/热点分析/角色分析/脚本创作 */
  type: StepPromptType;
  /** 提示词内容（长文本） */
  prompt: string;
  /** 返回内容（长文本） */
  response: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

export class PgStepPromptRepository extends PgBaseRepository<StepPromptRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("step_prompt"), client);
  }

  protected mapRow(row: Record<string, unknown>): StepPromptRecord {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      type: row.type as StepPromptType,
      prompt: row.prompt as string,
      response: row.response as string,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  protected mapEntity(entity: StepPromptRecord): Record<string, unknown> {
    return {
      id: entity.id,
      project_id: entity.projectId,
      type: entity.type,
      prompt: entity.prompt,
      response: entity.response,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  /** 生成唯一 ID */
  generateId(): string {
    return `sp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 存储步骤提示词记录
   * @param projectId 项目ID
   * @param type 类型
   * @param prompt 提示词内容
   * @param response 返回内容
   * @param now 当前时间戳
   * @returns 新创建的记录
   */
  async save(
    projectId: string,
    type: StepPromptType,
    prompt: string,
    response: string,
    now: number,
  ): Promise<StepPromptRecord> {
    const id = this.generateId();
    const record: StepPromptRecord = {
      id,
      projectId,
      type,
      prompt,
      response,
      createdAt: now,
      updatedAt: now,
    };

    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (id, project_id, type, prompt, response, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, projectId, type, prompt, response, now, now],
    );

    return record;
  }

  /**
   * 根据项目ID和类型获取最新的提示词记录
   * @param projectId 项目ID
   * @param type 类型
   * @returns 最新的记录，如果没有则返回 null
   */
  async findLatestByProjectIdAndType(
    projectId: string,
    type: StepPromptType,
  ): Promise<StepPromptRecord | null> {
    const result = await this.queryClient.query(
      `SELECT id, project_id, type, prompt, response, created_at, updated_at
       FROM ${this.tableName}
       WHERE project_id = $1 AND type = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [projectId, type],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * 根据项目ID获取所有提示词记录
   * @param projectId 项目ID
   * @returns 该项目的所有提示词记录
   */
  async findByProjectId(projectId: string): Promise<StepPromptRecord[]> {
    const result = await this.queryClient.query(
      `SELECT id, project_id, type, prompt, response, created_at, updated_at
       FROM ${this.tableName}
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [projectId],
    );

    return result.rows.map((row) => this.mapRow(row));
  }
}