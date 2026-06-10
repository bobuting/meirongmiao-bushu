/**
 * 服装换装项目 PG 仓库
 *
 * 操作 nrm_outfit_change_projects 表
 * 支持 draft 模式：Step1-3 中间选择持久化，Step4 提交时升级为正式项目
 */

import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import type {
  OutfitChangeProjectRecord,
  OutfitChangeProjectStatus,
  ReferenceCaptureResult,
  VideoUnderstandingResult,
  CharacterAdaptResult,
  VideoGenerationResult,
  BatchAdaptResult,
  BatchGenerateResult,
} from "../../contracts/outfit-change-contract.js";
import { PgBaseRepository } from "./base-pg-repository.js";
import { nrm } from "./base-pg-repository.js";

/** draft 更新字段 */
export interface OutfitChangeDraftPatch {
  sourceVideoUrl?: string | null;
  builtinTemplateId?: string | null;
  targetOutfitId?: string | null;
  characterId?: string | null;
}

/** 换装项目仓储接口 */
export interface IOutfitChangeProjectRepository {
  /** 创建项目 */
  create(project: OutfitChangeProjectRecord): Promise<OutfitChangeProjectRecord>;
  /** 根据 task_id 查找 */
  findById(taskId: string): Promise<OutfitChangeProjectRecord | null>;
  /** 根据 project_id 查找最新记录（不限状态） */
  findByProjectId(projectId: string): Promise<OutfitChangeProjectRecord | null>;
  /** 根据状态查找 */
  findByStatus(status: OutfitChangeProjectStatus): Promise<OutfitChangeProjectRecord[]>;
  /** 更新状态 */
  updateStatus(projectId: string, status: OutfitChangeProjectStatus): Promise<void>;
  /** 更新阶段结果 */
  updateStageResult(
    projectId: string,
    stage: "stage0" | "stage1" | "stage2" | "stage3",
    result: ReferenceCaptureResult | VideoUnderstandingResult | CharacterAdaptResult | VideoGenerationResult | BatchAdaptResult | BatchGenerateResult,
  ): Promise<void>;
  /** 设置错误信息 */
  setError(projectId: string, errorMessage: string): Promise<void>;
  /** 查找项目的 draft 记录 */
  findDraftByProjectId(projectId: string): Promise<OutfitChangeProjectRecord | null>;
  /** 创建 draft 记录 */
  createDraft(projectId: string, userId: string, patch?: OutfitChangeDraftPatch): Promise<OutfitChangeProjectRecord>;
  /** 更新 draft 字段 */
  updateDraftFields(projectId: string, patch: OutfitChangeDraftPatch): Promise<void>;
  /** 升级 draft 为正式项目 */
  upgradeDraftToProject(projectId: string, input: import("../../contracts/outfit-change-contract.js").OutfitChangeProjectInput): Promise<void>;
}

/** 换装项目 PG 仓储实现 */
export class PgOutfitChangeProjectRepository extends PgBaseRepository<OutfitChangeProjectRecord> implements IOutfitChangeProjectRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("outfit_change_projects"), client);
  }

  /** 从数据库行映射到实体 */
  protected mapRow(row: Record<string, unknown>): OutfitChangeProjectRecord {
    return {
      taskId: row.task_id as string,
      input: PgBaseRepository.fromJsonb<OutfitChangeProjectRecord["input"]>(row.input_json) ?? {} as OutfitChangeProjectRecord["input"],
      status: row.status as OutfitChangeProjectStatus,
      projectId: (row.project_id as string) ?? null,
      userId: (row.user_id as string) ?? null,
      sourceVideoUrl: (row.source_video_url as string) ?? null,
      builtinTemplateId: (row.builtin_template_id as string) ?? null,
      targetOutfitId: (row.target_outfit_id as string) ?? null,
      characterId: (row.character_id as string) ?? null,
      stage0Result: PgBaseRepository.fromJsonb<ReferenceCaptureResult>(row.stage0_result_json),
      stage1Result: PgBaseRepository.fromJsonb<VideoUnderstandingResult>(row.stage1_result_json),
      stage2Result: PgBaseRepository.fromJsonb<CharacterAdaptResult | BatchAdaptResult>(row.stage2_result_json),
      stage3Result: PgBaseRepository.fromJsonb<VideoGenerationResult | BatchGenerateResult>(row.stage3_result_json),
      errorMessage: row.error_message as string | null | undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  /** 从实体映射到数据库行 */
  protected mapEntity(project: OutfitChangeProjectRecord): Record<string, unknown> {
    return {
      task_id: project.taskId,
      input_json: PgBaseRepository.toJsonb(project.input),
      status: project.status,
      project_id: project.projectId ?? null,
      user_id: project.userId ?? null,
      source_video_url: project.sourceVideoUrl ?? null,
      builtin_template_id: project.builtinTemplateId ?? null,
      target_outfit_id: project.targetOutfitId ?? null,
      character_id: project.characterId ?? null,
      stage0_result_json: PgBaseRepository.toJsonb(project.stage0Result),
      stage1_result_json: PgBaseRepository.toJsonb(project.stage1Result),
      stage2_result_json: PgBaseRepository.toJsonb(project.stage2Result),
      stage3_result_json: PgBaseRepository.toJsonb(project.stage3Result),
      error_message: project.errorMessage ?? null,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    };
  }

  /** 创建项目 */
  async create(project: OutfitChangeProjectRecord): Promise<OutfitChangeProjectRecord> {
    const data = this.mapEntity(project);
    const keys = Object.keys(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const values = Object.values(data);

    const result = await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return this.mapRow(result.rows[0]);
  }

  /** 根据 ID 查找（主键是 task_id） */
  async findById(projectId: string): Promise<OutfitChangeProjectRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE task_id = $1 LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 根据状态查找 */
  async findByStatus(status: OutfitChangeProjectStatus): Promise<OutfitChangeProjectRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE status = $1 ORDER BY created_at DESC`,
      [status],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 更新状态 */
  async updateStatus(projectId: string, status: OutfitChangeProjectStatus): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = $1, updated_at = $2 WHERE task_id = $3`,
      [status, now, projectId],
    );
  }

  /** 更新阶段结果 */
  async updateStageResult(
    projectId: string,
    stage: "stage0" | "stage1" | "stage2" | "stage3",
    result: ReferenceCaptureResult | VideoUnderstandingResult | CharacterAdaptResult | VideoGenerationResult | BatchAdaptResult | BatchGenerateResult,
  ): Promise<void> {
    const column = `${stage}_result_json`;
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${column} = $1, updated_at = $2 WHERE task_id = $3`,
      [PgBaseRepository.toJsonb(result), now, projectId],
    );
  }

  // 视频结果存储在 nrm_outfit_segment_videos 表（使用 ctx.repos.segmentVideos）

  /** 设置错误信息 */
  async setError(projectId: string, errorMessage: string): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET error_message = $1, updated_at = $2 WHERE task_id = $3`,
      [errorMessage, now, projectId],
    );
  }

  /** 查找项目的 draft 记录 */
  async findDraftByProjectId(projectId: string): Promise<OutfitChangeProjectRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE project_id = $1 AND status = 'draft' LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 根据 project_id 查找最新记录（不限状态） */
  async findByProjectId(projectId: string): Promise<OutfitChangeProjectRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE project_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 创建 draft 记录 */
  async createDraft(projectId: string, userId: string, patch?: OutfitChangeDraftPatch): Promise<OutfitChangeProjectRecord> {
    const now = Date.now();
    const taskId = `oc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const data = {
      task_id: taskId,
      input_json: PgBaseRepository.toJsonb({ projectId, userId } as Record<string, unknown>),
      status: "draft",
      project_id: projectId,
      user_id: userId,
      source_video_url: patch?.sourceVideoUrl ?? null,
      builtin_template_id: patch?.builtinTemplateId ?? null,
      target_outfit_id: patch?.targetOutfitId ?? null,
      character_id: patch?.characterId ?? null,
      stage0_result_json: null,
      stage1_result_json: null,
      stage2_result_json: null,
      stage3_result_json: null,
      error_message: null,
      created_at: now,
      updated_at: now,
    };

    const keys = Object.keys(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const values = Object.values(data);

    const result = await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    return this.mapRow(result.rows[0]);
  }

  /** 更新 draft 字段 */
  async updateDraftFields(projectId: string, patch: OutfitChangeDraftPatch): Promise<void> {
    const now = Date.now();
    const sets: string[] = ["updated_at = $1"];
    const values: unknown[] = [now];
    let idx = 2;

    if (patch.sourceVideoUrl !== undefined) {
      sets.push(`source_video_url = $${idx}`);
      values.push(patch.sourceVideoUrl);
      idx++;
    }
    if (patch.builtinTemplateId !== undefined) {
      sets.push(`builtin_template_id = $${idx}`);
      values.push(patch.builtinTemplateId);
      idx++;
    }
    if (patch.targetOutfitId !== undefined) {
      sets.push(`target_outfit_id = $${idx}`);
      values.push(patch.targetOutfitId);
      idx++;
    }
    if (patch.characterId !== undefined) {
      sets.push(`character_id = $${idx}`);
      values.push(patch.characterId);
      idx++;
    }

    values.push(projectId);
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${sets.join(", ")} WHERE task_id = $${idx}`,
      values,
    );
  }

  /** 升级 draft 为正式项目 */
  async upgradeDraftToProject(projectId: string, input: import("../../contracts/outfit-change-contract.js").OutfitChangeProjectInput): Promise<void> {
    const now = Date.now();
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET status = $1, input_json = $2, updated_at = $3 WHERE task_id = $4`,
      ["pending", JSON.stringify(input), now, projectId],
    );
  }

  /** 按项目ID查询换装项目最新记录（返回原始行或 null） */
  async findByProject(projectId: string): Promise<Record<string, unknown> | null> {
    const result = await this.queryClient.query(
      `SELECT task_id, input_json, status, stage0_result_json, stage1_result_json,
              stage2_result_json, stage3_result_json, error_message, created_at, updated_at,
              source_video_url, target_outfit_id, character_id
       FROM ${this.tableName}
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ?? null;
  }
}