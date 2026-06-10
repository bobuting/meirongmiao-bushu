/**
 * Step4 分镜视频 PG 仓库
 *
 * 表名: nrm_step4_video_scenes
 * 用途: 每个分镜一行，保存视频版本历史和选中状态
 *
 * 建表 SQL:
 * CREATE TABLE nrm_step4_video_scenes (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   project_id VARCHAR(64) NOT NULL,
 *   user_id VARCHAR(64) NOT NULL,
 *   scene_index INTEGER NOT NULL,
 *   variant_urls JSONB NOT NULL DEFAULT '[]',
 *   selected_index INTEGER NOT NULL DEFAULT 0,
 *   clip_status VARCHAR(20) DEFAULT 'pending',
 *   clip_url TEXT,
 *   clip_prompt TEXT,
 *   clip_progress INTEGER DEFAULT 0,
 *   created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
 *   updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
 *   UNIQUE(project_id, scene_index)
 * );
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

export interface Step4VideoSceneRecord {
  id: string;
  projectId: string;
  userId: string;
  sceneIndex: number;
  variantUrls: string[];
  selectedIndex: number;
  clipStatus: "pending" | "generating" | "completed" | "failed";
  clipUrl: string | null;
  clipPrompt: string | null;
  clipProgress: number;
  /** 被删除的视频变体URL列表（软删除，用于审计和恢复） */
  deletedVariantUrls: string[];
  /** 提供商任务ID，用于跨请求恢复 */
  externalTaskId: string | null;
  /** 生成失败时的错误信息 */
  errorMessage: string | null;
  /** LLM调用审计记录ID */
  auditId: string | null;
  /** LLM视频任务查询上下文：queryUrl, callMode, taskId */
  llmQueryUrlJson: {
    queryUrl: string;
    callMode: string;
    taskId: string;
  } | null;
  /** 视频生成代际编号，用于区分不同 retry 周期的视频 */
  clipGeneration: number;
  createdAt: number;
  updatedAt: number;
}

export class PgStep4VideoSceneRepository {
  private readonly table = nrm("step4_video_scenes");

  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  private mapRow(row: Record<string, unknown>): Step4VideoSceneRecord {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      userId: row.user_id as string,
      sceneIndex: row.scene_index as number,
      variantUrls: PgBaseRepository.fromJsonb<string[]>(row.variant_urls) ?? [],
      selectedIndex: row.selected_index as number,
      clipStatus: (row.clip_status as Step4VideoSceneRecord["clipStatus"]) || "pending",
      clipUrl: (row.clip_url as string) ?? null,
      clipPrompt: (row.clip_prompt as string) ?? null,
      clipProgress: (row.clip_progress as number) ?? 0,
      deletedVariantUrls: PgBaseRepository.fromJsonb<string[]>(row.deleted_variant_urls) ?? [],
      externalTaskId: (row.external_task_id as string) ?? null,
      errorMessage: (row.error_message as string) ?? null,
      auditId: (row.audit_id as string) ?? null,
      llmQueryUrlJson: PgBaseRepository.fromJsonb<{ queryUrl: string; callMode: string; taskId: string }>(row.llm_query_url_json),
      clipGeneration: (row.clip_generation as number) ?? 0,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  /** 按 projectId 查找所有分镜 */
  async findByProjectId(projectId: string): Promise<Step4VideoSceneRecord[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE project_id = $1 ORDER BY scene_index ASC`,
      [projectId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 按 scene ID 查找单条 */
  async findById(sceneId: string): Promise<Step4VideoSceneRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE id = $1 LIMIT 1`,
      [sceneId],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 按 projectId + sceneIndex 查找单条 */
  async findByProjectAndScene(projectId: string, sceneIndex: number): Promise<Step4VideoSceneRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE project_id = $1 AND scene_index = $2 LIMIT 1`,
      [projectId, sceneIndex],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** 批量保存/更新项目的所有分镜 */
  async batchUpsert(projectId: string, userId: string, scenes: Array<{
    sceneIndex: number;
    variantUrls: string[];
    selectedIndex: number;
    clipStatus: string;
    clipUrl: string | null;
    clipPrompt: string | null;
    clipProgress: number;
  }>): Promise<void> {
    const now = Date.now();
    for (const scene of scenes) {
      await this.queryClient.query(
        `INSERT INTO ${this.table} (id, project_id, user_id, scene_index, variant_urls, selected_index, clip_status, clip_url, clip_prompt, clip_progress, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (project_id, scene_index) DO UPDATE SET
           variant_urls = EXCLUDED.variant_urls,
           selected_index = EXCLUDED.selected_index,
           clip_status = EXCLUDED.clip_status,
           clip_url = EXCLUDED.clip_url,
           clip_prompt = EXCLUDED.clip_prompt,
           clip_progress = EXCLUDED.clip_progress,
           updated_at = EXCLUDED.updated_at`,
        [
          projectId,
          userId,
          scene.sceneIndex,
          PgBaseRepository.toJsonb(scene.variantUrls),
          scene.selectedIndex,
          scene.clipStatus,
          scene.clipUrl,
          scene.clipPrompt,
          scene.clipProgress,
          now,
          now,
        ],
      );
    }
  }

  /** 更新单个分镜（不存在则创建） */
  async updateScene(
    projectId: string,
    sceneIndex: number,
    fields: {
      variantUrls?: string[];
      selectedIndex?: number;
      clipStatus?: string;
      clipUrl?: string | null;
      clipPrompt?: string | null;
      clipProgress?: number;
      externalTaskId?: string | null;
      errorMessage?: string | null;
      auditId?: string | null;
      clipGeneration?: number;
      /** LLM视频任务查询上下文 */
      llmQueryUrlJson?: { queryUrl: string; callMode: string; taskId: string } | null;
    },
    userId?: string,  // 创建新记录时需要
  ): Promise<Step4VideoSceneRecord | null> {
    const now = Date.now();

    // 构建 INSERT ... ON CONFLICT 语句，确保记录不存在时也能创建
    const insertKeys = ["project_id", "scene_index", "created_at", "updated_at"];
    const insertValues: unknown[] = [projectId, sceneIndex, now, now];
    const updateKeys: string[] = ["updated_at = EXCLUDED.updated_at"];
    let paramIndex = 5;

    // 如果提供了 userId，加入 INSERT 字段
    if (userId) {
      insertKeys.push("user_id");
      insertValues.push(userId);
      paramIndex++;
    }

    if (fields.variantUrls !== undefined) {
      insertKeys.push("variant_urls");
      insertValues.push(PgBaseRepository.toJsonb(fields.variantUrls));
      updateKeys.push(`variant_urls = EXCLUDED.variant_urls`);
      paramIndex++;
    }
    if (fields.selectedIndex !== undefined) {
      insertKeys.push("selected_index");
      insertValues.push(fields.selectedIndex);
      updateKeys.push(`selected_index = EXCLUDED.selected_index`);
      paramIndex++;
    }
    if (fields.clipStatus !== undefined) {
      insertKeys.push("clip_status");
      insertValues.push(fields.clipStatus);
      updateKeys.push(`clip_status = EXCLUDED.clip_status`);
      paramIndex++;
    }
    if (fields.clipUrl !== undefined) {
      insertKeys.push("clip_url");
      insertValues.push(fields.clipUrl);
      updateKeys.push(`clip_url = EXCLUDED.clip_url`);
      paramIndex++;
    }
    if (fields.clipPrompt !== undefined) {
      insertKeys.push("clip_prompt");
      insertValues.push(fields.clipPrompt);
      updateKeys.push(`clip_prompt = EXCLUDED.clip_prompt`);
      paramIndex++;
    }
    if (fields.clipProgress !== undefined) {
      insertKeys.push("clip_progress");
      insertValues.push(fields.clipProgress);
      updateKeys.push(`clip_progress = EXCLUDED.clip_progress`);
      paramIndex++;
    }
    if (fields.externalTaskId !== undefined) {
      insertKeys.push("external_task_id");
      insertValues.push(fields.externalTaskId);
      updateKeys.push(`external_task_id = EXCLUDED.external_task_id`);
      paramIndex++;
    }
    if (fields.errorMessage !== undefined) {
      insertKeys.push("error_message");
      insertValues.push(fields.errorMessage);
      updateKeys.push(`error_message = EXCLUDED.error_message`);
      paramIndex++;
    }
    if (fields.auditId !== undefined) {
      insertKeys.push("audit_id");
      insertValues.push(fields.auditId);
      updateKeys.push(`audit_id = EXCLUDED.audit_id`);
      paramIndex++;
    }
    if (fields.clipGeneration !== undefined) {
      insertKeys.push("clip_generation");
      insertValues.push(fields.clipGeneration);
      updateKeys.push(`clip_generation = EXCLUDED.clip_generation`);
      paramIndex++;
    }
    if (fields.llmQueryUrlJson !== undefined) {
      insertKeys.push("llm_query_url_json");
      insertValues.push(PgBaseRepository.toJsonb(fields.llmQueryUrlJson));
      updateKeys.push(`llm_query_url_json = EXCLUDED.llm_query_url_json`);
      paramIndex++;
    }

    const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `
      INSERT INTO ${this.table} (${insertKeys.join(", ")})
      VALUES (${placeholders})
      ON CONFLICT (project_id, scene_index) DO UPDATE SET ${updateKeys.join(", ")}
    `;

    await this.queryClient.query(sql, insertValues);

    return this.findByProjectAndScene(projectId, sceneIndex);
  }

  /** 按项目ID查询分镜列表（摘要字段，返回原始行） */
  async findByProject(projectId: string): Promise<Record<string, unknown>[]> {
    const result = await this.queryClient.query(
      `SELECT id, scene_index, clip_url, variant_urls, clip_status, error_message,
              selected_index, clip_generation, clip_prompt, created_at
       FROM ${this.table}
       WHERE project_id = $1
       ORDER BY scene_index`,
      [projectId],
    );
    return result.rows;
  }

  /**
   * 删除单个视频变体（软删除）
   * 从 variantUrls 移除，添加到 deletedVariantUrls
   */
  async deleteVariantUrl(
    projectId: string,
    sceneIndex: number,
    variantUrl: string,
  ): Promise<Step4VideoSceneRecord | null> {
    const now = Date.now();

    // 先查询当前数据
    const current = await this.findByProjectAndScene(projectId, sceneIndex);
    if (!current) {
      return null;
    }

    // 检查 URL 是否存在于 variantUrls 中
    const variantIndex = current.variantUrls.indexOf(variantUrl);
    if (variantIndex === -1) {
      return current; // URL 不存在，直接返回
    }

    // 至少保留一个变体
    if (current.variantUrls.length <= 1) {
      return current;
    }

    // 从 variantUrls 移除，添加到 deletedVariantUrls
    const newVariantUrls = current.variantUrls.filter((_, i) => i !== variantIndex);
    const newDeletedVariantUrls = [...current.deletedVariantUrls, variantUrl];

    // 调整 selectedIndex（如果删除的是当前选中的）
    let newSelectedIndex = current.selectedIndex;
    if (variantIndex <= current.selectedIndex) {
      newSelectedIndex = Math.max(0, current.selectedIndex - 1);
    }

    await this.queryClient.query(
      `UPDATE ${this.table} SET
        variant_urls = $3::jsonb,
        selected_index = $4,
        deleted_variant_urls = $5::jsonb,
        updated_at = $6
      WHERE project_id = $1 AND scene_index = $2`,
      [
        projectId,
        sceneIndex,
        PgBaseRepository.toJsonb(newVariantUrls),
        newSelectedIndex,
        PgBaseRepository.toJsonb(newDeletedVariantUrls),
        now,
      ],
    );

    return this.findByProjectAndScene(projectId, sceneIndex);
  }

  /** 统计项目中 selected_index >= 0 的分镜数量 */
  async countSelectedByProject(projectId: string): Promise<number> {
    const result = await this.queryClient.query(
      `SELECT COUNT(*) as count FROM ${this.table} WHERE project_id = $1 AND selected_index >= 0`,
      [projectId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  /** 查询项目中已完成的分镜视频（返回 scene_index + clip_url，用于裂变组合） */
  async findCompletedClipUrls(projectId: string): Promise<Array<{ sceneIndex: number; clipUrl: string }>> {
    const result = await this.queryClient.query(
      `SELECT scene_index, clip_url FROM ${this.table}
       WHERE project_id = $1 AND clip_status = 'completed' AND clip_url IS NOT NULL
       ORDER BY scene_index`,
      [projectId],
    );
    return result.rows.map((r: Record<string, unknown>) => ({
      sceneIndex: r.scene_index as number,
      clipUrl: r.clip_url as string,
    }));
  }

  /** 重置超时卡住的分镜状态为 failed（stuck-job-cleanup 使用） */
  async resetStuckScene(projectId: string, sceneIndex: number): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.table}
       SET clip_status = 'failed',
           error_message = '视频生成超时（超过60分钟），请重新生成',
           external_task_id = NULL,
           updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
       WHERE project_id = $1 AND scene_index = $2`,
      [projectId, sceneIndex],
    );
  }
}
