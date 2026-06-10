/**
 * 裂变视频状态 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";
import {
  FissionStatus,
  type FissionVideoStatusRecord,
  type CreateFissionVideoStatusInput,
  type UpdateFissionVideoStatusInput,
  type UpdateProgressInput,
  type NewStoryJson,
} from "../../modules/fission-video/fission-video-config.js";

/** 数据库行类型（完整列） */
interface FissionVideoStatusRow {
  id: string;
  project_id: string;
  fission_count: number;
  completed_count: number;
  status: string;
  consumed_credits: number;
  creator_id: string;
  atmospheres: string | null;
  new_story_json: string | null;
  new_story_script_id: string | null;
  error_msg: string | null;
  image_video_total: number | null;
  image_video_completed: number | null;
  image_video_failed: number | null;
  new_story_total: number | null;
  new_story_completed: number | null;
  new_story_failed: number | null;
  new_story_async_status: string | null;
  shot_prompts_async_status: string | null;
  async_failed_stage: string | null;
  async_error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** SELECT 常用列（不含异步字段） */
const BASE_COLUMNS = `id, project_id, fission_count, completed_count, status, consumed_credits,
  creator_id, atmospheres, new_story_json, new_story_script_id, error_msg,
  image_video_total, image_video_completed, image_video_failed,
  new_story_total, new_story_completed, new_story_failed,
  created_at, updated_at`;

/** SELECT 含异步字段的列 */
const FULL_COLUMNS = `${BASE_COLUMNS},
  new_story_async_status, shot_prompts_async_status,
  async_failed_stage, async_error_message`;

export class PgFissionVideoStatusRepository extends PgBaseRepository<FissionVideoStatusRow> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("fission_video_status"), client);
  }

  protected mapRow(row: Record<string, unknown>): FissionVideoStatusRow {
    return row as unknown as FissionVideoStatusRow;
  }

  protected mapEntity(entity: FissionVideoStatusRow): Record<string, unknown> {
    return { ...entity };
  }

  // ========== 行 → FissionVideoStatusRecord 映射 ==========

  /** 将数据库行转换为 FissionVideoStatusRecord */
  toRecord(row: FissionVideoStatusRow): FissionVideoStatusRecord {
    let atmospheres: string[] | undefined;
    if (row.atmospheres) {
      try {
        atmospheres = JSON.parse(row.atmospheres);
      } catch {
        atmospheres = undefined;
      }
    }

    let newStoryJson: NewStoryJson | undefined;
    if (row.new_story_json) {
      try {
        newStoryJson = typeof row.new_story_json === 'string'
          ? JSON.parse(row.new_story_json)
          : row.new_story_json;
      } catch {
        newStoryJson = undefined;
      }
    }

    return {
      id: row.id,
      projectId: row.project_id,
      fissionCount: row.fission_count,
      completedCount: row.completed_count,
      status: row.status as FissionStatus,
      consumedCredits: row.consumed_credits,
      creatorId: row.creator_id,
      atmospheres,
      newStoryJson,
      newStoryScriptId: row.new_story_script_id || undefined,
      errorMsg: row.error_msg || undefined,
      imageVideoTotal: row.image_video_total ?? 0,
      imageVideoCompleted: row.image_video_completed ?? 0,
      imageVideoFailed: row.image_video_failed ?? 0,
      newStoryTotal: row.new_story_total ?? 0,
      newStoryCompleted: row.new_story_completed ?? 0,
      newStoryFailed: row.new_story_failed ?? 0,
      newStoryAsyncStatus: row.new_story_async_status as FissionVideoStatusRecord['newStoryAsyncStatus'],
      shotPromptsAsyncStatus: row.shot_prompts_async_status as FissionVideoStatusRecord['shotPromptsAsyncStatus'],
      asyncFailedStage: row.async_failed_stage as FissionVideoStatusRecord['asyncFailedStage'],
      asyncErrorMessage: row.async_error_message || undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  // ========== 查询方法 ==========

  /** 查询所有记录（不含异步字段） */
  async listAll(): Promise<FissionVideoStatusRecord[]> {
    const result = await this.queryClient.query<FissionVideoStatusRow>(
      `SELECT ${BASE_COLUMNS} FROM ${this.tableName} ORDER BY created_at DESC`,
    );
    return result.rows.map((row) => this.toRecord(row));
  }

  /** 根据ID查询 */
  async getById(id: string): Promise<FissionVideoStatusRecord | null> {
    const result = await this.queryClient.query<FissionVideoStatusRow>(
      `SELECT ${BASE_COLUMNS} FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.toRecord(result.rows[0]);
  }

  /** 根据项目ID查询（含异步字段） */
  async listByProject(projectId: string): Promise<FissionVideoStatusRecord[]> {
    const result = await this.queryClient.query<FissionVideoStatusRow>(
      `SELECT ${FULL_COLUMNS} FROM ${this.tableName}
       WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId],
    );
    return result.rows.map((row) => this.toRecord(row));
  }

  /** 根据项目ID查询最新一条（含异步字段） */
  async findLatestByProject(projectId: string): Promise<FissionVideoStatusRecord | null> {
    const result = await this.queryClient.query<FissionVideoStatusRow>(
      `SELECT ${FULL_COLUMNS} FROM ${this.tableName}
       WHERE project_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [projectId],
    );
    if (result.rows.length === 0) return null;
    return this.toRecord(result.rows[0]);
  }

  /** 根据项目ID获取 status id（仅 id 列） */
  async findIdByProject(projectId: string): Promise<string | null> {
    const result = await this.queryClient.query<{ id: string }>(
      `SELECT id FROM ${this.tableName} WHERE project_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [projectId],
    );
    return result.rows[0]?.id ?? null;
  }

  /** 根据创建者ID查询 */
  async listByCreator(creatorId: string): Promise<FissionVideoStatusRecord[]> {
    const result = await this.queryClient.query<FissionVideoStatusRow>(
      `SELECT ${BASE_COLUMNS} FROM ${this.tableName}
       WHERE creator_id = $1 ORDER BY created_at DESC`,
      [creatorId],
    );
    return result.rows.map((row) => this.toRecord(row));
  }

  // ========== 写入方法 ==========

  /** 创建记录 */
  async createRecord(input: CreateFissionVideoStatusInput, creatorId: string): Promise<FissionVideoStatusRecord> {
    const now = Date.now();
    const id = randomUUID();

    await this.queryClient.query(
      `INSERT INTO ${this.tableName}
        (id, project_id, fission_count, completed_count, status, consumed_credits,
         creator_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        input.projectId,
        input.fissionCount ?? 0,
        input.completedCount ?? 0,
        input.status ?? FissionStatus.CREATING,
        input.consumedCredits ?? 0,
        creatorId,
        now,
        now,
      ],
    );

    return {
      id,
      projectId: input.projectId,
      fissionCount: input.fissionCount ?? 0,
      completedCount: input.completedCount ?? 0,
      status: input.status ?? FissionStatus.CREATING,
      consumedCredits: input.consumedCredits ?? 0,
      creatorId,
      imageVideoTotal: input.imageVideoTotal ?? 0,
      imageVideoCompleted: input.imageVideoCompleted ?? 0,
      imageVideoFailed: input.imageVideoFailed ?? 0,
      newStoryTotal: input.newStoryTotal ?? 0,
      newStoryCompleted: input.newStoryCompleted ?? 0,
      newStoryFailed: input.newStoryFailed ?? 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  /** 更新记录 */
  async updateRecord(id: string, input: UpdateFissionVideoStatusInput): Promise<void> {
    const now = Date.now();
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (input.fissionCount !== undefined) { setClauses.push(`fission_count = $${paramIdx++}`); values.push(input.fissionCount); }
    if (input.completedCount !== undefined) { setClauses.push(`completed_count = $${paramIdx++}`); values.push(input.completedCount); }
    if (input.status !== undefined) { setClauses.push(`status = $${paramIdx++}`); values.push(input.status); }
    if (input.consumedCredits !== undefined) { setClauses.push(`consumed_credits = $${paramIdx++}`); values.push(input.consumedCredits); }
    if (input.imageVideoTotal !== undefined) { setClauses.push(`image_video_total = $${paramIdx++}`); values.push(input.imageVideoTotal); }
    if (input.imageVideoCompleted !== undefined) { setClauses.push(`image_video_completed = $${paramIdx++}`); values.push(input.imageVideoCompleted); }
    if (input.imageVideoFailed !== undefined) { setClauses.push(`image_video_failed = $${paramIdx++}`); values.push(input.imageVideoFailed); }
    if (input.newStoryTotal !== undefined) { setClauses.push(`new_story_total = $${paramIdx++}`); values.push(input.newStoryTotal); }
    if (input.newStoryCompleted !== undefined) { setClauses.push(`new_story_completed = $${paramIdx++}`); values.push(input.newStoryCompleted); }
    if (input.newStoryFailed !== undefined) { setClauses.push(`new_story_failed = $${paramIdx++}`); values.push(input.newStoryFailed); }

    setClauses.push(`updated_at = $${paramIdx++}`);
    values.push(now);
    values.push(id);

    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
      values,
    );
  }

  /** 更新进度（原子操作） */
  async updateProgress(id: string, input: UpdateProgressInput): Promise<void> {
    const now = Date.now();
    const completedDelta = input.completedCountDelta ?? 0;
    const creditsDelta = input.consumedCreditsDelta ?? 0;

    const setClauses: string[] = [
      `completed_count = completed_count + $1`,
      `consumed_credits = consumed_credits + $2`,
    ];
    const values: unknown[] = [completedDelta, creditsDelta];
    let paramIdx = 3;

    if (input.status !== undefined) {
      setClauses.push(`status = $${paramIdx++}`);
      values.push(input.status);
    }

    setClauses.push(`updated_at = $${paramIdx++}`);
    values.push(now);
    values.push(id);

    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
      values,
    );
  }

  /** 更新氛围字段 */
  async updateAtmospheres(id: string, atmospheres: string[]): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET atmospheres = $2, updated_at = $3 WHERE id = $1`,
      [id, JSON.stringify(atmospheres), now],
    );
  }

  /** 更新新故事JSON数据 */
  async updateNewStoryJson(id: string, newStoryJson: NewStoryJson): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET new_story_json = $2, updated_at = $3 WHERE id = $1`,
      [id, JSON.stringify(newStoryJson), now],
    );
  }

  /** 更新新故事脚本ID */
  async updateNewStoryScriptId(id: string, scriptId: string): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET new_story_script_id = $2, updated_at = $3 WHERE id = $1`,
      [id, scriptId, now],
    );
  }

  /** 追加错误信息到 error_msg 字段（不替换已有内容） */
  async appendErrorMsg(id: string, errorMsg: string): Promise<void> {
    const now = Date.now();
    const timestamp = new Date().toISOString();
    const newEntry = `[${timestamp}] ${errorMsg}`;
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET error_msg = CONCAT(COALESCE(error_msg, ''), CASE WHEN error_msg IS NULL THEN '' ELSE CHR(10) END, $2),
           updated_at = $3
       WHERE id = $1`,
      [id, newEntry, now],
    );
  }

  /** 更新异步状态字段 */
  async updateAsyncStatus(
    id: string,
    update: {
      newStoryAsyncStatus?: 'pending' | 'processing' | 'completed' | 'failed';
      shotPromptsAsyncStatus?: 'pending' | 'processing' | 'completed' | 'failed';
      asyncFailedStage?: 'new_story' | 'shot_prompts' | null;
      asyncErrorMessage?: string | null;
    }
  ): Promise<void> {
    const now = Date.now();
    const setClauses: string[] = ['updated_at = $1'];
    const values: unknown[] = [now];
    let paramIdx = 2;

    if (update.newStoryAsyncStatus !== undefined) {
      setClauses.push(`new_story_async_status = $${paramIdx++}`);
      values.push(update.newStoryAsyncStatus);
    }
    if (update.shotPromptsAsyncStatus !== undefined) {
      setClauses.push(`shot_prompts_async_status = $${paramIdx++}`);
      values.push(update.shotPromptsAsyncStatus);
    }
    if (update.asyncFailedStage !== undefined) {
      setClauses.push(`async_failed_stage = $${paramIdx++}`);
      values.push(update.asyncFailedStage);
    }
    if (update.asyncErrorMessage !== undefined) {
      setClauses.push(`async_error_message = $${paramIdx++}`);
      values.push(update.asyncErrorMessage);
    }

    values.push(id);
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
      values,
    );
  }

  /** 删除记录 */
  async deleteRecord(id: string): Promise<boolean> {
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 获取项目的氛围列表 */
  async getAtmospheres(projectId: string): Promise<string[]> {
    const result = await this.queryClient.query<{ atmospheres: string | null }>(
      `SELECT atmospheres FROM ${this.tableName} WHERE project_id = $1 LIMIT 1`,
      [projectId],
    );
    if (result.rows.length === 0) return [];

    const atmospheresStr = result.rows[0].atmospheres;
    if (!atmospheresStr) return [];

    try {
      const parsed = JSON.parse(atmospheresStr);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      const atmospheres = atmospheresStr
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
      if (atmospheres.length > 0) return atmospheres;
    }
    return [];
  }

  /** 原子更新 new_story 状态为 processing（幂等保护） */
  async atomicSetNewStoryProcessing(projectId: string, updatedAt: number): Promise<boolean> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET new_story_async_status = 'processing', updated_at = $2
       WHERE project_id = $1 AND (new_story_async_status IS NULL OR new_story_async_status = 'pending')
       RETURNING id`,
      [projectId, updatedAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 原子更新 shot_prompts 状态为 processing（幂等保护） */
  async atomicSetShotPromptsProcessing(projectId: string, updatedAt: number): Promise<boolean> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET shot_prompts_async_status = 'processing', updated_at = $2
       WHERE project_id = $1 AND (shot_prompts_async_status IS NULL OR shot_prompts_async_status = 'pending')
       RETURNING id`,
      [projectId, updatedAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 将超时的裂变状态标记为 partial_complete（stuck-job-cleanup 使用） */
  async markPartialComplete(id: string, now: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName}
       SET status = 'partial_complete', updated_at = $2
       WHERE id = $1`,
      [id, now],
    );
  }
}
